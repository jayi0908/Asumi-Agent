//! Tauri shell: multi-window labels + Node backend IPC relay.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::net::TcpStream;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicI32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::Deserialize;
use serde_json::{json, Value};
use tauri::image::Image;
use tauri::menu::{ContextMenu, IsMenuItem, Menu, MenuItemBuilder, PredefinedMenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::PhysicalPosition;
use tauri::{
    AppHandle, Emitter, Manager, State, Theme, WebviewUrl, WebviewWindowBuilder, WindowEvent, Wry,
};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind, MessageDialogResult};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_notification::NotificationExt;

const TRAY_ID: &str = "cherry-tray";

pub mod labels {
    pub const MAIN: &str = "main";
    pub const SETTINGS: &str = "settings";
    pub const QUICK_ASSISTANT: &str = "quickAssistant";
    pub const SUB_WINDOW: &str = "subWindow";
    pub const SELECTION_TOOLBAR: &str = "selectionToolbar";
    pub const SELECTION_ACTION: &str = "selectionAction";
    pub const MIGRATION_V2: &str = "migrationV2";
}

struct Pending {
    tx: std::sync::mpsc::Sender<Result<Value, String>>,
}

/// Last-built tray context menu, kept so `tray.menu-popup` can pop it at the
/// cursor (Cherry calls `popUpContextMenu` from its `right-click` handler on
/// macOS/Windows; only Linux gets an auto context menu via `set_menu`).
struct ShellTrayState {
    menu: Mutex<Option<Menu<Wry>>>,
}

pub struct BackendBridge {
    stream: Mutex<Option<TcpStream>>,
    pending: Mutex<HashMap<u64, Pending>>,
    next_id: AtomicU64,
    child: Mutex<Option<Child>>,
    /// pgid of the live backend process group (== pnpm child pid after
    /// `process_group(0)`). Kept atomic so the SIGTERM path — which can run
    /// while `watch_backend` owns the `Child` — can still reap the whole
    /// pnpm → tsx → node tree.
    group_id: AtomicI32,
    port: Mutex<Option<u16>>,
}

impl BackendBridge {
    fn new() -> Self {
        Self {
            stream: Mutex::new(None),
            pending: Mutex::new(HashMap::new()),
            next_id: AtomicU64::new(1),
            child: Mutex::new(None),
            group_id: AtomicI32::new(0),
            port: Mutex::new(None),
        }
    }

    fn set_stream(&self, stream: TcpStream) {
        *self.stream.lock().expect("stream lock") = Some(stream);
    }

    /// Send an invoke over TCP and block until the backend replies.
    /// NOTE: must never be called on the Tauri main thread — callers use
    /// `tauri::async_runtime::spawn_blocking`.
    fn invoke(&self, channel: String, args: Vec<Value>) -> Result<Value, String> {
        // Wait for the backend hub to connect (it boots asynchronously after
        // the window is shown). Invokes run on blocking threads, so waiting
        // here doesn't stall the UI; early renderer calls simply queue up.
        let deadline = Instant::now() + Duration::from_secs(90);
        loop {
            {
                let guard = self.stream.lock().map_err(|e| e.to_string())?;
                if guard.is_some() {
                    break;
                }
            }
            if Instant::now() > deadline {
                return Err("backend not connected (startup timeout)".to_string());
            }
            thread::sleep(Duration::from_millis(150));
        }

        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = std::sync::mpsc::channel();
        self.pending
            .lock()
            .map_err(|e| e.to_string())?
            .insert(id, Pending { tx });

        let payload = json!({
            "id": id.to_string(),
            "type": "invoke",
            "channel": channel,
            "args": args,
        });

        {
            let mut guard = self.stream.lock().map_err(|e| e.to_string())?;
            let stream = guard
                .as_mut()
                .ok_or_else(|| "backend not connected".to_string())?;
            writeln!(stream, "{payload}").map_err(|e| format!("write failed: {e}"))?;
            stream.flush().map_err(|e| format!("flush failed: {e}"))?;
        }

        rx.recv_timeout(Duration::from_secs(120))
            .map_err(|_| "backend invoke timeout".to_string())?
    }

    /// Fire-and-forget `send` (renderer `ipcRenderer.send` → `ipcMain.on`).
    /// No response is expected, so this writes to the hub and returns immediately.
    fn send(&self, channel: String, args: Vec<Value>) -> Result<(), String> {
        let payload = json!({ "type": "send", "channel": channel, "args": args });
        let mut guard = self.stream.lock().map_err(|e| e.to_string())?;
        let stream = guard
            .as_mut()
            .ok_or_else(|| "backend not connected".to_string())?;
        writeln!(stream, "{payload}").map_err(|e| format!("write failed: {e}"))?;
        stream.flush().map_err(|e| format!("flush failed: {e}"))?;
        Ok(())
    }
}

fn resolve_repo_root() -> std::path::PathBuf {
    // CARGO_MANIFEST_DIR = src-tauri during build/runtime of dev
    std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| std::path::PathBuf::from("."))
}

/// Spawn the Node backend and keep it alive: on unexpected exit the child is
/// respawned on the same ports (the port file + browser-mode renderers keep
/// working because the ports never change). Invokes issued during the gap
/// simply queue in `BackendBridge::invoke`'s wait-for-stream loop.
fn spawn_backend_loop(app: &AppHandle, bridge: &Arc<BackendBridge>) {
    let root = resolve_repo_root();
    let listener = match std::net::TcpListener::bind("127.0.0.1:0") {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[tauri] backend port allocate failed: {e}");
            return;
        }
    };
    let tcp_port = listener.local_addr().unwrap().port();
    drop(listener);

    // HTTP port is CHERRY_HTTP_PORT+1 or let the backend pick
    let http_port = tcp_port.wrapping_add(1).max(1025);

    *bridge.port.lock().unwrap() = Some(tcp_port);

    let mut consecutive_failures: u32 = 0;
    loop {
        let mut cmd = Command::new("pnpm");
        cmd.arg("exec")
            .arg("tsx")
            .arg("--tsconfig")
            .arg("tsconfig.backend.json")
            .arg("--import")
            .arg("./scripts/register-asset-loader.mjs")
            .arg("src/backend/index.ts")
            .current_dir(&root)
            .env("CHERRY_IPC_PORT", tcp_port.to_string())
            .env("CHERRY_HTTP_PORT", http_port.to_string())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(unix)]
        {
            // Own process group so the whole pnpm → tsx → node tree can be
            // reaped at once when the app exits or respawns.
            use std::os::unix::process::CommandExt;
            cmd.process_group(0);
        }

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                // pnpm missing/broken: retry a few times, then give up.
                consecutive_failures += 1;
                eprintln!("[tauri] backend spawn failed ({consecutive_failures}): {e}");
                if consecutive_failures >= 5 {
                    eprintln!("[tauri] giving up on backend respawn");
                    return;
                }
                thread::sleep(Duration::from_secs(1));
                continue;
            }
        };

        if let Some(out) = child.stdout.take() {
            thread::spawn(move || {
                let reader = BufReader::new(out);
                for line in reader.lines().flatten() {
                    eprintln!("[backend] {line}");
                }
            });
        }
        if let Some(err) = child.stderr.take() {
            thread::spawn(move || {
                let reader = BufReader::new(err);
                for line in reader.lines().flatten() {
                    eprintln!("[backend:err] {line}");
                }
            });
        }

        let child_pid = child.id() as i32;
        *bridge.child.lock().unwrap() = Some(child);
        bridge.group_id.store(child_pid, Ordering::SeqCst);

        // Wait for hub listen; on timeout kill the child and respawn.
        let deadline = Instant::now() + Duration::from_secs(60);
        let mut connected: Option<TcpStream> = None;
        while connected.is_none() {
            match TcpStream::connect(("127.0.0.1", tcp_port)) {
                Ok(s) => connected = Some(s),
                Err(_) => {
                    if Instant::now() > deadline {
                        break;
                    }
                    thread::sleep(Duration::from_millis(100));
                }
            }
        }
        match connected {
            Some(stream) => {
                stream.set_read_timeout(None).ok();
                stream.set_write_timeout(Some(Duration::from_secs(30))).ok();
                let Some(read_stream) = stream.try_clone().ok() else {
                    eprintln!("[tauri] backend stream clone failed, respawning");
                    kill_reaped_child(bridge);
                    continue;
                };
                bridge.set_stream(stream);
                consecutive_failures = 0;
                eprintln!("[tauri] cherry backend connected on port {tcp_port}");
                let child = bridge.child.lock().unwrap().take();
                watch_backend(child, read_stream, app, bridge);
            }
            None => {
                eprintln!("[tauri] backend hub connect timeout, respawning");
                kill_reaped_child(bridge);
                consecutive_failures += 1;
                if consecutive_failures >= 5 {
                    eprintln!("[tauri] giving up on backend respawn");
                    return;
                }
                thread::sleep(Duration::from_secs(1));
            }
        }
    }
}

/// Kill the live backend process group (pnpm → tsx → node) by its pgid.
/// Works regardless of which thread currently owns the `Child` handle.
fn kill_backend_group(bridge: &Arc<BackendBridge>) {
    let gid = bridge.group_id.load(Ordering::SeqCst);
    #[cfg(unix)]
    if gid > 0 {
        unsafe {
            let _ = libc::kill(-gid, libc::SIGKILL);
        }
    }
}

/// Kill and reap a backend `Child` we currently hold, along with its group.
fn kill_backend_tree(bridge: &Arc<BackendBridge>, child: &mut Child) {
    let pid = child.id() as i32;
    #[cfg(unix)]
    {
        unsafe {
            // SIGKILL the entire pnpm → tsx → node group, then the leader.
            let _ = libc::kill(-pid, libc::SIGKILL);
        }
    }
    let _ = child.kill();
    let _ = child.wait();
    // Forget the group only if it still points at this (now dead) process.
    let _ = bridge.group_id.compare_exchange(pid, 0, Ordering::SeqCst, Ordering::SeqCst);
}

/// Kill and reap the backend child held in the bridge (if any).
fn kill_reaped_child(bridge: &Arc<BackendBridge>) {
    if let Some(mut child) = bridge.child.lock().unwrap().take() {
        if child.try_wait().is_ok_and(|s| s.is_none()) {
            kill_backend_tree(bridge, &mut child);
        }
    }
}

/// Drain one backend connection (reader loop) and return only when the child
/// exits or the hub socket closes; the caller then respawns.
fn watch_backend(
    mut child: Option<Child>,
    read_stream: TcpStream,
    app: &AppHandle,
    bridge: &Arc<BackendBridge>,
) {
    let app_handle = app.clone();
    let bridge_reader = Arc::clone(&bridge);
    let (eof_tx, eof_rx) = std::sync::mpsc::channel::<()>();
    let bridge_for_eof = Arc::clone(&bridge);
    thread::spawn(move || {
        let reader = BufReader::new(read_stream);
        for line in reader.lines().flatten() {
            let Ok(value) = serde_json::from_str::<Value>(&line) else {
                continue;
            };
            let typ = value.get("type").and_then(|v| v.as_str()).unwrap_or("");
            match typ {
                "result" | "error" => {
                    let id = value
                        .get("id")
                        .and_then(|v| v.as_str())
                        .and_then(|s| s.parse::<u64>().ok());
                    if let Some(id) = id {
                        if let Some(pending) = bridge_reader
                            .pending
                            .lock()
                            .ok()
                            .and_then(|mut m| m.remove(&id))
                        {
                            if typ == "result" {
                                let _ = pending.tx.send(Ok(value.get("result").cloned().unwrap_or(Value::Null)));
                            } else {
                                let msg = value
                                    .pointer("/error/message")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("backend error")
                                    .to_string();
                                let _ = pending.tx.send(Err(msg));
                            }
                        }
                    }
                }
                "sys" => {
                    // Node backend asking the shell to run a native system call
                    // (dialog / open / reveal). Run on a detached thread so the
                    // reader loop keeps draining invokes and events.
                    let id = value
                        .get("id")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string();
                    let channel = value
                        .get("channel")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string();
                    let args = value.get("args").cloned().unwrap_or_else(|| json!([]));
                    let app_handle = app_handle.clone();
                    let bridge_writer = Arc::clone(&bridge_reader);
                    thread::spawn(move || {
                        let result = handle_sys(&app_handle, &bridge_writer, &channel, &args);
                        let reply = match result {
                            Ok(v) => json!({ "id": id, "type": "sys-result", "result": v }),
                            Err(e) => json!({ "id": id, "type": "sys-error", "error": { "message": e } }),
                        };
                        if let Ok(mut guard) = bridge_writer.stream.lock() {
                            if let Some(stream) = guard.as_mut() {
                                let _ = writeln!(stream, "{reply}");
                                let _ = stream.flush();
                            }
                        }
                    });
                }
                "event" => {
                    let channel = value
                        .get("channel")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string();
                    let args = value.get("args").cloned().unwrap_or_else(|| json!([]));
                    let payload = json!({ "channel": channel, "args": args });
                    let _ = app_handle.emit("backend://event", payload);
                }
                "ready" => {
                    eprintln!("[backend] hub ready");
                }
                _ => {}
            }
        }
        // Socket closed: clear the stream so pending invokes re-wait, then
        // wake the monitor loop.
        eprintln!("[tauri] cherry backend stream closed (EOF)");
        if let Ok(mut guard) = bridge_for_eof.stream.lock() {
            *guard = None;
        }
        let _ = eof_tx.send(());
    });

    // Wait for the child to exit (normal or crashed) or for the socket to die;
    // returning lets the caller respawn on the same ports.
    loop {
        if let Some(c) = child.as_mut() {
            match c.try_wait() {
                Ok(Some(status)) => {
                    eprintln!("[tauri] cherry backend exited: {status}");
                    break;
                }
                Ok(None) => {}
                Err(e) => {
                    eprintln!("[tauri] cherry backend wait error: {e}");
                    break;
                }
            }
        }
        if eof_rx.try_recv().is_ok() {
            break;
        }
        thread::sleep(Duration::from_millis(400));
    }

    // Process still alive but the hub socket is gone — reap it.
    if let Some(c) = child.as_mut() {
        if c.try_wait().is_ok_and(|s| s.is_none()) {
            eprintln!("[tauri] cherry backend socket closed but process alive, killing");
            kill_backend_tree(bridge, c);
        }
    }
    if let Ok(mut guard) = bridge.stream.lock() {
        *guard = None;
    }
}

/// SIGTERM is not translated into a clean run-loop exit by Tauri (only SIGINT
/// is), so `pnpm tauri dev` / supervisor stop would kill the shell while the
/// Node backend process group is orphaned. Trap it and route through
/// `AppHandle::exit`, which fires `RunEvent::Exit` (→ backend tree reaped).
#[cfg(unix)]
static TERM_REQUESTED: AtomicBool = AtomicBool::new(false);

#[cfg(unix)]
extern "C" fn on_sigterm(_sig: libc::c_int) {
    TERM_REQUESTED.store(true, Ordering::SeqCst);
}

#[cfg(unix)]
fn install_sigterm_exit(app: AppHandle, bridge: Arc<BackendBridge>) {
    unsafe {
        let handler: usize = std::mem::transmute(on_sigterm as *const ());
        let _ = libc::signal(libc::SIGTERM, handler);
    }
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(200));
        if TERM_REQUESTED.swap(false, Ordering::SeqCst) {
            eprintln!("[tauri] SIGTERM received, exiting");
            // On macOS `AppHandle::exit` terminates the process immediately
            // (no run-loop round trip), so reaping can't wait for
            // `RunEvent::Exit` — kill the whole backend group by pgid here
            // (watch_backend may own the Child, but the group id is stable).
            kill_backend_group(&bridge);
            if let Some(mut child) = bridge.child.lock().ok().and_then(|mut g| g.take()) {
                let _ = child.wait();
            }
            app.exit(0);
            break;
        }
    });
}

/// Push a fire-and-forget event from the shell back to the Node backend over
/// the hub (e.g. a global-shortcut press). Reverse of the `sys` request/response.
fn bridge_push(bridge: &Arc<BackendBridge>, msg: &Value) {
    if let Ok(mut guard) = bridge.stream.lock() {
        if let Some(stream) = guard.as_mut() {
            let _ = writeln!(stream, "{msg}");
            let _ = stream.flush();
        }
    }
}

/// Build a Tauri tray menu from the shim's item descriptors
/// (`{id?, label?, enabled?, separator?}`).
fn build_tray_menu(app: &AppHandle, items: &[Value]) -> Result<Menu<Wry>, String> {
    let mut owned: Vec<Box<dyn IsMenuItem<Wry>>> = Vec::with_capacity(items.len());
    for item in items {
        if item.get("separator").and_then(|v| v.as_bool()).unwrap_or(false) {
            owned.push(Box::new(
                PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?,
            ));
        } else {
            let id = item
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            let label = item
                .get("label")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            let enabled = item
                .get("enabled")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);
            owned.push(Box::new(
                MenuItemBuilder::with_id(id, label)
                    .enabled(enabled)
                    .build(app)
                    .map_err(|e| e.to_string())?,
            ));
        }
    }
    let refs: Vec<&dyn IsMenuItem<Wry>> = owned.iter().map(|item| &**item).collect();
    Menu::with_items(app, &refs).map_err(|e| e.to_string())
}

/// Native system-API dispatch invoked by the Node backend over the hub.
/// Only implements the OS primitives the electron-shim routes here; product
/// semantics (FileStorage metadata, etc.) stay in Cherry's Node code.
fn handle_sys(
    app: &AppHandle,
    bridge: &Arc<BackendBridge>,
    channel: &str,
    args: &Value,
) -> Result<Value, String> {
    match channel {
        "dialog.open" => {
            let options = args.get(0).and_then(|v| v.as_object()).cloned().unwrap_or_default();
            let mut builder = app.dialog().file();
            if let Some(title) = options.get("title").and_then(|v| v.as_str()) {
                builder = builder.set_title(title);
            }
            if let Some(dp) = options.get("defaultPath").and_then(|v| v.as_str()) {
                if !dp.is_empty() {
                    builder = builder.set_directory(dp);
                }
            }
            if let Some(filters) = options.get("filters").and_then(|v| v.as_array()) {
                for f in filters {
                    let Some(name) = f.get("name").and_then(|v| v.as_str()) else {
                        continue;
                    };
                    let exts: Vec<&str> = f
                        .get("extensions")
                        .and_then(|v| v.as_array())
                        .map(|a| a.iter().filter_map(|e| e.as_str()).collect())
                        .unwrap_or_default();
                    if !exts.is_empty() {
                        builder = builder.add_filter(name, &exts);
                    }
                }
            }
            let props: Vec<String> = options
                .get("properties")
                .and_then(|v| v.as_array())
                .map(|a| a.iter().filter_map(|p| p.as_str().map(String::from)).collect())
                .unwrap_or_default();
            let multi = props.iter().any(|p| p == "multiSelections");
            let dir = props.iter().any(|p| p == "openDirectory");

            let paths: Vec<String> = if dir {
                if multi {
                    builder
                        .blocking_pick_folders()
                        .unwrap_or_default()
                        .into_iter()
                        .filter_map(|f| f.into_path().ok())
                        .map(|p| p.to_string_lossy().to_string())
                        .collect()
                } else {
                    builder
                        .blocking_pick_folder()
                        .into_iter()
                        .filter_map(|f| f.into_path().ok())
                        .map(|p| p.to_string_lossy().to_string())
                        .collect()
                }
            } else if multi {
                builder
                    .blocking_pick_files()
                    .unwrap_or_default()
                    .into_iter()
                    .filter_map(|f| f.into_path().ok())
                    .map(|p| p.to_string_lossy().to_string())
                    .collect()
            } else {
                builder
                    .blocking_pick_file()
                    .into_iter()
                    .filter_map(|f| f.into_path().ok())
                    .map(|p| p.to_string_lossy().to_string())
                    .collect()
            };

            Ok(json!({ "canceled": paths.is_empty(), "filePaths": paths }))
        }
        "dialog.showMessageBox" => {
            let options = args.get(0).and_then(|v| v.as_object()).cloned().unwrap_or_default();
            let title = options.get("title").and_then(|v| v.as_str()).unwrap_or("Cherry Studio").to_string();
            let message = options.get("message").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let detail = options.get("detail").and_then(|v| v.as_str()).unwrap_or("");
            let kind = match options.get("type").and_then(|v| v.as_str()) {
                Some("warning") => MessageDialogKind::Warning,
                Some("error") => MessageDialogKind::Error,
                _ => MessageDialogKind::Info,
            };
            let buttons: Vec<String> = options
                .get("buttons")
                .and_then(|v| v.as_array())
                .map(|a| a.iter().filter_map(|b| b.as_str().map(String::from)).collect())
                .unwrap_or_default();
            let cancel_id = options.get("cancelId").and_then(|v| v.as_u64()).map(|n| n as usize);

            // Electron folds `detail` into the message body; rfd has a single
            // message field, so join them with a blank line.
            let body = if detail.is_empty() {
                message
            } else {
                format!("{message}\n\n{detail}")
            };

            // rfd's message dialog supports at most 3 buttons. Map Electron's
            // arbitrary button list onto the closest built-in layout; extra
            // buttons beyond the first three are dropped (documented gap).
            let dialog_buttons = match buttons.len() {
                0 => MessageDialogButtons::Ok,
                1 => MessageDialogButtons::OkCustom(buttons[0].clone()),
                2 => MessageDialogButtons::OkCancelCustom(buttons[0].clone(), buttons[1].clone()),
                _ => MessageDialogButtons::YesNoCancelCustom(
                    buttons[0].clone(),
                    buttons[1].clone(),
                    buttons[2].clone(),
                ),
            };

            let result = app
                .dialog()
                .message(body)
                .title(title)
                .kind(kind)
                .buttons(dialog_buttons)
                .blocking_show_with_result();

            let last = buttons.len().min(3).saturating_sub(1);
            let response = match result {
                MessageDialogResult::Ok | MessageDialogResult::Yes => 0usize,
                MessageDialogResult::No => 1usize,
                MessageDialogResult::Cancel => cancel_id.unwrap_or(last),
                MessageDialogResult::Custom(s) => buttons.iter().position(|b| b == &s).unwrap_or(0),
            };
            Ok(json!({ "response": response.min(last), "checkboxChecked": false }))
        }
        "notification.show" => {
            let options = args.get(0).and_then(|v| v.as_object()).cloned().unwrap_or_default();
            let title = options.get("title").and_then(|v| v.as_str()).unwrap_or("Cherry Studio");
            let body = options.get("body").and_then(|v| v.as_str()).unwrap_or("");
            app.notification()
                .builder()
                .title(title)
                .body(body)
                .show()
                .map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        "shell.openPath" => {
            let p = args
                .get(0)
                .and_then(|v| v.as_str())
                .ok_or_else(|| "shell.openPath: missing path".to_string())?;
            // Electron returns an empty string on success, an error message on failure.
            match tauri_plugin_opener::open_path(p, None::<&str>) {
                Ok(()) => Ok(json!("")),
                Err(e) => Ok(json!(e.to_string())),
            }
        }
        "shell.showItemInFolder" => {
            let p = args
                .get(0)
                .and_then(|v| v.as_str())
                .ok_or_else(|| "shell.showItemInFolder: missing path".to_string())?;
            tauri_plugin_opener::reveal_item_in_dir(p).map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        "shell.openExternal" => {
            let url = args
                .get(0)
                .and_then(|v| v.as_str())
                .ok_or_else(|| "shell.openExternal: missing url".to_string())?;
            tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        "window.create" => {
            let o = args.get(0).and_then(|v| v.as_object()).cloned().unwrap_or_default();
            let label = o
                .get("label")
                .and_then(|v| v.as_str())
                .ok_or("window.create: missing label")?
                .to_string();
            let app_path = o
                .get("appPath")
                .and_then(|v| v.as_str())
                .unwrap_or("/windows/main/index.html")
                .to_string();
            let width = o.get("width").and_then(|v| v.as_f64()).unwrap_or(800.0);
            let height = o.get("height").and_then(|v| v.as_f64()).unwrap_or(600.0);
            let always_on_top = o.get("alwaysOnTop").map(|v| {
                v.as_bool().unwrap_or(false) || v.is_object() || v.is_string()
            }).unwrap_or(false);
            let skip_taskbar = o.get("skipTaskbar").and_then(|v| v.as_bool()).unwrap_or(false);
            let frame = o.get("frame").and_then(|v| v.as_bool()).unwrap_or(true);
            let center = o.get("center").and_then(|v| v.as_bool()).unwrap_or(false);
            let visible = o.get("visible").and_then(|v| v.as_bool()).unwrap_or(true);

            // Idempotent: the window already exists. Honor the requested
            // visibility — `showMode: 'manual'` windows (quickAssistant,
            // selectionToolbar, …) must stay hidden on a plain re-open, while
            // normal reopens (main/settings) focus their window.
            if let Some(win) = app.get_webview_window(&label) {
                if visible {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
                return Ok(json!({ "created": false, "label": label }));
            }

            // The quick-assistant popup talks to the Asumi engine, not the
            // Cherry renderer: it loads the DSH web client on the same session
            // cookies the main window authenticated with. Until the engine has
            // announced its URL the Cherry entry is a placeholder; the DSH
            // watcher navigates the window once the URL is known.
            let quick_assistant = label == labels::QUICK_ASSISTANT;
            let dsh = if quick_assistant { known_dsh_url() } else { None };
            let (width, height) = if quick_assistant && dsh.is_some() {
                (width.max(720.0), height.max(560.0))
            } else {
                (width, height)
            };
            let web_url = match dsh.as_deref().and_then(|url| tauri::Url::parse(url).ok()) {
                Some(url) => WebviewUrl::External(url),
                None => WebviewUrl::App(app_path.into()),
            };

            let mut builder = WebviewWindowBuilder::new(app, &label, web_url)
                .title(label.clone())
                .inner_size(width, height)
                .decorations(frame)
                .always_on_top(always_on_top)
                .skip_taskbar(skip_taskbar)
                .visible(visible);
            if center {
                builder = builder.center();
            }
            builder
                .build()
                .map_err(|e| format!("window.create failed for {label}: {e}"))?;
            Ok(json!({ "created": true, "label": label }))
        }
        "window.show" | "window.focus" => {
            let label = args.get(0).and_then(|v| v.as_str()).unwrap_or_default();
            if let Some(win) = app.get_webview_window(label) {
                let _ = win.show();
                let _ = win.set_focus();
            }
            Ok(Value::Null)
        }
        "window.hide" => {
            let label = args.get(0).and_then(|v| v.as_str()).unwrap_or_default();
            if let Some(win) = app.get_webview_window(label) {
                let _ = win.hide();
            }
            Ok(Value::Null)
        }
        "window.close" => {
            let label = args.get(0).and_then(|v| v.as_str()).unwrap_or_default();
            if let Some(win) = app.get_webview_window(label) {
                let _ = win.close();
            }
            Ok(Value::Null)
        }
        "window.toggle" => {
            let label = args.get(0).and_then(|v| v.as_str()).unwrap_or_default();
            if let Some(win) = app.get_webview_window(label) {
                if win.is_visible().unwrap_or(true) {
                    let _ = win.hide();
                } else {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
            Ok(Value::Null)
        }
        "window.minimize" => {
            let label = args.get(0).and_then(|v| v.as_str()).unwrap_or_default();
            if let Some(win) = app.get_webview_window(label) {
                let _ = win.minimize();
            }
            Ok(Value::Null)
        }
        "window.set-position" => {
            let label = args.get(0).and_then(|v| v.as_str()).unwrap_or_default();
            let x = args.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0);
            let y = args.get(2).and_then(|v| v.as_f64()).unwrap_or(0.0);
            if let Some(win) = app.get_webview_window(label) {
                let _ = win.set_position(PhysicalPosition::new(
                    (x * win.scale_factor().unwrap_or(1.0)).round() as i32,
                    (y * win.scale_factor().unwrap_or(1.0)).round() as i32,
                ));
            }
            Ok(Value::Null)
        }
        "window.set-size" => {
            let label = args.get(0).and_then(|v| v.as_str()).unwrap_or_default();
            let w = args.get(1).and_then(|v| v.as_f64()).unwrap_or(800.0);
            let h = args.get(2).and_then(|v| v.as_f64()).unwrap_or(600.0);
            if let Some(win) = app.get_webview_window(label) {
                let _ = win.set_size(tauri::LogicalSize::new(w, h));
            }
            Ok(Value::Null)
        }
        "window.set-always-on-top" => {
            let label = args.get(0).and_then(|v| v.as_str()).unwrap_or_default();
            let on = args.get(1).and_then(|v| v.as_bool()).unwrap_or(true);
            if let Some(win) = app.get_webview_window(label) {
                let _ = win.set_always_on_top(on);
            }
            Ok(Value::Null)
        }
        "shortcut.register" => {
            let acc = args
                .get(0)
                .and_then(|v| v.as_str())
                .ok_or("shortcut.register: missing accelerator")?;
            let gs = app.global_shortcut();
            // Electron `globalShortcut.register` replaces a live shortcut; the
            // Tauri plugin would otherwise error when the OS still holds it
            // (e.g. a backend respawn re-registering from a fresh process).
            if gs.is_registered(acc) {
                let _ = gs.unregister(acc);
            }
            let acc_owned = acc.to_string();
            let bridge2 = Arc::clone(bridge);
            gs.on_shortcut(acc, move |_app, _sc, ev| {
                if matches!(ev.state, ShortcutState::Pressed) {
                    let msg = json!({ "type": "shortcut-press", "accelerator": acc_owned.clone() });
                    bridge_push(&bridge2, &msg);
                }
            })
            .map_err(|e| format!("shortcut.register {acc}: {e}"))?;
            Ok(json!(true))
        }
        "shortcut.unregister" => {
            let acc = args.get(0).and_then(|v| v.as_str()).unwrap_or_default();
            let _ = app.global_shortcut().unregister(acc);
            Ok(json!(true))
        }
        "shortcut.is-registered" => {
            let acc = args.get(0).and_then(|v| v.as_str()).unwrap_or_default();
            Ok(json!(app.global_shortcut().is_registered(acc)))
        }
        "shortcut.unregister-all" => {
            app.global_shortcut()
                .unregister_all()
                .map_err(|e| e.to_string())?;
            Ok(json!(true))
        }
        "theme.set" => {
            let source = args.get(0).and_then(|v| v.as_str()).unwrap_or("system");
            let theme = match source {
                "dark" => Some(Theme::Dark),
                "light" => Some(Theme::Light),
                _ => None,
            };
            app.set_theme(theme);
            Ok(Value::Null)
        }
        "theme.get" => {
            let theme = app
                .get_webview_window(labels::MAIN)
                .and_then(|w| w.theme().ok())
                .map(|t| match t {
                    Theme::Dark => "dark",
                    Theme::Light => "light",
                    _ => "system",
                });
            Ok(json!({ "theme": theme }))
        }
        "tray.create" => {
            if app.tray_by_id(TRAY_ID).is_some() {
                return Ok(json!(true));
            }
            let o = args.get(0).and_then(|v| v.as_object()).cloned().unwrap_or_default();
            let icon = o.get("icon").and_then(|v| v.as_object());
            let mut image = None;
            let as_template = icon
                .and_then(|i| i.get("asTemplate"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            if let Some(p) = icon.and_then(|i| i.get("path")).and_then(|v| v.as_str()) {
                if let Ok(bytes) = std::fs::read(p) {
                    image = Image::from_bytes(&bytes).ok();
                }
            }
            let mut builder = TrayIconBuilder::with_id(TRAY_ID)
                .tooltip("Cherry Studio")
                .show_menu_on_left_click(false);
            if let Some(img) = image {
                builder = builder.icon(img);
            }
            let bridge2 = Arc::clone(bridge);
            builder = builder.on_menu_event(move |_app, ev| {
                let msg = json!({ "type": "tray-menu-click", "id": ev.id().0.clone() });
                bridge_push(&bridge2, &msg);
            });
            let bridge3 = Arc::clone(bridge);
            builder = builder.on_tray_icon_event(move |_tray, ev| {
                eprintln!("[traya] {:?}", ev);
                let name = match &ev {
                    TrayIconEvent::Click { button, .. } => match button {
                        MouseButton::Right => "right-click",
                        _ => "click",
                    },
                    _ => return,
                };
                let msg = json!({ "type": "tray-event", "event": name });
                bridge_push(&bridge3, &msg);
            });
            let tray = builder.build(app).map_err(|e| e.to_string())?;
            if as_template {
                let _ = tray.set_icon_as_template(true);
            }
            Ok(json!(true))
        }
        "tray.set-icon" => {
            let Some(tray) = app.tray_by_id(TRAY_ID) else {
                return Err("tray not created".to_string());
            };
            let o = args.get(0).and_then(|v| v.as_object()).cloned().unwrap_or_default();
            let image = o
                .get("path")
                .and_then(|v| v.as_str())
                .and_then(|p| std::fs::read(p).ok())
                .and_then(|bytes| Image::from_bytes(&bytes).ok());
            if let Some(img) = image {
                tray.set_icon(Some(img)).map_err(|e| e.to_string())?;
            }
            if let Some(as_template) = o.get("asTemplate").and_then(|v| v.as_bool()) {
                let _ = tray.set_icon_as_template(as_template);
            }
            Ok(Value::Null)
        }
        "tray.set-tooltip" => {
            let title = args.get(0).and_then(|v| v.as_str()).unwrap_or_default();
            if let Some(tray) = app.tray_by_id(TRAY_ID) {
                tray.set_tooltip(Some(title)).map_err(|e| e.to_string())?;
            }
            Ok(Value::Null)
        }
        "tray.set-menu" => {
            #[cfg_attr(not(target_os = "linux"), allow(unused_variables))]
            let tray = app.tray_by_id(TRAY_ID);
            let Some(o) = args.get(0).and_then(|v| v.as_object()) else {
                return Ok(Value::Null);
            };
            let items = o
                .get("items")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            if items.is_empty() {
                *app.state::<ShellTrayState>().menu.lock().map_err(|e| e.to_string())? = None;
                #[cfg(target_os = "linux")]
                if let Some(t) = &tray {
                    t.set_menu(None::<Menu<Wry>>).map_err(|e| e.to_string())?;
                }
                return Ok(Value::Null);
            }
            let menu = build_tray_menu(app, &items)?;
            {
                let st = app.state::<ShellTrayState>();
                *st.menu.lock().map_err(|e| e.to_string())? = Some(menu.clone());
            }
            // Linux: no tray click events, so also wire the native context menu.
            #[cfg(target_os = "linux")]
            if let Some(t) = &tray {
                t.set_menu(Some(menu)).map_err(|e| e.to_string())?;
            }
            Ok(Value::Null)
        }
        "tray.menu-popup" => {
            // Cherry passes the menu explicitly to `popUpContextMenu` on
            // macOS/Windows (it never calls setContextMenu there), so the
            // item list may arrive here; rebuild when it does.
            let items = args.get(0).and_then(|v| v.as_array()).cloned();
            let menu = match items {
                Some(items) if !items.is_empty() => {
                    let menu = build_tray_menu(app, &items)?;
                    {
                        let st = app.state::<ShellTrayState>();
                        let _ = st.menu.lock().map_err(|e| e.to_string())?.insert(menu.clone());
                    }
                    Some(menu)
                }
                _ => app
                    .state::<ShellTrayState>()
                    .menu
                    .lock()
                    .map_err(|e| e.to_string())?
                    .clone(),
            };
            let Some(menu) = menu else {
                return Ok(Value::Null);
            };
            let Some(win) = app.get_webview_window(labels::MAIN) else {
                return Ok(Value::Null);
            };
            // Pops at the current cursor position, matching Electron's
            // `tray.popUpContextMenu` used by Cherry's right-click handler.
            menu.popup(win.as_ref().window()).map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        "tray.destroy" => {
            app.remove_tray_by_id(TRAY_ID);
            Ok(Value::Null)
        }
        "dialog.save" => {
            let options = args.get(0).and_then(|v| v.as_object()).cloned().unwrap_or_default();
            let mut builder = app.dialog().file();
            if let Some(title) = options.get("title").and_then(|v| v.as_str()) {
                builder = builder.set_title(title);
            }
            if let Some(name) = options
                .get("defaultPath")
                .and_then(|v| v.as_str())
                .and_then(|s| s.rsplit('/').next())
                .filter(|s| !s.is_empty())
            {
                builder = builder.set_file_name(name);
            }
            match builder.blocking_save_file() {
                Some(p) => Ok(json!({
                    "canceled": false,
                    "filePath": p.into_path().ok().map(|x| x.to_string_lossy().to_string())
                })),
                None => Ok(json!({ "canceled": true })),
            }
        }
        other => Err(format!("unknown sys channel: {other}")),
    }
}

fn show_or_create_settings(app: &tauri::AppHandle) -> tauri::Result<()> {
    if let Some(win) = app.get_webview_window(labels::SETTINGS) {
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }

    let (width, height) = app
        .get_webview_window(labels::MAIN)
        .and_then(|main| main.outer_size().ok())
        .map(|s| {
            let w = (s.width as f64 * 0.8).max(760.0);
            let h = (s.height as f64 * 0.8).max(560.0);
            (w, h)
        })
        .unwrap_or((960.0, 700.0));

    WebviewWindowBuilder::new(
        app,
        labels::SETTINGS,
        WebviewUrl::App("/windows/settings/index.html".into()),
    )
    .title("Settings")
    .inner_size(width, height)
    .min_inner_size(760.0, 560.0)
    .center()
    .build()?;
    Ok(())
}

#[tauri::command]
fn window_open_settings(app: tauri::AppHandle) -> Result<(), String> {
    show_or_create_settings(&app).map_err(|e| e.to_string())
}

#[tauri::command]
fn window_show_main(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(labels::MAIN) {
        let _ = win.show();
        let _ = win.set_focus();
    }
    Ok(())
}

#[derive(Deserialize)]
struct BackendInvokeArgs {
    channel: String,
    #[serde(default)]
    args: Vec<Value>,
}

#[tauri::command]
async fn backend_invoke(
    app: AppHandle,
    bridge: State<'_, Arc<BackendBridge>>,
    payload: BackendInvokeArgs,
) -> Result<Value, String> {
    let ch = payload.channel.as_str();
    // Intercept window management and shell operations locally (no backend hop)
    if let Some(res) = handle_window_command(&app, ch, &payload.args) {
        return res;
    }
    let bridge = Arc::clone(bridge.inner());
    // Blocking TCP round-trip must never run on the Tauri main thread.
    tauri::async_runtime::spawn_blocking(move || bridge.invoke(payload.channel, payload.args))
        .await
        .map_err(|e| format!("invoke task failed: {e}"))?
}

/// Local, backend-free handling of window/OS commands. Returns `Some` when the
/// command is handled here; otherwise the caller should relay to the backend.
fn handle_window_command(
    app: &AppHandle,
    ch: &str,
    args: &[Value],
) -> Option<Result<Value, String>> {
    match ch {
        "WindowManager_Open" | "window-manager:open" => {
            let kind = args.first().and_then(|v| v.as_str()).unwrap_or("");
            if kind == "settings" {
                if let Err(e) = show_or_create_settings(app) {
                    return Some(Err(e.to_string()));
                }
            } else {
                eprintln!("[tauri] WindowManager_Open ignored: {kind}");
            }
            Some(Ok(json!({ "success": true })))
        }
        "settings-window:open" => match show_or_create_settings(app) {
            Ok(()) => Some(Ok(json!("settings-window"))),
            Err(e) => Some(Err(e.to_string())),
        },
        "WindowManager_Close" | "window-manager:close" => Some(Ok(json!({ "success": true }))),
        "WindowManager_Minimize" | "window-manager:minimize" => {
            if let Some(win) = app.get_webview_window(labels::MAIN) {
                let _ = win.minimize();
            }
            Some(Ok(json!({ "success": true })))
        }
        "WindowManager_Maximize" | "window-manager:maximize" => {
            if let Some(win) = app.get_webview_window(labels::MAIN) {
                let _ = win.maximize();
            }
            Some(Ok(json!({ "success": true })))
        }
        "WindowManager_Unmaximize" | "window-manager:unmaximize" => {
            if let Some(win) = app.get_webview_window(labels::MAIN) {
                let _ = win.unmaximize();
            }
            Some(Ok(json!({ "success": true })))
        }
        "WindowManager_SetFullScreen" | "window-manager:set-full-screen" => {
            if let Some(win) = app.get_webview_window(labels::MAIN) {
                let _ = win.set_fullscreen(true);
            }
            Some(Ok(json!({ "success": true })))
        }
        "WindowManager_IsMaximized" | "window-manager:is-maximized" => {
            let v = app
                .get_webview_window(labels::MAIN)
                .map(|w| w.is_maximized().unwrap_or(false))
                .unwrap_or(false);
            Some(Ok(json!(v)))
        }
        "WindowManager_IsFullScreen" | "window-manager:is-full-screen" => {
            let v = app
                .get_webview_window(labels::MAIN)
                .map(|w| w.is_fullscreen().unwrap_or(false))
                .unwrap_or(false);
            Some(Ok(json!(v)))
        }
        "WindowManager_GetInitData" | "window-manager:get-init-data" => Some(Ok(Value::Null)),
        "config:get" | "app:set-auto-update" | "app:set-launch-on-boot"
        | "app:set-enable-spell-check" | "app:set-spell-check-languages"
        | "app:set-test-plan" | "app:set-test-channel" | "app:handle-zoom-factor"
        | "app:check-for-update" | "app:quit-and-install" => Some(Ok(Value::Null)),
        _ => None,
    }
}

#[tauri::command]
fn backend_send(bridge: State<'_, Arc<BackendBridge>>, payload: BackendInvokeArgs) -> Result<(), String> {
    // Fire-and-forget `send` to `ipcMain.on` handlers on a detached thread so the
    // Tauri main thread is never blocked. No backend round-trip response is waited on.
    let bridge = Arc::clone(bridge.inner());
    std::thread::spawn(move || {
        let _ = bridge.send(payload.channel, payload.args);
    });
    Ok(())
}

#[tauri::command]
fn backend_status(bridge: State<'_, Arc<BackendBridge>>) -> Result<Value, String> {
    let port = *bridge.port.lock().map_err(|e| e.to_string())?;
    let connected = bridge.stream.lock().map_err(|e| e.to_string())?.is_some();
    Ok(json!({ "port": port, "connected": connected }))
}

/// Voice used for a given script, overridable through the environment.
///
/// `say` reads with the system default voice, which is usually single-language
/// — English text under a Chinese default (or vice versa) is skipped or
/// mangled. Asumi picks a voice from the text's script instead.
fn tts_voice_for(text: &str) -> String {
    let has_kana = text
        .chars()
        .any(|c| matches!(c, '\u{3040}'..='\u{30ff}'));
    let has_han = text
        .chars()
        .any(|c| matches!(c, '\u{3400}'..='\u{4dbf}' | '\u{4e00}'..='\u{9fff}'));

    let (env_key, default) = if has_kana {
        ("ASUMI_TTS_VOICE_JA", "Kyoko")
    } else if has_han {
        ("ASUMI_TTS_VOICE_ZH", "Tingting")
    } else {
        ("ASUMI_TTS_VOICE_EN", "Samantha")
    };

    std::env::var("ASUMI_TTS_VOICE")
        .or_else(|_| std::env::var(env_key))
        .unwrap_or_else(|_| default.to_string())
}

/// The set of voice names this machine has, cached for the process lifetime.
fn installed_voices() -> &'static std::collections::HashSet<String> {
    static VOICES: std::sync::OnceLock<std::collections::HashSet<String>> = std::sync::OnceLock::new();
    VOICES.get_or_init(|| {
        match Command::new("/usr/bin/say").arg("-v").arg("?").output() {
            Ok(output) => String::from_utf8_lossy(&output.stdout)
                .lines()
                .filter_map(|line| line.split_whitespace().next().map(str::to_string))
                .collect(),
            Err(_) => std::collections::HashSet::new(),
        }
    })
}

/// Speak `text` through the OS text-to-speech engine.
///
/// macOS ships `say`; other platforms fall back to logging until a native
/// backend is wired.
fn asumi_speak(text: &str) {
    #[cfg(target_os = "macos")]
    {
        let voice = tts_voice_for(text);
        let mut command = Command::new("/usr/bin/say");
        if installed_voices().contains(&voice) {
            command.arg("-v").arg(&voice);
        }
        match command.arg(text).spawn() {
            Ok(child) => eprintln!("[tauri] tts speaking (pid {}, voice {voice})", child.id()),
            Err(error) => eprintln!("[tauri] tts failed: {error}"),
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        println!("[asumi-desktop] speak: {text}");
    }
}

/// Write half of the bridge connection, kept so commands can be answered.
///
/// The reader thread owns the stream; screen-capture replies need a second
/// handle, which `TcpStream::try_clone` provides. Cleared on disconnect.
static DESKTOP_WRITER: Mutex<Option<TcpStream>> = Mutex::new(None);
static SCREENSHOT_SEQ: AtomicU64 = AtomicU64::new(0);

/// Pet presence mode: `always` (常驻), `ghost` (透明), or `hidden`.
///
/// `always` keeps Asumi on screen. `ghost` keeps the window alive but fully
/// transparent until she speaks, then fades her back out. `hidden` takes the
/// window off screen entirely.
static PET_MODE: Mutex<Option<String>> = Mutex::new(None);

/// Token-authenticated DSH web client URL, once the engine announces it.
///
/// Saved so windows created later (the quick-assistant popup) can point at the
/// engine instead of the Cherry renderer.
static DSH_URL: Mutex<Option<String>> = Mutex::new(None);

/// The DSH URL announced by `scripts/spawn-dsh.mjs`, if it is already on disk.
fn dsh_url_from_file() -> Option<String> {
    let content = std::fs::read_to_string(resolve_repo_root().join("dist/dsh-url.json")).ok()?;
    let info: Value = serde_json::from_str(&content).ok()?;
    info.get("url").and_then(|v| v.as_str()).map(str::to_string)
}

/// The DSH URL this process knows about, from the watcher or from disk.
fn known_dsh_url() -> Option<String> {
    DSH_URL
        .lock()
        .ok()
        .and_then(|guard| guard.clone())
        .or_else(dsh_url_from_file)
}

/// Remember the DSH URL and navigate a webview window to it.
fn navigate_to_dsh(app: &AppHandle, label: &str, url: &str) {
    let literal = serde_json::to_string(url).unwrap_or_else(|_| "\"\"".to_string());
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.eval(&format!("window.location.href = {literal}"));
    }
}

/// Encode bytes as standard base64 (RFC 4648).
///
/// Hand-rolled to avoid a new dependency for the one place the bridge needs it.
fn base64_encode(input: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((input.len() + 2) / 3 * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((n >> 18) & 63) as usize] as char);
        out.push(TABLE[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 {
            TABLE[((n >> 6) & 63) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[(n & 63) as usize] as char
        } else {
            '='
        });
    }
    out
}

/// Send one JSON line to the bridge, if it is still connected.
fn bridge_reply(message: &Value) {
    let Ok(mut guard) = DESKTOP_WRITER.lock() else {
        return;
    };
    let Some(stream) = guard.as_mut() else {
        return;
    };
    let mut line = match serde_json::to_string(message) {
        Ok(line) => line,
        Err(_) => return,
    };
    line.push('\n');
    if stream.write_all(line.as_bytes()).is_err() || stream.flush().is_err() {
        *guard = None;
    }
}

/// Answer one `capture-screen` request with a base64 PNG (or an error).
///
/// macOS needs Screen Recording permission for the capture to include window
/// contents; without it `screencapture` still exits 0 but returns only the
/// desktop background. The reply carries `ok:false` whenever no image was
/// produced so the agent can tell the user instead of describing a blank frame.
fn handle_capture_screen(request_id: &str, msg: &Value) {
    let mut reply = json!({ "type": "capture-screen-result", "requestId": request_id });
    let result = capture_screen_png(msg);
    match result {
        Ok((bytes, width, height)) => {
            reply["ok"] = json!(true);
            reply["mediaType"] = json!("image/png");
            reply["data"] = json!(base64_encode(&bytes));
            reply["width"] = json!(width);
            reply["height"] = json!(height);
            eprintln!("[tauri] capture-screen {width}x{height} ({} bytes)", bytes.len());
        }
        Err(error) => {
            reply["ok"] = json!(false);
            reply["error"] = json!(error);
            eprintln!("[tauri] capture-screen failed: {error}");
        }
    }
    bridge_reply(&reply);
}

/// Run the platform screenshot tool and return the PNG bytes and dimensions.
#[cfg(target_os = "macos")]
fn capture_screen_png(msg: &Value) -> Result<(Vec<u8>, u32, u32), String> {
    let seq = SCREENSHOT_SEQ.fetch_add(1, Ordering::Relaxed);
    let path = std::env::temp_dir().join(format!("asumi-shot-{}-{seq}.png", std::process::id()));

    let mut command = Command::new("/usr/sbin/screencapture");
    command.arg("-x").arg("-t").arg("png");
    if let Some(display) = msg.get("display").and_then(|v| v.as_i64()) {
        command.arg("-D").arg(display.to_string());
    }
    if let Some(region) = msg.get("region").and_then(|v| v.as_str()) {
        command.arg("-R").arg(region);
    }
    command.arg(&path);

    let status = command
        .status()
        .map_err(|e| format!("could not run screencapture: {e}"))?;
    if !status.success() {
        return Err(format!("screencapture exited with {status}"));
    }

    let bytes = std::fs::read(&path).map_err(|e| format!("could not read screenshot: {e}"))?;
    let _ = std::fs::remove_file(&path);
    if bytes.len() < 24 {
        return Err("screencapture produced an empty image (is Screen Recording allowed?)".into());
    }

    // PNG IHDR: width and height are big-endian u32 at offsets 16 and 20.
    let width = u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]);
    let height = u32::from_be_bytes([bytes[20], bytes[21], bytes[22], bytes[23]]);
    Ok((bytes, width, height))
}

#[cfg(not(target_os = "macos"))]
fn capture_screen_png(_msg: &Value) -> Result<(Vec<u8>, u32, u32), String> {
    Err("screen capture is only implemented for macOS".into())
}

/// Dispatch one inbound desktop command from the `asumi-desktop` bridge.
fn handle_asumi_desktop_message(app: &AppHandle, msg: &Value) {
    let kind = msg.get("type").and_then(|v| v.as_str()).unwrap_or("");
    eprintln!("[tauri] asumi-desktop <- {kind}");
    match kind {
        "capture-screen" => {
            let request_id = msg
                .get("requestId")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if !request_id.is_empty() {
                handle_capture_screen(&request_id, msg);
            }
        }
        "speak" => {
            let text = msg.get("text").and_then(|v| v.as_str()).unwrap_or("");
            if !text.is_empty() {
                reveal_pet(app);
                let literal = serde_json::to_string(text).unwrap_or_else(|_| "\"\"".to_string());
                pet_eval(
                    app,
                    &format!("window.__asumiSay && window.__asumiSay({literal})"),
                );
                let _ = app
                    .notification()
                    .builder()
                    .title("アスミ")
                    .body(text)
                    .show();
                asumi_speak(text);
            }
        }
        "notify" => {
            let title = msg.get("title").and_then(|v| v.as_str()).unwrap_or("Asumi");
            let body = msg.get("body").and_then(|v| v.as_str()).unwrap_or("");
            let _ = app.notification().builder().title(title).body(body).show();
        }
        "pet-state" => {
            let state = msg.get("state").and_then(|v| v.as_str()).unwrap_or("neutral");
            reveal_pet(app);
            let literal = serde_json::to_string(state).unwrap_or_else(|_| "\"neutral\"".to_string());
            pet_eval(
                app,
                &format!("window.__asumiSetState && window.__asumiSetState({literal})"),
            );
            let _ = app.emit("asumi://pet-state", json!({ "state": state }));
        }
        "pet-mode" => {
            let mode = msg.get("mode").and_then(|v| v.as_str()).unwrap_or("always");
            apply_pet_mode(app, mode);
        }
        "audio" => {
            let name = msg.get("name").and_then(|v| v.as_str()).unwrap_or("");
            println!("[asumi-desktop] audio -> {name}");
        }
        other => {
            println!("[asumi-desktop] unhandled message: {other}");
        }
    }
}

/// Connect to the Asumi desktop bridge and keep consuming its JSON-line stream.
///
/// Reconnects with a short backoff: DSH (which hosts the bridge) may still be
/// starting when this thread first runs.
fn spawn_asumi_desktop_client(app: &AppHandle) {
    let app = app.clone();
    thread::spawn(move || {
        let addr = std::env::var("ASUMI_DESKTOP_PORT")
            .ok()
            .and_then(|p| p.parse::<u16>().ok())
            .map(|p| format!("127.0.0.1:{p}"))
            .unwrap_or_else(|| "127.0.0.1:3099".to_string());

        loop {
            match TcpStream::connect(&addr) {
                Ok(stream) => {
                    eprintln!("[tauri] asumi-desktop bridge connected ({addr})");
                    // Keep a write handle so capture-screen can answer on the
                    // same connection the commands arrive on.
                    match stream.try_clone() {
                        Ok(writer) => {
                            if let Ok(mut guard) = DESKTOP_WRITER.lock() {
                                *guard = Some(writer);
                            }
                        }
                        Err(error) => eprintln!("[tauri] bridge write handle failed: {error}"),
                    }
                    let reader = BufReader::new(stream);
                    for line in reader.lines() {
                        match line {
                            Ok(line) => {
                                if line.trim().is_empty() {
                                    continue;
                                }
                                match serde_json::from_str::<Value>(&line) {
                                    Ok(msg) => handle_asumi_desktop_message(&app, &msg),
                                    Err(_) => eprintln!("[tauri] bad desktop frame: {line}"),
                                }
                            }
                            Err(_) => break,
                        }
                    }
                    if let Ok(mut guard) = DESKTOP_WRITER.lock() {
                        *guard = None;
                    }
                    eprintln!("[tauri] asumi-desktop bridge disconnected; retrying");
                }
                Err(_) => { /* bridge not up yet */ }
            }
            thread::sleep(Duration::from_secs(2));
        }
    });
}

const PET_LABEL: &str = "pet";

/// Create the transparent, click-through pet window if it does not exist yet.
fn ensure_pet_window(app: &AppHandle) {
    if app.get_webview_window(PET_LABEL).is_some() {
        return;
    }

    let page = resolve_repo_root().join("src-tauri").join("pet").join("index.html");
    let Ok(url) = tauri::Url::from_file_path(&page) else {
        eprintln!("[tauri] pet page path invalid: {}", page.display());
        return;
    };

    match WebviewWindowBuilder::new(app, PET_LABEL, WebviewUrl::External(url))
        .title("Asumi")
        .inner_size(220.0, 320.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .build()
    {
        Ok(window) => {
            // Click-through: the pet is decoration, not a hit target.
            let _ = window.set_ignore_cursor_events(true);

            // Park it near the bottom-right of the primary monitor.
            if let Ok(Some(monitor)) = app.primary_monitor() {
                let scale = monitor.scale_factor();
                let screen = monitor.size();
                let margin = 24.0 * scale;
                let x = screen.width as f64 - 220.0 * scale - margin;
                let y = screen.height as f64 - 320.0 * scale - margin;
                let _ = window.set_position(PhysicalPosition::new(x, y));
            }

            eprintln!("[tauri] pet window created");
        }
        Err(error) => eprintln!("[tauri] pet window failed: {error}"),
    }
}

/// Call a JS hook on the pet page, ignoring when the window is absent.
fn pet_eval(app: &AppHandle, script: &str) {
    if let Some(pet) = app.get_webview_window(PET_LABEL) {
        let _ = pet.eval(script);
    }
}

/// The current presence mode, defaulting to 常驻 (`always`).
fn current_pet_mode() -> String {
    PET_MODE
        .lock()
        .ok()
        .and_then(|guard| guard.clone())
        .unwrap_or_else(|| "always".to_string())
}

/// Switch the pet window between the always-on, ghost, and hidden presences.
fn apply_pet_mode(app: &AppHandle, mode: &str) {
    let mode = match mode {
        "ghost" | "transparent" => "ghost",
        "hidden" | "off" => "hidden",
        _ => "always",
    };
    if let Ok(mut guard) = PET_MODE.lock() {
        *guard = Some(mode.to_string());
    }

    let literal = serde_json::to_string(mode).unwrap_or_else(|_| "\"always\"".to_string());
    pet_eval(
        app,
        &format!("window.__asumiSetMode && window.__asumiSetMode({literal})"),
    );

    if let Some(pet) = app.get_webview_window(PET_LABEL) {
        match mode {
            "hidden" => {
                let _ = pet.hide();
            }
            // Ghost mode starts transparent and is revealed by speech, so the
            // window stays mapped while the page keeps it invisible.
            _ => {
                let _ = pet.show();
            }
        }
    }
    let _ = app.emit("asumi://pet-mode", json!({ "mode": mode }));
    eprintln!("[tauri] pet mode -> {mode}");
}

/// Bring the pet window forward for one utterance, fading it back in ghost mode.
fn reveal_pet(app: &AppHandle) {
    if current_pet_mode() != "ghost" {
        return;
    }
    if let Some(pet) = app.get_webview_window(PET_LABEL) {
        let _ = pet.show();
    }
    pet_eval(app, "window.__asumiReveal && window.__asumiReveal()");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let bridge = Arc::new(BackendBridge::new());
    let bridge_for_setup = Arc::clone(&bridge);

    let bridge_for_events = Arc::clone(&bridge);
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .on_window_event(move |win, event| {
            // Reverse events: push window focus/blur and theme changes to the
            // Node backend so Cherry services (ShortcutService, QuickAssistantService,
            // ThemeService) get the same signals Electron would deliver.
            match event {
                WindowEvent::Focused(focused) => {
                    let msg = json!({ "type": "window-focus", "label": win.label(), "focused": focused });
                    bridge_push(&bridge_for_events, &msg);
                }
                WindowEvent::ThemeChanged(theme) => {
                    let msg = json!({ "type": "theme-changed", "theme": theme.to_string() });
                    bridge_push(&bridge_for_events, &msg);
                }
                _ => {}
            }
        })
        .manage(bridge)
        .manage(ShellTrayState { menu: Mutex::new(None) })
        .setup(move |app| {
            // Show the window immediately; boot the Node backend in the
            // background so startup isn't blocked on tsx cold-start.
            let app_handle = app.handle().clone();
            if let Some(main) = app_handle.get_webview_window(labels::MAIN) {
                let _ = main.show();
            }
            #[cfg(unix)]
            install_sigterm_exit(app_handle.clone(), Arc::clone(&bridge_for_setup));
            let bridge = bridge_for_setup;
            std::thread::spawn(move || spawn_backend_loop(&app_handle, &bridge));

            // Connect to the Asumi desktop bridge hosted by the DSH plugin.
            spawn_asumi_desktop_client(app.handle());

            // Spawn the transparent, always-on-top pet window.
            ensure_pet_window(app.handle());

            // Watch for the DSH URL file (written by beforeDevCommand: spawn-dsh.mjs)
            // and navigate the webviews once DSH is ready.
            let app_handle_dsh = app.handle().clone();
            let url_file = resolve_repo_root().join("dist/dsh-url.json");
            std::thread::spawn(move || {
                let start = std::time::Instant::now();
                loop {
                    if let Ok(content) = std::fs::read_to_string(&url_file) {
                        if let Ok(info) = serde_json::from_str::<serde_json::Value>(&content) {
                            if let Some(url) = info.get("url").and_then(|v| v.as_str()) {
                                eprintln!("[tauri] DSH ready at {url}");
                                if let Ok(mut guard) = DSH_URL.lock() {
                                    *guard = Some(url.to_string());
                                }
                                // Give the webview a moment to settle on about:blank
                                std::thread::sleep(std::time::Duration::from_millis(500));
                                navigate_to_dsh(&app_handle_dsh, labels::MAIN, url);
                                // A quick-assistant window built before the
                                // engine was ready still holds the Cherry
                                // placeholder; move it onto the engine too.
                                navigate_to_dsh(&app_handle_dsh, labels::QUICK_ASSISTANT, url);
                                break;
                            }
                        }
                    }
                    // Timeout after 3 minutes
                    if start.elapsed().as_secs() > 180 {
                        eprintln!("[tauri] DSH URL not found within 3 minutes; giving up");
                        break;
                    }
                    std::thread::sleep(std::time::Duration::from_millis(500));
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            window_open_settings,
            window_show_main,
            backend_invoke,
            backend_send,
            backend_status
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| {
            // On full app exit kill the Node backend child (and its pnpm/tsx
            // descendants die with the process tree) so no orphan holds the ports.
            if let tauri::RunEvent::Exit = event {
                let bridge = app_handle.state::<Arc<BackendBridge>>();
                kill_backend_group(&bridge);
                if let Some(mut child) = bridge.child.lock().ok().and_then(|mut g| g.take()) {
                    let _ = child.wait();
                }
            }
        });
}

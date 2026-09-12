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

            let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(app_path.into()))
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

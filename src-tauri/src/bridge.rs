//! Client half of the agent's desktop bridge.
//!
//! The `asumi-desktop` DSH plugin listens on `127.0.0.1:${ASUMI_DESKTOP_PORT}`
//! and speaks newline-delimited JSON: it sends desktop commands and this side
//! answers the ones that need a result. The connection is re-established with
//! a short backoff because the engine may still be starting when the shell
//! comes up.

use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use serde_json::{json, Value};
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

use crate::{pet, tts};

const DEFAULT_PORT: u16 = 3099;
const RECONNECT_DELAY: Duration = Duration::from_secs(2);

/// Write half of the live connection, kept so commands can be answered. The
/// reader owns the stream; `TcpStream::try_clone` provides the second handle.
static WRITER: Mutex<Option<TcpStream>> = Mutex::new(None);
static SCREENSHOT_SEQ: AtomicU64 = AtomicU64::new(0);
static PORT: OnceLock<u16> = OnceLock::new();

/// The port the bridge listens on, agreed with the engine at launch.
///
/// The engine is told this value through `ASUMI_DESKTOP_PORT`, so a stale
/// engine from an earlier run cannot be mistaken for this run's agent: a fresh
/// port is chosen whenever one is still held.
pub fn port() -> u16 {
    *PORT.get_or_init(|| {
        if let Ok(port) = std::env::var("ASUMI_DESKTOP_PORT") {
            if let Ok(port) = port.parse::<u16>() {
                return port;
            }
        }
        TcpListener::bind("127.0.0.1:0")
            .and_then(|listener| listener.local_addr())
            .map(|addr| addr.port())
            .unwrap_or(DEFAULT_PORT)
    })
}

/// Connect to the bridge and keep consuming its command stream.
pub fn spawn_client(app: AppHandle) {
    std::thread::spawn(move || {
        let addr = format!("127.0.0.1:{}", port());

        loop {
            match TcpStream::connect(&addr) {
                Ok(stream) => {
                    eprintln!("[asumi] desktop bridge connected ({addr})");
                    match stream.try_clone() {
                        Ok(writer) => {
                            if let Ok(mut guard) = WRITER.lock() {
                                *guard = Some(writer);
                            }
                        }
                        Err(error) => eprintln!("[asumi] bridge write handle failed: {error}"),
                    }

                    for line in BufReader::new(stream).lines() {
                        let Ok(line) = line else { break };
                        if line.trim().is_empty() {
                            continue;
                        }
                        match serde_json::from_str::<Value>(&line) {
                            Ok(message) => handle(&app, &message),
                            Err(_) => eprintln!("[asumi] malformed bridge frame"),
                        }
                    }

                    if let Ok(mut guard) = WRITER.lock() {
                        *guard = None;
                    }
                    eprintln!("[asumi] desktop bridge disconnected; retrying");
                }
                Err(_) => { /* the engine is not listening yet */ }
            }
            std::thread::sleep(RECONNECT_DELAY);
        }
    });
}

/// Dispatch one command from the agent.
fn handle(app: &AppHandle, message: &Value) {
    let kind = message.get("type").and_then(|v| v.as_str()).unwrap_or("");
    eprintln!("[asumi] desktop <- {kind}");
    match kind {
        "say" => {
            let ja = message.get("ja").and_then(|v| v.as_str()).unwrap_or("");
            let zh = message.get("zh").and_then(|v| v.as_str()).unwrap_or("");
            if ja.trim().is_empty() && zh.trim().is_empty() {
                return;
            }
            pet::say_pair(app, zh, ja);
            // Only the Japanese half is voiced; the Chinese half is the
            // subtitle. Synthesis may block while the model loads, so it does
            // not run on the bridge's reader thread.
            if !ja.trim().is_empty() {
                let handle = app.clone();
                let spoken = ja.to_string();
                std::thread::spawn(move || tts::speak(&handle, &spoken));
            }
        }
        "pet-state" => {
            let state = message
                .get("state")
                .and_then(|v| v.as_str())
                .unwrap_or("neutral");
            pet::set_state(app, state);
        }
        "pet-mode" => {
            let mode = message
                .get("mode")
                .and_then(|v| v.as_str())
                .unwrap_or("always");
            pet::set_presence(app, mode);
        }
        "notify" => {
            let title = message
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("Asumi");
            let body = message.get("body").and_then(|v| v.as_str()).unwrap_or("");
            let _ = app.notification().builder().title(title).body(body).show();
        }
        "audio" => {
            // Audio playback is not implemented yet; keep the command visible
            // in the log so the agent side can be developed against it.
            let name = message.get("name").and_then(|v| v.as_str()).unwrap_or("");
            println!("[asumi] audio (not implemented) -> {name}");
        }
        "capture-screen" => {
            let Some(request_id) = message.get("requestId").and_then(|v| v.as_str()) else {
                return;
            };
            capture_screen(request_id, message);
        }
        other => println!("[asumi] unhandled desktop message: {other}"),
    }
}

/// Send one JSON line back to the agent, dropping the connection if it fails.
fn reply(message: &Value) {
    let Ok(mut guard) = WRITER.lock() else { return };
    let Some(stream) = guard.as_mut() else { return };
    let Ok(mut line) = serde_json::to_string(message) else {
        return;
    };
    line.push('\n');
    if stream.write_all(line.as_bytes()).is_err() || stream.flush().is_err() {
        *guard = None;
    }
}

/// Answer one `capture-screen` request with a base64 PNG, or a reason.
///
/// macOS needs Screen Recording permission for the capture to include window
/// contents; without it `screencapture` still succeeds but returns only the
/// desktop background. Any failure is reported as `ok:false` so Asumi can tell
/// the user instead of describing a blank frame.
fn capture_screen(request_id: &str, message: &Value) {
    let mut answer = json!({ "type": "capture-screen-result", "requestId": request_id });
    match capture_screen_png(message) {
        Ok((bytes, width, height)) => {
            answer["ok"] = json!(true);
            answer["mediaType"] = json!("image/png");
            answer["data"] = json!(base64_encode(&bytes));
            answer["width"] = json!(width);
            answer["height"] = json!(height);
            eprintln!("[asumi] capture-screen {width}x{height} ({} bytes)", bytes.len());
        }
        Err(error) => {
            answer["ok"] = json!(false);
            answer["error"] = json!(error);
            eprintln!("[asumi] capture-screen failed: {error}");
        }
    }
    reply(&answer);
}

/// Run the platform screenshot tool and report the PNG bytes and dimensions.
#[cfg(target_os = "macos")]
fn capture_screen_png(message: &Value) -> Result<(Vec<u8>, u32, u32), String> {
    let seq = SCREENSHOT_SEQ.fetch_add(1, Ordering::Relaxed);
    let path = std::env::temp_dir().join(format!("asumi-shot-{}-{seq}.png", std::process::id()));

    let mut command = Command::new("/usr/sbin/screencapture");
    command.arg("-x").arg("-t").arg("png");
    if let Some(display) = message.get("display").and_then(|v| v.as_i64()) {
        command.arg("-D").arg(display.to_string());
    }
    if let Some(region) = message.get("region").and_then(|v| v.as_str()) {
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
        return Err("screencapture produced no image (is Screen Recording allowed?)".into());
    }

    // PNG IHDR: width and height are big-endian u32 at offsets 16 and 20.
    let width = u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]);
    let height = u32::from_be_bytes([bytes[20], bytes[21], bytes[22], bytes[23]]);
    Ok((bytes, width, height))
}

#[cfg(not(target_os = "macos"))]
fn capture_screen_png(_message: &Value) -> Result<(Vec<u8>, u32, u32), String> {
    Err("screen capture is only implemented for macOS".into())
}

/// Encode bytes as standard base64 (RFC 4648).
///
/// Hand-rolled so the one place the bridge needs base64 does not add a
/// dependency.
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

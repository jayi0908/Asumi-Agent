//! Where the DeepSeek Harness engine lives, and when it is ready.
//!
//! The engine serves a token-authenticated web client. `scripts/spawn-dsh.mjs`
//! starts it in development, writes its URL to `dist/dsh-url.json` once the
//! client is listening, and removes any previous run's file first, so the
//! file's presence always means "this run's engine is up".

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde_json::Value;
use tauri::{AppHandle, Manager};

use crate::{labels, quick};

/// How long to wait for the engine before giving up on the webviews.
const READY_TIMEOUT: Duration = Duration::from_secs(180);
const POLL_INTERVAL: Duration = Duration::from_millis(500);

/// Token-authenticated web client URL, once the engine announces it.
static DSH_URL: Mutex<Option<String>> = Mutex::new(None);

/// The repository root, derived from this crate's manifest directory.
pub fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

/// Path of the file the dev launcher writes once the engine is listening.
pub fn url_file() -> PathBuf {
    repo_root().join("dist/dsh-url.json")
}

/// The engine URL recorded by the dev launcher, if it is already on disk.
fn url_from_file(path: &std::path::Path) -> Option<String> {
    let content = std::fs::read_to_string(path).ok()?;
    let info: Value = serde_json::from_str(&content).ok()?;
    info.get("url").and_then(|v| v.as_str()).map(str::to_string)
}

/// The engine URL this process knows about, from the watcher or from disk.
pub fn known_url() -> Option<String> {
    DSH_URL
        .lock()
        .ok()
        .and_then(|guard| guard.clone())
        .or_else(|| url_from_file(&url_file()))
}

/// Navigate a webview window onto the engine.
///
/// The URL carries the one-time auth token; the web client answers with the
/// session cookie the other windows then share.
pub fn navigate(app: &AppHandle, label: &str, url: &str) {
    let literal = serde_json::to_string(url).unwrap_or_else(|_| "\"\"".to_string());
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.eval(&format!("window.location.href = {literal}"));
    }
}

/// Follow `dist/dsh-url.json` and move the webviews onto the engine when it
/// appears.
pub fn watch(app: AppHandle) {
    std::thread::spawn(move || {
        let path = url_file();
        let start = Instant::now();
        loop {
            if let Some(url) = url_from_file(&path) {
                eprintln!("[asumi] engine ready at {url}");
                if let Ok(mut guard) = DSH_URL.lock() {
                    *guard = Some(url.clone());
                }
                // Let the window settle on its loading page first; a webview
                // cannot always navigate while its first document is loading.
                std::thread::sleep(Duration::from_millis(500));
                navigate(&app, labels::MAIN, &url);
                // The quick-assistant popup, if it was summoned before the
                // engine was up, still shows the loading page.
                quick::navigate_if_open(&app, &url);
                break;
            }
            if start.elapsed() > READY_TIMEOUT {
                eprintln!("[asumi] engine did not announce a URL within {READY_TIMEOUT:?}");
                break;
            }
            std::thread::sleep(POLL_INTERVAL);
        }
    });
}

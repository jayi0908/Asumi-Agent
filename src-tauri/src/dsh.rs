//! Where the DeepSeek Harness engine lives, and where it can be reached.
//!
//! `engine.rs` starts the engine and hands its token-authenticated URL here;
//! this module owns that URL, the webview navigation onto it, and the paths the
//! engine keeps its state under.

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, Manager};

use crate::{labels, quick};

/// Token-authenticated web client URL, once the engine announces it.
static DSH_URL: Mutex<Option<String>> = Mutex::new(None);

/// The repository root, derived from this crate's manifest directory.
pub fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

/// The harness home: engine profiles, sessions, attachments, and credentials.
pub fn home() -> PathBuf {
    if let Ok(home) = std::env::var("DSH_HOME") {
        return PathBuf::from(home);
    }
    let base = std::env::var("HOME").unwrap_or_default();
    PathBuf::from(base).join("Library/Application Support/AsumiAgent")
}

/// The engine URL, once it is ready.
pub fn known_url() -> Option<String> {
    DSH_URL.lock().ok().and_then(|guard| guard.clone())
}

/// Record the engine's URL and move the webviews onto it.
///
/// The URL carries a one-time auth token; the web client answers with the
/// session cookie every window then shares.
pub fn publish(app: &AppHandle, url: &str) {
    eprintln!("[asumi] engine ready at {url}");
    if let Ok(mut guard) = DSH_URL.lock() {
        *guard = Some(url.to_string());
    }

    // Let the window finish settling on its loading page first; a webview
    // cannot always navigate while its first document is loading.
    std::thread::sleep(std::time::Duration::from_millis(500));
    navigate(app, labels::MAIN, url);
    // A quick-assistant popup summoned before the engine was up still shows
    // the loading page.
    quick::navigate_if_open(app, url);
}

/// Navigate a webview window onto the engine.
pub fn navigate(app: &AppHandle, label: &str, url: &str) {
    let literal = serde_json::to_string(url).unwrap_or_else(|_| "\"\"".to_string());
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.eval(&format!("window.location.href = {literal}"));
    }
}

//! The transparent pet window.
//!
//! Asumi's presence on the desktop: an undecorated, always-on-top, click-through
//! window parked in the corner of the primary monitor. The shell drives it by
//! calling the page's JS hooks, so the page owns appearance and the shell owns
//! lifetime and visibility.

use std::sync::Mutex;

use serde_json::json;
use tauri::{AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};

use crate::dsh;

/// Window label of the pet.
pub const LABEL: &str = "pet";

const WIDTH: f64 = 220.0;
const HEIGHT: f64 = 320.0;
const MARGIN: f64 = 24.0;

/// Pet presence mode: `always` (常驻), `ghost` (透明), or `hidden`.
///
/// `always` keeps Asumi on screen. `ghost` keeps the window mapped but fully
/// transparent until she speaks, then fades her back out. `hidden` takes the
/// window off screen entirely.
static MODE: Mutex<Option<String>> = Mutex::new(None);

/// The current presence mode, defaulting to 常驻.
pub fn current_mode() -> String {
    MODE.lock()
        .ok()
        .and_then(|guard| guard.clone())
        .unwrap_or_else(|| "always".to_string())
}

/// Create the pet window if it does not exist yet.
pub fn ensure(app: &AppHandle) {
    if app.get_webview_window(LABEL).is_some() {
        return;
    }

    let page = dsh::repo_root().join("src-tauri").join("pet").join("index.html");
    let Ok(url) = tauri::Url::from_file_path(&page) else {
        eprintln!("[asumi] pet page path invalid: {}", page.display());
        return;
    };

    match WebviewWindowBuilder::new(app, LABEL, WebviewUrl::External(url))
        .title("Asumi")
        .inner_size(WIDTH, HEIGHT)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .build()
    {
        Ok(window) => {
            // The pet is decoration, not a hit target.
            let _ = window.set_ignore_cursor_events(true);
            park_bottom_right(app, &window);
            eprintln!("[asumi] pet window created");
        }
        Err(error) => eprintln!("[asumi] pet window failed: {error}"),
    }
}

/// Park the window near the bottom-right of the primary monitor.
fn park_bottom_right(app: &AppHandle, window: &tauri::WebviewWindow) {
    let Ok(Some(monitor)) = app.primary_monitor() else {
        return;
    };
    let scale = monitor.scale_factor();
    let screen = monitor.size();
    let margin = MARGIN * scale;
    let x = screen.width as f64 - WIDTH * scale - margin;
    let y = screen.height as f64 - HEIGHT * scale - margin;
    let _ = window.set_position(PhysicalPosition::new(x, y));
}

/// Call a JS hook on the pet page, ignoring an absent window.
fn eval(app: &AppHandle, script: &str) {
    if let Some(pet) = app.get_webview_window(LABEL) {
        let _ = pet.eval(script);
    }
}

/// JSON-encode `value` for interpolation into an eval'd call.
fn literal(value: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "\"\"".to_string())
}

/// Update the pet's mood.
pub fn set_state(app: &AppHandle, state: &str) {
    reveal(app);
    eval(
        app,
        &format!(
            "window.__asumiSetState && window.__asumiSetState({})",
            literal(state)
        ),
    );
}

/// Show a speech bubble and reveal the pet in ghost mode.
pub fn say(app: &AppHandle, text: &str) {
    reveal(app);
    eval(
        app,
        &format!(
            "window.__asumiSay && window.__asumiSay({})",
            literal(text)
        ),
    );
}

/// Switch presence mode.
pub fn set_mode(app: &AppHandle, mode: &str) {
    let mode = match mode {
        "ghost" | "transparent" => "ghost",
        "hidden" | "off" => "hidden",
        _ => "always",
    };
    if let Ok(mut guard) = MODE.lock() {
        *guard = Some(mode.to_string());
    }

    eval(
        app,
        &format!(
            "window.__asumiSetMode && window.__asumiSetMode({})",
            literal(mode)
        ),
    );

    if let Some(pet) = app.get_webview_window(LABEL) {
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
    eprintln!("[asumi] pet mode -> {mode}");
}

/// Bring the pet forward for one utterance, fading it back in ghost mode.
pub fn reveal(app: &AppHandle) {
    if current_mode() != "ghost" {
        return;
    }
    if let Some(pet) = app.get_webview_window(LABEL) {
        let _ = pet.show();
    }
    eval(app, "window.__asumiReveal && window.__asumiReveal()");
}

/// Whether the pet window is currently visible to the user.
pub fn visible(app: &AppHandle) -> bool {
    app.get_webview_window(LABEL)
        .and_then(|pet| pet.is_visible().ok())
        .unwrap_or(false)
}

/// Toggle between the last visible presence and hidden.
pub fn toggle_hidden(app: &AppHandle) {
    if visible(app) {
        set_mode(app, "hidden");
    } else {
        set_mode(app, "always");
    }
}

/// A JSON snapshot of the pet state, for logging and the tray.
pub fn state_snapshot(app: &AppHandle) -> serde_json::Value {
    json!({ "mode": current_mode(), "visible": visible(app) })
}

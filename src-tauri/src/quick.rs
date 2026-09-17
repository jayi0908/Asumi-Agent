//! The quick-assistant popup, summoned with a global shortcut.
//!
//! It is a second webview onto the same engine, so it shares the session
//! cookie the main window authenticated with. When the engine is not up yet it
//! holds the loading page and `dsh::watch` moves it over afterwards.
//!
//! Alt-tabbing away dismisses it, which is what makes it a "quick" surface
//! rather than a second main window.

use tauri::{AppHandle, Manager, WindowEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::dsh;
use crate::QUICK_SHORTCUT;

/// Window label of the popup.
pub const LABEL: &str = "quickAssistant";

const WIDTH: f64 = 720.0;
const HEIGHT: f64 = 560.0;

/// Bind the summon shortcut.
pub fn register_shortcut(app: &AppHandle) {
    let handle = app.clone();
    let result = app
        .global_shortcut()
        .on_shortcut(QUICK_SHORTCUT, move |_app, _shortcut, event| {
            if matches!(event.state, ShortcutState::Pressed) {
                toggle(&handle);
            }
        });
    if let Err(error) = result {
        eprintln!("[asumi] could not bind {QUICK_SHORTCUT}: {error}");
    }
}

/// Show the popup, or hide it when it is already up.
pub fn toggle(app: &AppHandle) {
    match app.get_webview_window(LABEL) {
        Some(window) if window.is_visible().unwrap_or(false) => {
            let _ = window.hide();
        }
        Some(window) => {
            let _ = window.show();
            let _ = window.set_focus();
        }
        None => ensure(app),
    }
}

/// Create the popup, pointed at the engine when its URL is already known.
pub fn ensure(app: &AppHandle) {
    let url = match dsh::known_url().and_then(|url| tauri::Url::parse(&url).ok()) {
        Some(url) => WebviewUrl::External(url),
        None => WebviewUrl::App("index.html".into()),
    };

    match WebviewWindowBuilder::new(app, LABEL, url)
        .title("Asumi")
        .inner_size(WIDTH, HEIGHT)
        .always_on_top(true)
        .skip_taskbar(true)
        .center()
        .build()
    {
        Ok(window) => {
            let handle = app.clone();
            window.on_window_event(move |event| {
                if let WindowEvent::Focused(false) = event {
                    if let Some(window) = handle.get_webview_window(LABEL) {
                        let _ = window.hide();
                    }
                }
            });
            let _ = window.show();
            let _ = window.set_focus();
        }
        Err(error) => eprintln!("[asumi] quick window failed: {error}"),
    }
}

/// Move the popup onto the engine, if it is open and still loading.
pub fn navigate_if_open(app: &AppHandle, url: &str) {
    if app.get_webview_window(LABEL).is_some() {
        dsh::navigate(app, LABEL, url);
    }
}

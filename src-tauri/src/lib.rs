//! Asumi Agent desktop shell.
//!
//! The shell owns nothing about the agent itself: the DeepSeek Harness engine
//! runs the conversation, the tools, and every model request, and serves the
//! UI as a web client. This process is the desktop half:
//!
//! * it starts the engine (through `beforeDevCommand` in development),
//! * points the webviews at the engine once it announces its token URL,
//! * hosts the transparent pet window,
//! * and answers the engine's desktop bridge (speech, notifications, presence,
//!   and screen capture).

pub mod bridge;
pub mod dsh;
pub mod pet;
pub mod quick;
pub mod tray;
pub mod voice;

use tauri::Manager;

/// Window labels owned by the shell.
pub mod labels {
    /// The main conversation window (declared in `tauri.conf.json`).
    pub const MAIN: &str = "main";
}

/// Global shortcut that summons the quick-assistant window.
pub const QUICK_SHORTCUT: &str = "CmdOrCtrl+E";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();

            // Show the main window immediately; it holds a "starting the
            // engine" page until DSH announces its URL, then navigates.
            if let Some(main) = handle.get_webview_window(labels::MAIN) {
                let _ = main.show();
            }

            pet::ensure(&handle);
            tray::install(&handle);
            quick::register_shortcut(&handle);

            // Answer the engine's desktop bridge and follow its readiness.
            bridge::spawn_client(handle.clone());
            dsh::watch(handle);

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running Asumi Agent")
        // The engine is a child of the dev command (or of whoever launched this
        // process), so it is reaped with the process tree rather than tracked
        // here; run() therefore has no exit work of its own.
        .run(|_app, _event| {});
}

//! Asumi Agent desktop shell.
//!
//! The shell owns nothing about the agent itself: the DeepSeek Harness engine
//! runs the conversation, the tools, and every model request, and serves the
//! agent UI as a web client. This process is the desktop half:
//!
//! * it starts and stops the engine,
//! * points the webviews at it once it announces its token URL,
//! * hosts the pet window and the settings window,
//! * and answers the engine's desktop bridge (speech, notifications, presence,
//!   screen capture).

pub mod bridge;
pub mod dsh;
pub mod engine;
pub mod pet;
pub mod prefs;
pub mod quick;
pub mod settings;
pub mod tray;
pub mod voice;

use tauri::{Manager, RunEvent, WindowEvent};

/// Window labels owned by the shell.
pub mod labels {
    /// The main conversation window (declared in `tauri.conf.json`).
    pub const MAIN: &str = "main";
}

/// Global shortcut that summons the quick-assistant window.
pub const QUICK_SHORTCUT: &str = "CmdOrCtrl+E";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Block termination signals before the runtime spawns its threads: a mask
    // is inherited per thread, so anything started later would otherwise take
    // the signal and exit before the engine can be stopped.
    engine::handle_signals();

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            prefs::shell_settings,
            prefs::save_shell_settings
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            // Settings first: the pet and the tray are both built from them.
            settings::load(&handle);

            // Show the main window immediately; it holds a "starting the
            // engine" page until DSH announces its URL, then navigates.
            if let Some(main) = handle.get_webview_window(labels::MAIN) {
                let _ = main.show();
                // The menu bar's contrast follows the system theme.
                let themed = handle.clone();
                main.on_window_event(move |event| {
                    if let WindowEvent::ThemeChanged(_) = event {
                        tray::refresh_icon(&themed);
                    }
                });
            }

            pet::ensure(&handle);
            tray::install(&handle);
            quick::register_shortcut(&handle);

            // The settings window is normally reachable only from the tray and
            // ⌘,; the override opens it at launch for debugging, like the
            // engine-path overrides.
            if std::env::var_os("ASUMI_OPEN_SETTINGS").is_some() {
                prefs::open(&handle);
            }

            // Answer the engine's desktop bridge, then start the engine and
            // let it publish the URL the webviews navigate to.
            bridge::spawn_client(handle.clone());
            engine::spawn(&handle);

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running Asumi Agent")
        .run(|_app, event| {
            if let RunEvent::Exit = event {
                engine::shutdown();
            }
        });
}

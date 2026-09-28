//! The settings window.
//!
//! A plain local page with no frontend build, like the pet and loading pages.
//! It edits only shell-side settings: anything about the model, the persona, or
//! skills belongs to the engine and stays in the engine's own UI.
//!
//! The page talks to the shell through the injected `window.asumi` bridge
//! rather than `withGlobalTauri`, so the API is not exposed to the engine's web
//! client, which is an ordinary web page from the shell's point of view.

use serde_json::{json, Value};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::settings::{
    self, ShellSettings, APPEARANCES, PET_FORMS, PRESENCES, SPRITE_MODES, SPRITE_PACKS,
    VOICE_BACKENDS,
};
use crate::{pet, sprite, tray, voice};

/// Window label of the settings window.
pub const LABEL: &str = "settings";

const WIDTH: f64 = 520.0;
const HEIGHT: f64 = 620.0;

/// Open the settings window, creating it on first use.
pub fn open(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    // The page calls commands through this shim; the invoke entry point is
    // always present in a Tauri webview even without the global API. The sprite
    // previews load the layered art through the asset protocol, so the page also
    // gets `convertFileSrc`.
    let init = "window.asumi = { invoke: (cmd, args) => window.__TAURI_INTERNALS__.invoke(cmd, args ?? {}), convertFileSrc: (path) => window.__TAURI_INTERNALS__.convertFileSrc(path) };";

    // Served from the app's own origin: a file:// page counts as a remote
    // origin, and the IPC layer refuses custom commands to remote content.
    match WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("settings/index.html".into()))
        .title("Asumi Agent 设置")
        .inner_size(WIDTH, HEIGHT)
        .resizable(false)
        .center()
        .initialization_script(init)
        .build()
    {
        Ok(_) => eprintln!("[asumi] settings window opened"),
        Err(error) => eprintln!("[asumi] settings window failed: {error}"),
    }
}

/// Everything the settings page needs to render itself.
#[tauri::command]
pub fn shell_settings() -> Value {
    // Logged because this is the only signal that the settings page loaded and
    // its injected bridge reached the shell.
    eprintln!("[asumi] settings page asked for its configuration");
    let current = settings::get();
    json!({
        "settings": current,
        "options": {
            "presences": PRESENCES,
            "appearances": APPEARANCES,
            "voiceBackends": VOICE_BACKENDS,
            "petForms": PET_FORMS,
            "spritePacks": SPRITE_PACKS,
            "spriteModes": SPRITE_MODES,
            "voices": voice::selectable(),
        },
    })
}

/// The layered sprite catalog: packs, bodies, and faces with their canvas
/// offsets. Empty when the art is not on this machine.
#[tauri::command]
pub fn sprite_catalog() -> Value {
    sprite::catalog()
}

/// Show a sprite in the pet right now (the settings window's test button).
#[tauri::command]
pub fn test_pet_sprite(app: AppHandle) {
    pet::preview_sprite(&app);
}

/// Persist a settings change and apply it everywhere it matters.
#[tauri::command]
pub fn save_shell_settings(app: AppHandle, settings: ShellSettings) -> Value {
    let saved = settings::put(&app, settings);

    pet::apply_presence(&app, &saved.presence);
    pet::apply_appearance(&app, &saved.appearance);
    pet::apply_click_through(&app, saved.click_through);
    // The sprite root may have moved, so re-allow it before the page reloads a
    // layer, then hand over the new form and catalog.
    sprite::allow(&app);
    pet::apply_form(&app, &saved.pet_form);
    pet::apply_sprite(&app);
    // Voice settings are read at each utterance, so nothing to apply here.
    tray::refresh(&app);

    json!({ "settings": saved })
}

//! Shell-side settings: how Asumi looks, sounds, and presents herself.
//!
//! These are the settings that belong to the desktop shell rather than to the
//! agent. Anything about the model, the persona, or skills lives in the
//! engine's own settings document and is edited in the engine's UI; nothing is
//! duplicated here.
//!
//! The store is a small JSON file in the app's config directory, so it is
//! shared by the tray, the pet window, and the settings window, and survives
//! restarts.

use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// How Asumi enters and leaves the screen.
pub const APPEARANCES: [&str; 3] = ["fade", "peek-bottom", "peek-top"];

/// Whether and how long Asumi stays on screen.
pub const PRESENCES: [&str; 3] = ["always", "ghost", "hidden"];

/// Which engine voices Asumi.
pub const VOICE_BACKENDS: [&str; 2] = ["asumi", "system"];

const FILE: &str = "shell-settings.json";

/// Persisted shell settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ShellSettings {
    /// Appearance module: `fade` | `peek-bottom` | `peek-top`.
    pub appearance: String,
    /// Presence mode: `always` | `ghost` | `hidden`.
    pub presence: String,
    /// Voice for every script; empty means "pick by script".
    pub voice: String,
    /// Voice for kana text.
    pub voice_ja: String,
    /// Voice for Han text without kana.
    pub voice_zh: String,
    /// Voice for everything else.
    pub voice_en: String,
    /// When true the pet ignores the pointer, so clicks pass through to
    /// whatever is behind her.
    pub click_through: bool,
    /// Voice backend: `asumi` (the cloned voice service) or `system` (`say`).
    pub voice_backend: String,
    /// Where the Asumi-TTS repository lives. Empty means "do not launch".
    pub tts_repo: String,
    /// Base URL of the voice service.
    pub tts_url: String,
    /// Start the service on first use instead of requiring it to be running.
    pub tts_lazy_start: bool,
    /// Interpreter used to start the service.
    pub tts_python: String,
    /// Speech rate: the service's `length`, where >1 is slower.
    pub tts_length: f64,
}

impl Default for ShellSettings {
    fn default() -> Self {
        Self {
            appearance: "fade".to_string(),
            presence: "always".to_string(),
            voice: crate::voice::default_voice_all(),
            voice_ja: crate::voice::default_voice("ja"),
            voice_zh: crate::voice::default_voice("zh"),
            voice_en: crate::voice::default_voice("en"),
            click_through: true,
            voice_backend: "asumi".to_string(),
            tts_repo: String::new(),
            tts_url: "http://127.0.0.1:8077".to_string(),
            tts_lazy_start: true,
            tts_python: "python3".to_string(),
            tts_length: 1.0,
        }
    }
}

impl ShellSettings {
    /// Clamp free-form values, so a hand-edited file cannot put the shell in a
    /// state no surface can select its way out of.
    fn normalized(mut self) -> Self {
        if !APPEARANCES.contains(&self.appearance.as_str()) {
            self.appearance = ShellSettings::default().appearance;
        }
        if !PRESENCES.contains(&self.presence.as_str()) {
            self.presence = ShellSettings::default().presence;
        }
        if !VOICE_BACKENDS.contains(&self.voice_backend.as_str()) {
            self.voice_backend = ShellSettings::default().voice_backend;
        }
        // A rate outside this range is a hand-edit mistake; clamp rather than
        // let it reach the model.
        self.tts_length = self.tts_length.clamp(0.5, 2.0);
        self
    }
}

static SETTINGS: Mutex<Option<ShellSettings>> = Mutex::new(None);

fn path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join(FILE))
}

/// Read the settings from disk into the process cache.
pub fn load(app: &AppHandle) -> ShellSettings {
    let loaded = path(app)
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|text| serde_json::from_str::<ShellSettings>(&text).ok())
        .unwrap_or_default()
        .normalized();

    if let Ok(mut guard) = SETTINGS.lock() {
        *guard = Some(loaded.clone());
    }
    loaded
}

/// The current settings, falling back to defaults before `load` has run.
pub fn get() -> ShellSettings {
    SETTINGS
        .lock()
        .ok()
        .and_then(|guard| guard.clone())
        .unwrap_or_default()
}

/// Replace the settings in memory, then persist them.
///
/// Writing is best-effort: losing the file costs the user their preferences,
/// which must not stop the tray or the pet from responding.
pub fn put(app: &AppHandle, next: ShellSettings) -> ShellSettings {
    let next = next.normalized();
    if let Ok(mut guard) = SETTINGS.lock() {
        *guard = Some(next.clone());
    }
    if let Some(path) = path(app) {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        match serde_json::to_string_pretty(&next) {
            Ok(text) => {
                if let Err(error) = std::fs::write(&path, format!("{text}\n")) {
                    eprintln!("[asumi] could not save shell settings: {error}");
                }
            }
            Err(error) => eprintln!("[asumi] could not encode shell settings: {error}"),
        }
    }
    next
}

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

/// How Asumi enters and leaves the screen. There is no top-right peek: the
/// sprite form is anchored to the bottom-right corner.
pub const APPEARANCES: [&str; 2] = ["fade", "peek-bottom"];

/// Whether and how long Asumi stays on screen.
pub const PRESENCES: [&str; 3] = ["always", "ghost", "hidden"];

/// Which engine voices Asumi.
pub const VOICE_BACKENDS: [&str; 2] = ["asumi", "system"];

/// What the pet is wearing: the chibi sticker, or the layered game sprite.
pub const PET_FORMS: [&str; 2] = ["sd", "tachie"];

/// Resolution packs the sprite form can load. `fa` is the bust crop and is not
/// selectable — the settings list only borrows it for thumbnails.
pub const SPRITE_PACKS: [&str; 3] = ["no", "z1", "z2"];

/// How a sprite body is chosen for each appearance.
pub const SPRITE_MODES: [&str; 3] = ["fixed", "subset", "all"];

const FILE: &str = "shell-settings.json";

/// Persisted shell settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ShellSettings {
    /// Appearance module: `fade` | `peek-bottom`.
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
    /// Which form the pet wears: `sd` (the chibi sticker) or `tachie` (the
    /// layered game sprite).
    pub pet_form: String,
    /// Where the layered sprite art lives. Empty means `<repo>/assets`.
    pub sprite_root: String,
    /// Resolution pack to load for the sprite form: `no` | `z1` | `z2` | `fa`.
    pub sprite_pack: String,
    /// How a body is chosen for each appearance: `fixed` | `subset` | `all`.
    pub sprite_mode: String,
    /// The one body loaded in `fixed` mode.
    pub sprite_body: String,
    /// The bodies eligible in `subset` mode.
    pub sprite_bodies: Vec<String>,
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
            pet_form: "sd".to_string(),
            sprite_root: String::new(),
            sprite_pack: "z1".to_string(),
            sprite_mode: "all".to_string(),
            sprite_body: String::new(),
            sprite_bodies: Vec::new(),
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
        if !PET_FORMS.contains(&self.pet_form.as_str()) {
            self.pet_form = ShellSettings::default().pet_form;
        }
        if !SPRITE_PACKS.contains(&self.sprite_pack.as_str()) {
            self.sprite_pack = ShellSettings::default().sprite_pack;
        }
        if !SPRITE_MODES.contains(&self.sprite_mode.as_str()) {
            self.sprite_mode = ShellSettings::default().sprite_mode;
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

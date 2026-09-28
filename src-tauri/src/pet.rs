//! The transparent pet window.
//!
//! Asumi's presence on the desktop: an undecorated, always-on-top window parked
//! in a corner of the primary monitor. Two orthogonal settings drive it:
//!
//! * **presence** (`always` / `ghost` / `hidden`) decides whether she is on
//!   screen at all, and whether she leaves between utterances;
//! * **appearance** (`fade` / `peek-bottom`) decides how she
//!   arrives and leaves, and which corner she lives in.
//!
//! The shell owns the window's position and visibility; the page owns the
//! animation, so a peek is a CSS transform rather than a window being moved
//! frame by frame.

use std::sync::Mutex;

use tauri::{AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};

use crate::settings;

/// Window label of the pet.
pub const LABEL: &str = "pet";

/// Window size. Wide enough that a bilingual line wraps instead of being cut
/// off, and tall enough that the caption has room to itself.
const WIDTH: f64 = 360.0;
const HEIGHT: f64 = 420.0;
const MARGIN: f64 = 18.0;

/// The presence mode last applied to the window.
static PRESENCE: Mutex<Option<String>> = Mutex::new(None);

/// The presence mode in force, defaulting to 常駐.
pub fn presence() -> String {
    PRESENCE
        .lock()
        .ok()
        .and_then(|guard| guard.clone())
        .unwrap_or_else(|| settings::ShellSettings::default().presence)
}

/// Create the pet window if it does not exist yet.
pub fn ensure(app: &AppHandle) {
    if app.get_webview_window(LABEL).is_some() {
        return;
    }

    let current = settings::get();
    // Hand the page its initial state before it renders, so no setter can race
    // the page's own scripts. `convertFileSrc` lets the sprite form load the
    // layered art the shell allowed into the asset scope.
    let init = format!(
        "window.asumi = {{ convertFileSrc: (path) => window.__TAURI_INTERNALS__.convertFileSrc(path) }};\n\
         window.__ASUMI_INIT = {};",
        serde_json::json!({
            "presence": current.presence,
            "appearance": current.appearance,
            "sprite": sprite_config(),
        })
    );

    // Served from the app's own origin, so the page is "local" to the IPC
    // layer and can use the injected bridge without an ACL grant.
    match WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("pet/index.html".into()))
        .title("Asumi")
        .inner_size(WIDTH, HEIGHT)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .initialization_script(&init)
        .build()
    {
        Ok(window) => {
            let _ = window.set_ignore_cursor_events(current.click_through);
            park(app);
            apply_presence(app, &current.presence);
            eprintln!("[asumi] pet window created");
        }
        Err(error) => eprintln!("[asumi] pet window failed: {error}"),
    }
}

/// Park the window in the corner the appearance module uses.
///
/// The work area excludes the menu bar and the Dock, which matters for the
/// top-right module: a window placed at the raw screen origin would sit under
/// the menu bar.
fn park(app: &AppHandle) {
    let Some(window) = app.get_webview_window(LABEL) else {
        return;
    };
    let Ok(Some(monitor)) = app.primary_monitor() else {
        return;
    };

    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let width = WIDTH * scale;
    let height = HEIGHT * scale;
    let margin = MARGIN * scale;

    let x = area.position.x as f64 + area.size.width as f64 - width - margin;
    let y = area.position.y as f64 + area.size.height as f64 - height - margin;

    let _ = window.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32));
}

/// The sprite settings plus the layer catalog the page composites from.
fn sprite_config() -> serde_json::Value {
    let current = settings::get();
    serde_json::json!({
        "form": current.pet_form,
        "pack": current.sprite_pack,
        "mode": current.sprite_mode,
        "body": current.sprite_body,
        "bodies": current.sprite_bodies,
        "catalog": crate::sprite::catalog(),
    })
}

/// Tell the pet which form to wear (SD sticker or layered sprite).
pub fn apply_form(app: &AppHandle, form: &str) {
    eval(
        app,
        &format!("window.__asumiSetForm && window.__asumiSetForm({})", literal(form)),
    );
}

/// Push the sprite settings and catalog to the pet.
pub fn apply_sprite(app: &AppHandle) {
    let config = sprite_config();
    eval(
        app,
        &format!(
            "window.__asumiSetSpriteConfig && window.__asumiSetSpriteConfig({})",
            config
        ),
    );
}

/// Load a sprite now and show it, whatever the presence mode is — the settings
/// window's test button, so a chosen body can be seen without waiting for a line.
pub fn preview_sprite(app: &AppHandle) {
    eval(app, "window.__asumiPreviewSprite && window.__asumiPreviewSprite()");
}

/// Let the sprite form pick a body for this appearance. Random modes change
/// body per utterance, so the shell calls this just before she speaks.
pub fn refresh_sprite(app: &AppHandle) {
    eval(app, "window.__asumiRefreshSprite && window.__asumiRefreshSprite()");
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

/// Apply the presence mode to the window.
pub fn apply_presence(app: &AppHandle, mode: &str) {
    let mode = match mode {
        "ghost" => "ghost",
        "hidden" => "hidden",
        _ => "always",
    };
    if let Ok(mut guard) = PRESENCE.lock() {
        *guard = Some(mode.to_string());
    }

    eval(
        app,
        &format!(
            "window.__asumiSetPresence && window.__asumiSetPresence({})",
            literal(mode)
        ),
    );

    if let Some(pet) = app.get_webview_window(LABEL) {
        match mode {
            "hidden" => {
                let _ = pet.hide();
            }
            // Ghost stays mapped but invisible: the page keeps it that way and
            // reveals it on speech, which cannot happen while hidden.
            _ => {
                let _ = pet.show();
            }
        }
    }
    eprintln!("[asumi] presence -> {mode}");
}

/// Switch presence mode and remember it.
pub fn set_presence(app: &AppHandle, mode: &str) {
    let mut next = settings::get();
    next.presence = mode.to_string();
    let saved = settings::put(app, next);
    apply_presence(app, &saved.presence);
    crate::tray::refresh(app);
}

/// Apply the appearance module: re-park and tell the page how to animate.
pub fn apply_appearance(app: &AppHandle, module: &str) {
    eval(
        app,
        &format!(
            "window.__asumiSetAppearance && window.__asumiSetAppearance({})",
            literal(module)
        ),
    );
    park(app);
}

/// Switch appearance module and remember it.
pub fn set_appearance(app: &AppHandle, module: &str) {
    let mut next = settings::get();
    next.appearance = module.to_string();
    let saved = settings::put(app, next);
    apply_appearance(app, &saved.appearance);
    crate::tray::refresh(app);
}

/// Apply the click-through preference.
pub fn apply_click_through(app: &AppHandle, enabled: bool) {
    if let Some(pet) = app.get_webview_window(LABEL) {
        let _ = pet.set_ignore_cursor_events(enabled);
    }
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

/// Set the pet's mood without revealing her.
///
/// A spoken reply carries its emotion on the same frame as its lines, and the
/// pet should already wear it when the first line brings her on screen — the
/// mood itself must not be what reveals her.
pub fn set_emotion(app: &AppHandle, state: &str) {
    eval(
        app,
        &format!(
            "window.__asumiSetState && window.__asumiSetState({})",
            literal(state)
        ),
    );
}

/// Show a caption with one bilingual line, revealing the pet in ghost mode.
///
/// `zh` is the subtitle and `ja` is what the voice reads; both are shown, in
/// that order, the way the character's lines are presented in the source
/// material. An empty half is simply omitted.
pub fn say_pair(app: &AppHandle, zh: &str, ja: &str) {
    let mut lines: Vec<String> = Vec::new();
    if !zh.trim().is_empty() {
        lines.push(format!("「{}」", zh.trim()));
    }
    if !ja.trim().is_empty() {
        lines.push(format!("「{}」", ja.trim()));
    }
    if lines.is_empty() {
        return;
    }
    say(app, &lines.join("\n"));
}

/// Show a caption, revealing the pet when she is in ghost mode.
pub fn say(app: &AppHandle, text: &str) {
    reveal(app);
    eval(
        app,
        &format!("window.__asumiSay && window.__asumiSay({})", literal(text)),
    );
}

/// Tell the pet the voice has stopped, so the caption can run its dwell and go.
///
/// The caption is shown with the line, but it holds until this arrives: the
/// agent hands the spoken half to the voice service, and synthesis can take
/// seconds, so "she said it" is only true once the player has stopped.
pub fn speech_done(app: &AppHandle) {
    eval(app, "window.__asumiSpeechDone && window.__asumiSpeechDone()");
}

/// Bring the pet on screen for one utterance.
pub fn reveal(app: &AppHandle) {
    if presence() != "ghost" {
        return;
    }
    if let Some(pet) = app.get_webview_window(LABEL) {
        let _ = pet.show();
    }
    eval(app, "window.__asumiReveal && window.__asumiReveal()");
}

/// Whether the pet window is currently mapped.
pub fn visible(app: &AppHandle) -> bool {
    app.get_webview_window(LABEL)
        .and_then(|pet| pet.is_visible().ok())
        .unwrap_or(false)
}

//! Text-to-speech.
//!
//! macOS ships `say`; other platforms log until a native backend is wired.
//!
//! The voice is a shell setting the user picks in the settings window. The
//! environment seeds the defaults on first run — `ASUMI_TTS_VOICE` for every
//! script, `ASUMI_TTS_VOICE_JA`/`_ZH`/`_EN` per script — and then gets out of
//! the way, so a saved choice is never silently overridden.

use std::collections::HashSet;
use std::process::{Child, Command};

use crate::settings;

/// Voice used for a given script.
///
/// `say` reads with the system default voice, which is usually single-language
/// — English text under a Chinese default (or vice versa) is skipped or
/// mangled. Asumi picks a voice from the text's script unless the user chose
/// one voice for everything.
fn voice_for(text: &str) -> String {
    let current = settings::get();
    if !current.voice.is_empty() {
        return current.voice;
    }

    let has_kana = text.chars().any(|c| matches!(c, '\u{3040}'..='\u{30ff}'));
    let has_han = text
        .chars()
        .any(|c| matches!(c, '\u{3400}'..='\u{4dbf}' | '\u{4e00}'..='\u{9fff}'));

    if has_kana {
        current.voice_ja
    } else if has_han {
        current.voice_zh
    } else {
        current.voice_en
    }
}

/// The default for one script, seeded from the environment.
pub fn default_voice(script: &str) -> String {
    let (env_key, fallback) = match script {
        "ja" => ("ASUMI_TTS_VOICE_JA", "Kyoko"),
        "zh" => ("ASUMI_TTS_VOICE_ZH", "Tingting"),
        _ => ("ASUMI_TTS_VOICE_EN", "Samantha"),
    };
    std::env::var(env_key).unwrap_or_else(|_| fallback.to_string())
}

/// The voice used when the user has not selected one, seeded from the
/// environment.
pub fn default_voice_all() -> String {
    std::env::var("ASUMI_TTS_VOICE").unwrap_or_default()
}

/// The voice names this machine has, cached for the process lifetime.
fn installed_voices() -> &'static HashSet<String> {
    static VOICES: std::sync::OnceLock<HashSet<String>> = std::sync::OnceLock::new();
    VOICES.get_or_init(|| match Command::new("/usr/bin/say").arg("-v").arg("?").output() {
        Ok(output) => String::from_utf8_lossy(&output.stdout)
            .lines()
            .filter_map(|line| line.split_whitespace().next().map(str::to_string))
            .collect(),
        Err(_) => HashSet::new(),
    })
}

/// Every voice the settings window can offer, sorted for a stable menu.
pub fn selectable() -> Vec<String> {
    let mut voices: Vec<String> = installed_voices().iter().cloned().collect();
    voices.sort();
    voices
}

/// Speak `text` out loud, handing back the running player.
///
/// The caller owns the wait: the caption and the pet have to stay up for as
/// long as she is actually talking, which only the player knows.
pub fn speak(text: &str) -> Option<Child> {
    #[cfg(target_os = "macos")]
    {
        let voice = voice_for(text);
        let mut command = Command::new("/usr/bin/say");
        // Only pass a voice this machine actually has; a missing voice makes
        // `say` fail silently, which reads as "TTS is broken".
        if installed_voices().contains(&voice) {
            command.arg("-v").arg(&voice);
        }
        match command.arg(text).spawn() {
            Ok(child) => {
                eprintln!("[asumi] tts speaking (pid {}, voice {voice})", child.id());
                Some(child)
            }
            Err(error) => {
                eprintln!("[asumi] tts failed: {error}");
                None
            }
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        println!("[asumi] speak: {text}");
        None
    }
}

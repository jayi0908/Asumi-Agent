//! Text-to-speech.
//!
//! macOS ships `say`; other platforms log until a native backend is wired.

use std::collections::HashSet;
use std::process::Command;

/// Voice used for a given script, overridable through the environment.
///
/// `say` reads with the system default voice, which is usually single-language
/// — English text under a Chinese default (or vice versa) is skipped or
/// mangled. Asumi picks a voice from the text's script instead.
fn voice_for(text: &str) -> String {
    let has_kana = text.chars().any(|c| matches!(c, '\u{3040}'..='\u{30ff}'));
    let has_han = text
        .chars()
        .any(|c| matches!(c, '\u{3400}'..='\u{4dbf}' | '\u{4e00}'..='\u{9fff}'));

    let (env_key, default) = if has_kana {
        ("ASUMI_TTS_VOICE_JA", "Kyoko")
    } else if has_han {
        ("ASUMI_TTS_VOICE_ZH", "Tingting")
    } else {
        ("ASUMI_TTS_VOICE_EN", "Samantha")
    };

    std::env::var("ASUMI_TTS_VOICE")
        .or_else(|_| std::env::var(env_key))
        .unwrap_or_else(|_| default.to_string())
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

/// Speak `text` out loud.
pub fn speak(text: &str) {
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
            Ok(child) => eprintln!("[asumi] tts speaking (pid {}, voice {voice})", child.id()),
            Err(error) => eprintln!("[asumi] tts failed: {error}"),
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        println!("[asumi] speak: {text}");
    }
}

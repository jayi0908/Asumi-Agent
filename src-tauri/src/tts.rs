//! Asumi's voice: the cloned Japanese model, and how the shell reaches it.
//!
//! The model is a fine-tuned Style-Bert-VITS2 JP-Extra voice that lives in its
//! own repository and is served over HTTP by that repository. Nothing about it
//! is bundled: it needs a Python environment with torch and a 240 MB model, so
//! the user clones it once and points the app at it — the same shape as the
//! self-hosted model route.
//!
//! Three rules shape this module:
//!
//! * **Only Japanese is spoken.** The model's frontend is Japanese-only, so it
//!   does not fail on Chinese or English input — it reads them with Japanese
//!   phonemes, which is worse than silence. A line is therefore spoken only
//!   when it contains kana; everything else is dropped. That is also what makes
//!   bilingual replies work: the Chinese line is read by the user while the
//!   Japanese line is voiced.
//! * **A bad answer is silence.** If the service is not healthy, or answers
//!   with something that is not a WAV, nothing is played — no fallback voice.
//!   Speaking the wrong voice would be worse than not speaking.
//! * **The service starts itself, once.** The first Japanese line may have to
//!   pay for a lazy start; after that the process stays warm for the app's
//!   lifetime and is stopped on exit.

use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde_json::json;
use tauri::AppHandle;

use crate::settings::{self, ShellSettings};

/// How long a health probe may take before the service counts as absent.
const HEALTH_TIMEOUT: Duration = Duration::from_secs(2);
/// How long a synthesis request may take. Covers the cold model load.
const SYNTH_TIMEOUT: Duration = Duration::from_secs(90);
/// How long a lazy start may take to become healthy.
const START_TIMEOUT: Duration = Duration::from_secs(60);

/// The service process, when this app is the one that started it.
static SERVICE: Mutex<Option<Child>> = Mutex::new(None);
/// The player process, so a new line can cut off the previous one.
static PLAYER: Mutex<Option<Child>> = Mutex::new(None);

/// Speak one Japanese line.
///
/// The caller passes the `ja` field of a bilingual line, so the text is
/// Japanese by contract and goes to the service as-is: no sentence surgery,
/// which would disturb the model's own punctuation and pauses.
pub fn speak(_app: &AppHandle, text: &str) {
    let current = settings::get();
    if current.voice_backend == "system" {
        crate::voice::speak(text);
        return;
    }

    let line = text.trim();
    if line.is_empty() {
        return;
    }

    // Kana is still required. A line without it is Chinese or English that
    // reached the wrong field, and a Japanese-only frontend reads those with
    // the wrong phonemes — worse than saying nothing.
    if !line.chars().any(is_kana) {
        eprintln!("[asumi] tts: no kana in the line; staying silent");
        return;
    }

    eprintln!("[asumi] tts: speaking \"{}\"", preview(line));
    if let Err(error) = speak_with_service(&current, line) {
        eprintln!("[asumi] tts: {error}; staying silent");
    }
}

/// Synthesize and play one Japanese line through the service.
fn speak_with_service(settings: &ShellSettings, text: &str) -> Result<(), String> {
    ensure_service(settings)?;

    let audio = synthesize(&settings.tts_url, text, settings.tts_length)?;
    play(&audio)
}

/// Make sure the service is answering, starting it when allowed to.
fn ensure_service(settings: &ShellSettings) -> Result<(), String> {
    if healthy(&settings.tts_url) {
        return Ok(());
    }

    if !settings.tts_lazy_start {
        return Err(format!("voice service at {} is not answering", settings.tts_url));
    }
    if settings.tts_repo.is_empty() {
        return Err("voice service is not answering and no repository is configured to start it".into());
    }

    let repo = PathBuf::from(&settings.tts_repo);
    if !repo.is_dir() {
        return Err(format!("voice repository not found: {}", repo.display()));
    }

    let port = port_of(&settings.tts_url)
        .ok_or_else(|| format!("voice service URL has no port: {}", settings.tts_url))?;

    // Only start once: a second call while the first is warming up would spawn
    // a competing process and lose the port race.
    let mut guard = SERVICE.lock().map_err(|_| "voice service lock poisoned")?;
    if guard.is_some() && healthy(&settings.tts_url) {
        return Ok(());
    }
    if guard.is_none() {
        let child = Command::new(&settings.tts_python)
            .args([
                "-m",
                "uvicorn",
                "asumi_tts.server:app",
                "--host",
                "127.0.0.1",
                "--port",
                &port.to_string(),
            ])
            .current_dir(&repo)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            // The service logs its requests; keep them with the app's output.
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| format!("could not start {}: {e}", settings.tts_python))?;
        eprintln!("[asumi] tts: started the voice service (pid {})", child.id());
        *guard = Some(child);
    }
    drop(guard);

    let deadline = Instant::now() + START_TIMEOUT;
    while Instant::now() < deadline {
        if healthy(&settings.tts_url) {
            eprintln!("[asumi] tts: voice service is up");
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    Err(format!("voice service did not come up within {START_TIMEOUT:?}"))
}

/// Whether the service reports itself ready.
fn healthy(base: &str) -> bool {
    let status = Command::new("/usr/bin/curl")
        .args([
            "-fsS",
            "--max-time",
            &HEALTH_TIMEOUT.as_secs().to_string(),
            &format!("{}/health", base.trim_end_matches('/')),
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    matches!(status, Ok(status) if status.success())
}

/// Ask the service for one line, returning the WAV bytes.
///
/// The body goes through a file: the text is user- and model-authored, and
/// quoting it into an argument list is how a stray quote turns into a broken
/// request. The answer is checked for a RIFF/WAVE header, because "the request
/// succeeded" and "the answer is audio" are different claims.
fn synthesize(base: &str, text: &str, length: f64) -> Result<Vec<u8>, String> {
    let dir = std::env::temp_dir();
    let tag = format!("asumi-tts-{}", std::process::id());
    let request_path = dir.join(format!("{tag}.json"));
    let audio_path = dir.join(format!("{tag}.wav"));

    let body = json!({ "text": text, "length": length }).to_string();
    std::fs::write(&request_path, body).map_err(|e| format!("could not stage the request: {e}"))?;

    let output = Command::new("/usr/bin/curl")
        .args([
            "-fsS",
            "--max-time",
            &SYNTH_TIMEOUT.as_secs().to_string(),
            "-X",
            "POST",
            "-H",
            "Content-Type: application/json",
            "--data-binary",
            &format!("@{}", request_path.display()),
            "-o",
            &audio_path.display().to_string(),
            &format!("{}/tts", base.trim_end_matches('/')),
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("could not reach the voice service: {e}"))?;

    let _ = std::fs::remove_file(&request_path);

    if !output.status.success() {
        let reason = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let _ = std::fs::remove_file(&audio_path);
        return Err(if reason.is_empty() {
            format!("voice service refused the request ({})", output.status)
        } else {
            format!("voice service refused the request: {reason}")
        });
    }

    let bytes = std::fs::read(&audio_path).map_err(|e| format!("could not read the audio: {e}"))?;
    let _ = std::fs::remove_file(&audio_path);

    if bytes.len() < 44 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return Err("voice service answered with something that is not a WAV".into());
    }
    Ok(bytes)
}

/// Play one WAV, cutting off whatever was still playing.
fn play(audio: &[u8]) -> Result<(), String> {
    let path = std::env::temp_dir().join(format!("asumi-voice-{}.wav", std::process::id()));
    std::fs::write(&path, audio).map_err(|e| format!("could not write the audio: {e}"))?;

    if let Ok(mut guard) = PLAYER.lock() {
        if let Some(mut previous) = guard.take() {
            // A companion should finish her sentence over the old one, not
            // alongside it.
            let _ = previous.kill();
            let _ = previous.wait();
        }
        let child = Command::new("/usr/bin/afplay")
            .arg(&path)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("could not play the audio: {e}"))?;
        *guard = Some(child);
    }
    Ok(())
}

/// The port in a service URL, when it names one.
fn port_of(url: &str) -> Option<u16> {
    let rest = url.split("://").nth(1).unwrap_or(url);
    let authority = rest.split('/').next()?;
    authority.rsplit(':').next()?.parse().ok()
}

/// Kana: the script that marks text as Japanese rather than Chinese.
fn is_kana(c: char) -> bool {
    matches!(c, '\u{3040}'..='\u{30ff}' | '\u{31f0}'..='\u{31ff}')
}

/// A short single-line form of `text`, for the log.
fn preview(text: &str) -> String {
    let flat = text.replace('\n', " / ");
    let mut chars = flat.chars();
    let head: String = chars.by_ref().take(48).collect();
    if chars.next().is_some() {
        format!("{head}…")
    } else {
        head
    }
}

/// Stop anything this module started: the player first, so the app can exit
/// without a voice still talking, then the service.
pub fn shutdown() {
    for slot in [&PLAYER, &SERVICE] {
        if let Ok(mut guard) = slot.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

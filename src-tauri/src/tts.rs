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
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde_json::json;
use tauri::AppHandle;

use crate::pet;
use crate::settings::{self, ShellSettings};

/// How long a health probe may take before the service counts as absent.
const HEALTH_TIMEOUT: Duration = Duration::from_secs(2);
/// How long a synthesis request may take. Covers the cold model load.
const SYNTH_TIMEOUT: Duration = Duration::from_secs(90);
/// How long a lazy start may take to become healthy.
const START_TIMEOUT: Duration = Duration::from_secs(60);

/// The service process, when this app is the one that started it.
static SERVICE: Mutex<Option<Child>> = Mutex::new(None);
/// The current player and the speech generation that owns it, so a new line can
/// cut off the previous one.
static PLAYER: Mutex<Option<(u64, Child)>> = Mutex::new(None);
/// Speech generations: a newer utterance invalidates an older one's work.
static SPEECH_SEQ: AtomicU64 = AtomicU64::new(0);

/// Pause between spoken lines, so a reply reads like galgame dialogue.
const LINE_GAP: Duration = Duration::from_millis(1000);
/// How long a caption waits when its line has no voice to time it against.
const SILENT_DWELL: Duration = Duration::from_millis(1800);

/// Speak one bilingual reply, line by line.
///
/// The model splits its reply into short lines — one galgame beat each. This
/// plays them in order: it shows a line's caption, plays that line's voice,
/// holds the caption until the voice stops, waits `LINE_GAP`, and moves on.
/// While a line plays, the next line's voice is synthesized in the background,
/// so the pause between lines is usually just the gap. Synthesis and playback
/// never overlap on the model itself — it serializes its own inference — so the
/// prefetch is pipelining, not concurrency.
pub fn say(app: &AppHandle, lines: &[(String, String)]) {
    if lines.is_empty() {
        return;
    }
    let shell = settings::get();
    let system = shell.voice_backend == "system";

    // Claim the utterance before any slow work, so a newer reply supersedes
    // this one even while the service is still warming up.
    let generation = begin_speech();

    let voiced: Vec<bool> = lines
        .iter()
        .map(|(ja, _)| wants_voice(system, ja))
        .collect();
    let service_ready = if system || !voiced.iter().any(|voiced| *voiced) {
        true
    } else {
        match ensure_service(&shell) {
            Ok(()) => true,
            Err(error) => {
                eprintln!("[asumi] tts: {error}; staying silent");
                false
            }
        }
    };
    if !is_current(generation) {
        return;
    }

    let mut prefetched: Option<Receiver<Result<Vec<u8>, String>>> = None;
    for (index, (ja, zh)) in lines.iter().enumerate() {
        if !is_current(generation) {
            return;
        }

        let audible = voiced[index] && service_ready;
        let audio = if audible && !system {
            match prefetched.take() {
                // Started while the previous line was playing.
                Some(receiver) => receiver.recv().ok().and_then(|result| result.ok()),
                None => synthesize_now(generation, &shell, ja),
            }
        } else {
            None
        };

        // Start the next line now; it synthesizes during this line's playback.
        if let Some((next_ja, _)) = lines.get(index + 1) {
            if !system && service_ready && wants_voice(system, next_ja) {
                prefetched = Some(synthesize_later(generation, &shell, next_ja));
            }
        }

        pet::say_pair(app, zh, ja);
        if !ja.trim().is_empty() {
            eprintln!("[asumi] tts: line {} \"{}\"", index + 1, preview(ja));
        }

        let played = if system && audible {
            crate::voice::speak(ja)
                .map(|player| await_player(generation, player))
                .unwrap_or(false)
        } else if let Some(wav) = audio {
            match play(generation, &wav) {
                Ok(played) => played,
                Err(error) => {
                    eprintln!("[asumi] tts: {error}; staying silent");
                    false
                }
            }
        } else {
            false
        };

        if !is_current(generation) {
            return;
        }
        if !played {
            // Nothing to time the caption against — no voice, service down, or a
            // failed request: let the line be read for a beat.
            std::thread::sleep(SILENT_DWELL);
            if !is_current(generation) {
                return;
            }
        }
        pet::speech_done(app);

        if index + 1 < lines.len() {
            std::thread::sleep(LINE_GAP);
        }
    }
}

/// Whether a line should be voiced at all.
fn wants_voice(system: bool, ja: &str) -> bool {
    let line = ja.trim();
    if line.is_empty() {
        return false;
    }
    // System voices read any script; the cloned model is Japanese-only, so a
    // line without kana is Chinese or English that reached the wrong field and
    // is better left silent than read with Japanese phonemes.
    system || line.chars().any(is_kana)
}

/// Claim the next speech generation, cutting off whatever is still playing.
fn begin_speech() -> u64 {
    let generation = SPEECH_SEQ.fetch_add(1, Ordering::SeqCst) + 1;
    if let Ok(mut guard) = PLAYER.lock() {
        if let Some((_, mut previous)) = guard.take() {
            // A companion should finish her sentence over the old one, not
            // alongside it.
            let _ = previous.kill();
            let _ = previous.wait();
        }
    }
    generation
}

/// Whether this utterance is still the most recent one.
fn is_current(generation: u64) -> bool {
    SPEECH_SEQ.load(Ordering::SeqCst) == generation
}

/// Synthesize one line here and now.
fn synthesize_now(generation: u64, shell: &ShellSettings, text: &str) -> Option<Vec<u8>> {
    if !is_current(generation) {
        return None;
    }
    match synthesize(&shell.tts_url, text, shell.tts_length) {
        Ok(audio) => Some(audio),
        Err(error) => {
            eprintln!("[asumi] tts: {error}; staying silent");
            None
        }
    }
}

/// Synthesize one line on a worker, so it is ready when its turn comes.
fn synthesize_later(
    generation: u64,
    shell: &ShellSettings,
    text: &str,
) -> Receiver<Result<Vec<u8>, String>> {
    let (sender, receiver) = mpsc::channel();
    let base = shell.tts_url.clone();
    let length = shell.tts_length;
    let text = text.to_string();
    std::thread::spawn(move || {
        let result = if is_current(generation) {
            synthesize(&base, &text, length)
        } else {
            Err("superseded".to_string())
        };
        let _ = sender.send(result);
    });
    receiver
}

/// Own one player to completion.
///
/// The wait runs off the mutex so a new utterance can still replace the player.
/// Returns whether this line still owned it when it stopped: a superseded line
/// must not time a caption that now belongs to the line that replaced it.
fn await_player(generation: u64, mut player: Child) -> bool {
    {
        let Ok(mut guard) = PLAYER.lock() else {
            return false;
        };
        // Checked under the lock: a line superseded while it was still
        // synthesizing must not join the audio of the line that replaced it.
        if !is_current(generation) {
            let _ = player.kill();
            let _ = player.wait();
            return false;
        }
        *guard = Some((generation, player));
    }
    loop {
        std::thread::sleep(Duration::from_millis(60));
        let Ok(mut guard) = PLAYER.lock() else {
            return false;
        };
        match guard.as_mut() {
            Some((owner, child)) if *owner == generation => match child.try_wait() {
                Ok(Some(_)) | Err(_) => {
                    guard.take();
                    break;
                }
                Ok(None) => {}
            },
            _ => return false,
        }
    }
    is_current(generation)
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

/// Play one WAV and stay with it, so the caption lasts as long as the voice.
fn play(generation: u64, audio: &[u8]) -> Result<bool, String> {
    let path = std::env::temp_dir().join(format!("asumi-voice-{}.wav", std::process::id()));
    std::fs::write(&path, audio).map_err(|e| format!("could not write the audio: {e}"))?;

    let player = Command::new("/usr/bin/afplay")
        .arg(&path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("could not play the audio: {e}"))?;

    Ok(await_player(generation, player))
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
    if let Ok(mut guard) = PLAYER.lock() {
        if let Some((_, mut player)) = guard.take() {
            let _ = player.kill();
            let _ = player.wait();
        }
    }
    if let Ok(mut guard) = SERVICE.lock() {
        if let Some(mut service) = guard.take() {
            let _ = service.kill();
            let _ = service.wait();
        }
    }
}

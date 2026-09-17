//! Starting, provisioning, and stopping the DeepSeek Harness engine.
//!
//! The shell owns the engine's lifetime: it starts one, follows its stdout
//! until the web client announces its token URL, and kills it on exit. The
//! engine location depends on how the app was built:
//!
//! * a packaged app runs the tree bundled under `Contents/Resources/engine`
//!   with the bundled Node sidecar, so nothing has to be installed;
//! * a development build runs the repository's own `node_modules` with the
//!   `node` on `PATH`, which keeps plugins hot-reloadable while working.

use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use tauri::{AppHandle, Manager};

use crate::dsh;

/// Profile the app boots.
const PROFILE: &str = "asumi";

/// The harness entry point inside an engine tree.
const ENTRY: &str = "node_modules/@deepseek-ai/dsh/lib/bin.js";

/// The running engine, kept so it can be killed when the app exits.
static ENGINE: Mutex<Option<Child>> = Mutex::new(None);

/// Start the engine and publish its URL once the web client is listening.
pub fn spawn(app: &AppHandle) {
    let handle = app.clone();
    std::thread::spawn(move || {
        let Some(engine) = engine_dir(&handle) else {
            eprintln!("[asumi] no engine found; run scripts/build-engine.mjs or pnpm install");
            return;
        };
        if let Err(error) = provision_profile(&engine) {
            eprintln!("[asumi] profile provisioning failed: {error}");
        }

        let node = node_binary(&handle);
        let entry = engine.join(ENTRY);
        eprintln!("[asumi] starting engine: {} {}", node.display(), entry.display());

        let mut command = Command::new(&node);
        command
            .arg(&entry)
            .arg("--profile")
            .arg(PROFILE)
            .arg("--no-open")
            // Port 0 lets the OS pick the web client's port, so an engine left
            // over from an earlier run can never block this one; the announced
            // URL carries whichever port it got.
            .arg("--port")
            .arg("0")
            .current_dir(&engine)
            .env("DSH_HOME", dsh::home())
            // The bridge port is chosen here and handed to the plugin, so both
            // ends agree and neither depends on a fixed number being free.
            .env("ASUMI_DESKTOP_PORT", crate::bridge::port().to_string())
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            // Inherit stderr so engine diagnostics land in the same log as the
            // shell's, with no interleaving buffer to lose them.
            .stderr(Stdio::inherit());

        let mut child = match command.spawn() {
            Ok(child) => child,
            Err(error) => {
                eprintln!("[asumi] could not start the engine: {error}");
                return;
            }
        };

        let Some(stdout) = child.stdout.take() else {
            eprintln!("[asumi] engine stdout unavailable");
            return;
        };

        if let Ok(mut guard) = ENGINE.lock() {
            *guard = Some(child);
        }

        follow(handle, stdout);
    });
}

/// Read the engine's output, echoing it and watching for the token URL.
fn follow(app: AppHandle, stdout: std::process::ChildStdout) {
    for line in BufReader::new(stdout).lines() {
        let Ok(line) = line else { break };
        eprintln!("[engine] {line}");
        if let Some(url) = extract_url(&line) {
            dsh::publish(&app, &url);
        }
    }
    eprintln!("[asumi] engine exited");
}

/// The token-authenticated web client URL in one line of engine output.
///
/// The launcher prints its banner and the URL together, so the line is matched
/// rather than parsed.
fn extract_url(line: &str) -> Option<String> {
    let start = line.find("http://127.0.0.1:")?;
    let rest = &line[start..];
    let end = rest.find(char::is_whitespace).unwrap_or(rest.len());
    let url = &rest[..end];
    url.contains("token=").then(|| url.to_string())
}

/// Where the engine lives: an explicit override, the bundle, or the repo.
fn engine_dir(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(dir) = std::env::var("ASUMI_ENGINE_DIR") {
        let dir = PathBuf::from(dir);
        if dir.join(ENTRY).exists() {
            return Some(dir);
        }
        eprintln!("[asumi] ASUMI_ENGINE_DIR has no harness at {}", dir.display());
    }

    if let Ok(resources) = app.path().resource_dir() {
        let bundled = resources.join("engine");
        if bundled.join(ENTRY).exists() {
            return Some(bundled);
        }
    }

    let repo = dsh::repo_root();
    repo.join(ENTRY).exists().then_some(repo)
}

/// The interpreter: the bundled sidecar, or `node` from `PATH` in development.
fn node_binary(app: &AppHandle) -> PathBuf {
    if let Ok(node) = std::env::var("ASUMI_NODE") {
        return PathBuf::from(node);
    }

    // `externalBin` places the sidecar beside the executable, with the target
    // triple stripped.
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let sidecar = dir.join("node");
            if sidecar.exists() {
                return sidecar;
            }
        }
    }

    let _ = app; // resource_dir is unused for the interpreter today
    PathBuf::from("node")
}

/// Copy the bundled profile into the harness home on first launch.
///
/// The engine's plugins resolve from the profile's own `node_modules`, so the
/// profile ships ready to use; re-provisioning is a matter of deleting
/// `$DSH_HOME/profiles/asumi` and launching again.
fn provision_profile(engine: &Path) -> std::io::Result<()> {
    let source = engine.join("profiles").join(PROFILE);
    if !source.is_dir() {
        return Ok(());
    }

    let destination = dsh::home().join("profiles").join(PROFILE);
    if destination.exists() {
        return Ok(());
    }

    copy_dir(&source, &destination)?;
    eprintln!("[asumi] provisioned profile at {}", destination.display());
    Ok(())
}

/// Recursively copy a directory, creating parents as needed.
fn copy_dir(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        let kind = entry.file_type()?;
        if kind.is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else if kind.is_symlink() {
            // The engine tree is hoisted (real files); anything symlinked is a
            // build-time convenience the runtime does not need.
            continue;
        } else {
            std::fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

/// Stop the engine so it cannot outlive the app.
pub fn shutdown() {
    let Ok(mut guard) = ENGINE.lock() else { return };
    let Some(mut child) = guard.take() else { return };
    let _ = child.kill();
    let _ = child.wait();
}

/// Kill the engine when the app is asked to quit by signal.
///
/// `RunEvent::Exit` covers a normal quit, but `kill`, a logout, or a terminal
/// Ctrl-C never reaches it — and an engine left behind would keep the web and
/// bridge ports, so the next launch would silently talk to the old agent.
/// Signals are blocked in every thread and drained by one waiter, which is the
/// only signal handling that is safe alongside the runtime's own threads.
#[cfg(unix)]
pub fn handle_signals() {
    use std::mem::MaybeUninit;

    unsafe {
        let mut set = MaybeUninit::<libc::sigset_t>::uninit();
        if libc::sigemptyset(set.as_mut_ptr()) != 0 {
            return;
        }
        let mut set = set.assume_init();
        for signal in [libc::SIGTERM, libc::SIGINT, libc::SIGHUP] {
            libc::sigaddset(&mut set, signal);
        }
        // Block before the runtime spawns its threads: the mask is inherited,
        // so this thread becomes the only one the signals can be delivered to.
        if libc::pthread_sigmask(libc::SIG_BLOCK, &set, std::ptr::null_mut()) != 0 {
            return;
        }

        let waiter = set;
        std::thread::spawn(move || {
            let mut signal = 0;
            if libc::sigwait(&waiter, &mut signal) == 0 {
                eprintln!("[asumi] signal {signal}; stopping the engine");
                shutdown();
                std::process::exit(128 + signal);
            }
        });
    }
}

#[cfg(not(unix))]
pub fn handle_signals() {}

//! The sprite (立绘) form: the game's layered art, shown as a bust.
//!
//! The art is a set of PNG *layers* — a body with a blank face and a separate
//! face for each expression — that only line up when each is drawn at the
//! offset recorded in its own `tEXt` `comment\0pos,x,y,w,h` block. The shell
//! reads those offsets and hands the whole catalog to the UI, which composites
//! the layers on a canvas (so a later expression switch is just another face
//! file, not another renderer).
//!
//! The art is copyrighted game material, so it is not part of this repository:
//! it lives wherever the user keeps it, pointed at by the sprite-root setting
//! (falling back to `<repo>/assets` in development). Nothing here fails when it
//! is absent — the catalog simply comes back empty and the UI offers the SD
//! form alone.

use std::path::{Path, PathBuf};

use serde_json::{json, Map, Value};
use tauri::{AppHandle, Manager};

use crate::{dsh, settings};

/// The resolution packs the game ships, largest last.
pub const PACKS: [&str; 4] = ["no", "z1", "z2", "fa"];

/// Expression used until the diff-to-face mapping exists.
pub const DEFAULT_FACE: &str = "0004";

/// Where the layered art lives: the setting when set, else `<repo>/assets`.
pub fn root() -> PathBuf {
    let configured = settings::get().sprite_root.trim().to_string();
    if !configured.is_empty() {
        return PathBuf::from(configured);
    }
    dsh::repo_root().join("assets")
}

/// Let the webviews load files straight out of the sprite root.
///
/// The pet and settings pages show the layers by URL, so the asset protocol has
/// to be allowed to read that directory (and only that directory).
pub fn allow(app: &AppHandle) {
    let root = root();
    let scope = app.asset_protocol_scope();
    if let Err(error) = scope.allow_directory(&root, true) {
        eprintln!("[asumi] sprite scope {}: {error}", root.display());
    }
}

/// Read one layer's canvas offset and size from its `tEXt` comment block.
fn layer(path: &Path) -> Option<(i64, i64, u32, u32)> {
    let bytes = std::fs::read(path).ok()?;
    if bytes.len() < 8 || &bytes[0..8] != b"\x89PNG\r\n\x1a\n" {
        return None;
    }
    let mut cursor = 8usize;
    while cursor + 8 <= bytes.len() {
        let length =
            u32::from_be_bytes([bytes[cursor], bytes[cursor + 1], bytes[cursor + 2], bytes[cursor + 3]])
                as usize;
        let kind = &bytes[cursor + 4..cursor + 8];
        let start = cursor + 8;
        let end = start.checked_add(length)?;
        if end + 4 > bytes.len() {
            return None;
        }
        if kind == b"tEXt" {
            let payload = &bytes[start..end];
            if let Some(at) = payload.windows(4).position(|window| window == b"pos,") {
                let text = String::from_utf8_lossy(&payload[at + 4..]);
                let mut numbers = text.split(',').filter_map(|part| part.trim().parse::<i64>().ok());
                let x = numbers.next()?;
                let y = numbers.next()?;
                let w = numbers.next().unwrap_or(0).max(0) as u32;
                let h = numbers.next().unwrap_or(0).max(0) as u32;
                return Some((x, y, w, h));
            }
        }
        if kind == b"IEND" {
            break;
        }
        cursor = end + 4;
    }
    None
}

/// A face layer's name is a group letter plus four digits (`a0004`).
fn is_face(name: &str) -> bool {
    let bytes = name.as_bytes();
    bytes.len() == 5
        && matches!(bytes[0], b'a' | b'b')
        && bytes[1..].iter().all(u8::is_ascii_digit)
}

/// The catalog the UI renders from: per pack, the body and face layers with the
/// offsets they must be composited at.
pub fn catalog() -> Value {
    let root = root();
    let mut packs = Map::new();
    for pack in PACKS {
        let directory = root.join(pack);
        let Ok(entries) = std::fs::read_dir(&directory) else {
            continue;
        };
        let mut bodies = Vec::new();
        let mut faces = Vec::new();
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|extension| extension.to_str()) != Some("png") {
                continue;
            }
            let Some(name) = path.file_stem().and_then(|stem| stem.to_str()).map(str::to_string)
            else {
                continue;
            };
            let Some((x, y, w, h)) = layer(&path) else {
                continue;
            };
            let group = name.chars().next().unwrap_or('a').to_string();
            if is_face(&name) {
                let expression = name[1..].to_string();
                faces.push(json!({
                    "id": name, "group": group, "expr": expression,
                    "x": x, "y": y, "w": w, "h": h
                }));
            } else if name.contains("__") {
                bodies.push(json!({
                    "id": name, "group": group, "x": x, "y": y, "w": w, "h": h
                }));
            }
        }
        bodies.sort_by_key(|value| value["id"].as_str().unwrap_or("").to_string());
        faces.sort_by_key(|value| value["id"].as_str().unwrap_or("").to_string());
        packs.insert(pack.to_string(), json!({ "bodies": bodies, "faces": faces }));
    }
    json!({
        "root": root.to_string_lossy(),
        "defaultFace": DEFAULT_FACE,
        "packs": packs,
    })
}

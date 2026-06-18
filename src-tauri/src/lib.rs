use std::str::FromStr;
use std::sync::Mutex;

use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

const QUICK_LAUNCH_LABEL: &str = "quick-launch";
const DEFAULT_SHORTCUT: &str = "Command+Shift+Space";
const QUICK_LAUNCH_WIDTH: f64 = 420.0;
const QUICK_LAUNCH_COLLAPSED_HEIGHT: f64 = 56.0;
const QUICK_LAUNCH_INPUT_ANCHOR_OFFSET: f64 = 28.0;

// Holds the currently-registered shortcut accelerator string
struct ShortcutStore(Mutex<String>);

// Whether quick launch is enabled
struct QuickLaunchEnabled(Mutex<bool>);

fn load_tray_icon() -> Image<'static> {
    let img = image::load_from_memory(include_bytes!("../icons/menubar-22.png"))
        .expect("Failed to load tray icon")
        .into_rgba8();
    let (w, h) = img.dimensions();
    let rgba = img.into_raw();
    Image::new_owned(rgba, w, h)
}

fn quick_launch_position(height: f64) -> Option<(f64, f64)> {
    cursor_position().ok().map(|(x, y)| {
        (
            x - QUICK_LAUNCH_WIDTH / 2.0,
            y - height + QUICK_LAUNCH_INPUT_ANCHOR_OFFSET,
        )
    })
}

fn reset_quick_launch_window(window: &WebviewWindow) {
    let _ = window.set_size(LogicalSize::new(
        QUICK_LAUNCH_WIDTH,
        QUICK_LAUNCH_COLLAPSED_HEIGHT,
    ));

    if let Some((x, y)) = quick_launch_position(QUICK_LAUNCH_COLLAPSED_HEIGHT) {
        let _ = window.set_position(LogicalPosition::new(x, y));
    }
}

fn toggle_quick_launch(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(QUICK_LAUNCH_LABEL) {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            reset_quick_launch_window(&window);
            let _ = window.show();
            let _ = window.set_focus();
        }
    } else {
        let mut builder = WebviewWindowBuilder::new(
            app,
            QUICK_LAUNCH_LABEL,
            WebviewUrl::App("index.html#/quick-launch".into()),
        )
        .title("")
        .inner_size(QUICK_LAUNCH_WIDTH, QUICK_LAUNCH_COLLAPSED_HEIGHT)
        .min_inner_size(QUICK_LAUNCH_WIDTH, QUICK_LAUNCH_COLLAPSED_HEIGHT)
        .resizable(true)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true);

        if let Some((x, y)) = quick_launch_position(QUICK_LAUNCH_COLLAPSED_HEIGHT) {
            builder = builder.position(x, y);
        } else {
            builder = builder.center();
        }

        let _ = builder.build();
    }
}

#[cfg(target_os = "macos")]
fn cursor_position() -> Result<(f64, f64), String> {
    use core_graphics::event::CGEvent;
    use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
    let source = CGEventSource::new(CGEventSourceStateID::Private)
        .map_err(|_| "Failed to create event source")?;
    let event = CGEvent::new(source).map_err(|_| "Failed to create event")?;
    let loc = event.location();
    Ok((loc.x, loc.y))
}

#[cfg(not(target_os = "macos"))]
fn cursor_position() -> Result<(f64, f64), String> {
    Err("Not supported on this platform".to_string())
}

#[tauri::command]
fn read_clipboard() -> Result<String, String> {
    let mut clipboard =
        arboard::Clipboard::new().map_err(|e| format!("Failed to open clipboard: {}", e))?;
    clipboard.get_text().map_err(|e| format!("Failed to read clipboard: {}", e))
}

#[tauri::command]
fn set_quick_launch_enabled(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let store = app.state::<QuickLaunchEnabled>();
    let mut current = store.0.lock().map_err(|e| e.to_string())?;
    *current = enabled;
    Ok(())
}

#[tauri::command]
fn get_cursor_position() -> Result<[f64; 2], String> {
    cursor_position().map(|(x, y)| [x, y])
}

#[tauri::command]
fn get_shortcut() -> String {
    DEFAULT_SHORTCUT.to_string()
}

#[tauri::command]
fn set_shortcut(app: tauri::AppHandle, shortcut: String) -> Result<(), String> {
    let store = app.state::<ShortcutStore>();
    let mut current = store.0.lock().map_err(|e| e.to_string())?;

    // Unregister old shortcut
    if !current.is_empty() {
        if let Ok(old) = Shortcut::from_str(&current) {
            let _ = app.global_shortcut().unregister(old);
        }
    }

    // Register new shortcut
    let new_shortcut =
        Shortcut::from_str(&shortcut).map_err(|e| format!("Invalid shortcut: {}", e))?;
    app.global_shortcut()
        .register(new_shortcut)
        .map_err(|e| format!("Failed to register shortcut: {}", e))?;

    *current = shortcut;
    Ok(())
}

#[derive(serde::Deserialize)]
struct ChatChoice {
    message: ChatMessage,
}

#[derive(serde::Deserialize)]
struct ChatMessage {
    content: String,
}

#[derive(serde::Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

async fn call_chat_api(
    api_key: &str,
    base_url: &str,
    model: &str,
    messages: &[serde_json::Value],
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let request_body = serde_json::json!({
        "model": model,
        "messages": messages,
    });

    let endpoint = format!(
        "{}/v1/chat/completions",
        base_url.trim_end_matches('/')
    );

    let response = client
        .post(&endpoint)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("API error ({}): {}", status, error_text));
    }

    let completion: ChatResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    completion
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content)
        .ok_or_else(|| "Empty response from API".to_string())
}

#[tauri::command]
async fn submit_quick_message(
    message: String,
    api_key: String,
    base_url: String,
    model: String,
    system_prompt: String,
) -> Result<String, String> {
    let mut messages = vec![];
    if !system_prompt.is_empty() {
        messages.push(serde_json::json!({
            "role": "system",
            "content": system_prompt,
        }));
    }
    messages.push(serde_json::json!({
        "role": "user",
        "content": message,
    }));
    call_chat_api(&api_key, &base_url, &model, &messages).await
}

#[tauri::command]
async fn test_api_connection(
    api_key: String,
    base_url: String,
    model: String,
) -> Result<String, String> {
    let messages = vec![serde_json::json!({
        "role": "user",
        "content": "Hi",
    })];
    call_chat_api(&api_key, &base_url, &model, &messages).await?;
    Ok("连接成功，API 工作正常~".to_string())
}

#[derive(serde::Serialize)]
struct ModelInfo {
    id: String,
    owned_by: String,
}

#[derive(serde::Deserialize)]
struct ModelsListResponse {
    data: Vec<ModelsListEntry>,
}

#[derive(serde::Deserialize)]
struct ModelsListEntry {
    id: String,
    #[serde(default)]
    owned_by: String,
}

#[tauri::command]
async fn fetch_models(api_key: String, base_url: String) -> Result<Vec<ModelInfo>, String> {
    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let endpoint = format!("{}/v1/models", base_url.trim_end_matches('/'));

    let response = client
        .get(&endpoint)
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("API error ({}): {}", status, error_text));
    }

    let models_response: ModelsListResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(models_response
        .data
        .into_iter()
        .map(|m| ModelInfo {
            id: m.id,
            owned_by: m.owned_by,
        })
        .collect())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        let enabled = app
                            .try_state::<QuickLaunchEnabled>()
                            .map(|s| *s.0.lock().unwrap())
                            .unwrap_or(true);
                        if enabled {
                            toggle_quick_launch(app);
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            // Register default global shortcut
            let default_shortcut =
                Shortcut::from_str(DEFAULT_SHORTCUT).expect("Invalid default shortcut");
            app.global_shortcut().register(default_shortcut)?;
            app.manage(ShortcutStore(Mutex::new(DEFAULT_SHORTCUT.to_string())));
            app.manage(QuickLaunchEnabled(Mutex::new(true)));

            // Build tray menu
            let toggle = MenuItemBuilder::with_id("toggle", "Show Asumi Agent")
                .accelerator("Cmd+Shift+A")
                .build(app)?;
            let quick_launch = MenuItemBuilder::with_id("quick_launch", "Quick Ask Asumi")
                .accelerator("Cmd+Shift+Space")
                .build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit Asumi Agent")
                .accelerator("Cmd+Q")
                .build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&toggle)
                .item(&quick_launch)
                .separator()
                .item(&quit)
                .build()?;

            // Build tray
            let icon = load_tray_icon();
            TrayIconBuilder::new()
                .icon(icon)
                .icon_as_template(true)
                .tooltip("Asumi Agent")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle" => {
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                    "quick_launch" => {
                        toggle_quick_launch(app);
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Minimize to tray instead of closing
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_shortcut,
            set_shortcut,
            submit_quick_message,
            get_cursor_position,
            test_api_connection,
            fetch_models,
            read_clipboard,
            set_quick_launch_enabled
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

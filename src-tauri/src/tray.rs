//! Menu-bar presence and the application menu.
//!
//! The tray is the control surface that is always reachable: it shows the main
//! window, switches Asumi's presence and appearance, and opens the settings
//! window. It is built entirely in Rust — nothing about it comes from the
//! agent.
//!
//! The icon is the snowflake from the original app. It is redrawn in the
//! colour the current menu bar needs: macOS renders a non-template image
//! exactly as given, so a black icon disappears in dark mode and a white one
//! disappears in light mode.

use std::sync::Mutex;

use tauri::image::Image;
use tauri::menu::{
    CheckMenuItem, CheckMenuItemBuilder, IsMenuItem, Menu, MenuBuilder, MenuItemBuilder,
    MenuItemKind, PredefinedMenuItem, SubmenuBuilder,
};
use tauri::tray::{MouseButton, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Theme, Wry};

use crate::settings::{self, APPEARANCES, PRESENCES};
use crate::{labels, pet, prefs};

const TRAY_ID: &str = "asumi-tray";

const ITEM_SHOW_MAIN: &str = "asumi.show-main";
const ITEM_SETTINGS: &str = "asumi.settings";
const ITEM_QUIT: &str = "asumi.quit";

/// Snowflake grey levels: ink for a light menu bar, white for a dark one.
const ICON_ON_LIGHT: u8 = 0;
const ICON_ON_DARK: u8 = 255;

/// The snowflake, decoded once at compile time.
const SNOWFLAKE_PNG: &[u8] = include_bytes!("../icons/menubar-22.png");

static TRAY: Mutex<Option<TrayIcon<Wry>>> = Mutex::new(None);

fn presence_id(mode: &str) -> String {
    format!("asumi.presence.{mode}")
}

fn appearance_id(module: &str) -> String {
    format!("asumi.appearance.{module}")
}

fn presence_label(mode: &str) -> &'static str {
    match mode {
        "ghost" => "透明",
        "hidden" => "隐藏",
        _ => "常驻",
    }
}

fn appearance_label(module: &str) -> &'static str {
    match module {
        "peek-bottom" => "右下角探头",
        _ => "淡入淡出",
    }
}

/// Build the tray icon and its menu, reporting rather than propagating failure.
pub fn install(app: &AppHandle) {
    if let Err(error) = build(app) {
        eprintln!("[asumi] tray failed: {error}");
    }
    install_app_menu(app);
}

fn build(app: &AppHandle) -> tauri::Result<()> {
    let menu = menu(app)?;
    let handle = app.clone();

    let tray = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Asumi Agent")
        // Left click shows the window; the menu is on right click.
        .show_menu_on_left_click(false)
        .icon(snowflake(icon_color(app)))
        // Contrast is handled by recolouring, not by the system.
        .icon_as_template(false)
        .menu(&menu)
        .on_menu_event(|app, event| handle_item(app, event.id().as_ref()))
        .on_tray_icon_event(move |_tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                ..
            } = event
            {
                show_main(&handle);
            }
        })
        .build(app)?;

    if let Ok(mut guard) = TRAY.lock() {
        *guard = Some(tray);
    }
    Ok(())
}

/// Rebuild the tray menu and icon from the current settings.
///
/// Rebuilding beats tracking each check item: the tray, the settings window,
/// and the agent's own tools all change these values, and one path that always
/// reflects the store cannot drift out of date.
pub fn refresh(app: &AppHandle) {
    let Ok(menu) = menu(app) else { return };
    let Ok(mut guard) = TRAY.lock() else { return };
    if let Some(tray) = guard.as_mut() {
        let _ = tray.set_menu(Some(menu));
        let _ = tray.set_icon(Some(snowflake(icon_color(app))));
    }
}

/// Redraw the icon for the current theme; called when the theme changes.
pub fn refresh_icon(app: &AppHandle) {
    let color = icon_color(app);
    if let Ok(mut guard) = TRAY.lock() {
        if let Some(tray) = guard.as_mut() {
            let _ = tray.set_icon(Some(snowflake(color)));
        }
    }
}

/// The snowflake colour that contrasts with the current menu bar.
fn icon_color(app: &AppHandle) -> u8 {
    if is_dark(app) {
        ICON_ON_DARK
    } else {
        ICON_ON_LIGHT
    }
}

/// Whether the system is in dark mode, judged by the main window.
fn is_dark(app: &AppHandle) -> bool {
    app.get_webview_window(labels::MAIN)
        .and_then(|window| window.theme().ok())
        .map(|theme| theme == Theme::Dark)
        .unwrap_or(false)
}

/// The snowflake in one grey level, alpha preserved.
///
/// Only the colour channels are rewritten, so the anti-aliased edges keep
/// blending correctly against either menu bar.
fn snowflake(color: u8) -> Image<'static> {
    let decoded = Image::from_bytes(SNOWFLAKE_PNG).expect("bundled snowflake is a valid PNG");
    let mut rgba = decoded.rgba().to_vec();
    for pixel in rgba.chunks_mut(4) {
        pixel[0] = color;
        pixel[1] = color;
        pixel[2] = color;
    }
    Image::new_owned(rgba, decoded.width(), decoded.height())
}

fn menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let current = settings::get();

    let show_main = MenuItemBuilder::with_id(ITEM_SHOW_MAIN, "显示主窗口").build(app)?;
    let settings_item = MenuItemBuilder::with_id(ITEM_SETTINGS, "设置…")
        .accelerator("CmdOrCtrl+,")
        .build(app)?;
    let quit = MenuItemBuilder::with_id(ITEM_QUIT, "退出 Asumi Agent").build(app)?;

    let mut presence_options: Vec<CheckMenuItem<Wry>> = Vec::new();
    for mode in PRESENCES {
        presence_options.push(
            CheckMenuItemBuilder::with_id(presence_id(mode), presence_label(mode))
                .checked(current.presence == mode)
                .build(app)?,
        );
    }
    let presence_refs: Vec<&dyn IsMenuItem<Wry>> = presence_options
        .iter()
        .map(|item| item as &dyn IsMenuItem<Wry>)
        .collect();
    let presence = SubmenuBuilder::new(app, "出现方式")
        .items(&presence_refs)
        .build()?;

    let mut appearance_options: Vec<CheckMenuItem<Wry>> = Vec::new();
    for module in APPEARANCES {
        appearance_options.push(
            CheckMenuItemBuilder::with_id(appearance_id(module), appearance_label(module))
                .checked(current.appearance == module)
                .build(app)?,
        );
    }
    let appearance_refs: Vec<&dyn IsMenuItem<Wry>> = appearance_options
        .iter()
        .map(|item| item as &dyn IsMenuItem<Wry>)
        .collect();
    let appearance = SubmenuBuilder::new(app, "出现模组")
        .items(&appearance_refs)
        .build()?;

    MenuBuilder::new(app)
        .item(&show_main)
        .item(&PredefinedMenuItem::separator(app)?)
        .item(&presence)
        .item(&appearance)
        .item(&PredefinedMenuItem::separator(app)?)
        .item(&settings_item)
        .item(&PredefinedMenuItem::separator(app)?)
        .item(&quit)
        .build()
}

/// Add Preferences to the application menu, so ⌘, works while the app is
/// focused without capturing the shortcut system-wide.
fn install_app_menu(app: &AppHandle) {
    if let Err(error) = try_install_app_menu(app) {
        eprintln!("[asumi] application menu: {error}");
        return;
    }
    app.on_menu_event(|app, event| handle_item(app, event.id().as_ref()));
}

fn try_install_app_menu(app: &AppHandle) -> tauri::Result<()> {
    let menu = Menu::default(app)?;
    let items = menu.items()?;
    let Some(MenuItemKind::Submenu(app_menu)) = items.first() else {
        return Ok(());
    };
    let prefs = MenuItemBuilder::with_id(ITEM_SETTINGS, "设置…")
        .accelerator("CmdOrCtrl+,")
        .build(app)?;
    app_menu.prepend(&prefs)?;
    app.set_menu(menu)?;
    Ok(())
}

/// One place where every menu id is resolved.
fn handle_item(app: &AppHandle, id: &str) {
    if id == ITEM_SHOW_MAIN {
        show_main(app);
    } else if id == ITEM_SETTINGS {
        prefs::open(app);
    } else if id == ITEM_QUIT {
        app.exit(0);
    } else if let Some(mode) = id.strip_prefix("asumi.presence.") {
        pet::set_presence(app, mode);
    } else if let Some(module) = id.strip_prefix("asumi.appearance.") {
        pet::set_appearance(app, module);
    }
}

/// Bring the main window back into view.
fn show_main(app: &AppHandle) {
    if let Some(main) = app.get_webview_window(labels::MAIN) {
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
    }
}

//! Menu-bar presence.
//!
//! The tray is the only control surface the user has without leaving whatever
//! they are doing: it shows the main window, switches Asumi's desktop presence,
//! and quits. It is built entirely in Rust — nothing about it comes from the
//! agent.

use tauri::image::Image;
use tauri::menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, PredefinedMenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

use crate::{labels, pet};

const TRAY_ID: &str = "asumi-tray";

const ITEM_SHOW_MAIN: &str = "asumi.show-main";
const ITEM_PRESENCE_ALWAYS: &str = "asumi.presence.always";
const ITEM_PRESENCE_GHOST: &str = "asumi.presence.ghost";
const ITEM_PRESENCE_HIDDEN: &str = "asumi.presence.hidden";
const ITEM_QUIT: &str = "asumi.quit";

/// Build the tray icon and its menu, reporting rather than propagating failure.
pub fn install(app: &AppHandle) {
    if let Err(error) = build(app) {
        eprintln!("[asumi] tray failed: {error}");
    }
}

fn build(app: &AppHandle) -> tauri::Result<()> {
    let mode = pet::current_mode();

    let show_main_item = MenuItemBuilder::with_id(ITEM_SHOW_MAIN, "显示主窗口").build(app)?;
    let always = CheckMenuItemBuilder::with_id(ITEM_PRESENCE_ALWAYS, "常驻")
        .checked(mode == "always")
        .build(app)?;
    let ghost = CheckMenuItemBuilder::with_id(ITEM_PRESENCE_GHOST, "透明")
        .checked(mode == "ghost")
        .build(app)?;
    let hidden = CheckMenuItemBuilder::with_id(ITEM_PRESENCE_HIDDEN, "隐藏")
        .checked(mode == "hidden")
        .build(app)?;
    let quit = MenuItemBuilder::with_id(ITEM_QUIT, "退出 Asumi Agent").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show_main_item)
        .item(&PredefinedMenuItem::separator(app)?)
        .item(&always)
        .item(&ghost)
        .item(&hidden)
        .item(&PredefinedMenuItem::separator(app)?)
        .item(&quit)
        .build()?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Asumi Agent")
        .show_menu_on_left_click(false)
        .menu(&menu);

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    } else if let Ok(icon) = Image::from_bytes(include_bytes!("../icons/32x32.png")) {
        builder = builder.icon(icon);
    }

    let handle = app.clone();
    builder
        .on_menu_event(move |app, event| match event.id().as_ref() {
            ITEM_SHOW_MAIN => show_main(app),
            ITEM_PRESENCE_ALWAYS => pet::set_mode(app, "always"),
            ITEM_PRESENCE_GHOST => pet::set_mode(app, "ghost"),
            ITEM_PRESENCE_HIDDEN => pet::set_mode(app, "hidden"),
            ITEM_QUIT => app.exit(0),
            _ => {}
        })
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

    Ok(())
}

/// Bring the main window back into view.
fn show_main(app: &AppHandle) {
    if let Some(main) = app.get_webview_window(labels::MAIN) {
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
    }
}

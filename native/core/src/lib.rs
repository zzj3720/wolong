mod app_index;
mod clipboard;
mod input;
mod error;
mod icon;
mod screenshot;
mod utils;

use app_index::scan_app_records;
use clipboard::{start_clipboard_watcher, stop_clipboard_watcher};
use input::{capture_foreground_handle, focus_window as focus_window_handle, simulate_paste};
use napi::bindgen_prelude::*;
use napi::threadsafe_function::ThreadsafeFunction;
use napi_derive::napi;
use screenshot::capture_active_monitor;

#[napi(object)]
pub struct AppInfo {
    pub id: String,
    pub name: String,
    pub launch_path: String,
    pub working_directory: Option<String>,
    pub icon_path: Option<String>,
    pub source: String,
}

#[napi(object)]
pub struct ScreenshotPayload {
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
    pub buffer: Buffer,
    pub mime_type: String,
}

#[napi(object)]
pub struct ClipboardItem {
    pub sequence: u32,
    pub timestamp: i64,
    pub format: String,
    pub text: Option<String>,
    pub image: Option<Buffer>,
}

#[napi]
pub async fn scan_apps(start_menu_paths: Vec<String>, registry_paths: Vec<String>) -> napi::Result<Vec<AppInfo>> {
    let start_menu = start_menu_paths;
    let registry = registry_paths;
    let records = tokio::task::spawn_blocking(move || scan_app_records(&start_menu, &registry))
        .await
        .map_err(|err| Error::new(Status::GenericFailure, err.to_string()))??;

    Ok(records
        .into_iter()
        .map(|record| AppInfo {
            id: record.id,
            name: record.name,
            launch_path: record.launch_path,
            working_directory: record.working_directory,
            icon_path: record.icon_path,
            source: record.source,
        })
        .collect())
}

#[napi]
pub async fn capture_monitor_screenshot() -> napi::Result<ScreenshotPayload> {
    let result = tokio::task::spawn_blocking(capture_active_monitor)
        .await
        .map_err(|err| Error::new(Status::GenericFailure, err.to_string()))??;

    Ok(ScreenshotPayload {
        width: result.width,
        height: result.height,
        x: result.origin_x,
        y: result.origin_y,
        buffer: Buffer::from(result.bytes),
        mime_type: "image/png".to_string(),
    })
}

#[napi]
pub fn subscribe_clipboard(callback: ThreadsafeFunction<ClipboardItem>) -> napi::Result<()> {
    start_clipboard_watcher(callback)
        .map_err(|err| Error::new(Status::GenericFailure, err.to_string()))
}

#[napi]
pub fn unsubscribe_clipboard() {
    stop_clipboard_watcher();
}

#[napi]
pub fn capture_foreground_window() -> Option<String> {
    capture_foreground_handle()
}

#[napi]
pub fn focus_window(handle: String) -> napi::Result<()> {
    focus_window_handle(&handle)
        .map_err(|err| Error::new(Status::GenericFailure, err.to_string()))
}

#[napi]
pub fn paste_clipboard() -> napi::Result<()> {
    simulate_paste()
        .map_err(|err| Error::new(Status::GenericFailure, err.to_string()))
}

#[napi]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[napi(object)]
pub struct ScanPaths {
    pub start_menu_paths: Vec<String>,
    pub registry_paths: Vec<String>,
}

#[napi]
pub fn get_default_scan_paths() -> ScanPaths {
    use app_index::get_default_scan_paths as get_paths;
    let (start_menu, registry) = get_paths();
    ScanPaths {
        start_menu_paths: start_menu,
        registry_paths: registry,
    }
}

#[napi]
pub fn extract_icon(icon_path: String) -> napi::Result<Option<Buffer>> {
    match icon::extract_icon_data(&icon_path) {
        Ok(Some(data)) => Ok(Some(Buffer::from(data))),
        Ok(None) => Ok(None),
        Err(e) => Err(Error::new(Status::GenericFailure, e.to_string())),
    }
}

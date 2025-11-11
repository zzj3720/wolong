use std::{
    ffi::c_void,
    slice,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use image::{codecs::png::PngEncoder, ColorType, ImageEncoder};
use napi::{
    bindgen_prelude::Buffer,
    threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode},
};
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use windows::core::{PCSTR, PCWSTR};
use windows::Win32::{
    Foundation::{HGLOBAL, HWND},
    Graphics::Gdi::{BITMAPINFOHEADER, BI_RGB},
    System::{
        DataExchange::{
            CloseClipboard, GetClipboardData, GetClipboardSequenceNumber, OpenClipboard,
            RegisterClipboardFormatA,
        },
        Memory::{GlobalLock, GlobalSize, GlobalUnlock},
    },
};

const CF_UNICODETEXT: u32 = 13;
const CF_DIB: u32 = 8;

use crate::{
    error::{CoreError, CoreResult},
    ClipboardItem,
};

pub struct ClipboardSnapshot {
    pub sequence: u32,
    pub timestamp: i64,
    pub format: String,
    pub text: Option<String>,
    pub html: Option<String>,
    pub image: Option<Vec<u8>>,
}

static CLIPBOARD_MANAGER: Lazy<ClipboardManager> = Lazy::new(ClipboardManager::new);

pub fn start_clipboard_watcher(callback: ThreadsafeFunction<ClipboardItem>) -> CoreResult<()> {
    CLIPBOARD_MANAGER.start(callback)
}

pub fn stop_clipboard_watcher() {
    CLIPBOARD_MANAGER.stop();
}

struct ClipboardManager {
    callback: Arc<Mutex<Option<ThreadsafeFunction<ClipboardItem>>>>,
    worker: Mutex<Option<ClipboardWorker>>,
}

struct ClipboardWorker {
    shutdown: Arc<AtomicBool>,
    handle: thread::JoinHandle<()>,
}

impl ClipboardManager {
    fn new() -> Self {
        Self {
            callback: Arc::new(Mutex::new(None)),
            worker: Mutex::new(None),
        }
    }

    fn start(&self, callback: ThreadsafeFunction<ClipboardItem>) -> CoreResult<()> {
        {
            let mut guard = self.callback.lock();
            *guard = Some(callback);
        }

        let mut worker_guard = self.worker.lock();
        if worker_guard.is_some() {
            return Ok(());
        }

        let shutdown = Arc::new(AtomicBool::new(false));
        let cb_holder = Arc::clone(&self.callback);
        let shutdown_flag = Arc::clone(&shutdown);

        let handle = thread::Builder::new()
            .name("wolong-clipboard".to_string())
            .spawn(move || poll_clipboard(cb_holder, shutdown_flag))
            .map_err(|err| {
                CoreError::Other(anyhow::anyhow!("spawn clipboard thread failed: {err}"))
            })?;

        *worker_guard = Some(ClipboardWorker { shutdown, handle });
        Ok(())
    }

    fn stop(&self) {
        let mut worker_guard = self.worker.lock();
        if let Some(worker) = worker_guard.take() {
            worker.shutdown.store(true, Ordering::Relaxed);
            worker.handle.join().ok();
        }

        let mut cb_guard = self.callback.lock();
        *cb_guard = None;
    }
}

fn poll_clipboard(
    callback_holder: Arc<Mutex<Option<ThreadsafeFunction<ClipboardItem>>>>,
    shutdown: Arc<AtomicBool>,
) {
    let mut last_sequence: u32 = 0;
    while !shutdown.load(Ordering::Relaxed) {
        let current = unsafe { GetClipboardSequenceNumber() };
        if current != 0 && current != last_sequence {
            last_sequence = current;
            if let Ok(snapshot) = capture_clipboard_snapshot(current) {
                if let Some(callback) = callback_holder.lock().as_ref() {
                    let item: ClipboardItem = snapshot.into();
                    let _ = callback.call(Ok(item), ThreadsafeFunctionCallMode::NonBlocking);
                }
            }
        }
        thread::sleep(Duration::from_millis(200));
    }
}

fn capture_clipboard_snapshot(sequence: u32) -> CoreResult<ClipboardSnapshot> {
    let mut attempts = 0;
    loop {
        match unsafe { OpenClipboard(HWND(0)) } {
            Ok(_) => break,
            Err(_) if attempts < 5 => {
                attempts += 1;
                thread::sleep(Duration::from_millis(20));
            }
            Err(_) => return Err(CoreError::from_win32("OpenClipboard failed")),
        }
    }

    let _guard = ClipboardGuard;
    let text = read_clipboard_text()?;
    let html = read_clipboard_html()?;
    let image = read_clipboard_image().transpose()?;

    let mut formats = Vec::new();
    if text.is_some() {
        formats.push("text".to_string());
    }
    if html.is_some() {
        formats.push("html".to_string());
    }
    if image.is_some() {
        formats.push("image".to_string());
    }

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0);

    Ok(ClipboardSnapshot {
        sequence,
        timestamp,
        format: if formats.is_empty() {
            "unknown".to_string()
        } else {
            formats.join(",")
        },
        text,
        html,
        image,
    })
}

struct ClipboardGuard;

impl Drop for ClipboardGuard {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseClipboard();
        }
    }
}

fn read_clipboard_text() -> CoreResult<Option<String>> {
    unsafe {
        let handle = match GetClipboardData(CF_UNICODETEXT).ok() {
            Some(handle) if handle.0 != 0 => handle,
            _ => return Ok(None),
        };

        let global = HGLOBAL(handle.0 as *mut c_void);
        let locked = GlobalLock(global);
        if locked.is_null() {
            return Err(CoreError::from_win32("GlobalLock clipboard text failed"));
        }

        let text = PCWSTR::from_raw(locked as *const u16)
            .to_string()
            .map_err(|err| {
                CoreError::Other(anyhow::anyhow!("convert clipboard text failed: {err}"))
            })?;

        let _ = GlobalUnlock(global);
        Ok(Some(text))
    }
}

fn read_clipboard_html() -> CoreResult<Option<String>> {
    unsafe {
        let format_name = b"HTML Format\0";
        let cf_html = RegisterClipboardFormatA(PCSTR::from_raw(format_name.as_ptr()));
        if cf_html == 0 {
            return Ok(None);
        }

        let handle = match GetClipboardData(cf_html).ok() {
            Some(handle) if handle.0 != 0 => handle,
            _ => return Ok(None),
        };

        let global = HGLOBAL(handle.0 as *mut c_void);
        let locked = GlobalLock(global);
        if locked.is_null() {
            return Err(CoreError::from_win32("GlobalLock clipboard HTML failed"));
        }

        let size = GlobalSize(global);
        if size == 0 {
            let _ = GlobalUnlock(global);
            return Ok(None);
        }

        let data = slice::from_raw_parts(locked as *const u8, size as usize);
        let html_raw = String::from_utf8_lossy(data).to_string();
        
        // Windows clipboard HTML format has a special header:
        // Version:0.9
        // StartHTML:0000000000
        // EndHTML:0000000000
        // StartFragment:0000000000
        // EndFragment:0000000000
        // ...actual HTML content...
        let html = if html_raw.starts_with("Version:") {
            // Extract the actual HTML content after the header
            if let Some(start_fragment_pos) = html_raw.find("StartFragment:") {
                if let Some(end_fragment_pos) = html_raw.find("EndFragment:") {
                    if let Some(start_html_pos) = html_raw.find("StartHTML:") {
                        if let Some(end_html_pos) = html_raw.find("EndHTML:") {
                            // Parse offsets
                            let start_html_offset = html_raw[start_html_pos + 10..]
                                .lines()
                                .next()
                                .and_then(|s| s.trim().parse::<usize>().ok())
                                .unwrap_or(0);
                            let end_html_offset = html_raw[end_html_pos + 8..]
                                .lines()
                                .next()
                                .and_then(|s| s.trim().parse::<usize>().ok())
                                .unwrap_or(html_raw.len());
                            
                            if start_html_offset < html_raw.len() && end_html_offset <= html_raw.len() && start_html_offset < end_html_offset {
                                html_raw[start_html_offset..end_html_offset].to_string()
                            } else {
                                html_raw
                            }
                        } else {
                            html_raw
                        }
                    } else {
                        html_raw
                    }
                } else {
                    html_raw
                }
            } else {
                html_raw
            }
        } else {
            html_raw
        };

        let _ = GlobalUnlock(global);
        Ok(Some(html))
    }
}

fn read_clipboard_image() -> Option<CoreResult<Vec<u8>>> {
    unsafe {
        let handle = match GetClipboardData(CF_DIB).ok() {
            Some(handle) if handle.0 != 0 => handle,
            _ => return None,
        };

        let global = HGLOBAL(handle.0 as *mut c_void);
        let locked = GlobalLock(global);
        if locked.is_null() {
            return Some(Err(CoreError::from_win32(
                "GlobalLock clipboard image failed",
            )));
        }

        let size = GlobalSize(global);
        if size == 0 {
            let _ = GlobalUnlock(global);
            return None;
        }

        let data = slice::from_raw_parts(locked as *const u8, size as usize);
        let header = match parse_bitmap_header(data) {
            Ok(header) => header,
            Err(err) => {
                let _ = GlobalUnlock(global);
                return Some(Err(err));
            }
        };

        let pixels_offset = header.header_size as usize;
        let width_u32 = abs_i32_to_u32(header.width);
        let height_u32 = abs_i32_to_u32(header.height);
        let stride = (((u32::from(header.bit_count) * width_u32) + 31) / 32 * 4) as usize;
        let height = height_u32 as usize;
        let width = width_u32 as usize;

        if pixels_offset + stride * height > data.len() {
            let _ = GlobalUnlock(global);
            return Some(Err(CoreError::Other(anyhow::anyhow!(
                "clipboard DIB buffer too small"
            ))));
        }

        let mut rgba = Vec::with_capacity(width * height * 4);
        let top_down = header.height < 0;

        for row in 0..height {
            let src_row = if top_down { row } else { height - 1 - row };
            let row_start = pixels_offset + src_row * stride;
            let row_data = &data[row_start..row_start + stride];

            match header.bit_count {
                32 => {
                    for chunk in row_data.chunks_exact(4).take(width) {
                        rgba.extend_from_slice(&[chunk[2], chunk[1], chunk[0], chunk[3]]);
                    }
                }
                24 => {
                    for chunk in row_data.chunks_exact(3).take(width) {
                        rgba.extend_from_slice(&[chunk[2], chunk[1], chunk[0], 255]);
                    }
                }
                _ => {
                    let _ = GlobalUnlock(global);
                    return Some(Err(CoreError::Other(anyhow::anyhow!(
                        "unsupported clipboard bit depth: {}",
                        header.bit_count
                    ))));
                }
            }
        }

        let _ = GlobalUnlock(global);

        let mut png = Vec::new();
        if let Err(err) = PngEncoder::new(&mut png).write_image(
            &rgba,
            width as u32,
            height as u32,
            ColorType::Rgba8,
        ) {
            return Some(Err(CoreError::Other(anyhow::anyhow!(
                "encode clipboard image failed: {err}"
            ))));
        }

        Some(Ok(png))
    }
}

struct DibHeader {
    width: i32,
    height: i32,
    bit_count: u16,
    header_size: u32,
}

fn parse_bitmap_header(data: &[u8]) -> CoreResult<DibHeader> {
    if data.len() < std::mem::size_of::<BITMAPINFOHEADER>() {
        return Err(CoreError::Other(anyhow::anyhow!(
            "clipboard DIB header too small"
        )));
    }

    let header = unsafe { *(data.as_ptr() as *const BITMAPINFOHEADER) };

    if header.biCompression != BI_RGB.0 {
        return Err(CoreError::Other(anyhow::anyhow!(
            "unsupported compression {}",
            header.biCompression
        )));
    }

    Ok(DibHeader {
        width: header.biWidth,
        height: header.biHeight,
        bit_count: header.biBitCount,
        header_size: header.biSize,
    })
}

fn abs_i32_to_u32(value: i32) -> u32 {
    if value < 0 {
        value.wrapping_neg() as u32
    } else {
        value as u32
    }
}

impl From<ClipboardSnapshot> for ClipboardItem {
    fn from(snapshot: ClipboardSnapshot) -> Self {
        ClipboardItem {
            sequence: snapshot.sequence,
            timestamp: snapshot.timestamp,
            format: snapshot.format,
            text: snapshot.text,
            html: snapshot.html,
            image: snapshot.image.map(Buffer::from),
        }
    }
}

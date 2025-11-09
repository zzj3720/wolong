use std::mem::size_of;

use anyhow::Context;
use image::{codecs::png::PngEncoder, ColorType, ImageEncoder};
use windows::Win32::{
    Foundation::{HWND, POINT},
    Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
        GetDIBits, GetMonitorInfoW, MonitorFromPoint, ReleaseDC, SelectObject, BITMAPINFO,
        BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, MONITORINFO, MONITORINFOEXW, MONITOR_FROM_FLAGS,
        RGBQUAD, SRCCOPY,
    },
    UI::WindowsAndMessaging::GetCursorPos,
};

const MONITOR_DEFAULTTONEAREST: MONITOR_FROM_FLAGS = MONITOR_FROM_FLAGS(2);

use crate::error::{CoreError, CoreResult};

pub struct ScreenshotResult {
    pub width: u32,
    pub height: u32,
    pub origin_x: i32,
    pub origin_y: i32,
    pub bytes: Vec<u8>,
}

pub fn capture_active_monitor() -> CoreResult<ScreenshotResult> {
    unsafe {
        let mut cursor = POINT::default();
        GetCursorPos(&mut cursor).map_err(|_| CoreError::from_win32("GetCursorPos failed"))?;

        let monitor = MonitorFromPoint(cursor, MONITOR_DEFAULTTONEAREST);
        if monitor.0 == 0 {
            return Err(CoreError::from_win32("MonitorFromPoint failed"));
        }

        let mut info = MONITORINFOEXW::default();
        info.monitorInfo.cbSize = size_of::<MONITORINFO>() as u32;
        if !GetMonitorInfoW(monitor, &mut info as *mut _ as *mut MONITORINFO).as_bool() {
            return Err(CoreError::from_win32("GetMonitorInfoW failed"));
        }

        let rect = info.monitorInfo.rcMonitor;
        let width = (rect.right - rect.left) as i32;
        let height = (rect.bottom - rect.top) as i32;

        if width <= 0 || height <= 0 {
            return Err(CoreError::Other(anyhow::anyhow!(
                "monitor dimensions invalid"
            )));
        }

        let screen_dc = GetDC(HWND(0));
        if screen_dc.0 == 0 {
            return Err(CoreError::from_win32("GetDC failed"));
        }

        let memory_dc = CreateCompatibleDC(screen_dc);
        if memory_dc.0 == 0 {
            let _ = ReleaseDC(HWND(0), screen_dc);
            return Err(CoreError::from_win32("CreateCompatibleDC failed"));
        }

        let bitmap = CreateCompatibleBitmap(screen_dc, width, height);
        if bitmap.0 == 0 {
            let _ = DeleteDC(memory_dc);
            let _ = ReleaseDC(HWND(0), screen_dc);
            return Err(CoreError::from_win32("CreateCompatibleBitmap failed"));
        }

        let old = SelectObject(memory_dc, bitmap);
        if old.0 == 0 {
            let _ = DeleteObject(bitmap);
            let _ = DeleteDC(memory_dc);
            let _ = ReleaseDC(HWND(0), screen_dc);
            return Err(CoreError::from_win32("SelectObject failed"));
        }

        if BitBlt(
            memory_dc, 0, 0, width, height, screen_dc, rect.left, rect.top, SRCCOPY,
        )
        .is_err()
        {
            SelectObject(memory_dc, old);
            let _ = DeleteObject(bitmap);
            let _ = DeleteDC(memory_dc);
            let _ = ReleaseDC(HWND(0), screen_dc);
            return Err(CoreError::from_win32("BitBlt failed"));
        }

        let mut bitmap_info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [RGBQUAD::default(); 1],
        };

        let mut buffer = vec![0u8; (width * height * 4) as usize];
        let result = GetDIBits(
            memory_dc,
            bitmap,
            0,
            height as u32,
            Some(buffer.as_mut_ptr().cast()),
            &mut bitmap_info,
            DIB_RGB_COLORS,
        );

        SelectObject(memory_dc, old);
        let _ = DeleteObject(bitmap);
        let _ = DeleteDC(memory_dc);
        let _ = ReleaseDC(HWND(0), screen_dc);

        if result == 0 {
            return Err(CoreError::from_win32("GetDIBits failed"));
        }

        // Convert BGRA to RGBA
        for chunk in buffer.chunks_exact_mut(4) {
            chunk.swap(0, 2);
        }

        let mut png_bytes = Vec::new();
        {
            let encoder = PngEncoder::new(&mut png_bytes);
            encoder
                .write_image(&buffer, width as u32, height as u32, ColorType::Rgba8)
                .context("encode PNG failed")?;
        }

        Ok(ScreenshotResult {
            width: width as u32,
            height: height as u32,
            origin_x: rect.left,
            origin_y: rect.top,
            bytes: png_bytes,
        })
    }
}

use crate::error::{CoreError, CoreResult};
use crate::utils::{expand_env_vars, wide_string};
use std::path::Path;
use windows::{
    core::PCWSTR,
    Win32::{
        Graphics::Gdi::{
            CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, ReleaseDC,
            SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
        },
        Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES,
        UI::{
            Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON},
            WindowsAndMessaging::{
                DestroyIcon, DrawIconEx, GetSystemMetrics, DI_NORMAL, SM_CXICON, SM_CYICON,
            },
        },
    },
};

const ICON_SIZE: i32 = 48;

pub fn extract_icon_data(icon_path: &str) -> CoreResult<Option<Vec<u8>>> {
    // Parse icon path (may contain index like "path.exe,0")
    let path_str = if let Some(comma_pos) = icon_path.find(',') {
        icon_path[..comma_pos].trim()
    } else {
        icon_path.trim()
    };

    let expanded = expand_env_vars(path_str);
    // Convert to PathBuf and normalize to Windows format (use \ instead of /)
    let path_buf = Path::new(&expanded).to_path_buf();
    let normalized = path_buf.to_string_lossy().replace('/', "\\");

    if !Path::new(&normalized).exists() {
        return Ok(None);
    }

    unsafe {
        let wide_path = wide_string(&normalized);
        let mut file_info = std::mem::zeroed::<SHFILEINFOW>();

        let result = SHGetFileInfoW(
            PCWSTR(wide_path.as_ptr()),
            FILE_FLAGS_AND_ATTRIBUTES(0),
            Some(&mut file_info),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_LARGEICON,
        );

        if result == 0 || file_info.hIcon.is_invalid() {
            return Ok(None);
        }

        let hicon = file_info.hIcon;
        let hdc = GetDC(None);
        if hdc.is_invalid() {
            let _ = DestroyIcon(hicon);
            return Ok(None);
        }

        let icon_width = GetSystemMetrics(SM_CXICON);
        let icon_height = GetSystemMetrics(SM_CYICON);

        // Create bitmap
        let bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: icon_width,
                biHeight: -icon_height, // Negative for top-down DIB
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [std::mem::zeroed(); 1],
        };

        let mut bits_ptr: *mut std::ffi::c_void = std::ptr::null_mut();
        let hbitmap = match CreateDIBSection(
            hdc,
            &bmi,
            DIB_RGB_COLORS,
            &mut bits_ptr,
            None,
            0,
        ) {
            Ok(bitmap) => bitmap,
            Err(_) => {
                ReleaseDC(None, hdc);
                let _ = DestroyIcon(hicon);
                return Ok(None);
            }
        };

        if hbitmap.is_invalid() || bits_ptr.is_null() {
            ReleaseDC(None, hdc);
            let _ = DestroyIcon(hicon);
            return Ok(None);
        }

        let mem_dc = CreateCompatibleDC(hdc);
        if mem_dc.is_invalid() {
            let _ = DeleteObject(hbitmap);
            ReleaseDC(None, hdc);
            let _ = DestroyIcon(hicon);
            return Ok(None);
        }

        let _old_bitmap = SelectObject(mem_dc, hbitmap);

        // Draw icon to bitmap
        let _ = DrawIconEx(
            mem_dc,
            0,
            0,
            hicon,
            icon_width,
            icon_height,
            0,
            None,
            DI_NORMAL,
        );

        // Read bitmap data
        let stride = icon_width * 4; // 32 bits per pixel (BGRA)
        let size = (stride * icon_height) as usize;
        let mut buffer = vec![0u8; size];
        std::ptr::copy_nonoverlapping(bits_ptr as *const u8, buffer.as_mut_ptr(), size);

        // Convert BGRA to RGBA
        for chunk in buffer.chunks_exact_mut(4) {
            chunk.swap(0, 2); // Swap B and R
        }

        // Cleanup
        SelectObject(mem_dc, _old_bitmap);
        let _ = DeleteObject(hbitmap);
        let _ = DeleteDC(mem_dc);
        ReleaseDC(None, hdc);
        let _ = DestroyIcon(hicon);

        // Resize to ICON_SIZE if needed
        let resized = if icon_width != ICON_SIZE || icon_height != ICON_SIZE {
            resize_image(
                &buffer,
                icon_width as usize,
                icon_height as usize,
                ICON_SIZE as usize,
                ICON_SIZE as usize,
            )?
        } else {
            buffer
        };

        // Convert to PNG
        let png_data = encode_as_png(&resized, ICON_SIZE as usize, ICON_SIZE as usize)?;
        Ok(Some(png_data))
    }
}

fn resize_image(
    data: &[u8],
    src_width: usize,
    src_height: usize,
    dst_width: usize,
    dst_height: usize,
) -> CoreResult<Vec<u8>> {
    let mut output = vec![0u8; dst_width * dst_height * 4];

    for y in 0..dst_height {
        for x in 0..dst_width {
            let src_x = (x * src_width) / dst_width;
            let src_y = (y * src_height) / dst_height;
            let src_idx = (src_y * src_width + src_x) * 4;
            let dst_idx = (y * dst_width + x) * 4;

            if src_idx + 3 < data.len() && dst_idx + 3 < output.len() {
                output[dst_idx] = data[src_idx];
                output[dst_idx + 1] = data[src_idx + 1];
                output[dst_idx + 2] = data[src_idx + 2];
                output[dst_idx + 3] = data[src_idx + 3];
            }
        }
    }

    Ok(output)
}

fn encode_as_png(data: &[u8], width: usize, height: usize) -> CoreResult<Vec<u8>> {
    use image::codecs::png::PngEncoder;
    use image::ImageEncoder;

    let mut png_data = Vec::new();
    let encoder = PngEncoder::new(&mut png_data);
    encoder
        .write_image(data, width as u32, height as u32, image::ColorType::Rgba8)
        .map_err(|e| CoreError::Other(anyhow::anyhow!("Failed to encode PNG: {e}")))?;

    Ok(png_data)
}


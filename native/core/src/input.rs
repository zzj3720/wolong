use std::{mem::size_of, thread, time::Duration};

use anyhow::anyhow;
use windows::Win32::{
    Foundation::HWND,
    UI::{
        Input::KeyboardAndMouse::{
            SendInput, INPUT, INPUT_KEYBOARD, INPUT_0, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, VIRTUAL_KEY,
        },
        WindowsAndMessaging::{
            AllowSetForegroundWindow, BringWindowToTop, GetForegroundWindow, IsIconic, SetForegroundWindow, ShowWindow,
            ASFW_ANY, SW_RESTORE,
        },
    },
};

use crate::error::{CoreError, CoreResult};

const KEY_CONTROL: u16 = 0x11; // VK_CONTROL
const KEY_V: u16 = 0x56; // 'V'

pub fn capture_foreground_handle() -> Option<String> {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0 == 0 {
            None
        } else {
            Some(format!("{:016X}", hwnd.0 as isize as u64))
        }
    }
}

pub fn focus_window(handle: &str) -> CoreResult<()> {
    let trimmed = handle.trim();
    if trimmed.is_empty() {
        return Ok(());
    }

    let normalized = trimmed.strip_prefix("0x").unwrap_or(trimmed);
    let value = u64::from_str_radix(normalized, 16)
        .map_err(|err| CoreError::Other(anyhow!("invalid window handle '{handle}': {err}")))?;

    if value == 0 {
        return Ok(());
    }

    let hwnd = HWND(value as isize);
    restore_window(hwnd)
}

pub fn simulate_paste() -> CoreResult<()> {
    send_combo(&[(KEY_CONTROL, false), (KEY_V, false), (KEY_V, true), (KEY_CONTROL, true)])
}

fn restore_window(hwnd: HWND) -> CoreResult<()> {
    if hwnd.0 == 0 {
        return Ok(());
    }

    unsafe {
        let _ = AllowSetForegroundWindow(ASFW_ANY);

        if IsIconic(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_RESTORE);
        }

        if let Err(err) = BringWindowToTop(hwnd) {
            return Err(CoreError::Other(anyhow!("BringWindowToTop failed: {err}")));
        }

        if SetForegroundWindow(hwnd).0 == 0 {
            return Err(CoreError::from_win32("SetForegroundWindow failed"));
        }

        // Give Windows a moment to settle focus before we send keystrokes
        thread::sleep(Duration::from_millis(12));
    }

    Ok(())
}

fn send_combo(sequence: &[(u16, bool)]) -> CoreResult<()> {
    // Small delay to allow other windows to settle (matching human timing)
    thread::sleep(Duration::from_millis(35));

    let mut inputs: Vec<INPUT> = Vec::with_capacity(sequence.len());
    for &(vk, key_up) in sequence {
        inputs.push(INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(vk),
                    wScan: 0,
                    dwFlags: if key_up { KEYEVENTF_KEYUP } else { KEYBD_EVENT_FLAGS(0) },
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        });
    }

    unsafe {
        let sent = SendInput(&inputs, size_of::<INPUT>() as i32);
        if sent == 0 {
            return Err(CoreError::from_win32("SendInput failed"));
        }
    }
    Ok(())
}






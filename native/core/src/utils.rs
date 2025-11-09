use std::{collections::HashMap, ffi::OsStr, os::windows::prelude::OsStrExt, path::Path};

use base64::{engine::general_purpose, Engine as _};
use sha2::{Digest, Sha256};

pub fn hash_id(parts: &[&str]) -> String {
    let mut hasher = Sha256::new();
    for part in parts {
        hasher.update(part.as_bytes());
    }
    general_purpose::URL_SAFE_NO_PAD.encode(hasher.finalize())
}

#[allow(dead_code)]
pub fn wide_string(value: &str) -> Vec<u16> {
    let mut wide: Vec<u16> = OsStr::new(value)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    if !wide.ends_with(&[0]) {
        wide.push(0);
    }
    wide
}

pub fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

pub fn string_from_wide(buffer: &[u16]) -> Option<String> {
    let len = buffer.iter().position(|&c| c == 0).unwrap_or(buffer.len());
    if len == 0 {
        return None;
    }
    String::from_utf16(&buffer[..len])
        .ok()
        .map(|s| s.trim().to_string())
}

pub fn expand_env_vars(value: &str) -> String {
    let mut result = String::with_capacity(value.len());
    let mut chars = value.chars().peekable();
    let env_map: HashMap<String, String> = std::env::vars().collect();

    while let Some(ch) = chars.next() {
        if ch == '%' {
            let mut key = String::new();
            while let Some(&next) = chars.peek() {
                chars.next();
                if next == '%' {
                    break;
                }
                key.push(next);
            }
            if key.is_empty() {
                result.push('%');
                continue;
            }
            if let Some(val) = env_map.get(&key) {
                result.push_str(val);
            } else {
                result.push('%');
                result.push_str(&key);
                result.push('%');
            }
        } else {
            result.push(ch);
        }
    }

    result
}

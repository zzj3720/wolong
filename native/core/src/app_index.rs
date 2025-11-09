struct ComGuard {
    initialized: bool,
}

impl ComGuard {
    fn new() -> CoreResult<Self> {
        unsafe {
            let hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            if hr.is_ok() {
                Ok(Self { initialized: true })
            } else if hr == RPC_E_CHANGED_MODE {
                Ok(Self { initialized: false })
            } else {
                Err(CoreError::Other(anyhow::anyhow!(
                    "CoInitializeEx failed: {hr}"
                )))
            }
        }
    }
}

impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.initialized {
            unsafe {
                CoUninitialize();
            }
        }
    }
}
use std::{
    collections::HashMap,
    env,
    path::{Path, PathBuf},
    ptr,
    time::{SystemTime, UNIX_EPOCH},
};

use walkdir::WalkDir;
use winreg::{enums::*, RegKey, HKEY};

use crate::{
    error::{CoreError, CoreResult},
    utils::{expand_env_vars, hash_id, normalize_path, string_from_wide, wide_string},
};
use anyhow::anyhow;
use windows::{
    core::{Interface, PCWSTR},
    Win32::{
        Foundation::{MAX_PATH, RPC_E_CHANGED_MODE},
        System::{
            Com::{
                CoCreateInstance, CoInitializeEx, CoUninitialize, IPersistFile,
                CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, STGM_READ,
            },
        },
        UI::Shell::{IShellLinkW, ShellLink, SLGP_RAWPATH},
    },
};

#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct AppRecord {
    pub id: String,
    pub name: String,
    pub launch_path: String,
    pub working_directory: Option<String>,
    pub icon_path: Option<String>,
    pub source: String,
    pub last_modified: u64,
}

#[derive(Default, Debug)]
struct ShortcutInfo {
    target: Option<String>,
    arguments: Option<String>,
    working_directory: Option<String>,
    icon_path: Option<String>,
}

fn parse_shell_shortcut(path: &Path) -> CoreResult<ShortcutInfo> {
    unsafe {
        let shell_link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)
            .map_err(|err| {
                CoreError::Other(anyhow!("CoCreateInstance(IShellLinkW) failed: {err}"))
            })?;
        let persist: IPersistFile = shell_link.cast().map_err(|err| {
            CoreError::Other(anyhow!("QueryInterface(IPersistFile) failed: {err}"))
        })?;

        let wide_path = wide_string(&path.to_string_lossy());
        persist
            .Load(PCWSTR(wide_path.as_ptr()), STGM_READ)
            .map_err(|err| CoreError::Other(anyhow!("persist.Load failed: {err}")))?;

        let mut buffer = [0u16; MAX_PATH as usize];

        shell_link
            .GetPath(&mut buffer, ptr::null_mut(), SLGP_RAWPATH.0 as u32)
            .ok();
        let target = string_from_wide(&buffer).map(|value| normalize_path(Path::new(&value)));

        buffer.fill(0);
        shell_link
            .GetArguments(&mut buffer)
            .ok();
        let arguments = string_from_wide(&buffer).filter(|s| !s.is_empty());

        buffer.fill(0);
        shell_link
            .GetWorkingDirectory(&mut buffer)
            .ok();
        let working_directory = string_from_wide(&buffer)
            .filter(|s| !s.is_empty())
            .map(|dir| resolve_relative_path(path, &dir));

        buffer.fill(0);
        let mut icon_index = 0;
        shell_link
            .GetIconLocation(&mut buffer, &mut icon_index)
            .ok();
        let icon_path = string_from_wide(&buffer)
            .filter(|s| !s.is_empty())
            .and_then(|icon| {
                let cleaned = clean_path_candidate(icon);
                cleaned.map(|value| resolve_relative_path(path, &value))
            });

        Ok(ShortcutInfo {
            target,
            arguments,
            working_directory,
            icon_path,
        })
    }
}

fn resolve_relative_path(base: &Path, candidate: &str) -> String {
    let expanded = expand_env_vars(candidate);
    let candidate_path = Path::new(&expanded);
    let resolved = if candidate_path.is_absolute() {
        candidate_path.to_path_buf()
    } else {
        base.parent()
            .map(|parent| parent.join(candidate_path))
            .unwrap_or_else(|| candidate_path.to_path_buf())
    };
    normalize_path(&resolved)
}

fn is_uninstaller_target(target: &str, arguments: Option<&str>) -> bool {
    let lower_target = target.to_ascii_lowercase();
    let filename = Path::new(target)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .map(|name| name.to_ascii_lowercase())
        .unwrap_or_else(String::new);

    if lower_target.contains("msiexec.exe")
        || lower_target.contains("uninstall")
        || lower_target.contains("\\uninst")
        || lower_target.contains("appwiz.cpl")
        || filename.contains("uninstall")
        || filename.contains("unins")
        || filename.contains("remove")
    {
        return true;
    }

    if let Some(args) = arguments {
        let lower_args = args.to_ascii_lowercase();
        if lower_args.contains("/x")
            || lower_args.contains("/uninstall")
            || lower_args.contains("--uninstall")
            || lower_args.contains("uninstall")
        {
            return true;
        }
    }

    false
}

pub fn scan_app_records(start_menu_paths: &[String], registry_paths: &[String]) -> CoreResult<Vec<AppRecord>> {
    let _com_guard = ComGuard::new()?;
    let mut map: HashMap<String, AppRecord> = HashMap::new();

    for path_str in start_menu_paths {
        let path = Path::new(path_str);
        let source_path = normalize_path(path);
        if let Err(err) = ingest_start_menu(&mut map, path, &source_path) {
            log::warn!("failed to ingest start menu path {:?}: {err}", path);
        }
    }

    for registry_path in registry_paths {
        if let Err(err) = ingest_registry_path(&mut map, registry_path) {
            log::warn!("failed to ingest registry path {:?}: {err}", registry_path);
        }
    }

    let mut values: Vec<AppRecord> = map.into_values().collect();
    values.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(values)
}

fn ingest_start_menu(map: &mut HashMap<String, AppRecord>, root: &Path, source_path: &str) -> CoreResult<()> {
    if !root.exists() {
        return Ok(());
    }

    for entry in WalkDir::new(root)
        .follow_links(true)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
    {
        let path = entry.into_path();
        if !matches!(
            path.extension()
                .and_then(|ext| ext.to_str())
                .map(|s| s.eq_ignore_ascii_case("lnk")),
            Some(true)
        ) {
            continue;
        }

        let name = path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "Unknown Shortcut".to_string());

        let shortcut = match parse_shell_shortcut(&path) {
            Ok(info) => info,
            Err(err) => {
                log::trace!("skip shortcut {:?}: {err}", path);
                continue;
            }
        };

        let Some(target_path) = shortcut.target.clone() else {
            log::trace!("skip shortcut without target {:?}", path);
            continue;
        };

        let shortcut_path = normalize_path(&path);
        // For shortcuts, use the target exe as launch_path instead of the shortcut itself
        let launch_path = normalize_path(Path::new(&target_path));
        let working_directory = shortcut.working_directory.or_else(|| {
            Path::new(&target_path)
                .parent()
                .map(|dir| normalize_path(dir))
        });
        let icon_path = shortcut.icon_path.or_else(|| Some(target_path.clone()));

        let metadata = std::fs::metadata(&path).ok();
        let modified = metadata
            .and_then(|meta| meta.modified().ok())
            .and_then(|stamp| stamp.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_secs())
            .unwrap_or_else(|| {
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0)
            });

        // Use shortcut path for ID to maintain consistency for the same shortcut
        let id = hash_id(&["start_menu", &shortcut_path]);
        let record = AppRecord {
            id: id.clone(),
            name,
            launch_path,
            working_directory,
            icon_path,
            source: source_path.to_string(),
            last_modified: modified,
        };

        map.insert(id, record);
    }

    Ok(())
}

fn ingest_registry_path(map: &mut HashMap<String, AppRecord>, registry_path: &str) -> CoreResult<()> {
    // Parse registry path format: "HKEY_LOCAL_MACHINE\\SOFTWARE\\..."
    let parts: Vec<&str> = registry_path.splitn(2, '\\').collect();
    if parts.len() != 2 {
        return Err(CoreError::Other(anyhow::anyhow!("invalid registry path format")));
    }

    let hive_str = parts[0];
    let subkey = parts[1];

    let hive = match hive_str {
        "HKEY_LOCAL_MACHINE" => HKEY_LOCAL_MACHINE,
        "HKEY_CURRENT_USER" => HKEY_CURRENT_USER,
        _ => return Err(CoreError::Other(anyhow::anyhow!("unsupported registry hive: {}", hive_str))),
    };

    let root = RegKey::predef(hive);
    let key = root.open_subkey_with_flags(subkey, KEY_READ)
        .map_err(|e| CoreError::Other(anyhow::anyhow!("failed to open registry key {}: {}", registry_path, e)))?;

    for entry in key.enum_keys().flatten() {
        if let Err(err) = ingest_uninstall_entry(map, &key, &entry, hive, registry_path) {
            log::trace!("skip registry app {entry}: {err}");
        }
    }

    Ok(())
}

fn ingest_uninstall_entry(
    map: &mut HashMap<String, AppRecord>,
    parent: &RegKey,
    key_name: &str,
    hive: HKEY,
    registry_path: &str,
) -> CoreResult<()> {
    let sub = parent.open_subkey_with_flags(key_name, KEY_READ)?;

    let name: String = sub
        .get_value("DisplayName")
        .map_err(|_| CoreError::Other(anyhow::anyhow!("missing DisplayName")))?;
    if name.trim().is_empty() {
        return Err(CoreError::Other(anyhow::anyhow!("empty display name")));
    }

    if matches!(sub.get_value::<u32, _>("SystemComponent"), Ok(value) if value == 1) {
        return Err(CoreError::Other(anyhow::anyhow!("system component hidden")));
    }
    if matches!(sub.get_value::<u32, _>("NoDisplay"), Ok(value) if value == 1) {
        return Err(CoreError::Other(anyhow::anyhow!(
            "entry hidden from display"
        )));
    }
    if matches!(sub.get_value::<u32, _>("NoDisplayIcon"), Ok(value) if value == 1) {
        return Err(CoreError::Other(anyhow::anyhow!("entry hides icon")));
    }

    let raw_uninstall = sub.get_value::<String, _>("UninstallString").ok();
    if let Some(raw) = raw_uninstall.as_ref() {
        let lower = raw.to_ascii_lowercase();
        if lower.contains("msiexec")
            || lower.contains("uninstall")
            || lower.contains("/x")
            || lower.contains("--remove")
            || lower.contains("--uninstall")
        {
            return Err(CoreError::Other(anyhow::anyhow!(
                "registry entry is uninstall command"
            )));
        }
    }

    let icon_path = sub
        .get_value::<String, _>("DisplayIcon")
        .ok()
        .and_then(clean_path_candidate);
    let install_location = sub
        .get_value::<String, _>("InstallLocation")
        .ok()
        .and_then(clean_path_candidate);

    let icon_normalized = icon_path.as_ref().map(|value| {
        let expanded = expand_env_vars(value);
        normalize_path(Path::new(&expanded))
    });

    let mut launch_path = icon_normalized
        .as_ref()
        .filter(|value| is_executable_candidate(value))
        .cloned();

    if launch_path.is_none() {
        if let Some(location) = install_location.as_ref() {
            let expanded = expand_env_vars(location);
            let normalized = normalize_path(Path::new(&expanded));
            if is_executable_candidate(&normalized) {
                launch_path = Some(normalized);
            }
        }
    }

    let launch_path =
        launch_path.ok_or_else(|| CoreError::Other(anyhow::anyhow!("missing executable path")))?;

    let normalized = normalize_path(Path::new(&launch_path));
    let working_directory = Path::new(&launch_path)
        .parent()
        .map(|dir| normalize_path(dir));

    let icon = icon_normalized;

    let id = hash_id(&["registry", &normalized, &name, &format!("{:?}", hive)]);

    let record = AppRecord {
        id: id.clone(),
        name: name.trim().to_string(),
        launch_path: normalized.clone(),
        working_directory,
        icon_path: icon,
        source: registry_path.to_string(),
        last_modified: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_secs())
            .unwrap_or(0),
    };

    map.insert(id, record);

    Ok(())
}

fn start_menu_roots() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(program_data) = env::var("PROGRAMDATA") {
        let path = Path::new(&program_data).join("Microsoft\\Windows\\Start Menu\\Programs");
        paths.push(path);
    }
    if let Ok(app_data) = env::var("APPDATA") {
        let path = Path::new(&app_data).join("Microsoft\\Windows\\Start Menu\\Programs");
        paths.push(path);
    }
    paths
}

pub fn get_default_scan_paths() -> (Vec<String>, Vec<String>) {
    let mut start_menu_paths = Vec::new();
    let mut registry_paths = Vec::new();
    
    // Start menu paths
    for path in start_menu_roots() {
        if let Some(path_str) = path.to_str() {
            start_menu_paths.push(path_str.to_string());
        }
    }
    
    // Registry paths
    registry_paths.push("HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall".to_string());
    registry_paths.push("HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall".to_string());
    registry_paths.push("HKEY_CURRENT_USER\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall".to_string());
    
    (start_menu_paths, registry_paths)
}

fn clean_path_candidate(input: String) -> Option<String> {
    let trimmed = input.trim().trim_matches('"');
    if trimmed.is_empty() {
        return None;
    }
    let parts: Vec<&str> = trimmed.split(',').collect();
    let primary = parts.first().copied()?.trim();
    if primary.is_empty() {
        None
    } else {
        Some(expand_env_vars(primary))
    }
}

fn is_executable_candidate(path: &str) -> bool {
    let candidate = Path::new(path);
    match candidate
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|s| s.to_ascii_lowercase())
    {
        Some(ext) if ext == "exe" || ext == "lnk" || ext == "bat" || ext == "cmd" => true,
        _ => false,
    }
}

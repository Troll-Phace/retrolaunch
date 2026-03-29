//! Auto-detection of installed emulators by scanning common install locations.

use crate::models::DetectedEmulator;
use std::path::{Path, PathBuf};

/// Definition of a known emulator for detection purposes.
struct KnownEmulator {
    name: &'static str,
    search_names: &'static [&'static str],
    system_ids: &'static [&'static str],
    default_args: &'static str,
}

/// Registry of emulators that auto-detection knows how to find.
const KNOWN_EMULATORS: &[KnownEmulator] = &[
    // NES
    KnownEmulator {
        name: "Mesen",
        search_names: &["Mesen", "Mesen.app", "Mesen.exe"],
        system_ids: &["nes"],
        default_args: "\"{rom}\"",
    },
    KnownEmulator {
        name: "FCEUX",
        search_names: &["FCEUX", "fceux", "FCEUX.app", "fceux.exe"],
        system_ids: &["nes"],
        default_args: "\"{rom}\"",
    },
    KnownEmulator {
        name: "Nestopia",
        search_names: &[
            "Nestopia",
            "nestopia",
            "Nestopia.app",
            "Nestopia UE.app",
            "nestopia.exe",
        ],
        system_ids: &["nes"],
        default_args: "\"{rom}\"",
    },
    // SNES
    KnownEmulator {
        name: "bsnes",
        search_names: &["bsnes", "bsnes.app", "bsnes.exe"],
        system_ids: &["snes"],
        default_args: "\"{rom}\"",
    },
    KnownEmulator {
        name: "Snes9x",
        search_names: &[
            "Snes9x",
            "snes9x",
            "Snes9x.app",
            "snes9x.exe",
            "snes9x-x64.exe",
        ],
        system_ids: &["snes"],
        default_args: "\"{rom}\"",
    },
    // Genesis / Mega Drive
    KnownEmulator {
        name: "BlastEm",
        search_names: &["blastem", "BlastEm.app", "blastem.exe"],
        system_ids: &["genesis"],
        default_args: "\"{rom}\"",
    },
    KnownEmulator {
        name: "Kega Fusion",
        search_names: &[
            "Kega Fusion",
            "Kega Fusion.app",
            "Fusion.exe",
            "Kega Fusion.exe",
        ],
        system_ids: &["genesis"],
        default_args: "\"{rom}\"",
    },
    // N64
    KnownEmulator {
        name: "simple64",
        search_names: &[
            "simple64",
            "simple64-gui",
            "simple64.app",
            "simple64-gui.exe",
        ],
        system_ids: &["n64"],
        default_args: "\"{rom}\"",
    },
    KnownEmulator {
        name: "Project64",
        search_names: &["Project64", "Project64.app", "Project64.exe"],
        system_ids: &["n64"],
        default_args: "\"{rom}\"",
    },
    KnownEmulator {
        name: "mupen64plus",
        search_names: &[
            "mupen64plus",
            "mupen64plus-gui",
            "mupen64plus.exe",
        ],
        system_ids: &["n64"],
        default_args: "--fullscreen \"{rom}\"",
    },
    // GB / GBC / GBA
    KnownEmulator {
        name: "mGBA",
        search_names: &["mGBA", "mgba", "mGBA.app", "mGBA.exe"],
        system_ids: &["gb", "gbc", "gba"],
        default_args: "\"{rom}\"",
    },
    KnownEmulator {
        name: "VBA-M",
        search_names: &[
            "VBA-M",
            "visualboyadvance-m",
            "VBA-M.app",
            "visualboyadvance-m.exe",
        ],
        system_ids: &["gb", "gbc", "gba"],
        default_args: "\"{rom}\"",
    },
    // PS1
    KnownEmulator {
        name: "DuckStation",
        search_names: &[
            "DuckStation",
            "duckstation-qt",
            "DuckStation.app",
            "duckstation-qt-x64-ReleaseLTCG.exe",
            "duckstation-qt.exe",
        ],
        system_ids: &["ps1"],
        default_args: "\"{rom}\"",
    },
    // Saturn
    KnownEmulator {
        name: "Mednafen",
        search_names: &["mednafen", "Mednafen.app", "mednafen.exe"],
        system_ids: &["saturn"],
        default_args: "\"{rom}\"",
    },
    KnownEmulator {
        name: "Yabause",
        search_names: &["yabause", "Yabause.app", "yabause.exe"],
        system_ids: &["saturn"],
        default_args: "\"{rom}\"",
    },
    // Multi-system
    KnownEmulator {
        name: "RetroArch",
        search_names: &[
            "RetroArch",
            "retroarch",
            "RetroArch.app",
            "retroarch.exe",
        ],
        system_ids: &[
            "nes", "snes", "genesis", "n64", "gb", "gbc", "gba", "ps1", "saturn", "neogeo",
            "atari2600",
        ],
        default_args: "\"{rom}\"",
    },
];

/// Returns platform-specific directories to scan for emulators.
fn get_search_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    #[cfg(target_os = "macos")]
    {
        paths.push(PathBuf::from("/Applications"));
        if let Ok(home) = std::env::var("HOME") {
            paths.push(PathBuf::from(home).join("Applications"));
        }
        paths.push(PathBuf::from("/opt/homebrew/bin"));
        paths.push(PathBuf::from("/usr/local/bin"));
    }

    #[cfg(target_os = "windows")]
    {
        paths.push(PathBuf::from(r"C:\Program Files"));
        paths.push(PathBuf::from(r"C:\Program Files (x86)"));
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            paths.push(PathBuf::from(local_app_data));
        }
    }

    paths
}

/// Scans a single directory (depth 1 only) for known emulators.
fn scan_directory(dir: &Path) -> Vec<DetectedEmulator> {
    let mut found = Vec::new();

    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return found,
    };

    for entry in entries.flatten() {
        let name = entry.file_name();
        let name_str = name.to_string_lossy();

        for known in KNOWN_EMULATORS {
            if known
                .search_names
                .iter()
                .any(|sn| *sn == name_str.as_ref())
            {
                let full_path = entry.path();
                found.push(DetectedEmulator {
                    name: known.name.to_string(),
                    executable_path: full_path.to_string_lossy().to_string(),
                    system_ids: known.system_ids.iter().map(|s| s.to_string()).collect(),
                    default_args: known.default_args.to_string(),
                });
                break;
            }
        }
    }

    found
}

/// Scans common install locations for known emulators.
///
/// Returns a deduplicated list of detected emulators with suggested system
/// mappings and default launch arguments.
pub fn auto_detect_emulators() -> Vec<DetectedEmulator> {
    let search_paths = get_search_paths();
    let mut detected = Vec::new();

    for dir in &search_paths {
        detected.extend(scan_directory(dir));
    }

    // Deduplicate by executable_path.
    detected.sort_by(|a, b| a.executable_path.cmp(&b.executable_path));
    detected.dedup_by(|a, b| a.executable_path == b.executable_path);

    detected
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_search_paths_returns_non_empty() {
        let paths = get_search_paths();
        // On macOS or Windows there should be at least one search path.
        // On Linux CI this may be empty, which is acceptable.
        #[cfg(any(target_os = "macos", target_os = "windows"))]
        assert!(!paths.is_empty());
        let _ = paths; // suppress unused warning on other platforms
    }

    #[test]
    fn test_scan_nonexistent_directory() {
        let result = scan_directory(Path::new("/nonexistent/directory/12345"));
        assert!(result.is_empty());
    }

    #[test]
    fn test_auto_detect_deduplicates() {
        // auto_detect_emulators should not panic and should return a
        // deduplicated list (no two entries with the same executable_path).
        let detected = auto_detect_emulators();
        for i in 0..detected.len() {
            for j in (i + 1)..detected.len() {
                assert_ne!(
                    detected[i].executable_path, detected[j].executable_path,
                    "Duplicate executable_path found"
                );
            }
        }
    }
}

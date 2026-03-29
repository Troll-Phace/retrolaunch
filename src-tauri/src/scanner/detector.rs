//! System detection via file extension matching and ROM header sniffing.
//!
//! The detection pipeline works in two stages:
//! 1. Extension-based detection narrows candidates (fast, always available).
//! 2. Header-based detection disambiguates when multiple systems share an extension.

use crate::models::System;
use anyhow::{Context, Result};
use std::cmp::min;
use std::fs::File;
use std::io::Read;
use std::path::Path;

/// Returns all system IDs whose registered extensions include the given extension.
///
/// For unambiguous extensions (e.g. "nes", "gba"), this returns exactly one system.
/// For shared extensions like "bin", multiple system IDs are returned.
pub fn detect_system_by_extension(ext: &str, systems: &[System]) -> Vec<String> {
    let ext_lower = ext.to_lowercase();
    systems
        .iter()
        .filter(|s| s.extensions.iter().any(|e| e.to_lowercase() == ext_lower))
        .map(|s| s.id.clone())
        .collect()
}

/// Attempts to identify the system by reading the file header.
///
/// Only checks detectors for the candidate system IDs passed in.
/// Returns the first matching system ID, or None if no header matches.
pub fn detect_system_by_header(
    file_path: &Path,
    candidates: &[String],
) -> Result<Option<String>> {
    // For .cue files, trust the extension — they are text files with no binary header.
    if let Some(ext) = file_path.extension().and_then(|e| e.to_str()) {
        if ext.eq_ignore_ascii_case("cue") {
            // Return the first candidate that accepts .cue (ps1 or saturn).
            for c in candidates {
                if c == "ps1" || c == "saturn" {
                    return Ok(Some(c.clone()));
                }
            }
            return Ok(candidates.first().cloned());
        }
    }

    let mut file = File::open(file_path)
        .with_context(|| format!("Failed to open file for header detection: {:?}", file_path))?;

    let mut buf = vec![0u8; 0x10000]; // 64 KiB
    let bytes_read = file
        .read(&mut buf)
        .with_context(|| format!("Failed to read header bytes from: {:?}", file_path))?;
    let bytes = &buf[..bytes_read];

    // For .iso files, try saturn first then ps1 fallback.
    if let Some(ext) = file_path.extension().and_then(|e| e.to_str()) {
        if ext.eq_ignore_ascii_case("iso") {
            if candidates.contains(&"saturn".to_string()) && detect_saturn(bytes) {
                return Ok(Some("saturn".to_string()));
            }
            if candidates.contains(&"ps1".to_string()) {
                return Ok(Some("ps1".to_string()));
            }
        }
    }

    // Ambiguous .bin cascade order: genesis -> saturn -> ps1 -> atari2600
    let ordered_candidates = order_candidates(candidates);

    for system_id in &ordered_candidates {
        let matched = match system_id.as_str() {
            "nes" => detect_nes(bytes),
            "snes" => detect_snes(bytes),
            "genesis" => detect_genesis(bytes),
            "n64" => detect_n64(bytes),
            "gb" => detect_gb(bytes) && !detect_gbc(bytes),
            "gbc" => detect_gbc(bytes),
            "gba" => detect_gba(bytes),
            "saturn" => detect_saturn(bytes),
            "ps1" => detect_ps1(bytes),
            // Systems with no header check (e.g. atari2600, neogeo) cannot be
            // positively identified by header, but serve as fallbacks.
            _ => false,
        };

        if matched {
            return Ok(Some(system_id.clone()));
        }
    }

    // If no header matched but atari2600 is a candidate, use it as fallback
    // (Atari 2600 ROMs have no identifiable header).
    if ordered_candidates.contains(&"atari2600".to_string()) {
        return Ok(Some("atari2600".to_string()));
    }

    Ok(None)
}

/// Orders candidate system IDs for the .bin disambiguation cascade.
/// Priority: genesis -> saturn -> ps1 -> atari2600, then everything else.
fn order_candidates(candidates: &[String]) -> Vec<String> {
    let priority_order = ["genesis", "saturn", "ps1", "atari2600"];
    let mut ordered = Vec::with_capacity(candidates.len());

    for &p in &priority_order {
        if candidates.iter().any(|c| c == p) {
            ordered.push(p.to_string());
        }
    }

    for c in candidates {
        if !priority_order.contains(&c.as_str()) {
            ordered.push(c.clone());
        }
    }

    ordered
}

// ---------------------------------------------------------------------------
// Private header detection helpers
// ---------------------------------------------------------------------------

/// NES: iNES magic bytes "NES\x1A" at offset 0.
fn detect_nes(bytes: &[u8]) -> bool {
    bytes.len() >= 4 && bytes[0..4] == [0x4E, 0x45, 0x53, 0x1A]
}

/// SNES: Valid ASCII title at LoROM (0x7FC0) or HiROM (0xFFC0) with valid checksum complement.
fn detect_snes(bytes: &[u8]) -> bool {
    detect_snes_at_offset(bytes, 0x7FC0) || detect_snes_at_offset(bytes, 0xFFC0)
}

/// Check SNES header at a specific offset.
fn detect_snes_at_offset(bytes: &[u8], offset: usize) -> bool {
    // Need at least offset + 32 bytes for the header fields.
    if bytes.len() < offset + 32 {
        return false;
    }

    // Check 21-byte title field for valid ASCII (0x20..=0x7E).
    let title = &bytes[offset..offset + 21];
    let valid_ascii_count = title.iter().filter(|&&b| (0x20..=0x7E).contains(&b)).count();
    if valid_ascii_count < 10 {
        return false;
    }

    // Validate checksum complement: u16 LE at offset+28 XOR u16 LE at offset+30 == 0xFFFF.
    let complement = u16::from_le_bytes([bytes[offset + 28], bytes[offset + 29]]);
    let checksum = u16::from_le_bytes([bytes[offset + 30], bytes[offset + 31]]);
    complement ^ checksum == 0xFFFF
}

/// Genesis/Mega Drive: "SEGA" at offset 0x100.
fn detect_genesis(bytes: &[u8]) -> bool {
    bytes.len() > 0x104 && bytes[0x100..0x104] == *b"SEGA"
}

/// GBA: Nintendo logo fragment at 0x04..0x08.
fn detect_gba(bytes: &[u8]) -> bool {
    bytes.len() >= 0xC0
        && bytes[0x04..0x08] == [0x24, 0xFF, 0xAE, 0x51]
}

/// Game Boy: 48-byte Nintendo logo at 0x0104..0x0134.
fn detect_gb(bytes: &[u8]) -> bool {
    const NINTENDO_LOGO: [u8; 48] = [
        0xCE, 0xED, 0x66, 0x66, 0xCC, 0x0D, 0x00, 0x0B,
        0x03, 0x73, 0x00, 0x83, 0x00, 0x0C, 0x00, 0x0D,
        0x00, 0x08, 0x11, 0x1F, 0x88, 0x89, 0x00, 0x0E,
        0xDC, 0xCC, 0x6E, 0xE6, 0xDD, 0xDD, 0xD9, 0x99,
        0xBB, 0xBB, 0x67, 0x63, 0x6E, 0x0E, 0xEC, 0xCC,
        0xDD, 0xDC, 0x99, 0x9F, 0xBB, 0xB9, 0x33, 0x3E,
    ];

    bytes.len() >= 0x0134 && bytes[0x0104..0x0134] == NINTENDO_LOGO
}

/// Game Boy Color: Same logo as GB, plus CGB flag at 0x0143 is 0x80 or 0xC0.
fn detect_gbc(bytes: &[u8]) -> bool {
    bytes.len() > 0x0143
        && detect_gb(bytes)
        && (bytes[0x0143] == 0x80 || bytes[0x0143] == 0xC0)
}

/// N64: First 4 bytes identify the ROM endianness format.
fn detect_n64(bytes: &[u8]) -> bool {
    if bytes.len() < 4 {
        return false;
    }
    let header = &bytes[0..4];
    // Big-endian (.z64)
    header == [0x80, 0x37, 0x12, 0x40]
    // Byte-swapped (.v64)
    || header == [0x37, 0x80, 0x40, 0x12]
    // Little-endian (.n64)
    || header == [0x40, 0x12, 0x37, 0x80]
}

/// Sega Saturn: "SEGA SEGASATURN" appears in the first 32 bytes.
fn detect_saturn(bytes: &[u8]) -> bool {
    bytes.len() >= 15
        && bytes[..min(32, bytes.len())]
            .windows(15)
            .any(|w| w == b"SEGA SEGASATURN")
}

/// PlayStation: "PlayStation" or "PS-X EXE" appears in the first 4096 bytes.
fn detect_ps1(bytes: &[u8]) -> bool {
    let search_len = min(4096, bytes.len());
    let region = &bytes[..search_len];

    region.windows(11).any(|w| w == b"PlayStation")
        || region.windows(8).any(|w| w == b"PS-X EXE")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_system(id: &str, extensions: &[&str]) -> System {
        System {
            id: id.to_string(),
            name: id.to_string(),
            manufacturer: String::new(),
            short_name: id.to_string(),
            generation: None,
            extensions: extensions.iter().map(|e| e.to_string()).collect(),
            header_offset: -1,
            header_magic: None,
            theme_color: None,
        }
    }

    #[test]
    fn test_detect_system_by_extension_unambiguous() {
        let systems = vec![
            make_system("nes", &["nes", "unf", "unif"]),
            make_system("gba", &["gba", "agb"]),
        ];
        let result = detect_system_by_extension("nes", &systems);
        assert_eq!(result, vec!["nes"]);
    }

    #[test]
    fn test_detect_system_by_extension_ambiguous_bin() {
        let systems = vec![
            make_system("genesis", &["md", "gen", "bin", "smd"]),
            make_system("ps1", &["bin", "cue", "chd", "iso", "pbp"]),
            make_system("saturn", &["iso", "bin", "cue"]),
            make_system("atari2600", &["a26", "bin"]),
        ];
        let result = detect_system_by_extension("bin", &systems);
        assert_eq!(result.len(), 4);
        assert!(result.contains(&"genesis".to_string()));
        assert!(result.contains(&"ps1".to_string()));
        assert!(result.contains(&"saturn".to_string()));
        assert!(result.contains(&"atari2600".to_string()));
    }

    #[test]
    fn test_detect_system_by_extension_case_insensitive() {
        let systems = vec![make_system("gba", &["gba", "agb"])];
        assert_eq!(detect_system_by_extension("GBA", &systems), vec!["gba"]);
    }

    #[test]
    fn test_detect_nes_header() {
        let mut bytes = vec![0u8; 16];
        bytes[0..4].copy_from_slice(&[0x4E, 0x45, 0x53, 0x1A]);
        assert!(detect_nes(&bytes));
    }

    #[test]
    fn test_detect_nes_header_invalid() {
        let bytes = vec![0u8; 16];
        assert!(!detect_nes(&bytes));
    }

    #[test]
    fn test_detect_genesis_header() {
        let mut bytes = vec![0u8; 0x200];
        bytes[0x100..0x104].copy_from_slice(b"SEGA");
        assert!(detect_genesis(&bytes));
    }

    #[test]
    fn test_detect_n64_big_endian() {
        let mut bytes = vec![0u8; 64];
        bytes[0..4].copy_from_slice(&[0x80, 0x37, 0x12, 0x40]);
        assert!(detect_n64(&bytes));
    }

    #[test]
    fn test_detect_n64_byte_swapped() {
        let mut bytes = vec![0u8; 64];
        bytes[0..4].copy_from_slice(&[0x37, 0x80, 0x40, 0x12]);
        assert!(detect_n64(&bytes));
    }

    #[test]
    fn test_detect_n64_little_endian() {
        let mut bytes = vec![0u8; 64];
        bytes[0..4].copy_from_slice(&[0x40, 0x12, 0x37, 0x80]);
        assert!(detect_n64(&bytes));
    }

    #[test]
    fn test_detect_gba_header() {
        let mut bytes = vec![0u8; 0xC0];
        bytes[0x04..0x08].copy_from_slice(&[0x24, 0xFF, 0xAE, 0x51]);
        assert!(detect_gba(&bytes));
    }

    #[test]
    fn test_detect_gba_too_small() {
        let mut bytes = vec![0u8; 0x08];
        bytes[0x04..0x08].copy_from_slice(&[0x24, 0xFF, 0xAE, 0x51]);
        assert!(!detect_gba(&bytes));
    }

    #[test]
    fn test_detect_gb_header() {
        let mut bytes = vec![0u8; 0x0150];
        let logo: [u8; 48] = [
            0xCE, 0xED, 0x66, 0x66, 0xCC, 0x0D, 0x00, 0x0B,
            0x03, 0x73, 0x00, 0x83, 0x00, 0x0C, 0x00, 0x0D,
            0x00, 0x08, 0x11, 0x1F, 0x88, 0x89, 0x00, 0x0E,
            0xDC, 0xCC, 0x6E, 0xE6, 0xDD, 0xDD, 0xD9, 0x99,
            0xBB, 0xBB, 0x67, 0x63, 0x6E, 0x0E, 0xEC, 0xCC,
            0xDD, 0xDC, 0x99, 0x9F, 0xBB, 0xB9, 0x33, 0x3E,
        ];
        bytes[0x0104..0x0134].copy_from_slice(&logo);
        // Not GBC (flag byte is 0x00)
        assert!(detect_gb(&bytes));
        assert!(!detect_gbc(&bytes));
    }

    #[test]
    fn test_detect_gbc_header() {
        let mut bytes = vec![0u8; 0x0150];
        let logo: [u8; 48] = [
            0xCE, 0xED, 0x66, 0x66, 0xCC, 0x0D, 0x00, 0x0B,
            0x03, 0x73, 0x00, 0x83, 0x00, 0x0C, 0x00, 0x0D,
            0x00, 0x08, 0x11, 0x1F, 0x88, 0x89, 0x00, 0x0E,
            0xDC, 0xCC, 0x6E, 0xE6, 0xDD, 0xDD, 0xD9, 0x99,
            0xBB, 0xBB, 0x67, 0x63, 0x6E, 0x0E, 0xEC, 0xCC,
            0xDD, 0xDC, 0x99, 0x9F, 0xBB, 0xB9, 0x33, 0x3E,
        ];
        bytes[0x0104..0x0134].copy_from_slice(&logo);
        bytes[0x0143] = 0x80; // CGB flag
        assert!(detect_gbc(&bytes));
    }

    #[test]
    fn test_detect_saturn_header() {
        let mut bytes = vec![0u8; 32];
        bytes[0..15].copy_from_slice(b"SEGA SEGASATURN");
        assert!(detect_saturn(&bytes));
    }

    #[test]
    fn test_detect_ps1_playstation_string() {
        let mut bytes = vec![0u8; 4096];
        bytes[100..111].copy_from_slice(b"PlayStation");
        assert!(detect_ps1(&bytes));
    }

    #[test]
    fn test_detect_ps1_psx_exe_string() {
        let mut bytes = vec![0u8; 4096];
        bytes[0..8].copy_from_slice(b"PS-X EXE");
        assert!(detect_ps1(&bytes));
    }

    #[test]
    fn test_detect_snes_lorom() {
        let mut bytes = vec![0u8; 0x8000];
        // Write a valid-looking title at 0x7FC0
        let title = b"SUPER MARIO WORLD    ";
        bytes[0x7FC0..0x7FC0 + 21].copy_from_slice(title);
        // Set checksum complement pair that XOR to 0xFFFF
        let complement: u16 = 0x1234;
        let checksum: u16 = complement ^ 0xFFFF;
        bytes[0x7FC0 + 28] = (complement & 0xFF) as u8;
        bytes[0x7FC0 + 29] = (complement >> 8) as u8;
        bytes[0x7FC0 + 30] = (checksum & 0xFF) as u8;
        bytes[0x7FC0 + 31] = (checksum >> 8) as u8;
        assert!(detect_snes(&bytes));
    }

    #[test]
    fn test_order_candidates_bin() {
        let candidates = vec![
            "atari2600".to_string(),
            "ps1".to_string(),
            "genesis".to_string(),
            "saturn".to_string(),
        ];
        let ordered = order_candidates(&candidates);
        assert_eq!(ordered[0], "genesis");
        assert_eq!(ordered[1], "saturn");
        assert_eq!(ordered[2], "ps1");
        assert_eq!(ordered[3], "atari2600");
    }
}

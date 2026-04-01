//! System detection via file extension matching and ROM header sniffing.
//!
//! The detection pipeline works in two stages:
//! 1. Extension-based detection narrows candidates (fast, always available).
//! 2. Header-based detection disambiguates when multiple systems share an extension.

use crate::models::System;
use anyhow::{Context, Result};
use std::cmp::min;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
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

    // For .ciso files (Compact ISO), verify CISO magic and prefer gamecube > ps2.
    if let Some(ext) = file_path.extension().and_then(|e| e.to_str()) {
        if ext.eq_ignore_ascii_case("ciso") {
            // Verify CISO magic at offset 0.
            if bytes.len() >= 4 && &bytes[0..4] == b"CISO" {
                // GameCube is the most common CISO user, prefer it over PS2.
                for preferred in &["gamecube", "ps2"] {
                    if candidates.contains(&preferred.to_string()) {
                        return Ok(Some(preferred.to_string()));
                    }
                }
            }
            // No CISO magic or no known candidate — return first candidate as fallback.
            return Ok(candidates.first().cloned());
        }
    }

    // For .iso files, disambiguate using header detection (most specific first).
    if let Some(ext) = file_path.extension().and_then(|e| e.to_str()) {
        if ext.eq_ignore_ascii_case("iso") {
            if candidates.contains(&"saturn".to_string()) && detect_saturn(bytes) {
                return Ok(Some("saturn".to_string()));
            }
            if candidates.contains(&"gamecube".to_string()) && detect_gamecube(bytes) {
                return Ok(Some("gamecube".to_string()));
            }
            // Use ISO 9660 parsing for PlayStation disc identification.
            // This correctly distinguishes PS1 vs PS2 by reading SYSTEM.CNF.
            let has_ps_candidate = candidates.contains(&"ps2".to_string())
                || candidates.contains(&"ps1".to_string());
            if has_ps_candidate {
                if let Ok(Some(system_id)) = detect_playstation_iso(file_path) {
                    if candidates.contains(&system_id) {
                        return Ok(Some(system_id));
                    }
                }
            }
            // Fall back to byte-buffer detection for non-standard ISOs.
            if candidates.contains(&"ps2".to_string()) && detect_ps2(bytes) {
                return Ok(Some("ps2".to_string()));
            }
            if candidates.contains(&"ps1".to_string()) && detect_ps1(bytes) {
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
            "ps2" => detect_ps2(bytes),
            "gamecube" => detect_gamecube(bytes),
            "nds" => detect_nds(bytes),
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
/// Priority: genesis -> saturn -> ps2 -> ps1 -> atari2600, then everything else.
fn order_candidates(candidates: &[String]) -> Vec<String> {
    let priority_order = ["genesis", "saturn", "ps2", "ps1", "atari2600"];
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

/// ISO 9660 sector size in bytes.
const ISO_SECTOR_SIZE: u64 = 2048;

/// Detects whether an ISO file is a PS1 or PS2 disc by parsing the ISO 9660 filesystem.
///
/// Reads the Primary Volume Descriptor at sector 16, verifies the "PLAYSTATION" system
/// identifier, locates SYSTEM.CNF in the root directory, and checks its contents for
/// "BOOT2" (PS2) or "BOOT" (PS1).
///
/// Returns `Some("ps2")` or `Some("ps1")` on success, `None` if not a PlayStation ISO.
fn detect_playstation_iso(file_path: &Path) -> Result<Option<String>> {
    let mut file = File::open(file_path)
        .with_context(|| format!("Failed to open ISO for PlayStation detection: {:?}", file_path))?;

    // Read the Primary Volume Descriptor at sector 16 (offset 0x8000).
    let pvd_offset = 16 * ISO_SECTOR_SIZE;
    file.seek(SeekFrom::Start(pvd_offset))
        .with_context(|| "Failed to seek to PVD")?;

    let mut pvd = vec![0u8; ISO_SECTOR_SIZE as usize];
    file.read_exact(&mut pvd)
        .with_context(|| "Failed to read PVD sector")?;

    // Verify ISO 9660 signature "CD001" at PVD offset 1.
    if pvd.len() < 882 || &pvd[1..6] != b"CD001" {
        return Ok(None);
    }

    // Check system identifier at PVD offset 8 (32 bytes, padded with spaces).
    let system_id = &pvd[8..40];
    let system_id_str = std::str::from_utf8(system_id).unwrap_or("");
    if !system_id_str.contains("PLAYSTATION") {
        return Ok(None);
    }

    // Parse the root directory record at PVD offset 156 (34 bytes).
    // The LBA of the root directory extent is at bytes 2-5 (little-endian u32).
    let root_dir_record = &pvd[156..190];
    let root_dir_lba = u32::from_le_bytes([
        root_dir_record[2],
        root_dir_record[3],
        root_dir_record[4],
        root_dir_record[5],
    ]);
    let root_dir_size = u32::from_le_bytes([
        root_dir_record[10],
        root_dir_record[11],
        root_dir_record[12],
        root_dir_record[13],
    ]);

    if root_dir_lba == 0 || root_dir_size == 0 {
        return Ok(None);
    }

    // Read the root directory (cap at 8 KiB to avoid reading too much).
    let read_size = min(root_dir_size as usize, 8192);
    let root_dir_offset = root_dir_lba as u64 * ISO_SECTOR_SIZE;
    file.seek(SeekFrom::Start(root_dir_offset))
        .with_context(|| "Failed to seek to root directory")?;

    let mut root_dir = vec![0u8; read_size];
    file.read_exact(&mut root_dir)
        .with_context(|| "Failed to read root directory")?;

    // Scan directory entries for SYSTEM.CNF.
    // ISO 9660 directory entry format:
    //   byte 0: entry length (0 = end of entries in this sector)
    //   bytes 2-5: LBA of data extent (LE u32)
    //   bytes 10-13: data length (LE u32)
    //   byte 32: filename length
    //   bytes 33+: filename (with ";1" version suffix)
    let mut pos = 0;
    let target_names = [b"SYSTEM.CNF;1" as &[u8], b"SYSTEM.CNF" as &[u8]];

    while pos < root_dir.len() {
        let entry_len = root_dir[pos] as usize;
        if entry_len == 0 {
            // Skip to next sector boundary within the directory.
            let next_sector = ((pos / ISO_SECTOR_SIZE as usize) + 1) * ISO_SECTOR_SIZE as usize;
            if next_sector >= root_dir.len() {
                break;
            }
            pos = next_sector;
            continue;
        }
        if pos + entry_len > root_dir.len() || entry_len < 34 {
            break;
        }

        let filename_len = root_dir[pos + 32] as usize;
        if filename_len > 0 && pos + 33 + filename_len <= root_dir.len() {
            let filename = &root_dir[pos + 33..pos + 33 + filename_len];
            let filename_upper: Vec<u8> = filename.iter().map(|b| b.to_ascii_uppercase()).collect();

            let is_system_cnf = target_names
                .iter()
                .any(|target| filename_upper == target.to_ascii_uppercase());

            if is_system_cnf {
                let file_lba = u32::from_le_bytes([
                    root_dir[pos + 2],
                    root_dir[pos + 3],
                    root_dir[pos + 4],
                    root_dir[pos + 5],
                ]);
                let file_size = u32::from_le_bytes([
                    root_dir[pos + 10],
                    root_dir[pos + 11],
                    root_dir[pos + 12],
                    root_dir[pos + 13],
                ]);

                if file_lba == 0 {
                    break;
                }

                // Read SYSTEM.CNF content (cap at 512 bytes).
                let cnf_read_size = min(file_size as usize, 512);
                let cnf_offset = file_lba as u64 * ISO_SECTOR_SIZE;
                file.seek(SeekFrom::Start(cnf_offset))
                    .with_context(|| "Failed to seek to SYSTEM.CNF")?;

                let mut cnf_buf = vec![0u8; cnf_read_size];
                file.read_exact(&mut cnf_buf)
                    .with_context(|| "Failed to read SYSTEM.CNF")?;

                let cnf_content = String::from_utf8_lossy(&cnf_buf);

                // BOOT2 indicates PS2; plain BOOT (without "2") indicates PS1.
                if cnf_content.contains("BOOT2") {
                    return Ok(Some("ps2".to_string()));
                } else if cnf_content.contains("BOOT") {
                    return Ok(Some("ps1".to_string()));
                }

                // Found SYSTEM.CNF but no BOOT marker — not a PlayStation disc.
                return Ok(None);
            }
        }

        pos += entry_len;
    }

    // No SYSTEM.CNF found — not a standard PlayStation ISO.
    Ok(None)
}

/// PlayStation: "PlayStation" or "PS-X EXE" appears in the first 4096 bytes.
fn detect_ps1(bytes: &[u8]) -> bool {
    let search_len = min(4096, bytes.len());
    let region = &bytes[..search_len];

    region.windows(11).any(|w| w == b"PlayStation")
        || region.windows(8).any(|w| w == b"PS-X EXE")
}

/// PlayStation 2: "PlayStation 2" or "BOOT2" appears in the header.
fn detect_ps2(bytes: &[u8]) -> bool {
    bytes.windows(13).any(|w| w == b"PlayStation 2")
        || bytes.windows(5).any(|w| w == b"BOOT2")
}

/// GameCube: Disc magic 0xC2339F3D at offset 0x1C.
fn detect_gamecube(bytes: &[u8]) -> bool {
    bytes.len() >= 0x20
        && bytes[0x1C..0x20] == [0xC2, 0x33, 0x9F, 0x3D]
}

/// Nintendo DS: Nintendo logo CRC16 at offset 0x15C should be 0xCF56.
fn detect_nds(bytes: &[u8]) -> bool {
    if bytes.len() < 0x15E {
        return false;
    }
    // Primary: known logo CRC16 value
    let logo_crc = u16::from_le_bytes([bytes[0x15C], bytes[0x15D]]);
    if logo_crc == 0xCF56 {
        return true;
    }
    // Fallback: valid ASCII game title at 0x00-0x0B + reasonable ROM size at 0x80
    if bytes.len() >= 0x84 {
        let title = &bytes[0..12];
        let valid_count = title.iter().filter(|&&b| b == 0 || (0x20..=0x7E).contains(&b)).count();
        if valid_count == 12 {
            let rom_size = u32::from_le_bytes([bytes[0x80], bytes[0x81], bytes[0x82], bytes[0x83]]);
            return rom_size > 0 && rom_size < 0x20000000;
        }
    }
    false
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

    #[test]
    fn test_detect_ps2_playstation2_string() {
        let mut bytes = vec![0u8; 0x8100];
        bytes[0x8000..0x800D].copy_from_slice(b"PlayStation 2");
        assert!(detect_ps2(&bytes));
    }

    #[test]
    fn test_detect_ps2_boot2_string() {
        let mut bytes = vec![0u8; 4096];
        bytes[100..105].copy_from_slice(b"BOOT2");
        assert!(detect_ps2(&bytes));
    }

    #[test]
    fn test_detect_ps2_not_ps1() {
        // PS2 disc should NOT match PS1 detector (PS1 looks for "PlayStation" not followed by " 2")
        let mut bytes = vec![0u8; 0x8100];
        bytes[0x8000..0x800D].copy_from_slice(b"PlayStation 2");
        assert!(detect_ps2(&bytes));
        // PS1 detector WILL also match since "PlayStation 2" contains "PlayStation"
        // That's OK — the cascade order (ps2 before ps1) handles disambiguation
    }

    #[test]
    fn test_detect_gamecube_header() {
        let mut bytes = vec![0u8; 0x100];
        bytes[0x1C..0x20].copy_from_slice(&[0xC2, 0x33, 0x9F, 0x3D]);
        assert!(detect_gamecube(&bytes));
    }

    #[test]
    fn test_detect_gamecube_no_match() {
        let bytes = vec![0u8; 0x100];
        assert!(!detect_gamecube(&bytes));
    }

    #[test]
    fn test_detect_nds_logo_crc() {
        let mut bytes = vec![0u8; 0x200];
        // Set Nintendo logo CRC16 at 0x15C (little-endian 0xCF56)
        bytes[0x15C] = 0x56;
        bytes[0x15D] = 0xCF;
        assert!(detect_nds(&bytes));
    }

    #[test]
    fn test_detect_nds_no_match() {
        let bytes = vec![0u8; 0x200];
        assert!(!detect_nds(&bytes));
    }

    #[test]
    fn test_detect_system_by_extension_ambiguous_bin_with_ps2() {
        let systems = vec![
            make_system("genesis", &["md", "gen", "bin", "smd"]),
            make_system("ps1", &["bin", "cue", "chd", "iso", "pbp"]),
            make_system("ps2", &["iso", "bin", "chd", "cso"]),
            make_system("saturn", &["iso", "bin", "cue"]),
            make_system("atari2600", &["a26", "bin"]),
        ];
        let result = detect_system_by_extension("bin", &systems);
        assert_eq!(result.len(), 5);
        assert!(result.contains(&"ps2".to_string()));
    }

    #[test]
    fn test_order_candidates_with_ps2() {
        let candidates = vec![
            "atari2600".to_string(),
            "ps1".to_string(),
            "ps2".to_string(),
            "genesis".to_string(),
            "saturn".to_string(),
        ];
        let ordered = order_candidates(&candidates);
        assert_eq!(ordered[0], "genesis");
        assert_eq!(ordered[1], "saturn");
        assert_eq!(ordered[2], "ps2");
        assert_eq!(ordered[3], "ps1");
        assert_eq!(ordered[4], "atari2600");
    }

    /// Helper to create a minimal PS2 ISO image in a temp file for testing.
    /// Builds an ISO 9660 structure with PVD, root directory, and SYSTEM.CNF.
    fn create_fake_playstation_iso(boot_content: &str) -> std::path::PathBuf {
        use std::io::Write;

        let dir = std::env::temp_dir().join("retrolaunch_test_iso");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!(
            "test_{}.iso",
            boot_content.replace(' ', "_").replace('=', "")
        ));

        // Sector layout:
        //   Sector 0-15: system area (zeroes)
        //   Sector 16: Primary Volume Descriptor
        //   Sector 17: root directory
        //   Sector 18: SYSTEM.CNF data
        let total_sectors = 20;
        let mut iso = vec![0u8; total_sectors * 2048];

        // --- PVD at sector 16 (offset 0x8000) ---
        let pvd = &mut iso[0x8000..0x8800];
        pvd[0] = 1; // Volume Descriptor Type: Primary
        pvd[1..6].copy_from_slice(b"CD001"); // Standard Identifier
        pvd[6] = 1; // Version
        // System Identifier at offset 8 (32 bytes, space-padded)
        let sys_id = b"PLAYSTATION                     ";
        pvd[8..40].copy_from_slice(sys_id);

        // Root directory record at PVD offset 156 (34 bytes)
        let root_rec = &mut pvd[156..190];
        root_rec[0] = 34; // Directory entry length
        // LBA of root directory extent at bytes 2-5 (LE) = sector 17
        root_rec[2..6].copy_from_slice(&17u32.to_le_bytes());
        // Also store as big-endian at bytes 6-9 (ISO 9660 both-endian)
        root_rec[6..10].copy_from_slice(&17u32.to_be_bytes());
        // Data length at bytes 10-13 (LE) = 2048 (one sector)
        root_rec[10..14].copy_from_slice(&2048u32.to_le_bytes());
        root_rec[14..18].copy_from_slice(&2048u32.to_be_bytes());

        // --- Root directory at sector 17 (offset 0x8800) ---
        let root_dir = &mut iso[0x8800..0x9000];

        // First entry: "." (self)
        root_dir[0] = 34; // entry length
        root_dir[2..6].copy_from_slice(&17u32.to_le_bytes());
        root_dir[10..14].copy_from_slice(&2048u32.to_le_bytes());
        root_dir[32] = 1; // filename length
        root_dir[33] = 0; // filename = 0x00 (self)

        // Second entry: ".." (parent)
        let entry2 = &mut root_dir[34..68];
        entry2[0] = 34;
        entry2[2..6].copy_from_slice(&17u32.to_le_bytes());
        entry2[10..14].copy_from_slice(&2048u32.to_le_bytes());
        entry2[32] = 1;
        entry2[33] = 1; // filename = 0x01 (parent)

        // Third entry: SYSTEM.CNF
        let cnf_name = b"SYSTEM.CNF;1";
        let cnf_entry_len: u8 = 33 + cnf_name.len() as u8;
        // Pad to even length
        let cnf_entry_len = if cnf_entry_len % 2 != 0 {
            cnf_entry_len + 1
        } else {
            cnf_entry_len
        };
        let entry3 = &mut root_dir[68..68 + cnf_entry_len as usize];
        entry3[0] = cnf_entry_len;
        // LBA = sector 18
        entry3[2..6].copy_from_slice(&18u32.to_le_bytes());
        // Data length = boot_content length
        entry3[10..14].copy_from_slice(&(boot_content.len() as u32).to_le_bytes());
        entry3[32] = cnf_name.len() as u8;
        entry3[33..33 + cnf_name.len()].copy_from_slice(cnf_name);

        // --- SYSTEM.CNF data at sector 18 (offset 0x9000) ---
        let cnf_data = &mut iso[0x9000..0x9000 + boot_content.len()];
        cnf_data.copy_from_slice(boot_content.as_bytes());

        let mut file = File::create(&path).unwrap();
        file.write_all(&iso).unwrap();
        path
    }

    #[test]
    fn test_detect_playstation_iso_ps2() {
        let iso_path =
            create_fake_playstation_iso("BOOT2 = cdrom0:\\SLUS_200.62;1");
        let result = detect_playstation_iso(&iso_path).unwrap();
        assert_eq!(result, Some("ps2".to_string()));
        let _ = std::fs::remove_file(&iso_path);
    }

    #[test]
    fn test_detect_playstation_iso_ps1() {
        let iso_path =
            create_fake_playstation_iso("BOOT = cdrom:\\SLUS_005.94;1");
        let result = detect_playstation_iso(&iso_path).unwrap();
        assert_eq!(result, Some("ps1".to_string()));
        let _ = std::fs::remove_file(&iso_path);
    }

    #[test]
    fn test_detect_system_by_extension_ciso_ambiguous() {
        let systems = vec![
            make_system("gamecube", &["iso", "gcm", "ciso"]),
            make_system("ps2", &["iso", "bin", "chd", "cso", "ciso"]),
        ];
        let result = detect_system_by_extension("ciso", &systems);
        assert_eq!(result.len(), 2);
        assert!(result.contains(&"gamecube".to_string()));
        assert!(result.contains(&"ps2".to_string()));
    }

    #[test]
    fn test_detect_ciso_prefers_gamecube() {
        // Create a temp file with CISO magic.
        let dir = std::env::temp_dir().join("retrolaunch_test_ciso");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("test_gc.ciso");
        let mut data = vec![0u8; 256];
        data[0..4].copy_from_slice(b"CISO");
        std::fs::write(&path, &data).unwrap();

        let candidates = vec!["gamecube".to_string(), "ps2".to_string()];
        let result = detect_system_by_header(&path, &candidates).unwrap();
        assert_eq!(result, Some("gamecube".to_string()));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn test_detect_ciso_falls_back_to_ps2() {
        // Create a temp file with CISO magic but no gamecube candidate.
        let dir = std::env::temp_dir().join("retrolaunch_test_ciso");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("test_ps2.ciso");
        let mut data = vec![0u8; 256];
        data[0..4].copy_from_slice(b"CISO");
        std::fs::write(&path, &data).unwrap();

        let candidates = vec!["ps2".to_string()];
        let result = detect_system_by_header(&path, &candidates).unwrap();
        assert_eq!(result, Some("ps2".to_string()));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn test_detect_ciso_no_magic_returns_first_candidate() {
        // Create a temp file WITHOUT CISO magic but with .ciso extension.
        let dir = std::env::temp_dir().join("retrolaunch_test_ciso");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("test_nomagic.ciso");
        let data = vec![0u8; 256];
        std::fs::write(&path, &data).unwrap();

        let candidates = vec!["gamecube".to_string(), "ps2".to_string()];
        let result = detect_system_by_header(&path, &candidates).unwrap();
        // No CISO magic, so falls back to first candidate.
        assert_eq!(result, Some("gamecube".to_string()));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn test_detect_playstation_iso_not_playstation() {
        // Create a file that is not an ISO at all.
        let dir = std::env::temp_dir().join("retrolaunch_test_iso");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("not_playstation.iso");
        let data = vec![0u8; 0x9000];
        std::fs::write(&path, &data).unwrap();
        let result = detect_playstation_iso(&path).unwrap();
        assert_eq!(result, None);
        let _ = std::fs::remove_file(&path);
    }
}

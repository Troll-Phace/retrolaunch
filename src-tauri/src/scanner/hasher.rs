//! ROM file hashing with copier header stripping.
//!
//! Computes CRC32 and SHA1 hashes of ROM contents, automatically stripping
//! known copier headers (iNES for NES, SMC/SWC for SNES) so hashes match
//! No-Intro database entries.

use crate::models::RomHashes;
use anyhow::{Context, Result};
use rayon::prelude::*;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

/// Maximum file size (in bytes) for full-file hashing. Files larger than this
/// threshold (e.g. PS1/PS2/Saturn/GameCube disc images) are only partially
/// hashed using the first [`PARTIAL_HASH_SIZE`] bytes after the skip offset.
/// This prevents the scanner from appearing hung on multi-gigabyte ISOs.
const MAX_HASH_FILE_SIZE: u64 = 768 * 1024 * 1024; // 768 MiB

/// Number of bytes to read when performing a partial hash on oversized files.
const PARTIAL_HASH_SIZE: u64 = 1024 * 1024; // 1 MiB

/// Hashes a single ROM file, stripping copier headers where applicable.
///
/// The `system_id` determines which header-stripping logic to apply:
/// - **NES**: Skips the 16-byte iNES header (and 512-byte trainer if present).
/// - **SNES**: Skips a 512-byte copier header if `file_size % 1024 == 512`.
/// - **All others**: No bytes are skipped.
///
/// Returns CRC32 and SHA1 as lowercase hex strings.
pub fn hash_rom(file_path: &Path, system_id: &str) -> Result<RomHashes> {
    let mut file = File::open(file_path)
        .with_context(|| format!("Failed to open ROM for hashing: {:?}", file_path))?;

    let file_size = file
        .metadata()
        .with_context(|| format!("Failed to read metadata for: {:?}", file_path))?
        .len();

    let skip = compute_skip_offset(&mut file, system_id, file_size)?;

    file.seek(SeekFrom::Start(skip))
        .with_context(|| format!("Failed to seek past header in: {:?}", file_path))?;

    // For files exceeding the size cap (large disc images), only hash a prefix
    // to avoid blocking the scanner for minutes on multi-gigabyte ISOs.
    let bytes_to_hash = if file_size > MAX_HASH_FILE_SIZE {
        Some(PARTIAL_HASH_SIZE)
    } else {
        None
    };

    hash_reader(&mut file, file_path, bytes_to_hash)
}

/// Hashes a ROM file without any header stripping.
///
/// Used for matching against "Headered" No-Intro DATs where the CRC32
/// in the DAT was computed over the entire file including the copier header
/// (e.g. iNES 16-byte header for NES ROMs).
pub fn hash_rom_full(file_path: &Path) -> Result<RomHashes> {
    let mut file = File::open(file_path)
        .with_context(|| format!("Failed to open ROM for full hashing: {:?}", file_path))?;

    let file_size = file
        .metadata()
        .with_context(|| format!("Failed to read metadata for: {:?}", file_path))?
        .len();

    // Guard against accidentally hashing multi-gigabyte disc images.
    let bytes_to_hash = if file_size > MAX_HASH_FILE_SIZE {
        Some(PARTIAL_HASH_SIZE)
    } else {
        None
    };

    hash_reader(&mut file, file_path, bytes_to_hash)
}

/// Hashes multiple ROM files in parallel using Rayon.
///
/// Each entry in `files` is a `(PathBuf, system_id)` pair.
/// Returns a vec of `(path, result)` pairs. Errors are mapped to String
/// for convenient reporting without requiring the error type to be Send.
pub fn hash_roms_parallel(
    files: &[(PathBuf, String)],
) -> Vec<(PathBuf, Result<RomHashes, String>)> {
    files
        .par_iter()
        .map(|(path, system_id)| {
            let result = hash_rom(path, system_id).map_err(|e| format!("{:#}", e));
            (path.clone(), result)
        })
        .collect()
}

/// Reads from `file` and computes CRC32 + SHA1 hashes.
///
/// If `limit` is `Some(n)`, only the first `n` bytes from the current file
/// position are hashed (partial hash for oversized files). If `None`, the
/// entire remaining content is hashed.
fn hash_reader(file: &mut File, file_path: &Path, limit: Option<u64>) -> Result<RomHashes> {
    let mut crc = crc32fast::Hasher::new();
    let mut sha = <sha1::Sha1 as digest::Digest>::new();
    let mut buf = [0u8; 65536];
    let mut remaining = limit;

    loop {
        let max_read = match remaining {
            Some(0) => break,
            Some(r) => buf.len().min(r as usize),
            None => buf.len(),
        };

        let n = file
            .read(&mut buf[..max_read])
            .with_context(|| format!("Failed to read ROM data from: {:?}", file_path))?;
        if n == 0 {
            break;
        }
        crc.update(&buf[..n]);
        digest::Digest::update(&mut sha, &buf[..n]);

        if let Some(ref mut r) = remaining {
            *r -= n as u64;
        }
    }

    let crc32_value = crc.finalize();
    let sha1_bytes: [u8; 20] = digest::Digest::finalize(sha).into();

    Ok(RomHashes {
        crc32: format!("{:08x}", crc32_value),
        sha1: Some(hex_encode(&sha1_bytes)),
    })
}

/// Determines how many bytes to skip at the start of a ROM for hashing.
fn compute_skip_offset(file: &mut File, system_id: &str, file_size: u64) -> Result<u64> {
    match system_id {
        "nes" => {
            // Read the first 16 bytes to check for iNES header.
            let mut header = [0u8; 16];
            file.read_exact(&mut header)
                .with_context(|| "Failed to read NES header")?;
            file.seek(SeekFrom::Start(0))?;

            if header[0..4] == [0x4E, 0x45, 0x53, 0x1A] {
                let mut skip: u64 = 16;
                // Check bit 2 of flags 6 (byte 6) for trainer presence.
                if header[6] & 0x04 != 0 {
                    skip += 512;
                }
                Ok(skip)
            } else {
                Ok(0)
            }
        }
        "snes" => {
            // A 512-byte copier header is present if file_size % 1024 == 512.
            if file_size % 1024 == 512 {
                Ok(512)
            } else {
                Ok(0)
            }
        }
        _ => Ok(0),
    }
}

/// Encodes a byte slice as a lowercase hexadecimal string.
fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    /// Helper to create a temporary ROM file with given contents.
    fn create_temp_rom(prefix: &str, data: &[u8]) -> (tempfile::NamedTempFile, PathBuf) {
        let mut tmp = tempfile::Builder::new()
            .prefix(prefix)
            .suffix(".rom")
            .tempfile()
            .expect("Failed to create temp file");
        tmp.write_all(data).expect("Failed to write temp data");
        let path = tmp.path().to_path_buf();
        (tmp, path)
    }

    #[test]
    fn test_hash_rom_no_header() {
        let data = b"Hello ROM data for hashing test";
        let (_tmp, path) = create_temp_rom("test_hash_", data);
        let result = hash_rom(&path, "gba").expect("hash_rom failed");
        assert_eq!(result.crc32.len(), 8);
        assert!(result.sha1.is_some());
        assert_eq!(result.sha1.as_ref().unwrap().len(), 40);
    }

    #[test]
    fn test_hash_rom_nes_strips_header() {
        // Build a minimal iNES ROM: 16-byte header + some data.
        let mut rom = vec![0u8; 16 + 32];
        rom[0..4].copy_from_slice(&[0x4E, 0x45, 0x53, 0x1A]);
        // Fill the "ROM data" after header with known bytes.
        for i in 0..32 {
            rom[16 + i] = (i as u8) + 1;
        }
        let (_tmp, path) = create_temp_rom("nes_hash_", &rom);

        let result = hash_rom(&path, "nes").expect("hash_rom failed for NES");

        // Verify the hash matches just the data portion (bytes 1..32).
        let data_only = &rom[16..];
        let mut expected_crc = crc32fast::Hasher::new();
        expected_crc.update(data_only);
        let expected = format!("{:08x}", expected_crc.finalize());
        assert_eq!(result.crc32, expected);
    }

    #[test]
    fn test_hash_rom_nes_with_trainer() {
        // iNES header with trainer flag set (bit 2 of byte 6).
        let mut rom = vec![0u8; 16 + 512 + 32];
        rom[0..4].copy_from_slice(&[0x4E, 0x45, 0x53, 0x1A]);
        rom[6] = 0x04; // Trainer present
        for i in 0..32 {
            rom[16 + 512 + i] = (i as u8) + 0xA0;
        }
        let (_tmp, path) = create_temp_rom("nes_trainer_", &rom);

        let result = hash_rom(&path, "nes").expect("hash_rom failed for NES+trainer");

        let data_only = &rom[16 + 512..];
        let mut expected_crc = crc32fast::Hasher::new();
        expected_crc.update(data_only);
        let expected = format!("{:08x}", expected_crc.finalize());
        assert_eq!(result.crc32, expected);
    }

    #[test]
    fn test_hash_rom_snes_strips_copier_header() {
        // Create a file whose size % 1024 == 512 (copier header present).
        let mut rom = vec![0u8; 512 + 1024]; // 512 copier + 1024 data
        for i in 0..1024 {
            rom[512 + i] = (i % 256) as u8;
        }
        let (_tmp, path) = create_temp_rom("snes_hash_", &rom);

        let result = hash_rom(&path, "snes").expect("hash_rom failed for SNES");

        let data_only = &rom[512..];
        let mut expected_crc = crc32fast::Hasher::new();
        expected_crc.update(data_only);
        let expected = format!("{:08x}", expected_crc.finalize());
        assert_eq!(result.crc32, expected);
    }

    #[test]
    fn test_hash_rom_full_includes_header() {
        // Build a minimal iNES ROM: 16-byte header + data.
        let mut rom = vec![0u8; 16 + 32];
        rom[0..4].copy_from_slice(&[0x4E, 0x45, 0x53, 0x1A]);
        for i in 0..32 {
            rom[16 + i] = (i as u8) + 1;
        }
        let (_tmp, path) = create_temp_rom("full_hash_", &rom);

        let stripped = hash_rom(&path, "nes").expect("hash_rom failed");
        let full = hash_rom_full(&path).expect("hash_rom_full failed");

        // The full hash must differ from the stripped hash (header included).
        assert_ne!(stripped.crc32, full.crc32);

        // The full hash should match the CRC32 of the entire file.
        let mut expected_crc = crc32fast::Hasher::new();
        expected_crc.update(&rom);
        let expected = format!("{:08x}", expected_crc.finalize());
        assert_eq!(full.crc32, expected);
    }

    #[test]
    fn test_hash_rom_full_matches_hash_rom_for_non_headered() {
        // For a non-headered ROM (e.g. GBA), both should produce the same hash.
        let data = b"Some GBA ROM data for testing";
        let (_tmp, path) = create_temp_rom("gba_full_", data);

        let stripped = hash_rom(&path, "gba").expect("hash_rom failed");
        let full = hash_rom_full(&path).expect("hash_rom_full failed");

        assert_eq!(stripped.crc32, full.crc32);
        assert_eq!(stripped.sha1, full.sha1);
    }

    #[test]
    fn test_hash_roms_parallel_multiple_files() {
        let data1 = b"ROM file one";
        let data2 = b"ROM file two";
        let (_tmp1, path1) = create_temp_rom("par1_", data1);
        let (_tmp2, path2) = create_temp_rom("par2_", data2);

        let files = vec![
            (path1.clone(), "gba".to_string()),
            (path2.clone(), "genesis".to_string()),
        ];

        let results = hash_roms_parallel(&files);
        assert_eq!(results.len(), 2);
        for (_, res) in &results {
            assert!(res.is_ok(), "Expected Ok, got: {:?}", res);
        }
    }

    #[test]
    fn test_size_cap_constants() {
        // Verify the size cap is 768 MiB and partial hash size is 1 MiB.
        assert_eq!(MAX_HASH_FILE_SIZE, 768 * 1024 * 1024);
        assert_eq!(PARTIAL_HASH_SIZE, 1024 * 1024);
        assert!(PARTIAL_HASH_SIZE < MAX_HASH_FILE_SIZE);
    }

    #[test]
    fn test_hash_reader_with_limit() {
        // Create a file with 2048 bytes, but only hash the first 1024.
        let data: Vec<u8> = (0..2048).map(|i| (i % 256) as u8).collect();
        let (_tmp, path) = create_temp_rom("limit_hash_", &data);

        let mut file = File::open(&path).expect("open file");
        let limited = hash_reader(&mut file, &path, Some(1024)).expect("hash_reader limited");

        let mut file2 = File::open(&path).expect("open file");
        let full = hash_reader(&mut file2, &path, None).expect("hash_reader full");

        // The partial hash (first 1024 bytes) must differ from the full hash (2048 bytes).
        assert_ne!(limited.crc32, full.crc32);

        // The partial hash should match a manual CRC32 of just the first 1024 bytes.
        let mut expected_crc = crc32fast::Hasher::new();
        expected_crc.update(&data[..1024]);
        let expected = format!("{:08x}", expected_crc.finalize());
        assert_eq!(limited.crc32, expected);
    }

    #[test]
    fn test_small_file_not_affected_by_cap() {
        // A small file (well under 768 MiB) should produce the same hash
        // regardless of the size cap existing.
        let data = b"Small ROM content that should hash normally";
        let (_tmp, path) = create_temp_rom("small_", data);

        let result = hash_rom(&path, "ps2").expect("hash_rom for small ps2 file");

        let mut expected_crc = crc32fast::Hasher::new();
        expected_crc.update(data);
        let expected = format!("{:08x}", expected_crc.finalize());
        assert_eq!(result.crc32, expected);
    }
}

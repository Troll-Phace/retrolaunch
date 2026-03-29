//! Integration tests for the RetroLaunch ROM scanner pipeline.
//!
//! These tests exercise multiple modules working together (walker, detector,
//! hasher, database) to validate end-to-end scanning behavior. All database
//! tests use in-memory SQLite instances and all ROM files are synthetic byte
//! arrays -- no real ROM files are included.

use retrolaunch_lib::db::Database;
use retrolaunch_lib::models::{GetGamesParams, ScannedRom};
use retrolaunch_lib::scanner::{detector, hasher, walker};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use tempfile::TempDir;

// ---------------------------------------------------------------------------
// Helper: build a set of known ROM extensions from the seeded systems table.
// ---------------------------------------------------------------------------
fn known_extensions_from_db(db: &Database) -> HashSet<String> {
    db.get_all_systems()
        .unwrap()
        .iter()
        .flat_map(|s| s.extensions.iter().cloned())
        .collect()
}

// ---------------------------------------------------------------------------
// Helper: create a synthetic NES ROM with valid iNES header.
// ---------------------------------------------------------------------------
fn make_nes_rom_bytes() -> Vec<u8> {
    let mut rom = vec![0u8; 16 + 256];
    rom[0..4].copy_from_slice(&[0x4E, 0x45, 0x53, 0x1A]); // NES\x1A
    for i in 0..256 {
        rom[16 + i] = (i % 256) as u8;
    }
    rom
}

// ---------------------------------------------------------------------------
// Helper: create a synthetic GBA ROM with Nintendo logo fragment.
// ---------------------------------------------------------------------------
fn make_gba_rom_bytes() -> Vec<u8> {
    let mut rom = vec![0u8; 0xC0 + 128];
    rom[0x04..0x08].copy_from_slice(&[0x24, 0xFF, 0xAE, 0x51]);
    for i in 0..128 {
        rom[0xC0 + i] = (i % 256) as u8;
    }
    rom
}

// ---------------------------------------------------------------------------
// Helper: create a synthetic Genesis ROM with "SEGA" at 0x100.
// ---------------------------------------------------------------------------
fn make_genesis_rom_bytes() -> Vec<u8> {
    let mut rom = vec![0u8; 0x200];
    rom[0x100..0x104].copy_from_slice(b"SEGA");
    for (i, byte) in rom.iter_mut().enumerate().take(0x200).skip(0x104) {
        *byte = (i % 256) as u8;
    }
    rom
}

// ---------------------------------------------------------------------------
// 1. Full pipeline: walk -> detect -> hash -> insert
// ---------------------------------------------------------------------------
#[test]
fn test_full_pipeline_walk_detect_hash_insert() {
    let tmp = TempDir::new().unwrap();
    let db = Database::new_in_memory().unwrap();
    let systems = db.get_all_systems().unwrap();
    let known_exts = known_extensions_from_db(&db);

    // Create synthetic ROM files with valid headers.
    fs::write(tmp.path().join("mario.nes"), make_nes_rom_bytes()).unwrap();
    fs::write(tmp.path().join("metroid.gba"), make_gba_rom_bytes()).unwrap();
    fs::write(tmp.path().join("sonic.md"), make_genesis_rom_bytes()).unwrap();

    // Step 1: Walk
    let dirs = vec![tmp.path().to_path_buf()];
    let discovered = walker::walk_directories(&dirs, &known_exts).unwrap();
    assert_eq!(discovered.len(), 3);

    // Step 2: Detect systems
    let mut identified: Vec<(PathBuf, String)> = Vec::new();
    for file in &discovered {
        let candidates = detector::detect_system_by_extension(&file.extension, &systems);
        assert!(
            !candidates.is_empty(),
            "No candidates for extension: {}",
            file.extension
        );
        let system_id = if candidates.len() == 1 {
            candidates[0].clone()
        } else {
            detector::detect_system_by_header(&file.path, &candidates)
                .unwrap()
                .expect("Header sniffing should identify the system")
        };
        identified.push((file.path.clone(), system_id));
    }
    assert_eq!(identified.len(), 3);

    // Step 3: Hash
    let hash_results = hasher::hash_roms_parallel(&identified);
    assert_eq!(hash_results.len(), 3);
    for (_, result) in &hash_results {
        let hashes = result.as_ref().expect("Hashing should succeed");
        assert_eq!(hashes.crc32.len(), 8, "CRC32 should be 8 hex chars");
        assert!(hashes.sha1.is_some(), "SHA1 should be present");
    }

    // Step 4: Insert into DB
    let mut inserted_count = 0u32;
    for (idx, (path, result)) in hash_results.into_iter().enumerate() {
        let hashes = result.unwrap();
        let disc = &discovered.iter().find(|d| d.path == path).unwrap();
        let rom = ScannedRom {
            file_path: path.clone(),
            file_name: path.file_name().unwrap().to_string_lossy().to_string(),
            file_size: disc.file_size,
            last_modified: disc.last_modified.clone(),
            system_id: identified[idx].1.clone(),
            crc32: hashes.crc32,
            sha1: hashes.sha1,
        };
        let id = db.insert_game(&rom).unwrap();
        if id > 0 {
            inserted_count += 1;
        }
    }

    assert_eq!(inserted_count, 3, "All 3 ROMs should be inserted");

    // Verify via query
    let all_games = db.get_games(&GetGamesParams::default()).unwrap();
    assert_eq!(all_games.len(), 3);

    // Check system assignments
    let system_ids: HashSet<String> = all_games.iter().map(|g| g.system_id.clone()).collect();
    assert!(system_ids.contains("nes"));
    assert!(system_ids.contains("gba"));
    assert!(system_ids.contains("genesis"));
}

// ---------------------------------------------------------------------------
// 2. Ambiguous .bin file resolution
// ---------------------------------------------------------------------------
#[test]
fn test_ambiguous_bin_resolution() {
    let tmp = TempDir::new().unwrap();
    let db = Database::new_in_memory().unwrap();
    let systems = db.get_all_systems().unwrap();

    // A .bin file with Genesis "SEGA" header at 0x100.
    fs::write(tmp.path().join("genesis_game.bin"), make_genesis_rom_bytes()).unwrap();

    // A .bin file with no recognizable header -- should fall back to atari2600.
    let unknown_bytes = vec![0xAAu8; 512];
    fs::write(tmp.path().join("unknown_game.bin"), &unknown_bytes).unwrap();

    // Detect by extension -- both should have multiple candidates since .bin is shared.
    let candidates_genesis =
        detector::detect_system_by_extension("bin", &systems);
    assert!(
        candidates_genesis.len() > 1,
        ".bin should be ambiguous across multiple systems"
    );

    // Header sniff the Genesis ROM.
    let genesis_result = detector::detect_system_by_header(
        &tmp.path().join("genesis_game.bin"),
        &candidates_genesis,
    )
    .unwrap();
    assert_eq!(
        genesis_result,
        Some("genesis".to_string()),
        "Genesis header should be detected"
    );

    // Header sniff the unknown ROM -- should fall back to atari2600.
    let candidates_unknown =
        detector::detect_system_by_extension("bin", &systems);
    let unknown_result = detector::detect_system_by_header(
        &tmp.path().join("unknown_game.bin"),
        &candidates_unknown,
    )
    .unwrap();
    assert_eq!(
        unknown_result,
        Some("atari2600".to_string()),
        "Unknown .bin should fall back to atari2600"
    );
}

// ---------------------------------------------------------------------------
// 3. Incremental scan -- skip unchanged files
// ---------------------------------------------------------------------------
#[test]
fn test_incremental_scan_skips_unchanged_files() {
    let tmp = TempDir::new().unwrap();
    let db = Database::new_in_memory().unwrap();

    let rom_path = tmp.path().join("game.nes");
    fs::write(&rom_path, make_nes_rom_bytes()).unwrap();

    // Read the file's actual last_modified timestamp.
    let metadata = fs::metadata(&rom_path).unwrap();
    let last_modified = metadata
        .modified()
        .unwrap()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
        .to_string();

    // Manually insert the game with matching last_modified.
    let rom = ScannedRom {
        file_path: rom_path.clone(),
        file_name: "game.nes".to_string(),
        file_size: metadata.len(),
        last_modified: last_modified.clone(),
        system_id: "nes".to_string(),
        crc32: "aabbccdd".to_string(),
        sha1: None,
    };
    db.insert_game(&rom).unwrap();

    // Check: file is in DB with matching timestamp -- should be skipped.
    let rom_path_str = rom_path.to_string_lossy().to_string();
    let stored = db.get_file_last_modified(&rom_path_str).unwrap();
    assert_eq!(
        stored.as_deref(),
        Some(last_modified.as_str()),
        "Stored timestamp should match file"
    );

    // Simulate incremental filter: stored == current means skip.
    let should_skip = stored.as_deref() == Some(last_modified.as_str());
    assert!(should_skip, "File should be skipped (unchanged)");

    // Now simulate a different timestamp -- file should be re-processed.
    let different_timestamp = "9999999999".to_string();
    let should_reprocess = stored.as_deref() != Some(different_timestamp.as_str());
    assert!(
        should_reprocess,
        "File should be re-processed when timestamp differs"
    );
}

// ---------------------------------------------------------------------------
// 4. Empty directory scan
// ---------------------------------------------------------------------------
#[test]
fn test_empty_directory_scan() {
    let tmp = TempDir::new().unwrap();
    let mut exts = HashSet::new();
    exts.insert("nes".to_string());
    exts.insert("gba".to_string());

    let dirs = vec![tmp.path().to_path_buf()];
    let result = walker::walk_directories(&dirs, &exts).unwrap();
    assert!(result.is_empty(), "Empty directory should yield no files");
}

// ---------------------------------------------------------------------------
// 5. Mixed file types -- only ROMs collected
// ---------------------------------------------------------------------------
#[test]
fn test_mixed_file_types_only_roms_collected() {
    let tmp = TempDir::new().unwrap();

    fs::write(tmp.path().join("game.nes"), make_nes_rom_bytes()).unwrap();
    fs::write(tmp.path().join("readme.txt"), b"This is a readme").unwrap();
    fs::write(tmp.path().join("image.png"), b"\x89PNG fake image").unwrap();
    fs::write(tmp.path().join("save.sav"), b"save data").unwrap();
    fs::write(tmp.path().join("game.gba"), make_gba_rom_bytes()).unwrap();

    let mut exts = HashSet::new();
    exts.insert("nes".to_string());
    exts.insert("gba".to_string());

    let dirs = vec![tmp.path().to_path_buf()];
    let result = walker::walk_directories(&dirs, &exts).unwrap();

    assert_eq!(result.len(), 2, "Only .nes and .gba files should be found");

    let extensions: HashSet<String> = result.iter().map(|f| f.extension.clone()).collect();
    assert!(extensions.contains("nes"));
    assert!(extensions.contains("gba"));
}

// ---------------------------------------------------------------------------
// 6. Zero-byte file handling
// ---------------------------------------------------------------------------
#[test]
fn test_zero_byte_file_does_not_panic() {
    let tmp = TempDir::new().unwrap();
    let rom_path = tmp.path().join("empty.nes");
    fs::write(&rom_path, b"").unwrap();

    // Hashing a zero-byte "nes" file: the hasher tries to read a 16-byte
    // header. This should either return an error or produce a valid hash --
    // it must not panic.
    let result = hasher::hash_rom(&rom_path, "nes");

    // We accept either Ok with a valid hash or Err -- both are fine.
    match result {
        Ok(hashes) => {
            assert_eq!(hashes.crc32.len(), 8, "CRC32 should still be 8 hex chars");
        }
        Err(_) => {
            // An error is acceptable for a zero-byte file.
        }
    }
}

#[test]
fn test_zero_byte_file_non_nes_produces_zero_hash() {
    let tmp = TempDir::new().unwrap();
    let rom_path = tmp.path().join("empty.gba");
    fs::write(&rom_path, b"").unwrap();

    // For non-NES systems there is no header reading, so hashing an empty
    // file should succeed with a deterministic "empty input" CRC32.
    let result = hasher::hash_rom(&rom_path, "gba").unwrap();
    assert_eq!(result.crc32, "00000000", "CRC32 of empty data should be 0");
    assert_eq!(
        result.sha1.as_deref(),
        Some("da39a3ee5e6b4b0d3255bfef95601890afd80709"),
        "SHA1 of empty data should be the well-known empty hash"
    );
}

// ---------------------------------------------------------------------------
// 7. Deeply nested directory structure
// ---------------------------------------------------------------------------
#[test]
fn test_deeply_nested_directory_scan() {
    let tmp = TempDir::new().unwrap();

    // Level 0
    fs::write(tmp.path().join("top.nes"), make_nes_rom_bytes()).unwrap();

    // Level 1
    let level1 = tmp.path().join("consoles");
    fs::create_dir(&level1).unwrap();
    fs::write(level1.join("mid.gba"), make_gba_rom_bytes()).unwrap();

    // Level 2
    let level2 = level1.join("sega");
    fs::create_dir(&level2).unwrap();
    fs::write(level2.join("deep.md"), make_genesis_rom_bytes()).unwrap();

    // Level 3
    let level3 = level2.join("roms");
    fs::create_dir(&level3).unwrap();
    fs::write(level3.join("deepest.nes"), make_nes_rom_bytes()).unwrap();

    let mut exts = HashSet::new();
    exts.insert("nes".to_string());
    exts.insert("gba".to_string());
    exts.insert("md".to_string());

    let dirs = vec![tmp.path().to_path_buf()];
    let result = walker::walk_directories(&dirs, &exts).unwrap();

    assert_eq!(
        result.len(),
        4,
        "All 4 ROMs should be found regardless of depth"
    );
}

// ---------------------------------------------------------------------------
// 8. CRC32 consistency / determinism
// ---------------------------------------------------------------------------
#[test]
fn test_crc32_consistency() {
    let tmp = TempDir::new().unwrap();

    // Known data: "Hello, RetroLaunch!" -- compute expected CRC32 manually.
    let data = b"Hello, RetroLaunch!";
    let expected_crc = {
        let mut h = crc32fast::Hasher::new();
        h.update(data);
        format!("{:08x}", h.finalize())
    };

    let rom_path = tmp.path().join("test.gba");
    fs::write(&rom_path, data).unwrap();

    let result = hasher::hash_rom(&rom_path, "gba").unwrap();
    assert_eq!(
        result.crc32, expected_crc,
        "Hash from hasher should match manually computed CRC32"
    );

    // Hash again to confirm determinism.
    let result2 = hasher::hash_rom(&rom_path, "gba").unwrap();
    assert_eq!(
        result.crc32, result2.crc32,
        "Hashing the same file twice should produce identical CRC32"
    );
    assert_eq!(
        result.sha1, result2.sha1,
        "Hashing the same file twice should produce identical SHA1"
    );
}

// ---------------------------------------------------------------------------
// 9. FTS search after insert
// ---------------------------------------------------------------------------
#[test]
fn test_fts_search_after_insert() {
    let db = Database::new_in_memory().unwrap();

    // Insert games with distinct titles.
    let games = [
        ("super_mario_bros", "nes"),
        ("mario_kart", "snes"),
        ("zelda_link_to_past", "snes"),
        ("sonic_the_hedgehog", "genesis"),
        ("metroid_prime", "gba"),
    ];

    for (name, system) in &games {
        let rom = ScannedRom {
            file_path: PathBuf::from(format!("/roms/{}.rom", name)),
            file_name: format!("{}.rom", name),
            file_size: 1024,
            last_modified: "1700000000".to_string(),
            system_id: system.to_string(),
            crc32: format!("{:08x}", name.len()),
            sha1: None,
        };
        let id = db.insert_game(&rom).unwrap();
        assert!(id > 0, "Game '{}' should be inserted", name);
    }

    // Search for "mario" -- should match super_mario_bros and mario_kart.
    let params = GetGamesParams {
        search: Some("mario".to_string()),
        ..Default::default()
    };
    let results = db.get_games(&params).unwrap();
    assert_eq!(results.len(), 2, "Two games should match 'mario'");
    for game in &results {
        assert!(
            game.title.contains("mario"),
            "Title '{}' should contain 'mario'",
            game.title
        );
    }

    // Prefix search: "met" should match "metroid_prime".
    let params_prefix = GetGamesParams {
        search: Some("met".to_string()),
        ..Default::default()
    };
    let prefix_results = db.get_games(&params_prefix).unwrap();
    assert_eq!(
        prefix_results.len(),
        1,
        "Prefix 'met' should match metroid_prime"
    );
    assert!(prefix_results[0].title.contains("metroid"));

    // Search for something that does not exist.
    let params_none = GetGamesParams {
        search: Some("kirby".to_string()),
        ..Default::default()
    };
    let no_results = db.get_games(&params_none).unwrap();
    assert!(no_results.is_empty(), "No games should match 'kirby'");
}

// ---------------------------------------------------------------------------
// 10. Sort ordering verification
// ---------------------------------------------------------------------------
#[test]
fn test_sort_ordering_desc() {
    let db = Database::new_in_memory().unwrap();

    let games = [
        ("alpha_game", "nes"),
        ("charlie_game", "genesis"),
        ("bravo_game", "gba"),
    ];

    for (name, system) in &games {
        let rom = ScannedRom {
            file_path: PathBuf::from(format!("/roms/{}.rom", name)),
            file_name: format!("{}.rom", name),
            file_size: 1024,
            last_modified: "1700000000".to_string(),
            system_id: system.to_string(),
            crc32: format!("{:08x}", name.len()),
            sha1: None,
        };
        db.insert_game(&rom).unwrap();
    }

    // Sort by title descending.
    let params = GetGamesParams {
        sort_by: Some("title".to_string()),
        sort_order: Some("desc".to_string()),
        ..Default::default()
    };
    let results = db.get_games(&params).unwrap();

    assert_eq!(results.len(), 3);
    assert_eq!(results[0].title, "charlie_game");
    assert_eq!(results[1].title, "bravo_game");
    assert_eq!(results[2].title, "alpha_game");
}

#[test]
fn test_sort_ordering_asc() {
    let db = Database::new_in_memory().unwrap();

    let games = [
        ("zebra_game", "nes"),
        ("apple_game", "genesis"),
        ("mango_game", "gba"),
    ];

    for (name, system) in &games {
        let rom = ScannedRom {
            file_path: PathBuf::from(format!("/roms/{}.rom", name)),
            file_name: format!("{}.rom", name),
            file_size: 1024,
            last_modified: "1700000000".to_string(),
            system_id: system.to_string(),
            crc32: format!("{:08x}", name.len()),
            sha1: None,
        };
        db.insert_game(&rom).unwrap();
    }

    // Sort by title ascending (default).
    let params = GetGamesParams {
        sort_by: Some("title".to_string()),
        sort_order: Some("asc".to_string()),
        ..Default::default()
    };
    let results = db.get_games(&params).unwrap();

    assert_eq!(results.len(), 3);
    assert_eq!(results[0].title, "apple_game");
    assert_eq!(results[1].title, "mango_game");
    assert_eq!(results[2].title, "zebra_game");
}

//! Live integration test: scan Pokemon Emerald ROM, fetch IGDB metadata.
//!
//! Requires IGDB_CLIENT_ID and IGDB_CLIENT_SECRET environment variables.
//! Run with: cargo test --test live_metadata_test -- --ignored --nocapture

use retrolaunch_lib::db::Database;
use retrolaunch_lib::metadata::cache::ImageCache;
use retrolaunch_lib::metadata::igdb::IgdbClient;
use retrolaunch_lib::models::GetGamesParams;
use retrolaunch_lib::scanner::{detector, hasher, walker};
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Arc;

/// Scans the ROM into the database using scanner submodules directly (no AppHandle needed).
fn scan_rom_into_db(db: &Database, rom_dir: &PathBuf) {
    let systems = db.get_all_systems().expect("Failed to load systems");
    let known_extensions: HashSet<String> = systems
        .iter()
        .flat_map(|s| s.extensions.iter().cloned())
        .collect();

    let discovered = walker::walk_directories(&[rom_dir.clone()], &known_extensions)
        .expect("Failed to walk directory");
    assert!(!discovered.is_empty(), "No ROM files discovered");

    let mut identified = Vec::new();
    for file in &discovered {
        let candidates = detector::detect_system_by_extension(&file.extension, &systems);
        let system_id = if candidates.len() == 1 {
            candidates[0].clone()
        } else if candidates.is_empty() {
            continue;
        } else {
            match detector::detect_system_by_header(&file.path, &candidates) {
                Ok(Some(id)) => id,
                _ => continue,
            }
        };
        identified.push((file.path.clone(), system_id));
    }
    assert!(!identified.is_empty(), "No ROMs identified");

    let hash_results = hasher::hash_roms_parallel(&identified);

    for (path, hash_result) in hash_results {
        let hashes = hash_result.expect("Hashing failed");
        let system_id = identified
            .iter()
            .find(|(p, _)| p == &path)
            .map(|(_, s)| s.clone())
            .unwrap();
        let disc_file = discovered.iter().find(|f| f.path == path).unwrap();
        let file_name = path.file_stem().unwrap().to_string_lossy().to_string();

        let rom = retrolaunch_lib::models::ScannedRom {
            file_path: path,
            file_name,
            file_size: disc_file.file_size,
            last_modified: disc_file.last_modified.clone(),
            system_id,
            crc32: hashes.crc32,
            sha1: hashes.sha1,
        };
        db.insert_game(&rom).expect("DB insert failed");
    }
}

#[tokio::test]
#[ignore] // Only run manually with --ignored flag (requires API credentials)
async fn test_pokemon_emerald_metadata_retrieval() {
    let rom_dir =
        PathBuf::from("/Users/anthonygrimaldi/Documents/VSCode-Projects/retrolaunch/test-files");
    assert!(rom_dir.exists(), "test-files directory not found");

    let tmp = tempfile::tempdir().unwrap();
    let db = Arc::new(Database::new(tmp.path()).unwrap());

    // === Step 1: Scan ROM into DB ===
    println!("\n=== Step 1: Scanning ROM ===");
    scan_rom_into_db(&db, &rom_dir);

    let games = db.get_games(&GetGamesParams::default()).unwrap();
    assert!(!games.is_empty(), "No games in DB after scan");
    for game in &games {
        println!(
            "  ID: {}, Title: '{}', System: {}, CRC32: {:?}",
            game.id, game.title, game.system_id, game.rom_hash_crc32
        );
    }

    // === Step 2: IGDB Authentication ===
    println!("\n=== Step 2: IGDB Authentication ===");
    let client_id = std::env::var("IGDB_CLIENT_ID").expect("IGDB_CLIENT_ID not set");
    let client_secret = std::env::var("IGDB_CLIENT_SECRET").expect("IGDB_CLIENT_SECRET not set");
    let igdb = IgdbClient::new(client_id, client_secret);
    assert!(igdb.is_configured(), "IGDB client should be configured");

    // === Step 3: Search IGDB ===
    println!("\n=== Step 3: IGDB Search for 'Pokemon Emerald' ===");
    let result = igdb.search_game("Pokemon Emerald", Some("gba")).await;
    let metadata = result
        .expect("IGDB search failed")
        .expect("IGDB returned no results for Pokemon Emerald");

    println!("  IGDB ID: {:?}", metadata.igdb_id);
    println!("  Developer: {:?}", metadata.developer);
    println!("  Publisher: {:?}", metadata.publisher);
    println!("  Release Date: {:?}", metadata.release_date);
    println!("  Genre: {:?}", metadata.genre);
    println!(
        "  Description: {:?}",
        metadata
            .description
            .as_ref()
            .map(|d| &d[..d.len().min(120)])
    );
    println!("  Cover URL: {:?}", metadata.cover_url);
    println!("  Screenshots: {} found", metadata.screenshot_urls.len());
    println!("  Source: {}", metadata.source);

    assert!(metadata.igdb_id.is_some(), "Should have IGDB ID");
    assert!(metadata.developer.is_some(), "Should have developer");
    assert!(metadata.cover_url.is_some(), "Should have cover URL");

    // === Step 4: Download Cover + Blurhash ===
    println!("\n=== Step 4: Cover Art Download ===");
    let image_cache = ImageCache::new(tmp.path(), false).unwrap();
    let game = &games[0];

    let (cover_path, blurhash) = image_cache
        .download_cover(game.id, metadata.cover_url.as_ref().unwrap())
        .await
        .expect("Cover download failed");

    let file_size = std::fs::metadata(&cover_path)
        .map(|m| m.len())
        .unwrap_or(0);
    println!("  Cover saved: {:?}", cover_path);
    println!("  Cover size: {} bytes", file_size);
    println!("  Blurhash: {}", blurhash);

    assert!(cover_path.exists(), "Cover file should exist on disk");
    assert!(file_size > 0, "Cover file should not be empty");
    assert!(!blurhash.is_empty(), "Blurhash should not be empty");

    // === Step 5: Update DB with Metadata ===
    println!("\n=== Step 5: Update Database ===");
    db.update_game_metadata(
        game.id,
        &metadata,
        Some(&cover_path.to_string_lossy()),
        Some(&blurhash),
    )
    .expect("DB metadata update failed");

    // === Step 6: Verify Final State ===
    println!("\n=== Step 6: Final DB State ===");
    let updated_games = db.get_games(&GetGamesParams::default()).unwrap();
    let updated = &updated_games[0];
    println!("  Title: {}", updated.title);
    println!("  System: {}", updated.system_id);
    println!("  Developer: {:?}", updated.developer);
    println!("  Publisher: {:?}", updated.publisher);
    println!("  Release Date: {:?}", updated.release_date);
    println!("  Genre: {:?}", updated.genre);
    println!("  Cover Path: {:?}", updated.cover_path);
    println!(
        "  Blurhash: {:?}",
        updated.blurhash.as_ref().map(|b| &b[..b.len().min(24)])
    );
    println!("  Metadata Source: {:?}", updated.metadata_source);
    println!("  Metadata Fetched: {:?}", updated.metadata_fetched_at);

    assert_eq!(
        updated.metadata_source.as_deref(),
        Some("igdb"),
        "Source should be IGDB"
    );
    assert!(updated.developer.is_some(), "Developer should be set in DB");
    assert!(
        updated.cover_path.is_some(),
        "Cover path should be set in DB"
    );
    assert!(updated.blurhash.is_some(), "Blurhash should be set in DB");
    assert!(
        updated.metadata_fetched_at.is_some(),
        "Fetch timestamp should be set"
    );

    // === Step 7: Cache Stats ===
    println!("\n=== Step 7: Cache Stats ===");
    let stats = image_cache.get_cache_stats().unwrap();
    println!(
        "  Covers: {} files, {} bytes",
        stats.covers_count, stats.covers_size_bytes
    );
    println!("  Total: {} bytes", stats.total_size_bytes);

    assert_eq!(stats.covers_count, 1, "Should have 1 cover cached");
    assert!(stats.covers_size_bytes > 0, "Cover should have nonzero size");

    println!("\n=== All Assertions Passed ===");
}

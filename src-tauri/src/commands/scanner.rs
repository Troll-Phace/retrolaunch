//! Tauri IPC command handlers for ROM scanning and library queries.
//!
//! Each function is annotated with `#[tauri::command]` and exposed to the
//! frontend via the Tauri invoke handler registered in `lib.rs`.

use crate::db::Database;
use crate::models::{DatFile, Game, GameDetailResponse, GetGamesParams, ScanComplete, System, WatchedDirectory};
use crate::scanner;
use crate::scanner::nointro::NoIntroDatabase;
use crate::watcher::FsWatcher;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use tauri::{AppHandle, State};

/// Scans the given directories for ROM files, identifies systems, hashes
/// contents, and inserts new games into the database.
///
/// Runs on a blocking thread since the scan pipeline is CPU-bound (hashing,
/// header sniffing). Emits `scan-progress` and `scan-complete` events.
#[tauri::command]
pub async fn scan_directories(
    app: AppHandle,
    directories: Vec<String>,
    db: State<'_, Arc<Database>>,
    nointro: State<'_, Arc<RwLock<NoIntroDatabase>>>,
) -> Result<ScanComplete, String> {
    let dirs: Vec<PathBuf> = directories.iter().map(PathBuf::from).collect();
    let db = db.inner().clone();
    let nointro_db = nointro
        .read()
        .map_err(|e| format!("NoIntro lock: {}", e))?
        .clone();

    tokio::task::spawn_blocking(move || scanner::run_scan(&app, dirs, &db, &nointro_db))
        .await
        .map_err(|e| format!("Scan task failed: {}", e))?
        .map_err(|e| format!("Scan error: {}", e))
}

/// Adds a directory to the watched directories list.
///
/// Uses `INSERT OR IGNORE` internally, so adding the same path twice
/// returns the existing record without error. Also adds the path to the
/// running file system watcher if it is enabled.
#[tauri::command]
pub async fn add_watched_directory(
    path: String,
    db: State<'_, Arc<Database>>,
    watcher: State<'_, Arc<FsWatcher>>,
) -> Result<WatchedDirectory, String> {
    let dir = db
        .add_watched_directory(&path)
        .map_err(|e| e.to_string())?;

    // Add to the running watcher if the directory is enabled.
    if dir.enabled {
        let _ = watcher.add_path(PathBuf::from(&path));
    }

    Ok(dir)
}

/// Removes a watched directory by its database ID.
///
/// Also removes the path from the running file system watcher.
#[tauri::command]
pub async fn remove_watched_directory(
    id: i64,
    db: State<'_, Arc<Database>>,
    watcher: State<'_, Arc<FsWatcher>>,
) -> Result<(), String> {
    // Look up the directory path before deleting so we can remove it from the watcher.
    let dir_path = db
        .get_watched_directory_path_by_id(id)
        .map_err(|e| e.to_string())?;

    db.remove_watched_directory(id)
        .map_err(|e| e.to_string())?;

    // Remove from the running watcher.
    if let Some(path) = dir_path {
        let _ = watcher.remove_path(PathBuf::from(&path));
    }

    Ok(())
}

/// Queries games from the database with optional filtering, sorting, and pagination.
#[tauri::command]
pub async fn get_games(
    params: GetGamesParams,
    db: State<'_, Arc<Database>>,
) -> Result<Vec<Game>, String> {
    db.get_games(&params).map_err(|e| e.to_string())
}

/// Returns all supported emulation systems from the database.
#[tauri::command]
pub async fn get_systems(db: State<'_, Arc<Database>>) -> Result<Vec<System>, String> {
    db.get_all_systems().map_err(|e| e.to_string())
}

/// Returns all watched directories from the database.
#[tauri::command]
pub async fn get_watched_directories(
    db: State<'_, Arc<Database>>,
) -> Result<Vec<WatchedDirectory>, String> {
    db.get_watched_directories().map_err(|e| e.to_string())
}

/// Returns a game and its associated screenshots for the detail view.
///
/// Combines `get_game_by_id` and `get_screenshots_for_game` into a single
/// response to reduce IPC round-trips from the frontend.
#[tauri::command]
pub async fn get_game_detail(
    game_id: i64,
    db: State<'_, Arc<Database>>,
) -> Result<GameDetailResponse, String> {
    let game = db
        .get_game_by_id(game_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Game with id {} not found", game_id))?;

    let screenshots = db
        .get_screenshots_for_game(game_id)
        .map_err(|e| e.to_string())?;

    Ok(GameDetailResponse { game, screenshots })
}

/// Toggles the favorite status of a game and returns the new value.
#[tauri::command]
pub async fn toggle_favorite(
    game_id: i64,
    db: State<'_, Arc<Database>>,
) -> Result<bool, String> {
    db.toggle_favorite(game_id).map_err(|e| e.to_string())
}

/// Deletes games whose ROM path does not belong to any watched directory.
///
/// Returns the number of orphaned games that were removed.
#[tauri::command]
pub async fn cleanup_orphaned_games(
    db: State<'_, Arc<Database>>,
) -> Result<u32, String> {
    db.cleanup_orphaned_games().map_err(|e| e.to_string())
}

// ── No-Intro DAT file commands ────────────────────────────────────

/// Imports a No-Intro DAT file for a specific system.
///
/// Parses the DAT file, copies it to the app data directory, records it
/// in the database, and updates the in-memory lookup table.
#[tauri::command]
pub async fn import_dat_file(
    system_id: String,
    source_path: String,
    db: State<'_, Arc<Database>>,
    nointro: State<'_, Arc<RwLock<NoIntroDatabase>>>,
    dat_dir: State<'_, Arc<PathBuf>>,
) -> Result<DatFile, String> {
    let source = std::path::Path::new(&source_path);

    // 1. Parse the DAT file to validate it and get info.
    let parsed = crate::scanner::nointro::parse_dat_file(source)
        .map_err(|e| format!("Failed to parse DAT file: {}", e))?;

    // 2. Copy file to dat/<system_id>.dat
    let dest = dat_dir.join(format!("{}.dat", system_id));
    std::fs::copy(source, &dest)
        .map_err(|e| format!("Failed to copy DAT file: {}", e))?;

    // 3. Record in database.
    let file_name = source
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    db.upsert_dat_file(
        &system_id,
        &file_name,
        Some(&parsed.info.name),
        parsed.info.entry_count as i32,
    )
    .map_err(|e| format!("Failed to save DAT record: {}", e))?;

    // 4. Update in-memory NoIntroDatabase.
    {
        let mut nointro_guard = nointro
            .write()
            .map_err(|e| format!("NoIntro write lock: {}", e))?;
        nointro_guard
            .systems
            .insert(system_id.clone(), parsed.entries);
    }

    // 5. Return the DAT file record.
    let dat_files = db.get_dat_files().map_err(|e| e.to_string())?;
    dat_files
        .into_iter()
        .find(|d| d.system_id == system_id)
        .ok_or_else(|| "DAT file record not found after insert".to_string())
}

/// Returns all imported DAT files.
#[tauri::command]
pub async fn get_dat_files(
    db: State<'_, Arc<Database>>,
) -> Result<Vec<DatFile>, String> {
    db.get_dat_files().map_err(|e| e.to_string())
}

/// Removes a DAT file for a system.
///
/// Deletes the file from disk, removes the database record, and clears
/// the in-memory lookup entries for that system.
#[tauri::command]
pub async fn remove_dat_file(
    system_id: String,
    db: State<'_, Arc<Database>>,
    nointro: State<'_, Arc<RwLock<NoIntroDatabase>>>,
    dat_dir: State<'_, Arc<PathBuf>>,
) -> Result<(), String> {
    // 1. Delete the file from disk.
    let dat_path = dat_dir.join(format!("{}.dat", system_id));
    if dat_path.exists() {
        std::fs::remove_file(&dat_path)
            .map_err(|e| format!("Failed to delete DAT file: {}", e))?;
    }

    // 2. Remove from database.
    db.remove_dat_file(&system_id).map_err(|e| e.to_string())?;

    // 3. Remove from in-memory state.
    {
        let mut nointro_guard = nointro
            .write()
            .map_err(|e| format!("NoIntro write lock: {}", e))?;
        nointro_guard.systems.remove(&system_id);
    }

    Ok(())
}

/// Re-matches all existing games against loaded DAT files.
///
/// Scans games that have a CRC32 hash but no No-Intro name set and
/// attempts to match them. Returns the number of newly matched games.
#[tauri::command]
pub async fn rematch_nointro(
    db: State<'_, Arc<Database>>,
    nointro: State<'_, Arc<RwLock<NoIntroDatabase>>>,
) -> Result<u32, String> {
    let games = db
        .get_games_without_nointro()
        .map_err(|e| e.to_string())?;
    let nointro_guard = nointro
        .read()
        .map_err(|e| format!("NoIntro read lock: {}", e))?;

    let mut matched = 0u32;
    for game in &games {
        if let Some(crc32) = &game.rom_hash_crc32 {
            // First try the headerless hash, then try full-file hash
            // for headered No-Intro DATs (NES/SNES).
            let nointro_match = nointro_guard
                .lookup(&game.system_id, crc32)
                .or_else(|| {
                    if game.system_id == "nes" || game.system_id == "snes" {
                        let path = std::path::Path::new(&game.rom_path);
                        crate::scanner::hasher::hash_rom_full(path)
                            .ok()
                            .and_then(|full| nointro_guard.lookup(&game.system_id, &full.crc32))
                    } else {
                        None
                    }
                });
            if let Some(entry) = nointro_match {
                if let Err(e) = db.update_nointro_match_by_path(
                    &game.rom_path,
                    &entry.name,
                    entry.region.as_deref(),
                ) {
                    eprintln!(
                        "Warning: failed to update No-Intro match for {}: {}",
                        game.rom_path, e
                    );
                } else {
                    matched += 1;
                }
            }
        }
    }

    Ok(matched)
}

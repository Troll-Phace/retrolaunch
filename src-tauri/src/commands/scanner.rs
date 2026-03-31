//! Tauri IPC command handlers for ROM scanning and library queries.
//!
//! Each function is annotated with `#[tauri::command]` and exposed to the
//! frontend via the Tauri invoke handler registered in `lib.rs`.

use crate::db::Database;
use crate::models::{Game, GameDetailResponse, GetGamesParams, ScanComplete, System, WatchedDirectory};
use crate::scanner;
use crate::watcher::FsWatcher;
use std::path::PathBuf;
use std::sync::Arc;
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
) -> Result<ScanComplete, String> {
    let dirs: Vec<PathBuf> = directories.iter().map(PathBuf::from).collect();
    let db = db.inner().clone();

    tokio::task::spawn_blocking(move || scanner::run_scan(&app, dirs, &db))
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

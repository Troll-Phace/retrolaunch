//! Tauri IPC command handlers for ROM scanning and library queries.
//!
//! Each function is annotated with `#[tauri::command]` and exposed to the
//! frontend via the Tauri invoke handler registered in `lib.rs`.

use crate::db::Database;
use crate::models::{Game, GetGamesParams, ScanComplete, System, WatchedDirectory};
use crate::scanner;
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
/// returns the existing record without error.
#[tauri::command]
pub async fn add_watched_directory(
    path: String,
    db: State<'_, Arc<Database>>,
) -> Result<WatchedDirectory, String> {
    db.add_watched_directory(&path)
        .map_err(|e| e.to_string())
}

/// Removes a watched directory by its database ID.
#[tauri::command]
pub async fn remove_watched_directory(
    id: i64,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.remove_watched_directory(id)
        .map_err(|e| e.to_string())
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

//! Tauri IPC command handlers for the file system watcher.

use crate::db::Database;
use crate::models::WatcherStatus;
use crate::scanner::nointro::NoIntroDatabase;
use crate::watcher::FsWatcher;
use std::sync::{Arc, RwLock};
use tauri::{AppHandle, State};

/// Starts the file system watcher for all enabled watched directories.
#[tauri::command]
pub async fn start_watcher(
    app: AppHandle,
    db: State<'_, Arc<Database>>,
    watcher: State<'_, Arc<FsWatcher>>,
    nointro: State<'_, Arc<RwLock<NoIntroDatabase>>>,
) -> Result<(), String> {
    watcher
        .start(app, db.inner().clone(), nointro.inner().clone())
        .await
}

/// Stops the file system watcher.
#[tauri::command]
pub async fn stop_watcher(
    watcher: State<'_, Arc<FsWatcher>>,
) -> Result<(), String> {
    watcher.stop()
}

/// Returns the current status of the file system watcher.
#[tauri::command]
pub async fn get_watcher_status(
    watcher: State<'_, Arc<FsWatcher>>,
) -> Result<WatcherStatus, String> {
    Ok(WatcherStatus {
        active: watcher.is_active(),
        watched_paths: watcher.get_watched_paths(),
    })
}

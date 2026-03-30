//! Tauri IPC command handlers for metadata fetching and cache management.
//!
//! These commands allow the frontend to trigger metadata enrichment for games
//! (cover art, descriptions, developer/publisher info) and manage the on-disk
//! image cache. Metadata fetching runs as a background task and reports
//! progress via Tauri events.

use crate::db::Database;
use crate::metadata::MetadataClients;
use crate::models::{CacheStats, ClearCacheParams, FetchMetadataParams};
use std::sync::Arc;
use tauri::{AppHandle, State};

/// Fetches metadata for games from IGDB and ScreenScraper.
///
/// If `params.game_ids` is empty, fetches metadata for all games that do not
/// yet have metadata. Otherwise, fetches only for the specified game IDs.
///
/// The actual fetching runs on a background `tokio::spawn` task so this
/// command returns immediately. Progress is reported to the frontend via
/// `metadata-progress` events.
#[tauri::command]
pub async fn fetch_metadata(
    app: AppHandle,
    params: FetchMetadataParams,
    db: State<'_, Arc<Database>>,
    clients: State<'_, Arc<MetadataClients>>,
) -> Result<(), String> {
    let games = if params.game_ids.is_empty() {
        // Fetch all games that don't have metadata yet.
        db.get_games_without_metadata(None)
            .map_err(|e| e.to_string())?
    } else {
        // Fetch only the specified games.
        let mut games = Vec::with_capacity(params.game_ids.len());
        for id in &params.game_ids {
            if let Some(game) = db.get_game_by_id(*id).map_err(|e| e.to_string())? {
                games.push(game);
            }
        }
        games
    };

    if games.is_empty() {
        return Ok(());
    }

    // Clone Arcs for the spawned task.
    let db = db.inner().clone();
    let clients = clients.inner().clone();

    tokio::spawn(async move {
        if let Err(e) =
            crate::metadata::fetch_metadata_batch(&app, &db, games, &clients).await
        {
            eprintln!("Metadata fetch error: {}", e);
        }
    });

    Ok(())
}

/// Returns statistics about the on-disk image cache (file counts and sizes).
#[tauri::command]
pub async fn get_cache_stats(
    clients: State<'_, Arc<MetadataClients>>,
) -> Result<CacheStats, String> {
    clients
        .image_cache
        .get_cache_stats()
        .map_err(|e| e.to_string())
}

/// Clears parts of (or the entire) image cache.
///
/// If `params.all` is `Some(true)`, clears both covers and screenshots.
/// Otherwise, clears based on the individual `params.covers` and
/// `params.screenshots` flags.
#[tauri::command]
pub async fn clear_cache(
    params: ClearCacheParams,
    clients: State<'_, Arc<MetadataClients>>,
) -> Result<(), String> {
    let clear_all = params.all.unwrap_or(false);
    let clear_covers = clear_all || params.covers.unwrap_or(false);
    let clear_screenshots = clear_all || params.screenshots.unwrap_or(false);

    clients
        .image_cache
        .clear_cache(clear_covers, clear_screenshots)
        .map_err(|e| e.to_string())
}

//! Tauri IPC command handlers for user preferences and app reset.

use crate::db::Database;
use crate::metadata::MetadataClients;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::State;

/// Returns all preference key-value pairs.
#[tauri::command]
pub async fn get_preferences(
    db: State<'_, Arc<Database>>,
) -> Result<HashMap<String, String>, String> {
    db.get_preferences().map_err(|e| e.to_string())
}

/// Creates or updates a preference value.
#[tauri::command]
pub async fn set_preference(
    key: String,
    value: String,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.set_preference(&key, &value).map_err(|e| e.to_string())
}

/// Resets the app to a fresh state by purging all user data.
///
/// Clears all games, configurations, preferences, and cached images so the
/// user can restart from the onboarding wizard.
#[tauri::command]
pub async fn reset_to_fresh(
    db: State<'_, Arc<Database>>,
    clients: State<'_, Arc<MetadataClients>>,
) -> Result<u32, String> {
    let games_deleted = db.reset_all_data().map_err(|e| e.to_string())?;
    clients
        .image_cache
        .clear_cache(true, true)
        .map_err(|e| e.to_string())?;
    Ok(games_deleted)
}

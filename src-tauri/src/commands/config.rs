//! Tauri IPC command handlers for user preferences.

use crate::db::Database;
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

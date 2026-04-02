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

/// Fetches release history from the GitHub Releases API.
///
/// Returns a list of non-draft releases sorted by publication date (newest first).
/// Used by the Settings > About panel to display patch notes.
#[tauri::command]
pub async fn fetch_github_releases() -> Result<Vec<crate::models::GitHubRelease>, String> {
    let client = reqwest::Client::new();
    let response = client
        .get("https://api.github.com/repos/Troll-Phace/retrolaunch/releases")
        .header("User-Agent", "RetroLaunch")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("Network error fetching releases: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "GitHub API returned status {}",
            response.status()
        ));
    }

    let releases: Vec<crate::models::GitHubRelease> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse GitHub releases: {e}"))?;

    let releases: Vec<crate::models::GitHubRelease> = releases
        .into_iter()
        .filter(|r| !r.draft)
        .collect();

    Ok(releases)
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

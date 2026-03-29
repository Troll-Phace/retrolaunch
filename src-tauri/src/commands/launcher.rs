//! Tauri IPC command handlers for emulator configuration and game launching.

use crate::db::Database;
use crate::launcher;
use crate::models::{DetectedEmulator, EmulatorConfig, PlayStats};
use std::sync::Arc;
use tauri::{AppHandle, State};

/// Returns all emulator configurations.
#[tauri::command]
pub async fn get_emulator_configs(
    db: State<'_, Arc<Database>>,
) -> Result<Vec<EmulatorConfig>, String> {
    db.get_emulator_configs().map_err(|e| e.to_string())
}

/// Creates or updates an emulator configuration for a system.
#[tauri::command]
pub async fn set_emulator_config(
    config: EmulatorConfig,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.set_emulator_config(&config).map_err(|e| e.to_string())
}

/// Scans common install locations for known emulators.
#[tauri::command]
pub async fn auto_detect_emulators() -> Result<Vec<DetectedEmulator>, String> {
    Ok(launcher::detect::auto_detect_emulators())
}

/// Launches a game in its configured emulator and starts playtime tracking.
///
/// Returns immediately after the emulator process is spawned. A background
/// task monitors the process and emits a `game-session-ended` event when
/// the emulator exits.
#[tauri::command]
pub async fn launch_game(
    app: AppHandle,
    game_id: i64,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    // Check if the game is already running.
    let game = db
        .get_game_by_id(game_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Game not found: {}", game_id))?;

    if game.currently_playing {
        return Err(format!("Game is already running: {}", game_id));
    }

    let db = db.inner().clone();
    launcher::session::launch_and_track(app, db, game_id)
        .await
        .map_err(|e| e.to_string())
}

/// Returns playtime stats for a specific game.
#[tauri::command]
pub async fn get_play_stats(
    game_id: i64,
    db: State<'_, Arc<Database>>,
) -> Result<PlayStats, String> {
    db.get_play_stats(game_id).map_err(|e| e.to_string())
}

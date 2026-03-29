//! Launch-and-track orchestrator: spawns emulator and monitors session lifecycle.

use crate::db::Database;
use crate::launcher::spawn;
use crate::launcher::LauncherError;
use crate::models::GameSessionEnded;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

/// Launches a game and starts async session tracking.
///
/// 1. Looks up the game by ID to get `rom_path` and `system_id`.
/// 2. Resolves emulator config (per-game override first, then system default).
/// 3. Spawns the emulator process.
/// 4. Creates a play session in the database.
/// 5. Spawns a tokio task to monitor the process and end the session on exit.
///
/// Returns `Ok(())` once the process is spawned (does NOT wait for exit).
pub async fn launch_and_track(
    app: AppHandle,
    db: Arc<Database>,
    game_id: i64,
) -> Result<(), LauncherError> {
    // 1. Get game record.
    let game = db
        .get_game_by_id(game_id)
        .map_err(|e| LauncherError::DatabaseError(e.to_string()))?
        .ok_or(LauncherError::GameNotFound(game_id))?;

    // Guard: prevent launching a game that is already running.
    if game.currently_playing {
        return Err(LauncherError::AlreadyRunning(game_id));
    }

    // 2. Resolve emulator config: check per-game override first, then system default.
    let (exe_path, launch_args) =
        if let Ok(Some(override_cfg)) = db.get_game_emulator_override(game_id) {
            (
                override_cfg.executable_path,
                override_cfg
                    .launch_args
                    .unwrap_or_else(|| "\"{rom}\"".to_string()),
            )
        } else if let Ok(Some(config)) = db.get_emulator_config(&game.system_id) {
            (config.executable_path, config.launch_args)
        } else {
            return Err(LauncherError::NoEmulatorConfigured(
                game.system_id.clone(),
            ));
        };

    // 3. Spawn emulator.
    let mut child = spawn::spawn_emulator(&exe_path, &launch_args, &game.rom_path).await?;

    // 4. Create play session.
    let session_id = db
        .start_play_session(game_id)
        .map_err(|e| LauncherError::DatabaseError(e.to_string()))?;

    // 5. Monitor in background — the spawned task waits for the emulator to exit
    //    and then ends the play session.
    let db_clone = db.clone();
    tokio::spawn(async move {
        // Wait for the emulator process to exit.
        let _ = child.wait().await;

        // End the session and emit an event with the duration.
        match db_clone.end_play_session(session_id) {
            Ok(duration) => {
                let payload = GameSessionEnded {
                    game_id,
                    duration_seconds: duration,
                };
                let _ = app.emit("game-session-ended", &payload);
            }
            Err(e) => {
                eprintln!(
                    "Warning: failed to end play session {}: {}",
                    session_id, e
                );
            }
        }
    });

    Ok(())
}

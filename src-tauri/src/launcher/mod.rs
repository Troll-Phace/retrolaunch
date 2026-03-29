//! Emulator process management: auto-detection, spawning, and session tracking.

pub mod detect;
pub mod session;
pub mod spawn;

use thiserror::Error;

/// Errors that can occur during emulator launching and session tracking.
#[derive(Debug, Error)]
pub enum LauncherError {
    #[error("Game not found: id={0}")]
    GameNotFound(i64),

    #[error("No emulator configured for system: {0}")]
    NoEmulatorConfigured(String),

    #[error("Emulator not found at path: {0}")]
    EmulatorNotFound(String),

    #[error("Invalid executable path: {0}")]
    InvalidExecutable(String),

    #[error("Invalid launch arguments: {0}")]
    InvalidArgs(String),

    #[error("Failed to spawn emulator '{executable}': {reason}")]
    SpawnFailed { executable: String, reason: String },

    #[error("Database error: {0}")]
    DatabaseError(String),

    #[error("Game is already running: id={0}")]
    AlreadyRunning(i64),
}

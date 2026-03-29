//! Shared data types used across the RetroLaunch backend.
//!
//! All types derive Serialize + Deserialize for Tauri IPC transport,
//! plus Debug and Clone for general use.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// Represents a supported emulation system (matches the `systems` SQLite table).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct System {
    pub id: String,
    pub name: String,
    pub manufacturer: String,
    pub short_name: String,
    pub generation: Option<i32>,
    /// File extensions associated with this system (parsed from JSON array in DB).
    pub extensions: Vec<String>,
    /// Byte offset for header magic check. -1 means no header check.
    pub header_offset: i32,
    /// Hex string of expected header magic bytes.
    pub header_magic: Option<String>,
    /// Theme color for the system's UI presentation.
    pub theme_color: Option<String>,
}

/// A ROM file discovered during directory scanning, before database insertion.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannedRom {
    pub file_path: PathBuf,
    pub file_name: String,
    pub file_size: u64,
    /// ISO 8601 formatted timestamp of the file's last modification.
    pub last_modified: String,
    pub system_id: String,
    /// CRC32 hash as a lowercase hex string.
    pub crc32: String,
    /// SHA1 hash as a lowercase hex string, if computed.
    pub sha1: Option<String>,
}

/// Full game record matching the `games` SQLite table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Game {
    pub id: i64,
    pub title: String,
    pub system_id: String,
    pub rom_path: String,
    pub rom_hash_crc32: Option<String>,
    pub rom_hash_sha1: Option<String>,
    pub file_size_bytes: Option<i64>,
    pub file_last_modified: Option<String>,
    pub nointro_name: Option<String>,
    pub region: Option<String>,
    pub igdb_id: Option<i64>,
    pub developer: Option<String>,
    pub publisher: Option<String>,
    pub release_date: Option<String>,
    pub genre: Option<String>,
    pub description: Option<String>,
    pub cover_path: Option<String>,
    pub blurhash: Option<String>,
    pub total_playtime_seconds: i64,
    pub last_played_at: Option<String>,
    pub currently_playing: bool,
    pub is_favorite: bool,
    pub date_added: String,
    pub metadata_source: Option<String>,
    pub metadata_fetched_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Event payload emitted during a ROM scan to report progress.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanProgress {
    pub scanned: u32,
    pub total: u32,
    pub current_file: String,
    /// Map of system_id to count of games found for that system so far.
    pub systems_found: HashMap<String, u32>,
}

/// Event payload emitted when a ROM scan completes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanComplete {
    pub total_games: u32,
    pub new_games: u32,
    pub total_systems: u32,
    pub duration_ms: u64,
}

/// Query parameters for fetching games from the database.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GetGamesParams {
    pub system_id: Option<String>,
    pub search: Option<String>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

/// A watched directory entry (matches the `watched_directories` SQLite table).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchedDirectory {
    pub id: i64,
    pub path: String,
    pub last_scanned_at: Option<String>,
    pub game_count: i32,
    pub enabled: bool,
}

/// Result of hashing a ROM file's contents.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RomHashes {
    /// CRC32 hash as a lowercase hex string.
    pub crc32: String,
    /// SHA1 hash as a lowercase hex string, if computed.
    pub sha1: Option<String>,
}

/// A file discovered during directory walking, before system identification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredFile {
    pub path: PathBuf,
    /// Lowercase file extension without the leading dot.
    pub extension: String,
    pub file_size: u64,
    /// ISO 8601 formatted timestamp of the file's last modification.
    pub last_modified: String,
}

/// Emulator configuration for a system (matches `emulator_configs` table).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmulatorConfig {
    /// Database row ID. `None` when creating a new config.
    pub id: Option<i64>,
    pub system_id: String,
    pub system_name: String,
    pub executable_path: String,
    /// Launch argument template. The placeholder `{rom}` is expanded at launch time.
    pub launch_args: String,
    /// JSON array string of supported file extensions, e.g. `["nes","unf"]`.
    pub supported_extensions: String,
    /// Whether this config was created by auto-detection (vs. manual setup).
    pub auto_detected: bool,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// Per-game emulator override (matches `game_emulator_overrides` table).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameEmulatorOverride {
    pub game_id: i64,
    pub executable_path: String,
    pub launch_args: Option<String>,
}

/// An emulator found by auto-detection scan.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedEmulator {
    pub name: String,
    pub executable_path: String,
    pub system_ids: Vec<String>,
    pub default_args: String,
}

/// A single play session record (matches `play_sessions` table).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaySession {
    pub id: i64,
    pub game_id: i64,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub duration_seconds: Option<i64>,
}

/// Aggregated play statistics for a game.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayStats {
    pub game_id: i64,
    pub total_playtime_seconds: i64,
    pub last_played_at: Option<String>,
    pub session_count: i64,
    pub sessions: Vec<PlaySession>,
}

/// Event payload emitted when a game session ends.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameSessionEnded {
    pub game_id: i64,
    pub duration_seconds: i64,
}

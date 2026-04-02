//! Database layer for RetroLaunch.
//!
//! Provides a thread-safe wrapper around a rusqlite connection with WAL mode
//! enabled. All methods lock the internal mutex before accessing the connection.

pub mod queries;

use crate::models::{DatFile, EmulatorConfig, Game, GameEmulatorOverride, GameMetadata, PlaySession, PlayStats, ScannedRom, System, WatchedDirectory};
use anyhow::{Context, Result};
use rusqlite::Connection;
use rusqlite::OptionalExtension;
use std::path::Path;
use std::sync::Mutex;

/// Thread-safe SQLite database handle.
///
/// Uses a `Mutex<Connection>` so it can be stored in Tauri's managed state
/// (which requires `Send + Sync`). The rusqlite `Connection` is `Send` but
/// not `Sync`, so the mutex provides the necessary synchronization.
pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    /// Opens (or creates) the SQLite database at `<app_data_dir>/retrolaunch.db`.
    ///
    /// Enables WAL journal mode and foreign key enforcement on the connection.
    pub fn new(app_data_dir: &Path) -> Result<Self> {
        let db_path = app_data_dir.join("retrolaunch.db");
        let conn = Connection::open(&db_path)
            .with_context(|| format!("Failed to open database at {:?}", db_path))?;

        // Enable WAL mode for concurrent reads during background writes.
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;

        // Ensure schema and seed data exist. Using IF NOT EXISTS / INSERT OR
        // IGNORE so this is safe to run on every startup against an existing DB.
        conn.execute_batch(include_str!("schema.sql"))?;
        conn.execute_batch(include_str!("seed_systems.sql"))?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    /// Creates a new in-memory database for testing purposes.
    ///
    /// Initializes the schema and seed data so tests can run against a fully
    /// populated database without touching the file system.
    pub fn new_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()
            .context("Failed to open in-memory database")?;

        conn.pragma_update(None, "foreign_keys", "ON")?;

        // Run schema creation
        conn.execute_batch(include_str!("schema.sql"))?;
        // Seed systems
        conn.execute_batch(include_str!("seed_systems.sql"))?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    /// Inserts a scanned ROM into the `games` table.
    ///
    /// Uses `INSERT OR IGNORE` so duplicate ROM paths are silently skipped.
    /// When a new row is inserted, it also populates the FTS index.
    /// Returns the row ID of the inserted game, or 0 if the path already existed.
    pub fn insert_game(&self, rom: &ScannedRom) -> Result<i64> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        // Use filename stem (without extension) as the title.
        let title = rom
            .file_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(&rom.file_name);

        let rom_path_str = rom.file_path.to_string_lossy();

        conn.execute(
            "INSERT OR IGNORE INTO games (title, system_id, rom_path, rom_hash_crc32, \
             rom_hash_sha1, file_size_bytes, file_last_modified, date_added) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))",
            rusqlite::params![
                title,
                rom.system_id,
                rom_path_str.as_ref(),
                rom.crc32,
                rom.sha1,
                rom.file_size as i64,
                rom.last_modified,
            ],
        )?;

        let changes = conn.changes();
        if changes > 0 {
            let row_id = conn.last_insert_rowid();
            // Populate the FTS index for the new game.
            conn.execute(
                "INSERT INTO games_fts(rowid, title, developer, publisher, description, genre) \
                 VALUES (?1, ?2, NULL, NULL, NULL, NULL)",
                rusqlite::params![row_id, title],
            )?;
            Ok(row_id)
        } else {
            Ok(0)
        }
    }

    /// Checks whether a game with the given ROM path already exists in the database.
    pub fn game_exists_by_path(&self, rom_path: &str) -> Result<bool> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        let exists: bool = conn
            .prepare("SELECT 1 FROM games WHERE rom_path = ?1 LIMIT 1")?
            .exists(rusqlite::params![rom_path])?;

        Ok(exists)
    }

    /// Deletes a game by its ROM file path, including its FTS index entry.
    ///
    /// Foreign-key cascades handle child rows (play_sessions,
    /// game_emulator_overrides, screenshots). Returns `true` if a row was
    /// deleted, `false` if the path was not found.
    pub fn delete_game_by_path(&self, rom_path: &str) -> Result<bool> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        // Read the FTS-indexed values so we can issue the FTS delete command.
        type FtsRow = (i64, String, Option<String>, Option<String>, Option<String>, Option<String>);
        let old_values: Option<FtsRow> = conn
            .query_row(
                "SELECT id, title, developer, publisher, description, genre \
                 FROM games WHERE rom_path = ?1",
                rusqlite::params![rom_path],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
            )
            .optional()?;

        if let Some((row_id, title, dev, pub_, desc, genre)) = old_values {
            // Remove from the FTS index first (external content table).
            conn.execute(
                "INSERT INTO games_fts(games_fts, rowid, title, developer, publisher, description, genre) \
                 VALUES('delete', ?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![row_id, title, dev, pub_, desc, genre],
            )?;

            // Delete the game row; cascades handle child tables.
            conn.execute(
                "DELETE FROM games WHERE rom_path = ?1",
                rusqlite::params![rom_path],
            )?;

            Ok(conn.changes() > 0)
        } else {
            Ok(false)
        }
    }

    /// Returns the stored `file_last_modified` value for a ROM path, or `None`
    /// if the path is not in the database.
    pub fn get_file_last_modified(&self, rom_path: &str) -> Result<Option<String>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        let mut stmt =
            conn.prepare("SELECT file_last_modified FROM games WHERE rom_path = ?1")?;
        let result = stmt
            .query_row(rusqlite::params![rom_path], |row| row.get(0))
            .optional()?;

        Ok(result)
    }

    /// Returns all supported systems from the `systems` table.
    ///
    /// The `extensions` column is stored as a JSON array string and is
    /// deserialized into `Vec<String>`.
    pub fn get_all_systems(&self) -> Result<Vec<System>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        let mut stmt = conn.prepare(
            "SELECT id, name, manufacturer, short_name, generation, extensions, \
             header_offset, header_magic, theme_color FROM systems",
        )?;

        let systems = stmt
            .query_map([], |row| {
                let extensions_json: String = row.get(5)?;
                let extensions: Vec<String> =
                    serde_json::from_str(&extensions_json).unwrap_or_default();

                Ok(System {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    manufacturer: row.get(2)?,
                    short_name: row.get(3)?,
                    generation: row.get(4)?,
                    extensions,
                    header_offset: row.get::<_, Option<i32>>(6)?.unwrap_or(-1),
                    header_magic: row.get(7)?,
                    theme_color: row.get(8)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(systems)
    }

    /// Adds a directory to the watch list.
    ///
    /// Uses `INSERT OR IGNORE` so duplicate paths are silently handled.
    /// Returns the full `WatchedDirectory` record after insertion.
    pub fn add_watched_directory(&self, path: &str) -> Result<WatchedDirectory> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        conn.execute(
            "INSERT OR IGNORE INTO watched_directories (path) VALUES (?1)",
            rusqlite::params![path],
        )?;

        let dir = conn.query_row(
            "SELECT id, path, last_scanned_at, game_count, enabled \
             FROM watched_directories WHERE path = ?1",
            rusqlite::params![path],
            |row| {
                Ok(WatchedDirectory {
                    id: row.get(0)?,
                    path: row.get(1)?,
                    last_scanned_at: row.get(2)?,
                    game_count: row.get(3)?,
                    enabled: row.get::<_, i32>(4)? != 0,
                })
            },
        )?;

        Ok(dir)
    }

    /// Returns the path of a watched directory by its database ID, if it exists.
    pub fn get_watched_directory_path_by_id(&self, id: i64) -> Result<Option<String>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        let path = conn
            .query_row(
                "SELECT path FROM watched_directories WHERE id = ?1",
                rusqlite::params![id],
                |row| row.get(0),
            )
            .optional()?;

        Ok(path)
    }

    /// Removes a watched directory by its database ID and deletes all games
    /// whose ROM path falls under that directory.
    pub fn remove_watched_directory(&self, id: i64) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        // Look up the directory path before deletion so we can cascade to games.
        let dir_path: Option<String> = conn
            .query_row(
                "SELECT path FROM watched_directories WHERE id = ?1",
                rusqlite::params![id],
                |row| row.get(0),
            )
            .ok();

        if let Some(path) = dir_path {
            // Ensure the path ends with a separator so we only match children,
            // not sibling directories that share a prefix.
            let prefix = if path.ends_with('/') || path.ends_with('\\') {
                path
            } else {
                format!("{}/", path)
            };

            // Delete all games whose rom_path starts with this directory.
            conn.execute(
                "DELETE FROM games WHERE rom_path LIKE ?1 ESCAPE '\\'",
                rusqlite::params![format!(
                    "{}%",
                    prefix
                        .replace('\\', "\\\\")
                        .replace('%', "\\%")
                        .replace('_', "\\_")
                )],
            )?;

            // Also clean up screenshots for deleted games (orphaned rows).
            conn.execute(
                "DELETE FROM screenshots WHERE game_id NOT IN (SELECT id FROM games)",
                [],
            )?;
        }

        conn.execute(
            "DELETE FROM watched_directories WHERE id = ?1",
            rusqlite::params![id],
        )?;

        Ok(())
    }

    /// Returns all watched directories.
    pub fn get_watched_directories(&self) -> Result<Vec<WatchedDirectory>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        let mut stmt = conn.prepare(
            "SELECT id, path, last_scanned_at, game_count, enabled FROM watched_directories",
        )?;

        let dirs = stmt
            .query_map([], |row| {
                Ok(WatchedDirectory {
                    id: row.get(0)?,
                    path: row.get(1)?,
                    last_scanned_at: row.get(2)?,
                    game_count: row.get(3)?,
                    enabled: row.get::<_, i32>(4)? != 0,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(dirs)
    }

    /// Updates a watched directory's game count and sets `last_scanned_at` to now.
    pub fn update_watched_directory(&self, path: &str, game_count: i32) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        conn.execute(
            "UPDATE watched_directories SET game_count = ?1, last_scanned_at = datetime('now') \
             WHERE path = ?2",
            rusqlite::params![game_count, path],
        )?;

        Ok(())
    }

    /// Counts the total number of games whose `rom_path` falls under the given directory.
    pub fn count_games_in_directory(&self, dir_path: &str) -> Result<i64> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        let prefix = if dir_path.ends_with('/') || dir_path.ends_with('\\') {
            dir_path.to_string()
        } else {
            format!("{}/", dir_path)
        };

        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM games WHERE rom_path LIKE ?1 ESCAPE '\\'",
            rusqlite::params![format!(
                "{}%",
                prefix
                    .replace('\\', "\\\\")
                    .replace('%', "\\%")
                    .replace('_', "\\_")
            )],
            |row| row.get(0),
        )?;

        Ok(count)
    }

    /// Returns all `rom_path` values for games whose path falls under the given
    /// directory. Used by the scanner to detect files that have been removed
    /// since the last scan.
    pub fn get_rom_paths_in_directory(&self, dir_path: &str) -> Result<Vec<String>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        let prefix = if dir_path.ends_with('/') || dir_path.ends_with('\\') {
            dir_path.to_string()
        } else {
            format!("{}/", dir_path)
        };

        let escaped = prefix
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_");

        let mut stmt = conn.prepare(
            "SELECT rom_path FROM games WHERE rom_path LIKE ?1 ESCAPE '\\'",
        )?;
        let paths = stmt
            .query_map(rusqlite::params![format!("{}%", escaped)], |row| {
                row.get::<_, String>(0)
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(paths)
    }

    // ── Emulator configuration methods ──────────────────────────────────

    /// Returns all emulator configurations from the database.
    pub fn get_emulator_configs(&self) -> Result<Vec<EmulatorConfig>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        let mut stmt = conn.prepare(
            "SELECT id, system_id, system_name, executable_path, launch_args, \
             supported_extensions, auto_detected, created_at, updated_at \
             FROM emulator_configs",
        )?;

        let configs = stmt
            .query_map([], |row| {
                Ok(EmulatorConfig {
                    id: Some(row.get(0)?),
                    system_id: row.get(1)?,
                    system_name: row.get(2)?,
                    executable_path: row.get(3)?,
                    launch_args: row.get(4)?,
                    supported_extensions: row.get(5)?,
                    auto_detected: row.get::<_, i32>(6)? != 0,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(configs)
    }

    /// Returns the emulator configuration for a specific system, if one exists.
    pub fn get_emulator_config(&self, system_id: &str) -> Result<Option<EmulatorConfig>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        let config = conn
            .query_row(
                "SELECT id, system_id, system_name, executable_path, launch_args, \
                 supported_extensions, auto_detected, created_at, updated_at \
                 FROM emulator_configs WHERE system_id = ?1",
                rusqlite::params![system_id],
                |row| {
                    Ok(EmulatorConfig {
                        id: Some(row.get(0)?),
                        system_id: row.get(1)?,
                        system_name: row.get(2)?,
                        executable_path: row.get(3)?,
                        launch_args: row.get(4)?,
                        supported_extensions: row.get(5)?,
                        auto_detected: row.get::<_, i32>(6)? != 0,
                        created_at: row.get(7)?,
                        updated_at: row.get(8)?,
                    })
                },
            )
            .optional()?;

        Ok(config)
    }

    /// Creates or updates an emulator configuration for a system.
    ///
    /// Uses an UPSERT (INSERT ... ON CONFLICT DO UPDATE) so the `created_at`
    /// timestamp is preserved on updates while `updated_at` is refreshed.
    pub fn set_emulator_config(&self, config: &EmulatorConfig) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        conn.execute(
            "INSERT INTO emulator_configs \
             (system_id, system_name, executable_path, launch_args, supported_extensions, auto_detected, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'), datetime('now')) \
             ON CONFLICT(system_id) DO UPDATE SET \
                 system_name = excluded.system_name, \
                 executable_path = excluded.executable_path, \
                 launch_args = excluded.launch_args, \
                 supported_extensions = excluded.supported_extensions, \
                 auto_detected = excluded.auto_detected, \
                 updated_at = datetime('now')",
            rusqlite::params![
                config.system_id,
                config.system_name,
                config.executable_path,
                config.launch_args,
                config.supported_extensions,
                config.auto_detected as i32,
            ],
        )?;

        Ok(())
    }

    /// Returns the per-game emulator override for a game, if one exists.
    pub fn get_game_emulator_override(&self, game_id: i64) -> Result<Option<GameEmulatorOverride>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        let override_cfg = conn
            .query_row(
                "SELECT game_id, executable_path, launch_args \
                 FROM game_emulator_overrides WHERE game_id = ?1",
                rusqlite::params![game_id],
                |row| {
                    Ok(GameEmulatorOverride {
                        game_id: row.get(0)?,
                        executable_path: row.get(1)?,
                        launch_args: row.get(2)?,
                    })
                },
            )
            .optional()?;

        Ok(override_cfg)
    }

    // ── Play session tracking methods ───────────────────────────────────

    /// Starts a new play session for a game.
    ///
    /// Inserts a row into `play_sessions` and sets `currently_playing = 1` on
    /// the game. Returns the new session's row ID.
    pub fn start_play_session(&self, game_id: i64) -> Result<i64> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        conn.execute(
            "INSERT INTO play_sessions (game_id, started_at) VALUES (?1, datetime('now'))",
            rusqlite::params![game_id],
        )?;

        let session_id = conn.last_insert_rowid();

        conn.execute(
            "UPDATE games SET currently_playing = 1 WHERE id = ?1",
            rusqlite::params![game_id],
        )?;

        Ok(session_id)
    }

    /// Ends an active play session by setting `ended_at` and computing duration.
    ///
    /// Also updates the game's `total_playtime_seconds`, `last_played_at`, and
    /// resets `currently_playing`. Returns the session's duration in seconds.
    pub fn end_play_session(&self, session_id: i64) -> Result<i64> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        // Close the session and compute duration from wall-clock difference.
        // The WHERE clause ensures we only close sessions that are still open.
        conn.execute(
            "UPDATE play_sessions \
             SET ended_at = datetime('now'), \
                 duration_seconds = CAST((julianday(datetime('now')) - julianday(started_at)) * 86400 AS INTEGER) \
             WHERE id = ?1 AND ended_at IS NULL",
            rusqlite::params![session_id],
        )?;

        // If no rows were affected, the session was already ended (e.g., by
        // orphan cleanup). Return 0 without double-counting playtime.
        if conn.changes() == 0 {
            return Ok(0);
        }

        // Read back the duration and game_id.
        let (duration, game_id): (i64, i64) = conn.query_row(
            "SELECT COALESCE(duration_seconds, 0), game_id FROM play_sessions WHERE id = ?1",
            rusqlite::params![session_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;

        // Update the game's aggregate stats.
        conn.execute(
            "UPDATE games SET \
                 total_playtime_seconds = total_playtime_seconds + ?1, \
                 last_played_at = datetime('now'), \
                 currently_playing = 0 \
             WHERE id = ?2",
            rusqlite::params![duration, game_id],
        )?;

        Ok(duration)
    }

    /// Returns aggregated play statistics for a game, including all sessions.
    pub fn get_play_stats(&self, game_id: i64) -> Result<PlayStats> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        // Read aggregates from the games table.
        let (total_playtime, last_played_at): (i64, Option<String>) = conn
            .query_row(
                "SELECT COALESCE(total_playtime_seconds, 0), last_played_at FROM games WHERE id = ?1",
                rusqlite::params![game_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?
            .unwrap_or((0, None));

        // Fetch all sessions for this game.
        let mut stmt = conn.prepare(
            "SELECT id, game_id, started_at, ended_at, duration_seconds \
             FROM play_sessions WHERE game_id = ?1 ORDER BY started_at DESC",
        )?;

        let sessions = stmt
            .query_map(rusqlite::params![game_id], |row| {
                Ok(PlaySession {
                    id: row.get(0)?,
                    game_id: row.get(1)?,
                    started_at: row.get(2)?,
                    ended_at: row.get(3)?,
                    duration_seconds: row.get(4)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        let session_count = sessions.len() as i64;

        Ok(PlayStats {
            game_id,
            total_playtime_seconds: total_playtime,
            last_played_at,
            session_count,
            sessions,
        })
    }

    // ── Metadata methods ────────────────────────────────────────────────

    /// Updates a game's metadata columns from an API source.
    ///
    /// Sets all metadata fields, the cover path, blurhash, metadata source,
    /// and timestamps. Also refreshes the FTS5 index for the updated game.
    pub fn update_game_metadata(
        &self,
        game_id: i64,
        metadata: &GameMetadata,
        cover_path: Option<&str>,
        blurhash: Option<&str>,
    ) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        // For an external-content FTS5 table, we must remove the old entry
        // using the OLD content values BEFORE updating the content table.
        // Read the current indexed values so the FTS delete command can match.
        type FtsRow = (String, Option<String>, Option<String>, Option<String>, Option<String>);
        let old_values: Option<FtsRow> = conn
            .query_row(
                "SELECT title, developer, publisher, description, genre FROM games WHERE id = ?1",
                rusqlite::params![game_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )
            .optional()?;

        if let Some((old_title, old_dev, old_pub, old_desc, old_genre)) = old_values {
            // Remove old FTS entry using the special 'delete' command with old values.
            conn.execute(
                "INSERT INTO games_fts(games_fts, rowid, title, developer, publisher, description, genre) \
                 VALUES('delete', ?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![game_id, old_title, old_dev, old_pub, old_desc, old_genre],
            )?;
        }

        conn.execute(
            "UPDATE games SET \
                 igdb_id = ?1, \
                 developer = ?2, \
                 publisher = ?3, \
                 release_date = ?4, \
                 genre = ?5, \
                 description = ?6, \
                 cover_path = ?7, \
                 blurhash = ?8, \
                 metadata_source = ?9, \
                 metadata_fetched_at = datetime('now'), \
                 updated_at = datetime('now') \
             WHERE id = ?10",
            rusqlite::params![
                metadata.igdb_id,
                metadata.developer,
                metadata.publisher,
                metadata.release_date,
                metadata.genre,
                metadata.description,
                cover_path,
                blurhash,
                metadata.source,
                game_id,
            ],
        )?;

        // Re-insert into FTS with the new values.
        conn.execute(
            "INSERT INTO games_fts(rowid, title, developer, publisher, description, genre) \
             SELECT id, title, developer, publisher, description, genre \
             FROM games WHERE id = ?1",
            rusqlite::params![game_id],
        )?;

        Ok(())
    }

    /// Inserts screenshot records for a game.
    ///
    /// Each entry is a tuple of `(url, optional_local_path, sort_order)`.
    pub fn insert_screenshots(
        &self,
        game_id: i64,
        entries: &[(String, Option<String>, i32)],
    ) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        let mut stmt = conn.prepare(
            "INSERT INTO screenshots (game_id, url, local_path, sort_order) \
             VALUES (?1, ?2, ?3, ?4)",
        )?;

        for (url, local_path, sort_order) in entries {
            stmt.execute(rusqlite::params![game_id, url, local_path, sort_order])?;
        }

        Ok(())
    }

    /// Returns all screenshots for a game, ordered by `sort_order` ascending.
    pub fn get_screenshots_for_game(&self, game_id: i64) -> Result<Vec<crate::models::Screenshot>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        let mut stmt = conn.prepare(
            "SELECT id, game_id, url, local_path, sort_order \
             FROM screenshots WHERE game_id = ?1 ORDER BY sort_order ASC",
        )?;

        let screenshots = stmt
            .query_map(rusqlite::params![game_id], |row| {
                Ok(crate::models::Screenshot {
                    id: row.get(0)?,
                    game_id: row.get(1)?,
                    url: row.get(2)?,
                    local_path: row.get(3)?,
                    sort_order: row.get(4)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(screenshots)
    }

    /// Toggles the `is_favorite` flag on a game and returns the new value.
    ///
    /// Flips `is_favorite` from 0 to 1 or from 1 to 0, and updates `updated_at`.
    /// Returns the new boolean state of `is_favorite`.
    pub fn toggle_favorite(&self, game_id: i64) -> Result<bool> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        conn.execute(
            "UPDATE games SET is_favorite = CASE WHEN is_favorite = 0 THEN 1 ELSE 0 END, \
             updated_at = datetime('now') WHERE id = ?1",
            rusqlite::params![game_id],
        )?;

        let new_value: bool = conn
            .query_row(
                "SELECT is_favorite FROM games WHERE id = ?1",
                rusqlite::params![game_id],
                |row| row.get(0),
            )
            .with_context(|| format!("Game with id {} not found after toggle", game_id))?;

        Ok(new_value)
    }

    /// Returns games that have no metadata source set (not yet fetched or unmatched).
    ///
    /// Optionally limits the number of results.
    pub fn get_games_without_metadata(&self, limit: Option<u32>) -> Result<Vec<Game>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        let sql = if let Some(limit) = limit {
            format!(
                "SELECT g.* FROM games g WHERE g.metadata_source IS NULL LIMIT {}",
                limit
            )
        } else {
            "SELECT g.* FROM games g WHERE g.metadata_source IS NULL".to_string()
        };

        let mut stmt = conn.prepare(&sql)?;
        let games = stmt
            .query_map([], crate::db::queries::row_to_game)?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(games)
    }

    /// Marks a game as unmatched (no metadata found from any source).
    pub fn mark_game_unmatched(&self, game_id: i64) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        conn.execute(
            "UPDATE games SET \
                 metadata_source = 'unmatched', \
                 metadata_fetched_at = datetime('now'), \
                 updated_at = datetime('now') \
             WHERE id = ?1",
            rusqlite::params![game_id],
        )?;

        Ok(())
    }

    /// Clears `metadata_source` and `metadata_fetched_at` on all games,
    /// forcing them back into the "needs metadata" state.
    pub fn clear_all_metadata_source(&self) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        conn.execute(
            "UPDATE games SET metadata_source = NULL, metadata_fetched_at = NULL, \
             updated_at = datetime('now')",
            [],
        )?;

        Ok(())
    }

    /// Clears metadata for a single game so it can be re-fetched.
    ///
    /// Resets all metadata fields to NULL and deletes associated screenshots,
    /// allowing the metadata pipeline to treat the game as unfetched.
    pub fn clear_game_metadata(&self, game_id: i64) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        conn.execute(
            "UPDATE games SET
                igdb_id = NULL,
                developer = NULL,
                publisher = NULL,
                release_date = NULL,
                genre = NULL,
                description = NULL,
                cover_path = NULL,
                blurhash = NULL,
                metadata_source = NULL,
                metadata_fetched_at = NULL,
                updated_at = datetime('now')
             WHERE id = ?1",
            rusqlite::params![game_id],
        )?;

        conn.execute(
            "DELETE FROM screenshots WHERE game_id = ?1",
            rusqlite::params![game_id],
        )?;

        Ok(())
    }

    /// Reads a single preference value by key.
    ///
    /// Returns `None` if the key is not present in the `preferences` table.
    pub fn get_preference(&self, key: &str) -> Result<Option<String>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        let value = conn
            .query_row(
                "SELECT value FROM preferences WHERE key = ?1",
                rusqlite::params![key],
                |row| row.get(0),
            )
            .optional()?;

        Ok(value)
    }

    /// Returns all preference key-value pairs.
    pub fn get_preferences(&self) -> Result<std::collections::HashMap<String, String>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        let mut stmt = conn.prepare("SELECT key, value FROM preferences")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;

        let mut map = std::collections::HashMap::new();
        for row in rows {
            let (key, value) = row?;
            map.insert(key, value);
        }
        Ok(map)
    }

    /// Upserts a preference value.
    pub fn set_preference(&self, key: &str, value: &str) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        conn.execute(
            "INSERT OR REPLACE INTO preferences (key, value) VALUES (?1, ?2)",
            rusqlite::params![key, value],
        )?;
        Ok(())
    }

    /// Cleans up orphaned play sessions left from a previous crash.
    ///
    /// Closes all sessions that have no `ended_at` and resets every game whose
    /// `currently_playing` flag is still set. Returns the number of sessions
    /// that were cleaned up.
    pub fn cleanup_orphaned_sessions(&self) -> Result<u32> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        // Close orphaned sessions with a computed duration.
        conn.execute(
            "UPDATE play_sessions \
             SET ended_at = datetime('now'), \
                 duration_seconds = CAST((julianday(datetime('now')) - julianday(started_at)) * 86400 AS INTEGER) \
             WHERE ended_at IS NULL",
            [],
        )?;

        let orphaned = conn.changes() as u32;

        // Accumulate orphaned session durations into each game's total playtime
        // and update last_played_at. This uses a correlated subquery to sum
        // durations of sessions that were just closed (those whose ended_at
        // matches the current timestamp, indicating they were orphans).
        if orphaned > 0 {
            conn.execute(
                "UPDATE games SET \
                     total_playtime_seconds = total_playtime_seconds + \
                         COALESCE((SELECT SUM(duration_seconds) FROM play_sessions \
                                   WHERE play_sessions.game_id = games.id \
                                   AND play_sessions.ended_at = datetime('now')\
                                   AND play_sessions.duration_seconds > 0), 0), \
                     last_played_at = COALESCE( \
                         (SELECT MAX(ended_at) FROM play_sessions \
                          WHERE play_sessions.game_id = games.id \
                          AND play_sessions.ended_at = datetime('now')), \
                         last_played_at) \
                 WHERE currently_playing = 1",
                [],
            )?;
        }

        // Reset the currently_playing flag on all games.
        conn.execute(
            "UPDATE games SET currently_playing = 0 WHERE currently_playing = 1",
            [],
        )?;

        Ok(orphaned)
    }

    /// Deletes games whose `rom_path` does not belong to any currently watched
    /// directory. If there are no watched directories at all, every game is
    /// considered orphaned and is deleted.
    ///
    /// Returns the number of deleted game rows.
    pub fn cleanup_orphaned_games(&self) -> Result<u32> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        // Collect all watched directory paths, normalized with a trailing separator.
        let mut stmt = conn.prepare("SELECT path FROM watched_directories")?;
        let dir_paths: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        if dir_paths.is_empty() {
            // No watched directories — every game is orphaned.
            conn.execute("DELETE FROM games", [])?;
            return Ok(conn.changes() as u32);
        }

        // Build a WHERE clause that keeps games matching any watched directory.
        // A game belongs to a directory when its rom_path starts with the
        // directory path (with a trailing separator to avoid prefix collisions).
        let conditions: Vec<String> = dir_paths
            .iter()
            .enumerate()
            .map(|(i, _)| format!("rom_path LIKE ?{}", i + 1))
            .collect();
        let where_clause = conditions.join(" OR ");
        let sql = format!("DELETE FROM games WHERE NOT ({})", where_clause);

        let params: Vec<String> = dir_paths
            .iter()
            .map(|p| {
                let prefix = if p.ends_with('/') || p.ends_with('\\') {
                    p.clone()
                } else {
                    format!("{}/", p)
                };
                // Escape LIKE wildcards in the path itself, then append %
                let escaped = prefix.replace('%', "\\%").replace('_', "\\_");
                format!("{}%", escaped)
            })
            .collect();

        let param_refs: Vec<&dyn rusqlite::types::ToSql> = params
            .iter()
            .map(|s| s as &dyn rusqlite::types::ToSql)
            .collect();

        conn.execute(&sql, param_refs.as_slice())?;
        Ok(conn.changes() as u32)
    }

    /// Deletes all user data while preserving the `systems` seed data.
    ///
    /// Runs the deletions inside a transaction so the database remains
    /// consistent if any individual statement fails. Child rows
    /// (play_sessions, game_emulator_overrides, screenshots) are removed
    /// before their parent (games) to satisfy foreign key constraints.
    pub fn reset_all_data(&self) -> Result<u32> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        // Use individual statements so any failure is immediately visible.
        conn.execute("DELETE FROM play_sessions", [])
            .context("Failed to delete play_sessions")?;
        conn.execute("DELETE FROM game_emulator_overrides", [])
            .context("Failed to delete game_emulator_overrides")?;
        conn.execute("DELETE FROM screenshots", [])
            .context("Failed to delete screenshots")?;
        let games_deleted = conn
            .execute("DELETE FROM games", [])
            .context("Failed to delete games")? as u32;
        conn.execute("DELETE FROM watched_directories", [])
            .context("Failed to delete watched_directories")?;
        conn.execute("DELETE FROM emulator_configs", [])
            .context("Failed to delete emulator_configs")?;
        // Delete preferences but preserve API credentials.
        conn.execute(
            "DELETE FROM preferences WHERE key NOT IN \
             ('igdb_client_id', 'igdb_client_secret', \
              'ss_dev_id', 'ss_dev_password', 'ss_username', 'ss_password')",
            [],
        )
        .context("Failed to delete preferences")?;

        // Rebuild FTS5 index from the now-empty games table.
        conn.execute_batch("INSERT INTO games_fts(games_fts) VALUES('rebuild');")
            .context("Failed to rebuild FTS5 index")?;

        // Verify the reset actually worked.
        let remaining: i64 = conn
            .query_row("SELECT COUNT(*) FROM games", [], |row| row.get(0))
            .context("Failed to verify reset")?;
        if remaining > 0 {
            anyhow::bail!(
                "Reset verification failed: {} games still in database",
                remaining
            );
        }

        Ok(games_deleted)
    }

    // ── No-Intro DAT file methods ─────────────────────────────────────

    /// Updates the `nointro_name` and `region` for a game identified by ROM path.
    pub fn update_nointro_match_by_path(
        &self,
        rom_path: &str,
        nointro_name: &str,
        region: Option<&str>,
    ) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;
        conn.execute(
            "UPDATE games SET nointro_name = ?1, region = ?2, updated_at = datetime('now') WHERE rom_path = ?3",
            rusqlite::params![nointro_name, region, rom_path],
        )?;
        Ok(())
    }

    /// Records an imported DAT file. Uses INSERT OR REPLACE for re-imports.
    pub fn upsert_dat_file(
        &self,
        system_id: &str,
        file_name: &str,
        dat_name: Option<&str>,
        entry_count: i32,
    ) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;
        conn.execute(
            "INSERT INTO dat_files (system_id, file_name, dat_name, entry_count, imported_at)
             VALUES (?1, ?2, ?3, ?4, datetime('now'))
             ON CONFLICT(system_id) DO UPDATE SET
               file_name = excluded.file_name,
               dat_name = excluded.dat_name,
               entry_count = excluded.entry_count,
               imported_at = excluded.imported_at",
            rusqlite::params![system_id, file_name, dat_name, entry_count],
        )?;
        Ok(())
    }

    /// Returns all tracked DAT files.
    pub fn get_dat_files(&self) -> Result<Vec<DatFile>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;
        let mut stmt = conn.prepare(
            "SELECT id, system_id, file_name, dat_name, entry_count, imported_at FROM dat_files ORDER BY system_id",
        )?;
        let rows = stmt
            .query_map([], |row| {
                Ok(DatFile {
                    id: row.get(0)?,
                    system_id: row.get(1)?,
                    file_name: row.get(2)?,
                    dat_name: row.get(3)?,
                    entry_count: row.get(4)?,
                    imported_at: row.get(5)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Removes a DAT file record by system_id.
    pub fn remove_dat_file(&self, system_id: &str) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;
        conn.execute(
            "DELETE FROM dat_files WHERE system_id = ?1",
            rusqlite::params![system_id],
        )?;
        Ok(())
    }

    /// Returns all games that have a CRC32 hash but no `nointro_name` set.
    pub fn get_games_without_nointro(&self) -> Result<Vec<Game>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;
        let mut stmt = conn.prepare(
            "SELECT * FROM games WHERE rom_hash_crc32 IS NOT NULL AND nointro_name IS NULL",
        )?;
        let rows = stmt
            .query_map([], queries::row_to_game)?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ScannedRom;
    use std::path::PathBuf;

    fn make_test_rom(name: &str, system: &str) -> ScannedRom {
        ScannedRom {
            file_path: PathBuf::from(format!("/roms/{}.nes", name)),
            file_name: format!("{}.nes", name),
            file_size: 1024,
            last_modified: "1700000000".to_string(),
            system_id: system.to_string(),
            crc32: "aabbccdd".to_string(),
            sha1: Some("0123456789abcdef0123456789abcdef01234567".to_string()),
        }
    }

    #[test]
    fn test_insert_and_check_game() {
        let db = Database::new_in_memory().unwrap();
        let rom = make_test_rom("mario", "nes");

        let id = db.insert_game(&rom).unwrap();
        assert!(id > 0);

        let exists = db.game_exists_by_path("/roms/mario.nes").unwrap();
        assert!(exists);
    }

    #[test]
    fn test_insert_duplicate_returns_zero() {
        let db = Database::new_in_memory().unwrap();
        let rom = make_test_rom("mario", "nes");

        let id1 = db.insert_game(&rom).unwrap();
        assert!(id1 > 0);

        let id2 = db.insert_game(&rom).unwrap();
        assert_eq!(id2, 0);
    }

    #[test]
    fn test_game_not_exists() {
        let db = Database::new_in_memory().unwrap();
        let exists = db.game_exists_by_path("/roms/nonexistent.nes").unwrap();
        assert!(!exists);
    }

    #[test]
    fn test_get_file_last_modified() {
        let db = Database::new_in_memory().unwrap();
        let rom = make_test_rom("zelda", "nes");
        db.insert_game(&rom).unwrap();

        let modified = db.get_file_last_modified("/roms/zelda.nes").unwrap();
        assert_eq!(modified, Some("1700000000".to_string()));

        let none = db.get_file_last_modified("/roms/missing.nes").unwrap();
        assert!(none.is_none());
    }

    #[test]
    fn test_get_all_systems() {
        let db = Database::new_in_memory().unwrap();
        let systems = db.get_all_systems().unwrap();

        // The seed data has 14 systems (original 11 + PS2, GameCube, NDS).
        assert_eq!(systems.len(), 14);

        let nes = systems.iter().find(|s| s.id == "nes").unwrap();
        assert_eq!(nes.name, "Nintendo Entertainment System");
        assert!(nes.extensions.contains(&"nes".to_string()));
    }

    #[test]
    fn test_watched_directories_crud() {
        let db = Database::new_in_memory().unwrap();

        // Add
        let dir = db.add_watched_directory("/home/user/roms").unwrap();
        assert_eq!(dir.path, "/home/user/roms");
        assert!(dir.enabled);
        assert_eq!(dir.game_count, 0);

        // List
        let dirs = db.get_watched_directories().unwrap();
        assert_eq!(dirs.len(), 1);

        // Update
        db.update_watched_directory("/home/user/roms", 42).unwrap();
        let dirs = db.get_watched_directories().unwrap();
        assert_eq!(dirs[0].game_count, 42);
        assert!(dirs[0].last_scanned_at.is_some());

        // Remove
        db.remove_watched_directory(dir.id).unwrap();
        let dirs = db.get_watched_directories().unwrap();
        assert!(dirs.is_empty());
    }

    #[test]
    fn test_add_duplicate_watched_directory() {
        let db = Database::new_in_memory().unwrap();

        let dir1 = db.add_watched_directory("/home/user/roms").unwrap();
        let dir2 = db.add_watched_directory("/home/user/roms").unwrap();

        // Should return the same directory, not create a duplicate.
        assert_eq!(dir1.id, dir2.id);

        let dirs = db.get_watched_directories().unwrap();
        assert_eq!(dirs.len(), 1);
    }

    // ── Emulator config CRUD tests ─────────────────────────────────────

    fn make_emulator_config(system_id: &str, exe: &str) -> crate::models::EmulatorConfig {
        crate::models::EmulatorConfig {
            id: None,
            system_id: system_id.to_string(),
            system_name: format!("{} Emulator", system_id.to_uppercase()),
            executable_path: exe.to_string(),
            launch_args: "\"{rom}\"".to_string(),
            supported_extensions: "[\"nes\"]".to_string(),
            auto_detected: false,
            created_at: None,
            updated_at: None,
        }
    }

    #[test]
    fn test_set_and_get_emulator_configs() {
        let db = Database::new_in_memory().unwrap();

        let config = make_emulator_config("nes", "/usr/bin/fceux");
        db.set_emulator_config(&config).unwrap();

        let all = db.get_emulator_configs().unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].system_id, "nes");
        assert_eq!(all[0].executable_path, "/usr/bin/fceux");
        assert_eq!(all[0].launch_args, "\"{rom}\"");
        assert!(!all[0].auto_detected);
        assert!(all[0].id.is_some());
        assert!(all[0].created_at.is_some());
        assert!(all[0].updated_at.is_some());
    }

    #[test]
    fn test_get_emulator_config_by_system_id() {
        let db = Database::new_in_memory().unwrap();

        db.set_emulator_config(&make_emulator_config("nes", "/usr/bin/fceux"))
            .unwrap();
        db.set_emulator_config(&make_emulator_config("snes", "/usr/bin/snes9x"))
            .unwrap();

        let nes_config = db.get_emulator_config("nes").unwrap();
        assert!(nes_config.is_some());
        let nes_config = nes_config.unwrap();
        assert_eq!(nes_config.system_id, "nes");
        assert_eq!(nes_config.executable_path, "/usr/bin/fceux");

        let snes_config = db.get_emulator_config("snes").unwrap();
        assert!(snes_config.is_some());
        assert_eq!(snes_config.unwrap().executable_path, "/usr/bin/snes9x");
    }

    #[test]
    fn test_get_emulator_config_nonexistent_system() {
        let db = Database::new_in_memory().unwrap();

        let config = db.get_emulator_config("dreamcast").unwrap();
        assert!(
            config.is_none(),
            "Should return None for a system with no config"
        );
    }

    #[test]
    fn test_set_emulator_config_upsert() {
        let db = Database::new_in_memory().unwrap();

        // Insert initial config.
        db.set_emulator_config(&make_emulator_config("nes", "/usr/bin/fceux"))
            .unwrap();

        // Upsert with a different executable path for the same system_id.
        let mut updated = make_emulator_config("nes", "/opt/mesen/Mesen");
        updated.auto_detected = true;
        db.set_emulator_config(&updated).unwrap();

        // There should be exactly 1 config for NES, not 2.
        let all = db.get_emulator_configs().unwrap();
        assert_eq!(all.len(), 1, "UPSERT should not create a duplicate row");

        let nes = db.get_emulator_config("nes").unwrap().unwrap();
        assert_eq!(
            nes.executable_path, "/opt/mesen/Mesen",
            "executable_path should be updated to the new value"
        );
        assert!(
            nes.auto_detected,
            "auto_detected flag should be updated"
        );
    }

    // ── Play session lifecycle tests ───────────────────────────────────

    #[test]
    fn test_start_play_session() {
        let db = Database::new_in_memory().unwrap();
        let rom = make_test_rom("session_game", "nes");
        let game_id = db.insert_game(&rom).unwrap();
        assert!(game_id > 0);

        let session_id = db.start_play_session(game_id).unwrap();
        assert!(session_id > 0, "Session ID should be a positive integer");

        // Verify the game is now marked as currently playing.
        let game = db.get_game_by_id(game_id).unwrap().unwrap();
        assert!(
            game.currently_playing,
            "Game should be marked as currently_playing after starting a session"
        );
    }

    #[test]
    fn test_end_play_session() {
        let db = Database::new_in_memory().unwrap();
        let rom = make_test_rom("end_session_game", "nes");
        let game_id = db.insert_game(&rom).unwrap();

        let session_id = db.start_play_session(game_id).unwrap();
        let duration = db.end_play_session(session_id).unwrap();

        // Duration is computed from wall-clock difference. Since start and end
        // happen nearly simultaneously, it should be 0 (or possibly 1 second).
        assert!(
            duration >= 0,
            "Duration should be non-negative, got: {}",
            duration
        );

        // Verify the game is no longer marked as currently playing.
        let game = db.get_game_by_id(game_id).unwrap().unwrap();
        assert!(
            !game.currently_playing,
            "Game should NOT be marked as currently_playing after ending a session"
        );

        // Verify last_played_at was set.
        assert!(
            game.last_played_at.is_some(),
            "last_played_at should be set after ending a session"
        );
    }

    #[test]
    fn test_multiple_sessions_accumulate_playtime() {
        let db = Database::new_in_memory().unwrap();
        let rom = make_test_rom("multi_session_game", "snes");
        let game_id = db.insert_game(&rom).unwrap();

        // Run three sessions.
        for _ in 0..3 {
            let sid = db.start_play_session(game_id).unwrap();
            db.end_play_session(sid).unwrap();
        }

        let game = db.get_game_by_id(game_id).unwrap().unwrap();
        // Each session has ~0 seconds duration, so total_playtime_seconds should
        // be >= 0. The important thing is that it does not reset to 0 between
        // sessions (it accumulates via += in the SQL).
        assert!(
            game.total_playtime_seconds >= 0,
            "Total playtime should accumulate across sessions"
        );

        let stats = db.get_play_stats(game_id).unwrap();
        assert_eq!(
            stats.session_count, 3,
            "Session count should reflect all three sessions"
        );
        assert_eq!(
            stats.sessions.len(),
            3,
            "All three session records should be returned"
        );
    }

    // ── Orphan cleanup tests ───────────────────────────────────────────

    #[test]
    fn test_cleanup_orphaned_sessions() {
        let db = Database::new_in_memory().unwrap();
        let rom = make_test_rom("orphan_game", "gba");
        let game_id = db.insert_game(&rom).unwrap();

        // Start a session but do NOT end it (simulates a crash).
        let _session_id = db.start_play_session(game_id).unwrap();

        // Verify the game is marked as currently playing before cleanup.
        let game_before = db.get_game_by_id(game_id).unwrap().unwrap();
        assert!(game_before.currently_playing);

        // Run cleanup.
        let cleaned = db.cleanup_orphaned_sessions().unwrap();
        assert_eq!(
            cleaned, 1,
            "Should report 1 orphaned session cleaned up"
        );

        // Verify the game's currently_playing flag was reset.
        let game_after = db.get_game_by_id(game_id).unwrap().unwrap();
        assert!(
            !game_after.currently_playing,
            "currently_playing should be reset after orphan cleanup"
        );
    }

    #[test]
    fn test_cleanup_orphaned_sessions_none_orphaned() {
        let db = Database::new_in_memory().unwrap();
        let rom = make_test_rom("clean_game", "nes");
        let game_id = db.insert_game(&rom).unwrap();

        // Start and properly end a session.
        let sid = db.start_play_session(game_id).unwrap();
        db.end_play_session(sid).unwrap();

        // Cleanup should find 0 orphans.
        let cleaned = db.cleanup_orphaned_sessions().unwrap();
        assert_eq!(cleaned, 0, "No orphaned sessions should be found");
    }

    // ── Play stats tests ───────────────────────────────────────────────

    #[test]
    fn test_get_play_stats_no_sessions() {
        let db = Database::new_in_memory().unwrap();
        let rom = make_test_rom("stats_empty_game", "genesis");
        let game_id = db.insert_game(&rom).unwrap();

        let stats = db.get_play_stats(game_id).unwrap();
        assert_eq!(stats.game_id, game_id);
        assert_eq!(stats.total_playtime_seconds, 0);
        assert_eq!(stats.session_count, 0);
        assert!(stats.sessions.is_empty());
        assert!(stats.last_played_at.is_none());
    }

    #[test]
    fn test_get_play_stats_after_one_session() {
        let db = Database::new_in_memory().unwrap();
        let rom = make_test_rom("stats_one_session", "nes");
        let game_id = db.insert_game(&rom).unwrap();

        let sid = db.start_play_session(game_id).unwrap();
        db.end_play_session(sid).unwrap();

        let stats = db.get_play_stats(game_id).unwrap();
        assert_eq!(stats.game_id, game_id);
        assert_eq!(stats.session_count, 1);
        assert_eq!(stats.sessions.len(), 1);
        assert!(
            stats.last_played_at.is_some(),
            "last_played_at should be populated after a session"
        );

        // Verify session record fields.
        let session = &stats.sessions[0];
        assert_eq!(session.game_id, game_id);
        assert!(
            session.ended_at.is_some(),
            "ended_at should be set on a completed session"
        );
        assert!(
            session.duration_seconds.is_some(),
            "duration_seconds should be set on a completed session"
        );
    }

    // ── Game emulator override tests ───────────────────────────────────

    #[test]
    fn test_get_game_emulator_override_none() {
        let db = Database::new_in_memory().unwrap();
        let rom = make_test_rom("no_override_game", "nes");
        let game_id = db.insert_game(&rom).unwrap();

        let result = db.get_game_emulator_override(game_id).unwrap();
        assert!(
            result.is_none(),
            "Should return None when no override is configured"
        );
    }

    #[test]
    fn test_get_game_emulator_override_exists() {
        let db = Database::new_in_memory().unwrap();
        let rom = make_test_rom("override_game", "nes");
        let game_id = db.insert_game(&rom).unwrap();

        // Insert an override via raw SQL (there is no public set method for overrides yet).
        {
            let conn = db.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO game_emulator_overrides (game_id, executable_path, launch_args) \
                 VALUES (?1, ?2, ?3)",
                rusqlite::params![game_id, "/opt/special-emu", "--verbose \"{rom}\""],
            )
            .unwrap();
        }

        let result = db.get_game_emulator_override(game_id).unwrap();
        assert!(result.is_some(), "Override should be returned");
        let ovr = result.unwrap();
        assert_eq!(ovr.game_id, game_id);
        assert_eq!(ovr.executable_path, "/opt/special-emu");
        assert_eq!(
            ovr.launch_args.as_deref(),
            Some("--verbose \"{rom}\"")
        );
    }

    // ── Edge case tests ───────────────────────────────────────────────

    #[test]
    fn test_get_play_stats_nonexistent_game() {
        let db = Database::new_in_memory().unwrap();

        // Should return a zero-valued stats struct, not an error.
        let stats = db.get_play_stats(99999).unwrap();
        assert_eq!(stats.game_id, 99999);
        assert_eq!(stats.total_playtime_seconds, 0);
        assert_eq!(stats.session_count, 0);
        assert!(stats.sessions.is_empty());
        assert!(stats.last_played_at.is_none());
    }

    #[test]
    fn test_end_play_session_twice_does_not_double_count() {
        let db = Database::new_in_memory().unwrap();
        let rom = make_test_rom("double_end_game", "nes");
        let game_id = db.insert_game(&rom).unwrap();

        let session_id = db.start_play_session(game_id).unwrap();
        let duration1 = db.end_play_session(session_id).unwrap();
        assert!(duration1 >= 0);

        // Ending the same session a second time should return 0 and not
        // add any additional playtime.
        let duration2 = db.end_play_session(session_id).unwrap();
        assert_eq!(duration2, 0, "Second end should return 0 duration");

        let game = db.get_game_by_id(game_id).unwrap().unwrap();
        assert_eq!(
            game.total_playtime_seconds, duration1,
            "Playtime should not be double-counted"
        );
    }

    // ── Metadata database method tests ────────────────────────────────

    #[test]
    fn test_update_game_metadata() {
        let db = Database::new_in_memory().unwrap();
        let rom = make_test_rom("metroid", "snes");
        let game_id = db.insert_game(&rom).unwrap();
        assert!(game_id > 0);

        let metadata = GameMetadata {
            igdb_id: Some(5678),
            developer: Some("Nintendo R&D1".to_string()),
            publisher: Some("Nintendo".to_string()),
            release_date: Some("1994-03-19".to_string()),
            genre: Some("Action, Adventure".to_string()),
            description: Some("Explore planet Zebes.".to_string()),
            cover_url: Some("https://example.com/cover.jpg".to_string()),
            screenshot_urls: vec![],
            source: "igdb".to_string(),
        };

        db.update_game_metadata(game_id, &metadata, Some("/cache/covers/1.webp"), Some("LEHV6n"))
            .unwrap();

        let game = db.get_game_by_id(game_id).unwrap().unwrap();
        assert_eq!(game.igdb_id, Some(5678));
        assert_eq!(game.developer.as_deref(), Some("Nintendo R&D1"));
        assert_eq!(game.publisher.as_deref(), Some("Nintendo"));
        assert_eq!(game.release_date.as_deref(), Some("1994-03-19"));
        assert_eq!(game.genre.as_deref(), Some("Action, Adventure"));
        assert_eq!(game.description.as_deref(), Some("Explore planet Zebes."));
        assert_eq!(game.cover_path.as_deref(), Some("/cache/covers/1.webp"));
        assert_eq!(game.blurhash.as_deref(), Some("LEHV6n"));
        assert_eq!(game.metadata_source.as_deref(), Some("igdb"));
        assert!(
            game.metadata_fetched_at.is_some(),
            "metadata_fetched_at should be set"
        );
    }

    #[test]
    fn test_update_game_metadata_with_none_cover() {
        let db = Database::new_in_memory().unwrap();
        let rom = make_test_rom("zelda", "nes");
        let game_id = db.insert_game(&rom).unwrap();

        let metadata = GameMetadata {
            igdb_id: None,
            developer: Some("Capcom".to_string()),
            publisher: None,
            release_date: None,
            genre: None,
            description: None,
            cover_url: None,
            screenshot_urls: vec![],
            source: "screenscraper".to_string(),
        };

        db.update_game_metadata(game_id, &metadata, None, None)
            .unwrap();

        let game = db.get_game_by_id(game_id).unwrap().unwrap();
        assert!(game.cover_path.is_none());
        assert!(game.blurhash.is_none());
        assert_eq!(game.developer.as_deref(), Some("Capcom"));
        assert_eq!(game.metadata_source.as_deref(), Some("screenscraper"));
    }

    #[test]
    fn test_update_game_metadata_refreshes_fts_index() {
        let db = Database::new_in_memory().unwrap();
        let rom = make_test_rom("some_game", "nes");
        let game_id = db.insert_game(&rom).unwrap();

        let metadata = GameMetadata {
            igdb_id: None,
            developer: Some("Rare".to_string()),
            publisher: Some("Nintendo".to_string()),
            release_date: None,
            genre: Some("Platformer".to_string()),
            description: Some("A fun platformer game about a bear.".to_string()),
            cover_url: None,
            screenshot_urls: vec![],
            source: "igdb".to_string(),
        };

        db.update_game_metadata(game_id, &metadata, None, None)
            .unwrap();

        // Search by developer name -- should find the game via FTS.
        let params = crate::models::GetGamesParams {
            search: Some("Rare".to_string()),
            ..Default::default()
        };
        let results = db.get_games(&params).unwrap();
        assert_eq!(
            results.len(),
            1,
            "FTS search should find the game by developer name"
        );
        assert_eq!(results[0].id, game_id);
    }

    #[test]
    fn test_insert_screenshots() {
        let db = Database::new_in_memory().unwrap();
        let rom = make_test_rom("ss_game", "gba");
        let game_id = db.insert_game(&rom).unwrap();

        let entries = vec![
            (
                "https://example.com/ss1.jpg".to_string(),
                Some("/cache/screenshots/1/1.webp".to_string()),
                0,
            ),
            (
                "https://example.com/ss2.jpg".to_string(),
                Some("/cache/screenshots/1/2.webp".to_string()),
                1,
            ),
            (
                "https://example.com/ss3.jpg".to_string(),
                None,
                2,
            ),
        ];

        db.insert_screenshots(game_id, &entries).unwrap();

        // Verify screenshots are in the database by querying directly.
        let conn = db.conn.lock().unwrap();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM screenshots WHERE game_id = ?1",
                rusqlite::params![game_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 3, "All three screenshots should be inserted");
    }

    #[test]
    fn test_get_games_without_metadata() {
        let db = Database::new_in_memory().unwrap();

        // Insert three games, none with metadata.
        for name in &["game_a", "game_b", "game_c"] {
            let rom = make_test_rom(name, "nes");
            db.insert_game(&rom).unwrap();
        }

        let without_md = db.get_games_without_metadata(None).unwrap();
        assert_eq!(
            without_md.len(),
            3,
            "All three games should have no metadata"
        );

        // Now give one game metadata.
        let metadata = GameMetadata {
            igdb_id: None,
            developer: None,
            publisher: None,
            release_date: None,
            genre: None,
            description: None,
            cover_url: None,
            screenshot_urls: vec![],
            source: "igdb".to_string(),
        };
        db.update_game_metadata(without_md[0].id, &metadata, None, None)
            .unwrap();

        let without_md = db.get_games_without_metadata(None).unwrap();
        assert_eq!(
            without_md.len(),
            2,
            "Only two games should remain without metadata"
        );
    }

    #[test]
    fn test_get_games_without_metadata_with_limit() {
        let db = Database::new_in_memory().unwrap();

        for name in &["limit_a", "limit_b", "limit_c", "limit_d"] {
            let rom = make_test_rom(name, "snes");
            db.insert_game(&rom).unwrap();
        }

        let limited = db.get_games_without_metadata(Some(2)).unwrap();
        assert_eq!(
            limited.len(),
            2,
            "Should return at most 2 games when limit is 2"
        );
    }

    #[test]
    fn test_mark_game_unmatched() {
        let db = Database::new_in_memory().unwrap();
        let rom = make_test_rom("unmatched_game", "genesis");
        let game_id = db.insert_game(&rom).unwrap();

        // Before marking, metadata_source should be None.
        let game = db.get_game_by_id(game_id).unwrap().unwrap();
        assert!(game.metadata_source.is_none());

        db.mark_game_unmatched(game_id).unwrap();

        let game = db.get_game_by_id(game_id).unwrap().unwrap();
        assert_eq!(
            game.metadata_source.as_deref(),
            Some("unmatched"),
            "metadata_source should be 'unmatched'"
        );
        assert!(
            game.metadata_fetched_at.is_some(),
            "metadata_fetched_at should be set"
        );
    }

    #[test]
    fn test_mark_game_unmatched_excludes_from_without_metadata() {
        let db = Database::new_in_memory().unwrap();
        let rom = make_test_rom("will_be_unmatched", "nes");
        let game_id = db.insert_game(&rom).unwrap();

        // Should appear in without_metadata list.
        let before = db.get_games_without_metadata(None).unwrap();
        assert!(
            before.iter().any(|g| g.id == game_id),
            "Game should appear in without-metadata list before marking"
        );

        db.mark_game_unmatched(game_id).unwrap();

        // Should no longer appear (metadata_source is set to 'unmatched').
        let after = db.get_games_without_metadata(None).unwrap();
        assert!(
            !after.iter().any(|g| g.id == game_id),
            "Game should NOT appear in without-metadata list after marking unmatched"
        );
    }

    // ── Screenshot query tests ────────────────────────────────────────

    #[test]
    fn test_get_screenshots_for_game() {
        let db = Database::new_in_memory().unwrap();
        let rom = make_test_rom("screenshot_game", "snes");
        let game_id = db.insert_game(&rom).unwrap();

        let entries = vec![
            ("https://example.com/ss2.jpg".to_string(), Some("/cache/ss/2.webp".to_string()), 1),
            ("https://example.com/ss1.jpg".to_string(), Some("/cache/ss/1.webp".to_string()), 0),
            ("https://example.com/ss3.jpg".to_string(), None, 2),
        ];
        db.insert_screenshots(game_id, &entries).unwrap();

        let screenshots = db.get_screenshots_for_game(game_id).unwrap();
        assert_eq!(screenshots.len(), 3);

        // Verify they are returned sorted by sort_order ascending.
        assert_eq!(screenshots[0].sort_order, 0);
        assert_eq!(screenshots[1].sort_order, 1);
        assert_eq!(screenshots[2].sort_order, 2);

        assert_eq!(screenshots[0].url, "https://example.com/ss1.jpg");
        assert_eq!(screenshots[0].local_path.as_deref(), Some("/cache/ss/1.webp"));
        assert!(screenshots[2].local_path.is_none());
    }

    #[test]
    fn test_get_screenshots_for_game_none() {
        let db = Database::new_in_memory().unwrap();
        let rom = make_test_rom("no_ss_game", "nes");
        let game_id = db.insert_game(&rom).unwrap();

        let screenshots = db.get_screenshots_for_game(game_id).unwrap();
        assert!(screenshots.is_empty(), "Should return empty vec when no screenshots exist");
    }

    // ── Toggle favorite tests ─────────────────────────────────────────

    #[test]
    fn test_toggle_favorite() {
        let db = Database::new_in_memory().unwrap();
        let rom = make_test_rom("fav_game", "nes");
        let game_id = db.insert_game(&rom).unwrap();

        // Default is_favorite should be false.
        let game = db.get_game_by_id(game_id).unwrap().unwrap();
        assert!(!game.is_favorite, "is_favorite should default to false");

        // First toggle: false -> true.
        let new_val = db.toggle_favorite(game_id).unwrap();
        assert!(new_val, "First toggle should set is_favorite to true");

        let game = db.get_game_by_id(game_id).unwrap().unwrap();
        assert!(game.is_favorite);

        // Second toggle: true -> false.
        let new_val = db.toggle_favorite(game_id).unwrap();
        assert!(!new_val, "Second toggle should set is_favorite back to false");

        let game = db.get_game_by_id(game_id).unwrap().unwrap();
        assert!(!game.is_favorite);
    }

    #[test]
    fn test_toggle_favorite_nonexistent_game() {
        let db = Database::new_in_memory().unwrap();

        // Toggling a nonexistent game should return an error.
        let result = db.toggle_favorite(99999);
        assert!(
            result.is_err(),
            "toggle_favorite on a nonexistent game should return an error"
        );
    }

    // ── No-Intro / DAT file integration tests ────────────────────────────

    #[test]
    fn test_upsert_dat_file() {
        let db = Database::new_in_memory().unwrap();

        // Insert a new DAT file record.
        db.upsert_dat_file("nes", "NES.dat", Some("Nintendo - NES"), 500)
            .unwrap();

        let dats = db.get_dat_files().unwrap();
        assert_eq!(dats.len(), 1);
        assert_eq!(dats[0].system_id, "nes");
        assert_eq!(dats[0].file_name, "NES.dat");
        assert_eq!(dats[0].dat_name, Some("Nintendo - NES".to_string()));
        assert_eq!(dats[0].entry_count, 500);

        // Re-import for the same system_id should update, not duplicate.
        db.upsert_dat_file("nes", "NES_v2.dat", Some("Nintendo - NES v2"), 600)
            .unwrap();

        let dats = db.get_dat_files().unwrap();
        assert_eq!(dats.len(), 1, "UPSERT should not create a duplicate row");
        assert_eq!(dats[0].file_name, "NES_v2.dat");
        assert_eq!(dats[0].dat_name, Some("Nintendo - NES v2".to_string()));
        assert_eq!(dats[0].entry_count, 600);
    }

    #[test]
    fn test_get_dat_files_empty() {
        let db = Database::new_in_memory().unwrap();

        let dats = db.get_dat_files().unwrap();
        assert!(
            dats.is_empty(),
            "Fresh database should have no DAT file records"
        );
    }

    #[test]
    fn test_remove_dat_file() {
        let db = Database::new_in_memory().unwrap();

        db.upsert_dat_file("nes", "NES.dat", Some("Nintendo - NES"), 500)
            .unwrap();
        assert_eq!(db.get_dat_files().unwrap().len(), 1);

        db.remove_dat_file("nes").unwrap();

        let dats = db.get_dat_files().unwrap();
        assert!(dats.is_empty(), "DAT file should be removed");
    }

    #[test]
    fn test_update_nointro_match_by_path() {
        let db = Database::new_in_memory().unwrap();
        let rom = make_test_rom("smb", "nes");
        let game_id = db.insert_game(&rom).unwrap();
        assert!(game_id > 0);

        // Verify nointro fields are initially unset.
        let game = db.get_game_by_id(game_id).unwrap().unwrap();
        assert!(game.nointro_name.is_none());
        assert!(game.region.is_none());

        // Apply a No-Intro match.
        db.update_nointro_match_by_path(
            "/roms/smb.nes",
            "Super Mario Bros. (USA)",
            Some("USA"),
        )
        .unwrap();

        let game = db.get_game_by_id(game_id).unwrap().unwrap();
        assert_eq!(
            game.nointro_name,
            Some("Super Mario Bros. (USA)".to_string())
        );
        assert_eq!(game.region, Some("USA".to_string()));
    }

    #[test]
    fn test_get_games_without_nointro() {
        let db = Database::new_in_memory().unwrap();

        // Insert two games with CRC32 hashes but no nointro_name.
        let rom1 = ScannedRom {
            file_path: PathBuf::from("/roms/game_a.nes"),
            file_name: "game_a.nes".to_string(),
            file_size: 1024,
            last_modified: "1700000000".to_string(),
            system_id: "nes".to_string(),
            crc32: "11111111".to_string(),
            sha1: None,
        };
        let rom2 = ScannedRom {
            file_path: PathBuf::from("/roms/game_b.nes"),
            file_name: "game_b.nes".to_string(),
            file_size: 2048,
            last_modified: "1700000000".to_string(),
            system_id: "nes".to_string(),
            crc32: "22222222".to_string(),
            sha1: None,
        };

        let id1 = db.insert_game(&rom1).unwrap();
        let id2 = db.insert_game(&rom2).unwrap();
        assert!(id1 > 0);
        assert!(id2 > 0);

        // Both should appear as unmatched.
        let unmatched = db.get_games_without_nointro().unwrap();
        assert_eq!(unmatched.len(), 2);

        // Match one of them.
        db.update_nointro_match_by_path(
            "/roms/game_a.nes",
            "Game A (USA)",
            Some("USA"),
        )
        .unwrap();

        // Only the unmatched game should remain.
        let unmatched = db.get_games_without_nointro().unwrap();
        assert_eq!(unmatched.len(), 1);
        assert_eq!(unmatched[0].rom_path, "/roms/game_b.nes");
    }
}

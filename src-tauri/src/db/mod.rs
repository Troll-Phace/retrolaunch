//! Database layer for RetroLaunch.
//!
//! Provides a thread-safe wrapper around a rusqlite connection with WAL mode
//! enabled. All methods lock the internal mutex before accessing the connection.

pub mod queries;

use crate::models::{ScannedRom, System, WatchedDirectory};
use anyhow::{Context, Result};
use rusqlite::Connection;
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

    /// Removes a watched directory by its database ID.
    pub fn remove_watched_directory(&self, id: i64) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

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
}

// Pull in the `optional()` extension method for query_row.
use rusqlite::OptionalExtension;

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

        // The seed data has 11 systems.
        assert_eq!(systems.len(), 11);

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
}

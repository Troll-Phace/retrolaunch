//! Dynamic query builders for the games table.
//!
//! Supports full-text search via FTS5, filtering by system, and flexible
//! sorting with pagination.

use crate::db::Database;
use crate::models::{Game, GetGamesParams};
use anyhow::Result;
use rusqlite::params_from_iter;
use rusqlite::OptionalExtension;

/// Converts a rusqlite `Row` into a `Game` struct.
///
/// Reads columns by index in the order they appear in `SELECT g.* FROM games g`.
/// Boolean fields (`currently_playing`, `is_favorite`) are stored as integers
/// in SQLite and converted here.
pub(crate) fn row_to_game(row: &rusqlite::Row) -> rusqlite::Result<Game> {
    Ok(Game {
        id: row.get(0)?,
        title: row.get(1)?,
        system_id: row.get(2)?,
        rom_path: row.get(3)?,
        rom_hash_crc32: row.get(4)?,
        rom_hash_sha1: row.get(5)?,
        file_size_bytes: row.get(6)?,
        file_last_modified: row.get(7)?,
        nointro_name: row.get(8)?,
        region: row.get(9)?,
        igdb_id: row.get(10)?,
        developer: row.get(11)?,
        publisher: row.get(12)?,
        release_date: row.get(13)?,
        genre: row.get(14)?,
        description: row.get(15)?,
        cover_path: row.get(16)?,
        blurhash: row.get(17)?,
        total_playtime_seconds: row.get::<_, Option<i64>>(18)?.unwrap_or(0),
        last_played_at: row.get(19)?,
        currently_playing: row.get::<_, i32>(20)? != 0,
        is_favorite: row.get::<_, i32>(21)? != 0,
        date_added: row.get(22)?,
        metadata_source: row.get(23)?,
        metadata_fetched_at: row.get(24)?,
        created_at: row.get(25)?,
        updated_at: row.get(26)?,
    })
}

impl Database {
    /// Queries games with optional full-text search, system filtering, sorting,
    /// and pagination.
    ///
    /// The query is built dynamically based on which `GetGamesParams` fields are
    /// set. All user-provided values are passed as parameterized bindings to
    /// prevent SQL injection.
    pub fn get_games(&self, params: &GetGamesParams) -> Result<Vec<Game>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        let mut sql = String::from("SELECT g.* FROM games g");
        let mut conditions: Vec<String> = Vec::new();
        let mut bind_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        let mut param_index: usize = 1;

        // Full-text search join
        if let Some(ref search) = params.search {
            if !search.is_empty() {
                sql.push_str(" JOIN games_fts fts ON g.id = fts.rowid");
                conditions.push(format!("games_fts MATCH ?{}", param_index));
                // Wrap in double quotes to treat as a literal phrase (prevents
                // FTS5 operator injection: AND, OR, NOT, NEAR, column filters).
                // Append wildcard outside quotes for prefix matching.
                let search_term = format!("\"{}\"*", search.replace('"', "\"\""));
                bind_values.push(Box::new(search_term));
                param_index += 1;
            }
        }

        // System filter
        if let Some(ref system_id) = params.system_id {
            if !system_id.is_empty() {
                conditions.push(format!("g.system_id = ?{}", param_index));
                bind_values.push(Box::new(system_id.clone()));
                param_index += 1;
            }
        }

        // Append WHERE clause if we have conditions
        if !conditions.is_empty() {
            sql.push_str(" WHERE ");
            sql.push_str(&conditions.join(" AND "));
        }

        // Sorting — only allow known column names to prevent injection.
        let order_column = match params
            .sort_by
            .as_deref()
            .unwrap_or("title")
        {
            "date_added" => "g.date_added",
            "last_played" => "g.last_played_at",
            "playtime" => "g.total_playtime_seconds",
            _ => "g.title",
        };
        let order_dir = match params.sort_order.as_deref() {
            Some("desc") => "DESC",
            _ => "ASC",
        };
        sql.push_str(&format!(" ORDER BY {} {}", order_column, order_dir));

        // Pagination
        if let Some(limit) = params.limit {
            sql.push_str(&format!(" LIMIT ?{}", param_index));
            bind_values.push(Box::new(limit as i64));
            param_index += 1;
        }

        if let Some(offset) = params.offset {
            sql.push_str(&format!(" OFFSET ?{}", param_index));
            bind_values.push(Box::new(offset as i64));
            // param_index is not read after this, but increment for consistency.
            let _ = param_index;
        }

        let params_refs: Vec<&dyn rusqlite::types::ToSql> =
            bind_values.iter().map(|b| b.as_ref()).collect();

        let mut stmt = conn.prepare(&sql)?;
        let games = stmt
            .query_map(params_from_iter(params_refs.iter()), |row| {
                row_to_game(row)
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(games)
    }

    /// Retrieves a single game by its database ID.
    ///
    /// Returns `None` if no game with the given ID exists.
    pub fn get_game_by_id(&self, id: i64) -> Result<Option<Game>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Database mutex poisoned: {}", e))?;

        let game = conn
            .query_row(
                "SELECT g.* FROM games g WHERE g.id = ?1",
                rusqlite::params![id],
                row_to_game,
            )
            .optional()?;

        Ok(game)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ScannedRom;
    use std::path::PathBuf;

    fn make_rom(name: &str, system: &str) -> ScannedRom {
        ScannedRom {
            file_path: PathBuf::from(format!("/roms/{}.nes", name)),
            file_name: format!("{}.nes", name),
            file_size: 1024,
            last_modified: "1700000000".to_string(),
            system_id: system.to_string(),
            crc32: format!("{:08x}", name.len()),
            sha1: None,
        }
    }

    #[test]
    fn test_get_games_all() {
        let db = Database::new_in_memory().unwrap();
        db.insert_game(&make_rom("mario", "nes")).unwrap();
        db.insert_game(&make_rom("zelda", "nes")).unwrap();
        db.insert_game(&make_rom("sonic", "genesis")).unwrap();

        let params = GetGamesParams::default();
        let games = db.get_games(&params).unwrap();
        assert_eq!(games.len(), 3);
    }

    #[test]
    fn test_get_games_filter_system() {
        let db = Database::new_in_memory().unwrap();
        db.insert_game(&make_rom("mario", "nes")).unwrap();
        db.insert_game(&make_rom("sonic", "genesis")).unwrap();

        let params = GetGamesParams {
            system_id: Some("nes".to_string()),
            ..Default::default()
        };
        let games = db.get_games(&params).unwrap();
        assert_eq!(games.len(), 1);
        assert_eq!(games[0].system_id, "nes");
    }

    #[test]
    fn test_get_games_sort_title() {
        let db = Database::new_in_memory().unwrap();
        db.insert_game(&make_rom("zelda", "nes")).unwrap();
        db.insert_game(&make_rom("mario", "nes")).unwrap();
        db.insert_game(&make_rom("castlevania", "nes")).unwrap();

        let params = GetGamesParams {
            sort_by: Some("title".to_string()),
            sort_order: Some("asc".to_string()),
            ..Default::default()
        };
        let games = db.get_games(&params).unwrap();
        assert_eq!(games[0].title, "castlevania");
        assert_eq!(games[1].title, "mario");
        assert_eq!(games[2].title, "zelda");
    }

    #[test]
    fn test_get_games_limit_offset() {
        let db = Database::new_in_memory().unwrap();
        db.insert_game(&make_rom("a_game", "nes")).unwrap();
        db.insert_game(&make_rom("b_game", "nes")).unwrap();
        db.insert_game(&make_rom("c_game", "nes")).unwrap();

        let params = GetGamesParams {
            sort_by: Some("title".to_string()),
            limit: Some(2),
            offset: Some(0),
            ..Default::default()
        };
        let games = db.get_games(&params).unwrap();
        assert_eq!(games.len(), 2);
        assert_eq!(games[0].title, "a_game");

        let params2 = GetGamesParams {
            sort_by: Some("title".to_string()),
            limit: Some(2),
            offset: Some(2),
            ..Default::default()
        };
        let games2 = db.get_games(&params2).unwrap();
        assert_eq!(games2.len(), 1);
        assert_eq!(games2[0].title, "c_game");
    }

    #[test]
    fn test_get_games_fts_search() {
        let db = Database::new_in_memory().unwrap();
        db.insert_game(&make_rom("super_mario_bros", "nes")).unwrap();
        db.insert_game(&make_rom("zelda", "nes")).unwrap();

        let params = GetGamesParams {
            search: Some("mario".to_string()),
            ..Default::default()
        };
        let games = db.get_games(&params).unwrap();
        assert_eq!(games.len(), 1);
        assert!(games[0].title.contains("mario"));
    }

    #[test]
    fn test_get_games_empty() {
        let db = Database::new_in_memory().unwrap();
        let params = GetGamesParams::default();
        let games = db.get_games(&params).unwrap();
        assert!(games.is_empty());
    }

    // ── get_game_by_id tests ───────────────────────────────────────────

    #[test]
    fn test_get_game_by_id_exists() {
        let db = Database::new_in_memory().unwrap();
        let rom = make_rom("castlevania", "nes");
        let game_id = db.insert_game(&rom).unwrap();
        assert!(game_id > 0);

        let game = db.get_game_by_id(game_id).unwrap();
        assert!(game.is_some(), "Game should be found by its ID");

        let game = game.unwrap();
        assert_eq!(game.id, game_id);
        assert_eq!(game.title, "castlevania");
        assert_eq!(game.system_id, "nes");
        assert_eq!(game.rom_path, "/roms/castlevania.nes");
    }

    #[test]
    fn test_get_game_by_id_nonexistent() {
        let db = Database::new_in_memory().unwrap();

        let game = db.get_game_by_id(99999).unwrap();
        assert!(
            game.is_none(),
            "Should return None for a nonexistent game ID"
        );
    }
}

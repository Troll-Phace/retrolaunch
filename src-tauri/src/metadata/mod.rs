//! Metadata pipeline for enriching games with cover art, descriptions, and more.
//!
//! Implements a cascading fetch strategy: IGDB (primary) -> ScreenScraper (fallback)
//! -> mark as unmatched. All API responses are cached in SQLite; images are saved
//! to the platform-appropriate cache directory.

pub mod cache;
pub mod igdb;
pub mod screenscraper;

use crate::db::Database;
use crate::models::{Game, GameMetadata, MetadataProgress};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter};

/// Generation counter — incremented each time a new metadata fetch starts.
/// Background tasks check this before processing each game and abort if a
/// newer fetch has been started.
pub static FETCH_GENERATION: AtomicU64 = AtomicU64::new(0);

use self::cache::ImageCache;
use self::igdb::IgdbClient;
use self::screenscraper::ScreenScraperClient;

/// Strips No-Intro parenthetical tags (region, revision, language, etc.) from a game name.
///
/// Examples:
/// - `"Contra (USA)"` -> `"Contra"`
/// - `"Super Mario Bros. 3 (USA) (Rev A)"` -> `"Super Mario Bros. 3"`
/// - `"Final Fantasy III (Japan)"` -> `"Final Fantasy III"`
fn strip_nointro_tags(name: &str) -> String {
    let mut result = String::with_capacity(name.len());
    let mut depth: u32 = 0;
    for ch in name.chars() {
        match ch {
            '(' => depth += 1,
            ')' => {
                depth = depth.saturating_sub(1);
            }
            _ if depth == 0 => result.push(ch),
            _ => {}
        }
    }
    result.trim().to_string()
}

/// Errors that can occur during metadata operations.
#[derive(Debug, thiserror::Error)]
pub enum MetadataError {
    /// OAuth2 or API key authentication failed.
    #[error("Authentication failed: {0}")]
    AuthenticationFailed(String),

    /// The API returned a non-success HTTP status.
    #[error("API error from {api_source}: HTTP {status} — {message}")]
    ApiError {
        api_source: String,
        status: u16,
        message: String,
    },

    /// The API returned a rate-limit response.
    #[error("Rate limited, retry after {retry_after_ms}ms")]
    RateLimited { retry_after_ms: u64 },

    /// A network-level error (DNS, timeout, connection refused).
    #[error("Network error: {0}")]
    NetworkError(String),

    /// Failed to decode, resize, or encode an image.
    #[error("Image processing error: {0}")]
    ImageProcessingError(String),

    /// File system I/O error.
    #[error("I/O error: {0}")]
    IoError(#[from] std::io::Error),

    /// Requested game does not exist in the database.
    #[error("Game not found: {0}")]
    GameNotFound(i64),

    /// Database query or write failed.
    #[error("Database error: {0}")]
    DatabaseError(String),

    /// API client is not configured (missing credentials).
    #[error("Not configured: {0}")]
    NotConfigured(String),
}

/// Holds all metadata API clients and the image cache.
pub struct MetadataClients {
    pub igdb: IgdbClient,
    pub screenscraper: ScreenScraperClient,
    pub image_cache: ImageCache,
}

/// Fetches metadata for a batch of games using the cascade strategy.
///
/// For each game:
/// 1. Skip if `metadata_source` is already set (cache hit).
/// 2. Try IGDB by title.
/// 3. On miss, try ScreenScraper by hash.
/// 4. On miss, try ScreenScraper by name.
/// 5. On full miss, mark the game as unmatched.
/// 6. On hit, download cover + screenshots, then persist to the database.
///
/// Emits `metadata-progress` events throttled to at most every 100ms.
pub async fn fetch_metadata_batch(
    app: &AppHandle,
    db: &Arc<Database>,
    games: Vec<Game>,
    clients: &MetadataClients,
    generation: u64,
) -> Result<(), MetadataError> {
    let total = games.len() as u32;
    let mut fetched: u32 = 0;
    let mut last_emit = Instant::now();

    for game in &games {
        // Abort if a newer fetch was started (e.g. after a factory reset).
        if FETCH_GENERATION.load(Ordering::SeqCst) != generation {
            return Ok(());
        }

        // 1. Skip games that already have metadata.
        if game.metadata_source.is_some() {
            fetched += 1;
            continue;
        }

        let search_name = game
            .nointro_name
            .as_deref()
            .map(strip_nointro_tags)
            .unwrap_or_else(|| game.title.clone());

        // 2. Try IGDB.
        let mut metadata: Option<GameMetadata> = None;

        if clients.igdb.is_configured() {
            match clients.igdb.search_game(&search_name, Some(&game.system_id)).await {
                Ok(Some(md)) => metadata = Some(md),
                Ok(None) => { /* miss — fall through */ }
                Err(e) => {
                    eprintln!("IGDB error for '{}': {}", game.title, e);
                }
            }
        }

        // 3. Try ScreenScraper by hash.
        if metadata.is_none() && clients.screenscraper.is_configured() {
            if let Some(ref crc32) = game.rom_hash_crc32 {
                match clients
                    .screenscraper
                    .search_by_hash(crc32, game.rom_hash_sha1.as_deref(), &game.system_id)
                    .await
                {
                    Ok(Some(md)) => metadata = Some(md),
                    Ok(None) => { /* miss — fall through */ }
                    Err(e) => {
                        eprintln!("ScreenScraper hash error for '{}': {}", game.title, e);
                    }
                }
            }
        }

        // 4. Try ScreenScraper by name.
        if metadata.is_none() && clients.screenscraper.is_configured() {
            match clients
                .screenscraper
                .search_by_name(&search_name, &game.system_id)
                .await
            {
                Ok(Some(md)) => metadata = Some(md),
                Ok(None) => { /* miss — fall through */ }
                Err(e) => {
                    eprintln!("ScreenScraper name error for '{}': {}", game.title, e);
                }
            }
        }

        // 5. On full miss, mark unmatched.
        if metadata.is_none() {
            if let Err(e) = db.mark_game_unmatched(game.id) {
                eprintln!("Failed to mark game {} unmatched: {}", game.id, e);
            }
            fetched += 1;
            emit_progress_throttled(app, fetched, total, &game.title, None, None, &mut last_emit);
            continue;
        }

        // 6. On hit — download assets and persist.
        // Safety: guarded by the `is_none()` check + continue above.
        let Some(md) = metadata else {
            continue;
        };
        let source_name = Some(md.source.clone());

        // Download cover art.
        let (cover_path, blurhash) = if let Some(ref url) = md.cover_url {
            match clients.image_cache.download_cover(game.id, url).await {
                Ok((path, hash)) => (Some(path.to_string_lossy().to_string()), Some(hash)),
                Err(e) => {
                    eprintln!("Cover download failed for game {}: {}", game.id, e);
                    (None, None)
                }
            }
        } else {
            (None, None)
        };

        // Download screenshots.
        if !md.screenshot_urls.is_empty() {
            match clients
                .image_cache
                .download_screenshots(game.id, &md.screenshot_urls)
                .await
            {
                Ok(paths) => {
                    let entries: Vec<(String, Option<String>, i32)> = md
                        .screenshot_urls
                        .iter()
                        .zip(paths.iter())
                        .enumerate()
                        .map(|(i, (url, path))| {
                            (
                                url.clone(),
                                Some(path.to_string_lossy().to_string()),
                                i as i32,
                            )
                        })
                        .collect();

                    if let Err(e) = db.insert_screenshots(game.id, &entries) {
                        eprintln!("Failed to insert screenshots for game {}: {}", game.id, e);
                    }
                }
                Err(e) => {
                    eprintln!("Screenshot download failed for game {}: {}", game.id, e);
                }
            }
        }

        // Persist metadata to the database.
        if let Err(e) = db.update_game_metadata(
            game.id,
            &md,
            cover_path.as_deref(),
            blurhash.as_deref(),
        ) {
            eprintln!("Failed to update metadata for game {}: {}", game.id, e);
        }

        fetched += 1;
        emit_progress_throttled(
            app,
            fetched,
            total,
            &game.title,
            source_name.as_deref(),
            cover_path.as_deref(),
            &mut last_emit,
        );
    }

    // Always emit a final progress event.
    if total > 0 {
        let progress = MetadataProgress {
            fetched,
            total,
            current_game: games
                .last()
                .map(|g| g.title.clone())
                .unwrap_or_default(),
            source: None,
            cover_path: None,
        };
        let _ = app.emit("metadata-progress", &progress);
    }

    Ok(())
}

/// Emits a progress event if at least 100ms have passed since the last emission.
fn emit_progress_throttled(
    app: &AppHandle,
    fetched: u32,
    total: u32,
    current_game: &str,
    source: Option<&str>,
    cover_path: Option<&str>,
    last_emit: &mut Instant,
) {
    if last_emit.elapsed().as_millis() >= 100 || fetched == total {
        let progress = MetadataProgress {
            fetched,
            total,
            current_game: current_game.to_string(),
            source: source.map(|s| s.to_string()),
            cover_path: cover_path.map(|s| s.to_string()),
        };
        let _ = app.emit("metadata-progress", &progress);
        *last_emit = Instant::now();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_metadata_error_display() {
        let err = MetadataError::AuthenticationFailed("bad token".to_string());
        assert!(err.to_string().contains("bad token"));

        let err = MetadataError::ApiError {
            api_source: "IGDB".to_string(),
            status: 401,
            message: "Unauthorized".to_string(),
        };
        assert!(err.to_string().contains("401"));
        assert!(err.to_string().contains("IGDB"));

        let err = MetadataError::NotConfigured("IGDB credentials missing".to_string());
        assert!(err.to_string().contains("Not configured"));
    }

    #[test]
    fn test_metadata_error_display_rate_limited() {
        let err = MetadataError::RateLimited {
            retry_after_ms: 2000,
        };
        let msg = err.to_string();
        assert!(msg.contains("2000"), "Should include retry_after_ms in message");
    }

    #[test]
    fn test_metadata_error_display_network() {
        let err = MetadataError::NetworkError("connection refused".to_string());
        assert!(err.to_string().contains("connection refused"));
    }

    #[test]
    fn test_metadata_error_display_image_processing() {
        let err = MetadataError::ImageProcessingError("unsupported format".to_string());
        assert!(err.to_string().contains("unsupported format"));
    }

    #[test]
    fn test_metadata_error_display_game_not_found() {
        let err = MetadataError::GameNotFound(42);
        let msg = err.to_string();
        assert!(msg.contains("42"));
    }

    #[test]
    fn test_metadata_error_display_database_error() {
        let err = MetadataError::DatabaseError("table not found".to_string());
        assert!(err.to_string().contains("table not found"));
    }

    #[test]
    fn test_metadata_error_display_io_error() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file missing");
        let err = MetadataError::IoError(io_err);
        assert!(err.to_string().contains("file missing"));
    }

    #[test]
    fn test_strip_nointro_tags_single_region() {
        assert_eq!(strip_nointro_tags("Contra (USA)"), "Contra");
    }

    #[test]
    fn test_strip_nointro_tags_multiple_tags() {
        assert_eq!(
            strip_nointro_tags("Super Mario Bros. 3 (USA) (Rev A)"),
            "Super Mario Bros. 3"
        );
    }

    #[test]
    fn test_strip_nointro_tags_europe() {
        assert_eq!(strip_nointro_tags("Mega Man (Europe)"), "Mega Man");
    }

    #[test]
    fn test_strip_nointro_tags_no_parens() {
        assert_eq!(strip_nointro_tags("Game Title"), "Game Title");
    }

    #[test]
    fn test_strip_nointro_tags_many_tags() {
        assert_eq!(strip_nointro_tags("Game (Unl) (Beta)"), "Game");
    }

    #[test]
    fn test_strip_nointro_tags_empty_string() {
        assert_eq!(strip_nointro_tags(""), "");
    }

    #[test]
    fn test_strip_nointro_tags_only_tags() {
        assert_eq!(strip_nointro_tags("(USA) (Rev 1)"), "");
    }
}

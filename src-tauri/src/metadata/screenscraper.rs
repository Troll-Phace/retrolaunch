//! ScreenScraper API client for retro game metadata.
//!
//! Provides hash-based and name-based game lookup as a fallback when IGDB
//! does not have coverage. Respects the free-tier rate limit of 1 request/second.

use super::MetadataError;
use crate::models::GameMetadata;
use reqwest::Client;
use serde::Deserialize;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

/// ScreenScraper API client.
pub struct ScreenScraperClient {
    http: Client,
    dev_id: String,
    dev_password: String,
    username: String,
    password: String,
    last_request: Mutex<Instant>,
}

// ── ScreenScraper JSON response types ─────────────────────────────────

#[derive(Debug, Deserialize)]
struct SsResponse {
    response: Option<SsResponseBody>,
}

#[derive(Debug, Deserialize)]
struct SsResponseBody {
    jeu: Option<SsGame>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct SsGame {
    id: Option<String>,
    noms: Option<Vec<SsNom>>,
    developpeur: Option<SsTextValue>,
    editeur: Option<SsTextValue>,
    dates: Option<Vec<SsDate>>,
    genres: Option<Vec<SsGenre>>,
    synopsis: Option<Vec<SsText>>,
    medias: Option<Vec<SsMedia>>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct SsNom {
    region: Option<String>,
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SsTextValue {
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SsDate {
    region: Option<String>,
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SsGenre {
    noms: Option<Vec<SsGenreNom>>,
}

#[derive(Debug, Deserialize)]
struct SsGenreNom {
    langue: Option<String>,
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SsText {
    langue: Option<String>,
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SsMedia {
    #[serde(rename = "type")]
    media_type: Option<String>,
    region: Option<String>,
    url: Option<String>,
}

// ── Search results response (for name-based search) ────────────────────

#[derive(Debug, Deserialize)]
struct SsSearchResponse {
    response: Option<SsSearchResponseBody>,
}

#[derive(Debug, Deserialize)]
struct SsSearchResponseBody {
    jeux: Option<Vec<SsSearchResult>>,
}

#[derive(Debug, Deserialize)]
struct SsSearchResult {
    id: Option<String>,
}

impl ScreenScraperClient {
    /// Creates a new ScreenScraper client with the given credentials.
    ///
    /// If `dev_id` is empty, the client is considered "not configured".
    pub fn new(
        dev_id: String,
        dev_password: String,
        username: String,
        password: String,
    ) -> Self {
        Self {
            http: Client::new(),
            dev_id,
            dev_password,
            username,
            password,
            last_request: Mutex::new(Instant::now() - Duration::from_secs(2)),
        }
    }

    /// Returns `true` if the client has credentials configured.
    pub fn is_configured(&self) -> bool {
        !self.dev_id.is_empty() && !self.username.is_empty()
    }

    /// Enforces the ScreenScraper rate limit of 1 request/second.
    async fn rate_limit(&self) {
        let mut last = self.last_request.lock().await;
        let elapsed = last.elapsed();
        let min_interval = Duration::from_millis(1000);

        if elapsed < min_interval {
            tokio::time::sleep(min_interval - elapsed).await;
        }

        *last = Instant::now();
    }

    /// Returns the base query parameters for authentication.
    fn auth_params(&self) -> Vec<(&str, &str)> {
        vec![
            ("devid", self.dev_id.as_str()),
            ("devpassword", self.dev_password.as_str()),
            ("softname", "retrolaunch"),
            ("ssid", self.username.as_str()),
            ("sspassword", self.password.as_str()),
            ("output", "json"),
        ]
    }

    /// Searches ScreenScraper for a game by CRC32 hash (and optionally SHA1).
    ///
    /// This is the most reliable lookup method since it matches the exact ROM dump.
    pub async fn search_by_hash(
        &self,
        crc32: &str,
        sha1: Option<&str>,
        system_id: &str,
    ) -> Result<Option<GameMetadata>, MetadataError> {
        if !self.is_configured() {
            return Err(MetadataError::NotConfigured(
                "ScreenScraper credentials are required".to_string(),
            ));
        }

        let ss_system_id = match Self::map_system_id(system_id) {
            Some(id) => id,
            None => return Ok(None), // Unsupported system
        };

        self.rate_limit().await;

        let mut params = self.auth_params();
        params.push(("crc", crc32));
        params.push(("systemeid", ss_system_id));

        if let Some(sha1) = sha1 {
            params.push(("sha1", sha1));
        }

        let resp = self
            .http
            .get("https://api.screenscraper.fr/api2/jeuInfos.php")
            .query(&params)
            .send()
            .await
            .map_err(|e| MetadataError::NetworkError(e.to_string()))?;

        let status = resp.status();
        if status.as_u16() == 429 {
            return Err(MetadataError::RateLimited {
                retry_after_ms: 2000,
            });
        }
        if status.as_u16() == 404 || status.as_u16() == 430 {
            // 404 or 430 = game not found
            return Ok(None);
        }
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(MetadataError::ApiError {
                api_source: "ScreenScraper".to_string(),
                status: status.as_u16(),
                message: body,
            });
        }

        let ss_resp: SsResponse = resp
            .json()
            .await
            .map_err(|e| MetadataError::NetworkError(e.to_string()))?;

        match ss_resp.response.and_then(|r| r.jeu) {
            Some(game) => Ok(Some(ss_game_to_metadata(game))),
            None => Ok(None),
        }
    }

    /// Searches ScreenScraper for a game by name and system.
    ///
    /// Uses the search endpoint to find a game ID, then fetches full details.
    /// This is less reliable than hash-based lookup.
    pub async fn search_by_name(
        &self,
        name: &str,
        system_id: &str,
    ) -> Result<Option<GameMetadata>, MetadataError> {
        if !self.is_configured() {
            return Err(MetadataError::NotConfigured(
                "ScreenScraper credentials are required".to_string(),
            ));
        }

        let ss_system_id = match Self::map_system_id(system_id) {
            Some(id) => id,
            None => return Ok(None),
        };

        self.rate_limit().await;

        // First, search for game ID by name.
        let mut params = self.auth_params();
        params.push(("systemeid", ss_system_id));
        params.push(("recherche", name));

        let resp = self
            .http
            .get("https://api.screenscraper.fr/api2/jeuRecherche.php")
            .query(&params)
            .send()
            .await
            .map_err(|e| MetadataError::NetworkError(e.to_string()))?;

        let status = resp.status();
        if !status.is_success() {
            if status.as_u16() == 404 || status.as_u16() == 430 {
                return Ok(None);
            }
            let body = resp.text().await.unwrap_or_default();
            return Err(MetadataError::ApiError {
                api_source: "ScreenScraper".to_string(),
                status: status.as_u16(),
                message: body,
            });
        }

        let search_resp: SsSearchResponse = resp
            .json()
            .await
            .map_err(|e| MetadataError::NetworkError(e.to_string()))?;

        let game_id = match search_resp
            .response
            .and_then(|r| r.jeux)
            .and_then(|mut games| games.first_mut().and_then(|g| g.id.take()))
        {
            Some(id) => id,
            None => return Ok(None),
        };

        // Fetch full game info by ID.
        self.rate_limit().await;

        let mut params = self.auth_params();
        params.push(("gameid", &game_id));

        let resp = self
            .http
            .get("https://api.screenscraper.fr/api2/jeuInfos.php")
            .query(&params)
            .send()
            .await
            .map_err(|e| MetadataError::NetworkError(e.to_string()))?;

        let status = resp.status();
        if !status.is_success() {
            if status.as_u16() == 404 || status.as_u16() == 430 {
                return Ok(None);
            }
            let body = resp.text().await.unwrap_or_default();
            return Err(MetadataError::ApiError {
                api_source: "ScreenScraper".to_string(),
                status: status.as_u16(),
                message: body,
            });
        }

        let ss_resp: SsResponse = resp
            .json()
            .await
            .map_err(|e| MetadataError::NetworkError(e.to_string()))?;

        match ss_resp.response.and_then(|r| r.jeu) {
            Some(game) => Ok(Some(ss_game_to_metadata(game))),
            None => Ok(None),
        }
    }

    /// Maps RetroLaunch system IDs to ScreenScraper numeric system IDs.
    ///
    /// Returns `None` for unsupported systems.
    pub fn map_system_id(retrolaunch_id: &str) -> Option<&'static str> {
        match retrolaunch_id {
            "nes" => Some("3"),
            "snes" => Some("4"),
            "n64" => Some("14"),
            "gb" => Some("9"),
            "gbc" => Some("10"),
            "gba" => Some("12"),
            "genesis" => Some("1"),
            "master_system" => Some("2"),
            "game_gear" => Some("21"),
            "ps1" => Some("57"),
            "saturn" => Some("22"),
            "neogeo" => Some("142"),
            "atari2600" => Some("26"),
            _ => None,
        }
    }
}

/// Converts a ScreenScraper game response into our internal `GameMetadata`.
fn ss_game_to_metadata(game: SsGame) -> GameMetadata {
    // Pick the best cover (box-2D, prefer US or world region).
    let cover_url = game
        .medias
        .as_ref()
        .and_then(|medias| {
            let box_2d: Vec<&SsMedia> = medias
                .iter()
                .filter(|m| m.media_type.as_deref() == Some("box-2D"))
                .collect();

            // Prefer US, then world, then any region.
            box_2d
                .iter()
                .find(|m| m.region.as_deref() == Some("us"))
                .or_else(|| box_2d.iter().find(|m| m.region.as_deref() == Some("wor")))
                .or_else(|| box_2d.first())
                .and_then(|m| m.url.clone())
        });

    // Collect screenshot URLs.
    let screenshot_urls: Vec<String> = game
        .medias
        .as_ref()
        .map(|medias| {
            medias
                .iter()
                .filter(|m| m.media_type.as_deref() == Some("ss"))
                .filter_map(|m| m.url.clone())
                .collect()
        })
        .unwrap_or_default();

    // Extract release date (prefer US, then world, then any).
    let release_date = game.dates.as_ref().and_then(|dates| {
        dates
            .iter()
            .find(|d| d.region.as_deref() == Some("us"))
            .or_else(|| dates.iter().find(|d| d.region.as_deref() == Some("wor")))
            .or_else(|| dates.first())
            .and_then(|d| d.text.clone())
    });

    // Extract genre (English preferred).
    let genre = game.genres.as_ref().and_then(|genres| {
        let names: Vec<String> = genres
            .iter()
            .filter_map(|g| {
                g.noms.as_ref().and_then(|noms| {
                    noms.iter()
                        .find(|n| n.langue.as_deref() == Some("en"))
                        .or_else(|| noms.first())
                        .and_then(|n| n.text.clone())
                })
            })
            .collect();

        if names.is_empty() {
            None
        } else {
            Some(names.join(", "))
        }
    });

    // Extract synopsis (English preferred).
    let description = game.synopsis.as_ref().and_then(|texts| {
        texts
            .iter()
            .find(|t| t.langue.as_deref() == Some("en"))
            .or_else(|| texts.first())
            .and_then(|t| t.text.clone())
    });

    GameMetadata {
        igdb_id: None,
        developer: game.developpeur.and_then(|d| d.text),
        publisher: game.editeur.and_then(|e| e.text),
        release_date,
        genre,
        description,
        cover_url,
        screenshot_urls,
        source: "screenscraper".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_system_id_mapping() {
        assert_eq!(ScreenScraperClient::map_system_id("nes"), Some("3"));
        assert_eq!(ScreenScraperClient::map_system_id("snes"), Some("4"));
        assert_eq!(ScreenScraperClient::map_system_id("genesis"), Some("1"));
        assert_eq!(ScreenScraperClient::map_system_id("gba"), Some("12"));
        assert_eq!(ScreenScraperClient::map_system_id("ps1"), Some("57"));
        assert_eq!(ScreenScraperClient::map_system_id("unknown_system"), None);
    }

    #[test]
    fn test_is_configured() {
        let client = ScreenScraperClient::new(
            "dev".to_string(),
            "pass".to_string(),
            "user".to_string(),
            "upass".to_string(),
        );
        assert!(client.is_configured());

        let client = ScreenScraperClient::new(
            String::new(),
            String::new(),
            String::new(),
            String::new(),
        );
        assert!(!client.is_configured());
    }

    #[test]
    fn test_ss_game_to_metadata_cover_selection() {
        let game = SsGame {
            id: Some("123".to_string()),
            noms: None,
            developpeur: Some(SsTextValue {
                text: Some("Nintendo".to_string()),
            }),
            editeur: Some(SsTextValue {
                text: Some("Nintendo".to_string()),
            }),
            dates: Some(vec![SsDate {
                region: Some("us".to_string()),
                text: Some("1994-03-19".to_string()),
            }]),
            genres: Some(vec![SsGenre {
                noms: Some(vec![SsGenreNom {
                    langue: Some("en".to_string()),
                    text: Some("Action".to_string()),
                }]),
            }]),
            synopsis: Some(vec![SsText {
                langue: Some("en".to_string()),
                text: Some("A great game.".to_string()),
            }]),
            medias: Some(vec![
                SsMedia {
                    media_type: Some("box-2D".to_string()),
                    region: Some("jp".to_string()),
                    url: Some("https://example.com/jp_cover.png".to_string()),
                },
                SsMedia {
                    media_type: Some("box-2D".to_string()),
                    region: Some("us".to_string()),
                    url: Some("https://example.com/us_cover.png".to_string()),
                },
                SsMedia {
                    media_type: Some("ss".to_string()),
                    region: None,
                    url: Some("https://example.com/screenshot1.png".to_string()),
                },
            ]),
        };

        let md = ss_game_to_metadata(game);
        assert_eq!(md.source, "screenscraper");
        assert_eq!(
            md.cover_url.as_deref(),
            Some("https://example.com/us_cover.png")
        );
        assert_eq!(md.developer.as_deref(), Some("Nintendo"));
        assert_eq!(md.publisher.as_deref(), Some("Nintendo"));
        assert_eq!(md.release_date.as_deref(), Some("1994-03-19"));
        assert_eq!(md.genre.as_deref(), Some("Action"));
        assert_eq!(md.description.as_deref(), Some("A great game."));
        assert_eq!(md.screenshot_urls.len(), 1);
    }

    #[test]
    fn test_system_id_mapping_all_known_systems() {
        let mappings = [
            ("nes", "3"),
            ("snes", "4"),
            ("n64", "14"),
            ("gb", "9"),
            ("gbc", "10"),
            ("gba", "12"),
            ("genesis", "1"),
            ("master_system", "2"),
            ("game_gear", "21"),
            ("ps1", "57"),
            ("saturn", "22"),
            ("neogeo", "142"),
            ("atari2600", "26"),
        ];

        for (retrolaunch_id, expected_ss_id) in &mappings {
            assert_eq!(
                ScreenScraperClient::map_system_id(retrolaunch_id),
                Some(*expected_ss_id),
                "System '{}' should map to ScreenScraper ID '{}'",
                retrolaunch_id,
                expected_ss_id
            );
        }
    }

    #[test]
    fn test_system_id_mapping_returns_none_for_unknown() {
        assert_eq!(ScreenScraperClient::map_system_id("dreamcast"), None);
        assert_eq!(ScreenScraperClient::map_system_id(""), None);
        assert_eq!(ScreenScraperClient::map_system_id("xbox"), None);
    }

    #[test]
    fn test_is_configured_requires_dev_id_and_username() {
        // dev_id present but username empty
        let client = ScreenScraperClient::new(
            "dev".to_string(),
            "pass".to_string(),
            String::new(),
            "upass".to_string(),
        );
        assert!(
            !client.is_configured(),
            "Should not be configured when username is empty"
        );

        // username present but dev_id empty
        let client = ScreenScraperClient::new(
            String::new(),
            "pass".to_string(),
            "user".to_string(),
            "upass".to_string(),
        );
        assert!(
            !client.is_configured(),
            "Should not be configured when dev_id is empty"
        );
    }

    #[test]
    fn test_ss_game_to_metadata_cover_fallback_to_world_region() {
        let game = SsGame {
            id: Some("200".to_string()),
            noms: None,
            developpeur: None,
            editeur: None,
            dates: None,
            genres: None,
            synopsis: None,
            medias: Some(vec![
                SsMedia {
                    media_type: Some("box-2D".to_string()),
                    region: Some("jp".to_string()),
                    url: Some("https://example.com/jp_cover.png".to_string()),
                },
                SsMedia {
                    media_type: Some("box-2D".to_string()),
                    region: Some("wor".to_string()),
                    url: Some("https://example.com/world_cover.png".to_string()),
                },
            ]),
        };

        let md = ss_game_to_metadata(game);
        assert_eq!(
            md.cover_url.as_deref(),
            Some("https://example.com/world_cover.png"),
            "Should fall back to 'wor' region when 'us' is not available"
        );
    }

    #[test]
    fn test_ss_game_to_metadata_cover_fallback_to_any_region() {
        let game = SsGame {
            id: Some("300".to_string()),
            noms: None,
            developpeur: None,
            editeur: None,
            dates: None,
            genres: None,
            synopsis: None,
            medias: Some(vec![SsMedia {
                media_type: Some("box-2D".to_string()),
                region: Some("eu".to_string()),
                url: Some("https://example.com/eu_cover.png".to_string()),
            }]),
        };

        let md = ss_game_to_metadata(game);
        assert_eq!(
            md.cover_url.as_deref(),
            Some("https://example.com/eu_cover.png"),
            "Should fall back to any region when neither 'us' nor 'wor' is available"
        );
    }

    #[test]
    fn test_ss_game_to_metadata_no_cover() {
        let game = SsGame {
            id: Some("400".to_string()),
            noms: None,
            developpeur: None,
            editeur: None,
            dates: None,
            genres: None,
            synopsis: None,
            medias: Some(vec![SsMedia {
                media_type: Some("ss".to_string()),
                region: None,
                url: Some("https://example.com/screenshot.png".to_string()),
            }]),
        };

        let md = ss_game_to_metadata(game);
        assert!(
            md.cover_url.is_none(),
            "Should be None when no box-2D media exists"
        );
        assert_eq!(md.screenshot_urls.len(), 1);
    }

    #[test]
    fn test_ss_game_to_metadata_all_fields_empty() {
        let game = SsGame {
            id: None,
            noms: None,
            developpeur: None,
            editeur: None,
            dates: None,
            genres: None,
            synopsis: None,
            medias: None,
        };

        let md = ss_game_to_metadata(game);
        assert!(md.cover_url.is_none());
        assert!(md.developer.is_none());
        assert!(md.publisher.is_none());
        assert!(md.release_date.is_none());
        assert!(md.genre.is_none());
        assert!(md.description.is_none());
        assert!(md.screenshot_urls.is_empty());
        assert_eq!(md.source, "screenscraper");
        assert!(md.igdb_id.is_none());
    }

    #[test]
    fn test_ss_game_to_metadata_date_region_preference() {
        let game = SsGame {
            id: Some("500".to_string()),
            noms: None,
            developpeur: None,
            editeur: None,
            dates: Some(vec![
                SsDate {
                    region: Some("jp".to_string()),
                    text: Some("1990-11-21".to_string()),
                },
                SsDate {
                    region: Some("wor".to_string()),
                    text: Some("1991-07-01".to_string()),
                },
            ]),
            genres: None,
            synopsis: None,
            medias: None,
        };

        let md = ss_game_to_metadata(game);
        // No "us" date, should fall back to "wor".
        assert_eq!(md.release_date.as_deref(), Some("1991-07-01"));
    }

    #[test]
    fn test_ss_game_to_metadata_synopsis_english_preferred() {
        let game = SsGame {
            id: Some("600".to_string()),
            noms: None,
            developpeur: None,
            editeur: None,
            dates: None,
            genres: None,
            synopsis: Some(vec![
                SsText {
                    langue: Some("fr".to_string()),
                    text: Some("Un super jeu.".to_string()),
                },
                SsText {
                    langue: Some("en".to_string()),
                    text: Some("A super game.".to_string()),
                },
            ]),
            medias: None,
        };

        let md = ss_game_to_metadata(game);
        assert_eq!(
            md.description.as_deref(),
            Some("A super game."),
            "Should prefer English synopsis"
        );
    }

    #[test]
    fn test_ss_game_to_metadata_genre_english_preferred() {
        let game = SsGame {
            id: Some("700".to_string()),
            noms: None,
            developpeur: None,
            editeur: None,
            dates: None,
            genres: Some(vec![SsGenre {
                noms: Some(vec![
                    SsGenreNom {
                        langue: Some("fr".to_string()),
                        text: Some("Plate-forme".to_string()),
                    },
                    SsGenreNom {
                        langue: Some("en".to_string()),
                        text: Some("Platform".to_string()),
                    },
                ]),
            }]),
            synopsis: None,
            medias: None,
        };

        let md = ss_game_to_metadata(game);
        assert_eq!(md.genre.as_deref(), Some("Platform"));
    }

    #[test]
    fn test_ss_game_to_metadata_multiple_genres() {
        let game = SsGame {
            id: Some("800".to_string()),
            noms: None,
            developpeur: None,
            editeur: None,
            dates: None,
            genres: Some(vec![
                SsGenre {
                    noms: Some(vec![SsGenreNom {
                        langue: Some("en".to_string()),
                        text: Some("Action".to_string()),
                    }]),
                },
                SsGenre {
                    noms: Some(vec![SsGenreNom {
                        langue: Some("en".to_string()),
                        text: Some("Adventure".to_string()),
                    }]),
                },
            ]),
            synopsis: None,
            medias: None,
        };

        let md = ss_game_to_metadata(game);
        assert_eq!(md.genre.as_deref(), Some("Action, Adventure"));
    }

    #[tokio::test]
    async fn test_search_by_hash_not_configured() {
        let client = ScreenScraperClient::new(
            String::new(),
            String::new(),
            String::new(),
            String::new(),
        );
        let result = client.search_by_hash("aabbccdd", None, "nes").await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(
            matches!(err, MetadataError::NotConfigured(_)),
            "Expected NotConfigured error, got: {:?}",
            err
        );
    }

    #[tokio::test]
    async fn test_search_by_name_not_configured() {
        let client = ScreenScraperClient::new(
            String::new(),
            String::new(),
            String::new(),
            String::new(),
        );
        let result = client.search_by_name("Super Mario", "nes").await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(matches!(err, MetadataError::NotConfigured(_)));
    }

    #[tokio::test]
    async fn test_search_by_hash_unsupported_system_returns_none() {
        let client = ScreenScraperClient::new(
            "dev".to_string(),
            "pass".to_string(),
            "user".to_string(),
            "upass".to_string(),
        );
        // "dreamcast" is not in the system ID map, so should return Ok(None)
        // without making any HTTP request.
        let result = client
            .search_by_hash("aabbccdd", None, "dreamcast")
            .await;
        assert!(result.is_ok());
        assert!(
            result.unwrap().is_none(),
            "Unsupported system should return None"
        );
    }
}

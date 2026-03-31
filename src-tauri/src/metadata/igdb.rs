//! IGDB API client with Twitch OAuth2 authentication.
//!
//! Uses the Apicalypse query language over POST requests. Supports automatic
//! token refresh and rate limiting (4 requests/second).

use super::MetadataError;
use crate::models::GameMetadata;
use reqwest::Client;
use serde::Deserialize;
use std::time::{Duration, Instant};
use tokio::sync::{Mutex, RwLock};

/// An authenticated IGDB access token with its expiry time.
#[derive(Debug, Clone)]
struct IgdbToken {
    access_token: String,
    expires_at: Instant,
}

/// IGDB API client that handles authentication, rate limiting, and game search.
pub struct IgdbClient {
    http: Client,
    client_id: String,
    client_secret: String,
    token: RwLock<Option<IgdbToken>>,
    last_request: Mutex<Instant>,
}

/// Twitch OAuth2 token response.
#[derive(Debug, Deserialize)]
struct TwitchTokenResponse {
    access_token: String,
    expires_in: u64,
}

/// Top-level IGDB game response.
#[derive(Debug, Default, Deserialize)]
#[allow(dead_code)]
struct IgdbGame {
    id: Option<i64>,
    name: Option<String>,
    cover: Option<IgdbCover>,
    screenshots: Option<Vec<IgdbScreenshot>>,
    involved_companies: Option<Vec<IgdbInvolvedCompany>>,
    first_release_date: Option<i64>,
    genres: Option<Vec<IgdbGenre>>,
    summary: Option<String>,
    /// IGDB category: 0 = main game, 1 = DLC, 2 = expansion, etc.
    category: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct IgdbCover {
    url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct IgdbScreenshot {
    url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct IgdbInvolvedCompany {
    company: Option<IgdbCompany>,
    developer: Option<bool>,
    publisher: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct IgdbCompany {
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct IgdbGenre {
    name: Option<String>,
}

impl IgdbClient {
    /// Creates a new IGDB client with the given Twitch credentials.
    ///
    /// If `client_id` is empty, the client is considered "not configured"
    /// and all API calls will return `NotConfigured`.
    pub fn new(client_id: String, client_secret: String) -> Self {
        Self {
            http: Client::new(),
            client_id,
            client_secret,
            token: RwLock::new(None),
            last_request: Mutex::new(Instant::now() - Duration::from_secs(1)),
        }
    }

    /// Returns `true` if the client has credentials configured.
    pub fn is_configured(&self) -> bool {
        !self.client_id.is_empty() && !self.client_secret.is_empty()
    }

    /// Authenticates with Twitch OAuth2 to obtain an IGDB access token.
    async fn authenticate(&self) -> Result<(), MetadataError> {
        let resp = self
            .http
            .post("https://id.twitch.tv/oauth2/token")
            .form(&[
                ("client_id", self.client_id.as_str()),
                ("client_secret", self.client_secret.as_str()),
                ("grant_type", "client_credentials"),
            ])
            .send()
            .await
            .map_err(|e| MetadataError::NetworkError(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            return Err(MetadataError::AuthenticationFailed(format!(
                "Twitch OAuth2 returned HTTP {}: {}",
                status, body
            )));
        }

        let token_resp: TwitchTokenResponse = resp
            .json()
            .await
            .map_err(|e| MetadataError::AuthenticationFailed(e.to_string()))?;

        let token = IgdbToken {
            access_token: token_resp.access_token,
            // Expire 60 seconds early to provide a safety margin.
            expires_at: Instant::now()
                + Duration::from_secs(token_resp.expires_in.saturating_sub(60)),
        };

        let mut guard = self.token.write().await;
        *guard = Some(token);

        Ok(())
    }

    /// Ensures the client has a valid access token, refreshing if needed.
    ///
    /// Returns the current access token string.
    async fn ensure_authenticated(&self) -> Result<String, MetadataError> {
        if !self.is_configured() {
            return Err(MetadataError::NotConfigured(
                "IGDB client_id and client_secret are required".to_string(),
            ));
        }

        // Check if current token is valid.
        {
            let guard = self.token.read().await;
            if let Some(ref token) = *guard {
                if Instant::now() < token.expires_at {
                    return Ok(token.access_token.clone());
                }
            }
        }

        // Token is missing or expired — re-authenticate.
        self.authenticate().await?;

        let guard = self.token.read().await;
        match *guard {
            Some(ref token) => Ok(token.access_token.clone()),
            None => Err(MetadataError::AuthenticationFailed(
                "Token not available after authentication".to_string(),
            )),
        }
    }

    /// Enforces the IGDB rate limit of 4 requests/second (250ms between requests).
    async fn rate_limit(&self) {
        let mut last = self.last_request.lock().await;
        let elapsed = last.elapsed();
        let min_interval = Duration::from_millis(250);

        if elapsed < min_interval {
            tokio::time::sleep(min_interval - elapsed).await;
        }

        *last = Instant::now();
    }

    /// Maps RetroLaunch system IDs to IGDB platform IDs for filtered searches.
    fn map_platform_id(system_id: &str) -> Option<u32> {
        match system_id {
            "nes" => Some(18),
            "snes" => Some(19),
            "n64" => Some(4),
            "gb" => Some(33),
            "gbc" => Some(22),
            "gba" => Some(24),
            "genesis" => Some(29),
            "master_system" => Some(64),
            "game_gear" => Some(35),
            "ps1" => Some(7),
            "saturn" => Some(32),
            "neogeo" => Some(80),
            "atari2600" => Some(59),
            _ => None,
        }
    }

    /// Searches IGDB for a game by name, optionally filtered by platform.
    ///
    /// Returns the best match as a `GameMetadata`, or `None` if no results were found.
    /// Cover URLs are transformed from `t_thumb` to `t_cover_big` for full-size images.
    /// When `system_id` is provided, results are filtered to that platform for better accuracy.
    pub async fn search_game(
        &self,
        name: &str,
        system_id: Option<&str>,
    ) -> Result<Option<GameMetadata>, MetadataError> {
        let token = self.ensure_authenticated().await?;
        self.rate_limit().await;

        // Build the Apicalypse query body.
        // Request category field so we can prefer main games (category 0) over
        // mods, hacks, DLC, etc. Filter by platform when known.
        let platform_filter = system_id
            .and_then(Self::map_platform_id)
            .map(|pid| format!("where platforms = ({pid});"))
            .unwrap_or_default();
        let query = format!(
            "search \"{}\"; fields name,cover.url,screenshots.url,\
             involved_companies.company.name,involved_companies.developer,\
             involved_companies.publisher,first_release_date,genres.name,summary,category;\
             {platform_filter} limit 10;",
            name.replace('"', "\\\"")
        );

        let resp = self
            .http
            .post("https://api.igdb.com/v4/games")
            .header("Client-ID", &self.client_id)
            .header("Authorization", format!("Bearer {}", token))
            .body(query)
            .send()
            .await
            .map_err(|e| MetadataError::NetworkError(e.to_string()))?;

        let status = resp.status();
        if status.as_u16() == 429 {
            return Err(MetadataError::RateLimited {
                retry_after_ms: 1000,
            });
        }
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(MetadataError::ApiError {
                api_source: "IGDB".to_string(),
                status: status.as_u16(),
                message: body,
            });
        }

        let games: Vec<IgdbGame> = resp
            .json()
            .await
            .map_err(|e| MetadataError::NetworkError(e.to_string()))?;

        if games.is_empty() {
            return Ok(None);
        }

        // Score results to find the best match. Lower score = better.
        // Criteria: name similarity (dominant), main game category, more companies,
        // lower IGDB ID (older/more established entries).
        let game = games
            .into_iter()
            .min_by_key(|g| {
                // Name similarity score — heavily weighted so exact matches always win.
                let game_name = g.name.as_deref().unwrap_or("");
                let name_lower = name.to_ascii_lowercase();
                let game_name_lower = game_name.to_ascii_lowercase();
                let name_score: i64 = if game_name.eq_ignore_ascii_case(name) {
                    -10000 // Exact match (case-insensitive)
                } else if game_name_lower.contains(&name_lower)
                    || name_lower.contains(&game_name_lower)
                {
                    -5000 // One name is a substring of the other
                } else {
                    0 // No obvious relationship
                };

                let category_score: i64 = match g.category {
                    Some(0) => 0,   // Main game
                    None => 100,    // Unknown
                    Some(_) => 200, // DLC, mod, expansion
                };

                // Prefer games with more involved companies (official games have
                // both developer and publisher; ROM hacks often have fewer).
                let company_count = g
                    .involved_companies
                    .as_ref()
                    .map(|c| c.len())
                    .unwrap_or(0) as i64;
                let company_score = -company_count * 10;

                // Prefer lower IGDB IDs as a tiebreaker — official games were
                // added to IGDB first and have lower IDs than fan-made entries.
                let id_score = g.id.unwrap_or(i64::MAX) / 1000;

                name_score + category_score + company_score + id_score
            })
            .unwrap(); // Safe: we checked games is not empty above.

        Ok(Some(igdb_game_to_metadata(game)))
    }
}

/// Converts an IGDB game response into our internal `GameMetadata` representation.
fn igdb_game_to_metadata(game: IgdbGame) -> GameMetadata {
    // Extract developer and publisher from involved_companies.
    let mut developer: Option<String> = None;
    let mut publisher: Option<String> = None;

    if let Some(companies) = &game.involved_companies {
        for ic in companies {
            if let Some(ref company) = ic.company {
                if let Some(ref name) = company.name {
                    if ic.developer.unwrap_or(false) && developer.is_none() {
                        developer = Some(name.clone());
                    }
                    if ic.publisher.unwrap_or(false) && publisher.is_none() {
                        publisher = Some(name.clone());
                    }
                }
            }
        }
    }

    // Convert cover URL: replace t_thumb with t_cover_big, add https: prefix.
    let cover_url = game.cover.and_then(|c| c.url).map(|url| {
        let full = if url.starts_with("//") {
            format!("https:{}", url)
        } else {
            url.clone()
        };
        full.replace("t_thumb", "t_cover_big")
    });

    // Extract screenshot URLs.
    let screenshot_urls: Vec<String> = game
        .screenshots
        .unwrap_or_default()
        .into_iter()
        .filter_map(|s| {
            s.url.map(|url| {
                let full = if url.starts_with("//") {
                    format!("https:{}", url)
                } else {
                    url
                };
                full.replace("t_thumb", "t_screenshot_big")
            })
        })
        .collect();

    // Convert Unix timestamp to ISO 8601 date string.
    let release_date = game.first_release_date.map(|ts| {
        let secs = ts;
        // Simple conversion: compute year-month-day from Unix timestamp.
        // Using chrono would be cleaner but we avoid the dependency.
        let days = secs / 86400;
        let (year, month, day) = days_to_ymd(days);
        format!("{:04}-{:02}-{:02}", year, month, day)
    });

    // Join genre names.
    let genre = game.genres.map(|genres| {
        genres
            .into_iter()
            .filter_map(|g| g.name)
            .collect::<Vec<_>>()
            .join(", ")
    });

    GameMetadata {
        igdb_id: game.id,
        developer,
        publisher,
        release_date,
        genre,
        description: game.summary,
        cover_url,
        screenshot_urls,
        source: "igdb".to_string(),
    }
}

/// Converts days since Unix epoch to (year, month, day).
///
/// Simple civil date calculation without external dependencies.
fn days_to_ymd(days_since_epoch: i64) -> (i64, u32, u32) {
    // Algorithm from Howard Hinnant's date algorithms.
    let z = days_since_epoch + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };
    (year, m, d)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cover_url_transform() {
        let game = IgdbGame {
            id: Some(1234),
            name: Some("Test Game".to_string()),
            cover: Some(IgdbCover {
                url: Some("//images.igdb.com/igdb/image/upload/t_thumb/abc123.jpg".to_string()),
            }),
            screenshots: None,
            involved_companies: None,
            first_release_date: None,
            genres: None,
            summary: None,
            ..Default::default()
        };

        let md = igdb_game_to_metadata(game);
        assert_eq!(
            md.cover_url.as_deref(),
            Some("https://images.igdb.com/igdb/image/upload/t_cover_big/abc123.jpg")
        );
        assert_eq!(md.source, "igdb");
    }

    #[test]
    fn test_involved_companies_extraction() {
        let game = IgdbGame {
            id: Some(42),
            name: Some("Metroid".to_string()),
            cover: None,
            screenshots: None,
            involved_companies: Some(vec![
                IgdbInvolvedCompany {
                    company: Some(IgdbCompany {
                        name: Some("Nintendo R&D1".to_string()),
                    }),
                    developer: Some(true),
                    publisher: Some(false),
                },
                IgdbInvolvedCompany {
                    company: Some(IgdbCompany {
                        name: Some("Nintendo".to_string()),
                    }),
                    developer: Some(false),
                    publisher: Some(true),
                },
            ]),
            first_release_date: None,
            genres: None,
            summary: None,
            ..Default::default()
        };

        let md = igdb_game_to_metadata(game);
        assert_eq!(md.developer.as_deref(), Some("Nintendo R&D1"));
        assert_eq!(md.publisher.as_deref(), Some("Nintendo"));
    }

    #[test]
    fn test_unix_timestamp_to_date() {
        // 1994-03-19 = Super Metroid JP release
        let game = IgdbGame {
            id: Some(1),
            name: None,
            cover: None,
            screenshots: None,
            involved_companies: None,
            first_release_date: Some(764035200), // 1994-03-19
            genres: None,
            summary: None,
            ..Default::default()
        };

        let md = igdb_game_to_metadata(game);
        assert_eq!(md.release_date.as_deref(), Some("1994-03-19"));
    }

    #[test]
    fn test_screenshot_url_transform() {
        let game = IgdbGame {
            id: Some(1),
            name: None,
            cover: None,
            screenshots: Some(vec![
                IgdbScreenshot {
                    url: Some("//images.igdb.com/igdb/image/upload/t_thumb/ss1.jpg".to_string()),
                },
                IgdbScreenshot {
                    url: Some("//images.igdb.com/igdb/image/upload/t_thumb/ss2.jpg".to_string()),
                },
            ]),
            involved_companies: None,
            first_release_date: None,
            genres: None,
            summary: None,
            ..Default::default()
        };

        let md = igdb_game_to_metadata(game);
        assert_eq!(md.screenshot_urls.len(), 2);
        assert!(md.screenshot_urls[0].contains("t_screenshot_big"));
        assert!(md.screenshot_urls[0].starts_with("https:"));
    }

    #[test]
    fn test_genre_join() {
        let game = IgdbGame {
            id: Some(1),
            name: None,
            cover: None,
            screenshots: None,
            involved_companies: None,
            first_release_date: None,
            genres: Some(vec![
                IgdbGenre {
                    name: Some("Action".to_string()),
                },
                IgdbGenre {
                    name: Some("Adventure".to_string()),
                },
            ]),
            summary: None,
            ..Default::default()
        };

        let md = igdb_game_to_metadata(game);
        assert_eq!(md.genre.as_deref(), Some("Action, Adventure"));
    }

    #[test]
    fn test_is_configured() {
        let client = IgdbClient::new("my_id".to_string(), "my_secret".to_string());
        assert!(client.is_configured());

        let client = IgdbClient::new(String::new(), String::new());
        assert!(!client.is_configured());

        let client = IgdbClient::new("id_only".to_string(), String::new());
        assert!(!client.is_configured());
    }

    #[test]
    fn test_days_to_ymd() {
        // Unix epoch = 1970-01-01
        assert_eq!(days_to_ymd(0), (1970, 1, 1));
        // 2000-01-01 = day 10957
        assert_eq!(days_to_ymd(10957), (2000, 1, 1));
    }

    #[test]
    fn test_days_to_ymd_leap_year() {
        // 2000-02-29 = day 10987 (leap day)
        assert_eq!(days_to_ymd(11016), (2000, 02, 29));
    }

    #[test]
    fn test_cover_url_with_https_prefix_already_present() {
        let game = IgdbGame {
            id: Some(1),
            name: Some("Test".to_string()),
            cover: Some(IgdbCover {
                url: Some("https://images.igdb.com/igdb/image/upload/t_thumb/abc.jpg".to_string()),
            }),
            screenshots: None,
            involved_companies: None,
            first_release_date: None,
            genres: None,
            summary: None,
            ..Default::default()
        };

        let md = igdb_game_to_metadata(game);
        assert_eq!(
            md.cover_url.as_deref(),
            Some("https://images.igdb.com/igdb/image/upload/t_cover_big/abc.jpg"),
            "URLs already starting with https: should not get a double prefix"
        );
    }

    #[test]
    fn test_all_fields_none_does_not_panic() {
        let game = IgdbGame {
            id: None,
            name: None,
            cover: None,
            screenshots: None,
            involved_companies: None,
            first_release_date: None,
            genres: None,
            summary: None,
            ..Default::default()
        };

        let md = igdb_game_to_metadata(game);
        assert!(md.cover_url.is_none());
        assert!(md.developer.is_none());
        assert!(md.publisher.is_none());
        assert!(md.release_date.is_none());
        assert!(md.genre.is_none());
        assert!(md.description.is_none());
        assert!(md.screenshot_urls.is_empty());
        assert_eq!(md.source, "igdb");
    }

    #[test]
    fn test_involved_companies_with_missing_company_name() {
        let game = IgdbGame {
            id: Some(1),
            name: None,
            cover: None,
            screenshots: None,
            involved_companies: Some(vec![
                IgdbInvolvedCompany {
                    company: None,
                    developer: Some(true),
                    publisher: Some(false),
                },
                IgdbInvolvedCompany {
                    company: Some(IgdbCompany { name: None }),
                    developer: Some(true),
                    publisher: Some(false),
                },
                IgdbInvolvedCompany {
                    company: Some(IgdbCompany {
                        name: Some("Good Studio".to_string()),
                    }),
                    developer: Some(true),
                    publisher: Some(false),
                },
            ]),
            first_release_date: None,
            genres: None,
            summary: None,
            ..Default::default()
        };

        let md = igdb_game_to_metadata(game);
        assert_eq!(
            md.developer.as_deref(),
            Some("Good Studio"),
            "Should skip companies with None name"
        );
        assert!(md.publisher.is_none());
    }

    #[test]
    fn test_empty_genres_list() {
        let game = IgdbGame {
            id: Some(1),
            name: None,
            cover: None,
            screenshots: None,
            involved_companies: None,
            first_release_date: None,
            genres: Some(vec![]),
            summary: None,
            ..Default::default()
        };

        let md = igdb_game_to_metadata(game);
        // An empty genres vec should produce Some("") since it maps but collects zero items.
        assert_eq!(md.genre.as_deref(), Some(""));
    }

    #[test]
    fn test_genres_with_none_names_filtered() {
        let game = IgdbGame {
            id: Some(1),
            name: None,
            cover: None,
            screenshots: None,
            involved_companies: None,
            first_release_date: None,
            genres: Some(vec![
                IgdbGenre { name: None },
                IgdbGenre {
                    name: Some("Platformer".to_string()),
                },
                IgdbGenre { name: None },
                IgdbGenre {
                    name: Some("RPG".to_string()),
                },
            ]),
            summary: None,
            ..Default::default()
        };

        let md = igdb_game_to_metadata(game);
        assert_eq!(md.genre.as_deref(), Some("Platformer, RPG"));
    }

    #[test]
    fn test_screenshots_with_none_urls_filtered() {
        let game = IgdbGame {
            id: Some(1),
            name: None,
            cover: None,
            screenshots: Some(vec![
                IgdbScreenshot { url: None },
                IgdbScreenshot {
                    url: Some("//images.igdb.com/igdb/image/upload/t_thumb/valid.jpg".to_string()),
                },
                IgdbScreenshot { url: None },
            ]),
            involved_companies: None,
            first_release_date: None,
            genres: None,
            summary: None,
            ..Default::default()
        };

        let md = igdb_game_to_metadata(game);
        assert_eq!(md.screenshot_urls.len(), 1);
        assert!(md.screenshot_urls[0].contains("t_screenshot_big"));
    }

    #[test]
    fn test_first_developer_and_publisher_wins() {
        let game = IgdbGame {
            id: Some(1),
            name: None,
            cover: None,
            screenshots: None,
            involved_companies: Some(vec![
                IgdbInvolvedCompany {
                    company: Some(IgdbCompany {
                        name: Some("Dev A".to_string()),
                    }),
                    developer: Some(true),
                    publisher: Some(false),
                },
                IgdbInvolvedCompany {
                    company: Some(IgdbCompany {
                        name: Some("Dev B".to_string()),
                    }),
                    developer: Some(true),
                    publisher: Some(false),
                },
                IgdbInvolvedCompany {
                    company: Some(IgdbCompany {
                        name: Some("Pub A".to_string()),
                    }),
                    developer: Some(false),
                    publisher: Some(true),
                },
                IgdbInvolvedCompany {
                    company: Some(IgdbCompany {
                        name: Some("Pub B".to_string()),
                    }),
                    developer: Some(false),
                    publisher: Some(true),
                },
            ]),
            first_release_date: None,
            genres: None,
            summary: None,
            ..Default::default()
        };

        let md = igdb_game_to_metadata(game);
        assert_eq!(
            md.developer.as_deref(),
            Some("Dev A"),
            "First developer should win"
        );
        assert_eq!(
            md.publisher.as_deref(),
            Some("Pub A"),
            "First publisher should win"
        );
    }

    #[tokio::test]
    async fn test_ensure_authenticated_not_configured() {
        let client = IgdbClient::new(String::new(), String::new());
        let result = client.ensure_authenticated().await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(
            matches!(err, MetadataError::NotConfigured(_)),
            "Expected NotConfigured error, got: {:?}",
            err
        );
    }
}

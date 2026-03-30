//! Image download, caching, optimization, and blurhash generation.
//!
//! Downloads cover art and screenshots from API URLs, optionally resizes
//! and converts to WebP, generates blurhash placeholder strings, and manages
//! the on-disk cache directory.

use super::MetadataError;
use crate::models::CacheStats;
use image::GenericImageView;
use reqwest::Client;
use std::fs;
use std::path::{Path, PathBuf};

/// Image cache that downloads, optimizes, and stores game artwork.
pub struct ImageCache {
    cache_dir: PathBuf,
    http: Client,
    optimize: bool,
    /// When true, skip URL scheme and host validation (for testing with mock servers).
    skip_url_validation: bool,
}

impl ImageCache {
    /// Creates a new image cache rooted under `<app_data_dir>/cache/`.
    ///
    /// Creates the `covers/` and `screenshots/` subdirectories if they
    /// do not already exist.
    pub fn new(app_data_dir: &Path, optimize: bool) -> Result<Self, MetadataError> {
        let cache_dir = app_data_dir.join("cache");
        fs::create_dir_all(cache_dir.join("covers"))?;
        fs::create_dir_all(cache_dir.join("screenshots"))?;

        Ok(Self {
            cache_dir,
            http: Client::new(),
            optimize,
            skip_url_validation: false,
        })
    }

    /// Creates a new image cache with a custom HTTP client.
    ///
    /// This is useful for testing, where the mock server uses HTTP instead of HTTPS,
    /// or for production scenarios where a custom client configuration is needed.
    /// URL validation (scheme and host allowlist) is disabled when using this
    /// constructor to allow connecting to local mock servers.
    pub fn new_with_client(
        app_data_dir: &Path,
        optimize: bool,
        http: Client,
    ) -> Result<Self, MetadataError> {
        let cache_dir = app_data_dir.join("cache");
        fs::create_dir_all(cache_dir.join("covers"))?;
        fs::create_dir_all(cache_dir.join("screenshots"))?;

        Ok(Self {
            cache_dir,
            http,
            optimize,
            skip_url_validation: true,
        })
    }

    /// Downloads a cover image, optionally optimizes it, generates a blurhash,
    /// and saves it to `covers/{game_id}.webp` (or `.png` if not optimizing).
    ///
    /// Returns the local file path and the blurhash string.
    pub async fn download_cover(
        &self,
        game_id: i64,
        url: &str,
    ) -> Result<(PathBuf, String), MetadataError> {
        let bytes = self.download_bytes(url).await?;

        let img = image::load_from_memory(&bytes)
            .map_err(|e| MetadataError::ImageProcessingError(e.to_string()))?;

        // Optionally resize and encode as WebP.
        let (save_bytes, extension) = if self.optimize {
            let resized = img.resize(300, u32::MAX, image::imageops::FilterType::Lanczos3);
            let mut buf = std::io::Cursor::new(Vec::new());
            resized
                .write_to(&mut buf, image::ImageFormat::WebP)
                .map_err(|e| MetadataError::ImageProcessingError(e.to_string()))?;
            (buf.into_inner(), "webp")
        } else {
            let mut buf = std::io::Cursor::new(Vec::new());
            img.write_to(&mut buf, image::ImageFormat::Png)
                .map_err(|e| MetadataError::ImageProcessingError(e.to_string()))?;
            (buf.into_inner(), "png")
        };

        // Generate blurhash from the (possibly resized) image.
        let blurhash_img = if self.optimize {
            img.resize(300, u32::MAX, image::imageops::FilterType::Lanczos3)
        } else {
            img
        };
        let blurhash = Self::generate_blurhash(&blurhash_img)?;

        // Save to disk.
        let path = self
            .cache_dir
            .join("covers")
            .join(format!("{}.{}", game_id, extension));
        fs::write(&path, &save_bytes)?;

        Ok((path, blurhash))
    }

    /// Downloads screenshots and saves them to `screenshots/{game_id}/{n}.webp`
    /// (or `.png` if not optimizing).
    ///
    /// Returns the list of local file paths for successfully downloaded screenshots.
    pub async fn download_screenshots(
        &self,
        game_id: i64,
        urls: &[String],
    ) -> Result<Vec<PathBuf>, MetadataError> {
        let dir = self
            .cache_dir
            .join("screenshots")
            .join(game_id.to_string());
        fs::create_dir_all(&dir)?;

        let extension = if self.optimize { "webp" } else { "png" };
        let mut paths = Vec::new();

        for (i, url) in urls.iter().enumerate() {
            match self.download_and_save_screenshot(url, &dir, i, extension).await {
                Ok(path) => paths.push(path),
                Err(e) => {
                    eprintln!(
                        "Warning: failed to download screenshot {} for game {}: {}",
                        i, game_id, e
                    );
                }
            }
        }

        Ok(paths)
    }

    /// Downloads a single screenshot, optionally optimizes, and saves to disk.
    async fn download_and_save_screenshot(
        &self,
        url: &str,
        dir: &Path,
        index: usize,
        extension: &str,
    ) -> Result<PathBuf, MetadataError> {
        let bytes = self.download_bytes(url).await?;

        let img = image::load_from_memory(&bytes)
            .map_err(|e| MetadataError::ImageProcessingError(e.to_string()))?;

        let save_bytes = if self.optimize {
            let resized = img.resize(640, u32::MAX, image::imageops::FilterType::Lanczos3);
            let mut buf = std::io::Cursor::new(Vec::new());
            resized
                .write_to(&mut buf, image::ImageFormat::WebP)
                .map_err(|e| MetadataError::ImageProcessingError(e.to_string()))?;
            buf.into_inner()
        } else {
            let mut buf = std::io::Cursor::new(Vec::new());
            img.write_to(&mut buf, image::ImageFormat::Png)
                .map_err(|e| MetadataError::ImageProcessingError(e.to_string()))?;
            buf.into_inner()
        };

        let path = dir.join(format!("{}.{}", index + 1, extension));
        fs::write(&path, &save_bytes)?;

        Ok(path)
    }

    /// Maximum image download size (10 MB). Prevents OOM from malicious URLs.
    const MAX_IMAGE_BYTES: u64 = 10 * 1024 * 1024;

    /// Allowed image host domains for download URLs.
    const ALLOWED_HOSTS: &[&str] = &[
        "images.igdb.com",
        "screenscraper.fr",
        "www.screenscraper.fr",
    ];

    /// Downloads raw bytes from a URL with size and domain validation.
    async fn download_bytes(&self, url: &str) -> Result<Vec<u8>, MetadataError> {
        // Validate URL scheme and domain to prevent SSRF (skipped for test clients).
        if !self.skip_url_validation {
            let parsed = url
                .parse::<reqwest::Url>()
                .map_err(|e| MetadataError::NetworkError(format!("Invalid URL: {e}")))?;
            if parsed.scheme() != "https" {
                return Err(MetadataError::NetworkError(format!(
                    "Only HTTPS URLs are allowed, got: {}",
                    parsed.scheme()
                )));
            }
            if let Some(host) = parsed.host_str() {
                if !Self::ALLOWED_HOSTS.iter().any(|h| host == *h || host.ends_with(&format!(".{h}"))) {
                    return Err(MetadataError::NetworkError(format!(
                        "Image host not allowed: {host}"
                    )));
                }
            } else {
                return Err(MetadataError::NetworkError("URL has no host".to_string()));
            }
        }

        let resp = self
            .http
            .get(url)
            .send()
            .await
            .map_err(|e| MetadataError::NetworkError(e.to_string()))?;

        if !resp.status().is_success() {
            return Err(MetadataError::ApiError {
                api_source: "image download".to_string(),
                status: resp.status().as_u16(),
                message: format!("Failed to download {}", url),
            });
        }

        // Reject responses that declare a Content-Length above our limit.
        if let Some(len) = resp.content_length() {
            if len > Self::MAX_IMAGE_BYTES {
                return Err(MetadataError::NetworkError(format!(
                    "Image too large: {len} bytes (max {})",
                    Self::MAX_IMAGE_BYTES
                )));
            }
        }

        resp.bytes()
            .await
            .map(|b| b.to_vec())
            .map_err(|e| MetadataError::NetworkError(e.to_string()))
    }

    /// Returns statistics about the current cache contents.
    ///
    /// Walks the `covers/` and `screenshots/` directories to count files
    /// and sum their sizes.
    pub fn get_cache_stats(&self) -> Result<CacheStats, MetadataError> {
        let (covers_count, covers_size) = dir_stats(&self.cache_dir.join("covers"))?;
        let (screenshots_count, screenshots_size) =
            dir_stats(&self.cache_dir.join("screenshots"))?;

        Ok(CacheStats {
            covers_count,
            covers_size_bytes: covers_size,
            screenshots_count,
            screenshots_size_bytes: screenshots_size,
            total_size_bytes: covers_size + screenshots_size,
        })
    }

    /// Removes cached files from the specified subdirectories.
    ///
    /// If `covers` is true, all files in `covers/` are removed.
    /// If `screenshots` is true, all entries in `screenshots/` are removed.
    pub fn clear_cache(&self, covers: bool, screenshots: bool) -> Result<(), MetadataError> {
        if covers {
            let covers_dir = self.cache_dir.join("covers");
            if covers_dir.exists() {
                for entry in fs::read_dir(&covers_dir)? {
                    let entry = entry?;
                    if entry.file_type()?.is_file() {
                        fs::remove_file(entry.path())?;
                    }
                }
            }
        }

        if screenshots {
            let screenshots_dir = self.cache_dir.join("screenshots");
            if screenshots_dir.exists() {
                for entry in fs::read_dir(&screenshots_dir)? {
                    let entry = entry?;
                    let path = entry.path();
                    if path.is_dir() {
                        fs::remove_dir_all(&path)?;
                    } else if path.is_file() {
                        fs::remove_file(&path)?;
                    }
                }
            }
        }

        Ok(())
    }

    /// Generates a blurhash string from a `DynamicImage`.
    ///
    /// Resizes the image to a small thumbnail (32px wide) before encoding
    /// to keep computation fast. Uses 4x3 components as recommended for
    /// typical cover art aspect ratios.
    fn generate_blurhash(img: &image::DynamicImage) -> Result<String, MetadataError> {
        // Resize to small dimensions for fast blurhash computation.
        let small = img.resize(32, 32, image::imageops::FilterType::Nearest);
        let (w, h) = small.dimensions();
        let rgba = small.to_rgba8();
        let pixels: Vec<u8> = rgba.into_raw();

        let hash = blurhash::encode(4, 3, w, h, &pixels)
            .map_err(|e| MetadataError::ImageProcessingError(format!("Blurhash encode failed: {:?}", e)))?;

        Ok(hash)
    }
}

/// Walks a directory (recursively) and returns (file_count, total_size_bytes).
fn dir_stats(dir: &Path) -> Result<(u32, u64), MetadataError> {
    let mut count: u32 = 0;
    let mut size: u64 = 0;

    if !dir.exists() {
        return Ok((0, 0));
    }

    walk_dir_recursive(dir, &mut count, &mut size)?;

    Ok((count, size))
}

/// Recursively walks a directory, accumulating file count and total size.
fn walk_dir_recursive(dir: &Path, count: &mut u32, size: &mut u64) -> Result<(), MetadataError> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let file_type = entry.file_type()?;

        if file_type.is_file() {
            *count += 1;
            *size += entry.metadata()?.len();
        } else if file_type.is_dir() {
            walk_dir_recursive(&entry.path(), count, size)?;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn test_cache_creation() {
        let tmp = tempfile::tempdir().unwrap();
        let cache = ImageCache::new(tmp.path(), false).unwrap();

        assert!(tmp.path().join("cache/covers").exists());
        assert!(tmp.path().join("cache/screenshots").exists());
        assert!(!cache.optimize);
    }

    #[test]
    fn test_cache_stats_empty() {
        let tmp = tempfile::tempdir().unwrap();
        let cache = ImageCache::new(tmp.path(), false).unwrap();

        let stats = cache.get_cache_stats().unwrap();
        assert_eq!(stats.covers_count, 0);
        assert_eq!(stats.covers_size_bytes, 0);
        assert_eq!(stats.screenshots_count, 0);
        assert_eq!(stats.screenshots_size_bytes, 0);
        assert_eq!(stats.total_size_bytes, 0);
    }

    #[test]
    fn test_cache_stats_with_files() {
        let tmp = tempfile::tempdir().unwrap();
        let cache = ImageCache::new(tmp.path(), false).unwrap();

        // Create some fake cover files.
        let covers_dir = tmp.path().join("cache/covers");
        for i in 0..3 {
            let path = covers_dir.join(format!("{}.png", i));
            let mut f = fs::File::create(&path).unwrap();
            f.write_all(&[0u8; 100]).unwrap();
        }

        // Create a screenshot subdirectory with files.
        let ss_dir = tmp.path().join("cache/screenshots/1");
        fs::create_dir_all(&ss_dir).unwrap();
        let mut f = fs::File::create(ss_dir.join("1.png")).unwrap();
        f.write_all(&[0u8; 200]).unwrap();

        let stats = cache.get_cache_stats().unwrap();
        assert_eq!(stats.covers_count, 3);
        assert_eq!(stats.covers_size_bytes, 300);
        assert_eq!(stats.screenshots_count, 1);
        assert_eq!(stats.screenshots_size_bytes, 200);
        assert_eq!(stats.total_size_bytes, 500);
    }

    #[test]
    fn test_clear_cache_covers_only() {
        let tmp = tempfile::tempdir().unwrap();
        let cache = ImageCache::new(tmp.path(), false).unwrap();

        let covers_dir = tmp.path().join("cache/covers");
        fs::write(covers_dir.join("1.png"), &[0u8; 50]).unwrap();

        let ss_dir = tmp.path().join("cache/screenshots/1");
        fs::create_dir_all(&ss_dir).unwrap();
        fs::write(ss_dir.join("1.png"), &[0u8; 50]).unwrap();

        cache.clear_cache(true, false).unwrap();

        // Covers should be gone.
        assert_eq!(fs::read_dir(&covers_dir).unwrap().count(), 0);
        // Screenshots should remain.
        assert!(ss_dir.join("1.png").exists());
    }

    #[test]
    fn test_clear_cache_screenshots_only() {
        let tmp = tempfile::tempdir().unwrap();
        let cache = ImageCache::new(tmp.path(), false).unwrap();

        let covers_dir = tmp.path().join("cache/covers");
        fs::write(covers_dir.join("1.png"), &[0u8; 50]).unwrap();

        let ss_dir = tmp.path().join("cache/screenshots/1");
        fs::create_dir_all(&ss_dir).unwrap();
        fs::write(ss_dir.join("1.png"), &[0u8; 50]).unwrap();

        cache.clear_cache(false, true).unwrap();

        // Covers should remain.
        assert!(covers_dir.join("1.png").exists());
        // Screenshots dir should be empty.
        let screenshots_dir = tmp.path().join("cache/screenshots");
        assert_eq!(fs::read_dir(&screenshots_dir).unwrap().count(), 0);
    }

    #[test]
    fn test_blurhash_generation() {
        // Create a small 4x4 red PNG image in memory.
        let img = image::DynamicImage::ImageRgba8(image::RgbaImage::from_fn(4, 4, |_, _| {
            image::Rgba([255, 0, 0, 255])
        }));

        let hash = ImageCache::generate_blurhash(&img).unwrap();
        assert!(!hash.is_empty(), "Blurhash should not be empty");
        // Blurhash strings are typically 20-30 characters.
        assert!(
            hash.len() >= 6,
            "Blurhash should be a reasonable length, got: {}",
            hash
        );
    }

    #[test]
    fn test_blurhash_deterministic() {
        let img = image::DynamicImage::ImageRgba8(image::RgbaImage::from_fn(8, 8, |x, y| {
            image::Rgba([(x * 32) as u8, (y * 32) as u8, 128, 255])
        }));

        let hash1 = ImageCache::generate_blurhash(&img).unwrap();
        let hash2 = ImageCache::generate_blurhash(&img).unwrap();
        assert_eq!(hash1, hash2, "Blurhash should be deterministic for the same image");
    }

    #[test]
    fn test_blurhash_different_images_produce_different_hashes() {
        let red_img = image::DynamicImage::ImageRgba8(image::RgbaImage::from_fn(8, 8, |_, _| {
            image::Rgba([255, 0, 0, 255])
        }));
        let blue_img = image::DynamicImage::ImageRgba8(image::RgbaImage::from_fn(8, 8, |_, _| {
            image::Rgba([0, 0, 255, 255])
        }));

        let red_hash = ImageCache::generate_blurhash(&red_img).unwrap();
        let blue_hash = ImageCache::generate_blurhash(&blue_img).unwrap();
        assert_ne!(
            red_hash, blue_hash,
            "Different images should produce different blurhashes"
        );
    }

    #[test]
    fn test_clear_cache_both() {
        let tmp = tempfile::tempdir().unwrap();
        let cache = ImageCache::new(tmp.path(), false).unwrap();

        let covers_dir = tmp.path().join("cache/covers");
        fs::write(covers_dir.join("1.png"), &[0u8; 50]).unwrap();
        fs::write(covers_dir.join("2.png"), &[0u8; 50]).unwrap();

        let ss_dir = tmp.path().join("cache/screenshots/1");
        fs::create_dir_all(&ss_dir).unwrap();
        fs::write(ss_dir.join("1.png"), &[0u8; 50]).unwrap();

        cache.clear_cache(true, true).unwrap();

        assert_eq!(
            fs::read_dir(&covers_dir).unwrap().count(),
            0,
            "Covers directory should be empty"
        );
        assert_eq!(
            fs::read_dir(tmp.path().join("cache/screenshots"))
                .unwrap()
                .count(),
            0,
            "Screenshots directory should be empty"
        );
    }

    #[test]
    fn test_clear_cache_neither() {
        let tmp = tempfile::tempdir().unwrap();
        let cache = ImageCache::new(tmp.path(), false).unwrap();

        let covers_dir = tmp.path().join("cache/covers");
        fs::write(covers_dir.join("1.png"), &[0u8; 50]).unwrap();

        let ss_dir = tmp.path().join("cache/screenshots/1");
        fs::create_dir_all(&ss_dir).unwrap();
        fs::write(ss_dir.join("1.png"), &[0u8; 50]).unwrap();

        cache.clear_cache(false, false).unwrap();

        // Both should remain untouched.
        assert!(covers_dir.join("1.png").exists());
        assert!(ss_dir.join("1.png").exists());
    }

    #[test]
    fn test_cache_stats_after_clear() {
        let tmp = tempfile::tempdir().unwrap();
        let cache = ImageCache::new(tmp.path(), false).unwrap();

        let covers_dir = tmp.path().join("cache/covers");
        fs::write(covers_dir.join("1.png"), &[0u8; 100]).unwrap();
        fs::write(covers_dir.join("2.png"), &[0u8; 200]).unwrap();

        // Verify stats before clear.
        let stats = cache.get_cache_stats().unwrap();
        assert_eq!(stats.covers_count, 2);
        assert_eq!(stats.covers_size_bytes, 300);

        // Clear covers.
        cache.clear_cache(true, false).unwrap();

        // Verify stats after clear.
        let stats = cache.get_cache_stats().unwrap();
        assert_eq!(stats.covers_count, 0);
        assert_eq!(stats.covers_size_bytes, 0);
        assert_eq!(stats.total_size_bytes, 0);
    }

    #[test]
    fn test_cache_stats_multiple_screenshot_directories() {
        let tmp = tempfile::tempdir().unwrap();
        let cache = ImageCache::new(tmp.path(), false).unwrap();

        // Create screenshots for two different games.
        let ss_dir_1 = tmp.path().join("cache/screenshots/100");
        fs::create_dir_all(&ss_dir_1).unwrap();
        fs::write(ss_dir_1.join("1.png"), &[0u8; 150]).unwrap();
        fs::write(ss_dir_1.join("2.png"), &[0u8; 150]).unwrap();

        let ss_dir_2 = tmp.path().join("cache/screenshots/200");
        fs::create_dir_all(&ss_dir_2).unwrap();
        fs::write(ss_dir_2.join("1.png"), &[0u8; 200]).unwrap();

        let stats = cache.get_cache_stats().unwrap();
        assert_eq!(stats.screenshots_count, 3);
        assert_eq!(stats.screenshots_size_bytes, 500);
        assert_eq!(stats.covers_count, 0);
        assert_eq!(stats.total_size_bytes, 500);
    }

    #[test]
    fn test_cache_creation_with_optimize_flag() {
        let tmp = tempfile::tempdir().unwrap();
        let cache = ImageCache::new(tmp.path(), true).unwrap();
        assert!(cache.optimize);
    }

    #[test]
    fn test_cache_creation_idempotent() {
        let tmp = tempfile::tempdir().unwrap();

        // Creating twice should not fail (dirs already exist).
        let _cache1 = ImageCache::new(tmp.path(), false).unwrap();
        let _cache2 = ImageCache::new(tmp.path(), true).unwrap();

        assert!(tmp.path().join("cache/covers").exists());
        assert!(tmp.path().join("cache/screenshots").exists());
    }
}

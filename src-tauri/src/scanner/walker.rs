//! Directory walker for discovering ROM files.
//!
//! Recursively walks configured directories, filtering files by extension
//! against the known ROM extension set. Skips hidden files and directories.

use crate::models::DiscoveredFile;
use anyhow::Result;
use std::collections::HashSet;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use walkdir::WalkDir;

/// Converts a `SystemTime` to a Unix timestamp string for consistent DB storage.
fn format_system_time(time: SystemTime) -> String {
    let duration = time.duration_since(UNIX_EPOCH).unwrap_or_default();
    duration.as_secs().to_string()
}

/// Recursively walks the given directories and returns all files whose extension
/// matches the `known_extensions` set.
///
/// Hidden files (names starting with `.`) and hidden directories are skipped.
/// If a directory does not exist, it is skipped with a warning logged to stderr.
/// If file metadata cannot be read, that file is skipped.
pub fn walk_directories(
    directories: &[PathBuf],
    known_extensions: &HashSet<String>,
) -> Result<Vec<DiscoveredFile>> {
    let mut discovered: Vec<DiscoveredFile> = Vec::new();

    for dir in directories {
        if !dir.exists() {
            eprintln!(
                "Warning: scan directory does not exist, skipping: {:?}",
                dir
            );
            continue;
        }

        let walker = WalkDir::new(dir)
            .follow_links(false)
            .into_iter()
            .filter_entry(|entry| {
                // The root entry (depth 0) is the directory the user chose to
                // scan. We must always include it even if its name happens to
                // start with a dot (e.g. temp directories on macOS).
                if entry.depth() == 0 {
                    return true;
                }
                // Skip hidden directories and files so WalkDir does not
                // descend into hidden directories at all.
                entry
                    .file_name()
                    .to_str()
                    .map(|name| !name.starts_with('.'))
                    .unwrap_or(false)
            });

        for entry_result in walker {
            let entry = match entry_result {
                Ok(e) => e,
                Err(err) => {
                    eprintln!("Warning: error walking directory entry: {}", err);
                    continue;
                }
            };

            // Skip directories — we only care about files.
            if entry.file_type().is_dir() {
                continue;
            }

            // Extract and normalize the extension.
            let extension = match entry.path().extension().and_then(|e| e.to_str()) {
                Some(ext) => ext.to_lowercase(),
                None => continue,
            };

            // Check against known ROM extensions.
            if !known_extensions.contains(&extension) {
                continue;
            }

            // Read file metadata for size and modification time.
            let metadata = match entry.metadata() {
                Ok(m) => m,
                Err(err) => {
                    eprintln!(
                        "Warning: could not read metadata for {:?}: {}",
                        entry.path(),
                        err
                    );
                    continue;
                }
            };

            let last_modified = metadata
                .modified()
                .map(format_system_time)
                .unwrap_or_else(|_| "0".to_string());

            discovered.push(DiscoveredFile {
                path: entry.path().to_path_buf(),
                extension,
                file_size: metadata.len(),
                last_modified,
            });
        }
    }

    Ok(discovered)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn test_walk_finds_matching_files() {
        let tmp = TempDir::new().unwrap();
        let rom_path = tmp.path().join("game.nes");
        fs::write(&rom_path, b"NES\x1a dummy rom data").unwrap();
        fs::write(tmp.path().join("readme.txt"), b"not a rom").unwrap();

        let mut exts = HashSet::new();
        exts.insert("nes".to_string());

        let dirs = vec![tmp.path().to_path_buf()];
        let result = walk_directories(&dirs, &exts).unwrap();

        assert_eq!(result.len(), 1);
        assert_eq!(result[0].extension, "nes");
        assert_eq!(result[0].path, rom_path);
    }

    #[test]
    fn test_walk_skips_hidden_files() {
        let tmp = TempDir::new().unwrap();
        fs::write(tmp.path().join(".hidden.nes"), b"hidden rom").unwrap();
        fs::write(tmp.path().join("visible.nes"), b"visible rom").unwrap();

        let mut exts = HashSet::new();
        exts.insert("nes".to_string());

        let dirs = vec![tmp.path().to_path_buf()];
        let result = walk_directories(&dirs, &exts).unwrap();

        assert_eq!(result.len(), 1);
        assert_eq!(result[0].path, tmp.path().join("visible.nes"));
    }

    #[test]
    fn test_walk_skips_hidden_directories() {
        let tmp = TempDir::new().unwrap();
        let hidden_dir = tmp.path().join(".hidden_dir");
        fs::create_dir(&hidden_dir).unwrap();
        fs::write(hidden_dir.join("game.nes"), b"rom inside hidden dir").unwrap();
        fs::write(tmp.path().join("game.nes"), b"rom in visible dir").unwrap();

        let mut exts = HashSet::new();
        exts.insert("nes".to_string());

        let dirs = vec![tmp.path().to_path_buf()];
        let result = walk_directories(&dirs, &exts).unwrap();

        assert_eq!(result.len(), 1);
    }

    #[test]
    fn test_walk_nonexistent_directory_skipped() {
        let mut exts = HashSet::new();
        exts.insert("nes".to_string());

        let dirs = vec![PathBuf::from("/nonexistent/path/that/does/not/exist")];
        let result = walk_directories(&dirs, &exts).unwrap();

        assert!(result.is_empty());
    }

    #[test]
    fn test_walk_recursive() {
        let tmp = TempDir::new().unwrap();
        let sub = tmp.path().join("subdir");
        fs::create_dir(&sub).unwrap();
        fs::write(tmp.path().join("top.gba"), b"top level rom").unwrap();
        fs::write(sub.join("nested.gba"), b"nested rom").unwrap();

        let mut exts = HashSet::new();
        exts.insert("gba".to_string());

        let dirs = vec![tmp.path().to_path_buf()];
        let result = walk_directories(&dirs, &exts).unwrap();

        assert_eq!(result.len(), 2);
    }

    #[test]
    fn test_walk_multiple_directories() {
        let tmp1 = TempDir::new().unwrap();
        let tmp2 = TempDir::new().unwrap();
        fs::write(tmp1.path().join("a.nes"), b"rom a").unwrap();
        fs::write(tmp2.path().join("b.nes"), b"rom b").unwrap();

        let mut exts = HashSet::new();
        exts.insert("nes".to_string());

        let dirs = vec![tmp1.path().to_path_buf(), tmp2.path().to_path_buf()];
        let result = walk_directories(&dirs, &exts).unwrap();

        assert_eq!(result.len(), 2);
    }

    #[test]
    fn test_walk_case_insensitive_extension() {
        let tmp = TempDir::new().unwrap();
        fs::write(tmp.path().join("game.NES"), b"uppercase ext").unwrap();

        let mut exts = HashSet::new();
        exts.insert("nes".to_string());

        let dirs = vec![tmp.path().to_path_buf()];
        let result = walk_directories(&dirs, &exts).unwrap();

        assert_eq!(result.len(), 1);
    }
}

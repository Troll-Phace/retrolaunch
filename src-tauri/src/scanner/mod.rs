//! ROM scanning pipeline orchestrator.
//!
//! Coordinates the full scan flow: walk directories -> detect systems ->
//! hash ROMs -> insert into database -> emit progress events.

pub mod detector;
pub mod hasher;
pub mod nointro;
pub mod walker;

use crate::db::Database;
use crate::models::{Game, ScanComplete, ScanProgress, ScannedRom};
use anyhow::Result;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter};

/// Runs the full ROM scanning pipeline against the given directories.
///
/// This is a blocking, CPU-bound operation that should be called from a
/// background thread (e.g. via `tokio::task::spawn_blocking`). It emits
/// `scan-progress` events (throttled to ~10/sec) and a final `scan-complete`
/// event through the Tauri event system.
///
/// The pipeline:
/// 1. Load supported systems from the database
/// 2. Walk directories for files matching known ROM extensions
/// 3. Filter out files unchanged since last scan (incremental)
/// 4. Detect the system for each file (extension + header sniffing)
/// 5. Hash ROM contents in parallel (with copier header stripping)
/// 6. Insert new games into the database
/// 7. Emit progress and completion events
pub fn run_scan(
    app: &AppHandle,
    directories: Vec<PathBuf>,
    db: &Arc<Database>,
    nointro: &nointro::NoIntroDatabase,
) -> Result<ScanComplete> {
    let start_time = Instant::now();

    // 1. Load all supported systems from the database.
    let systems = db.get_all_systems()?;

    // 2. Build the set of all known ROM file extensions across all systems.
    let known_extensions: HashSet<String> = systems
        .iter()
        .flat_map(|s| s.extensions.iter().cloned())
        .collect();

    // 3. Walk directories to discover candidate ROM files.
    let discovered = walker::walk_directories(&directories, &known_extensions)?;

    // 4. Filter for incremental scanning — skip files unchanged since last scan.
    let mut files_to_process = Vec::new();
    for file in &discovered {
        let rom_path = file.path.to_string_lossy().to_string();
        match db.get_file_last_modified(&rom_path)? {
            Some(stored) if stored == file.last_modified => continue,
            _ => files_to_process.push(file),
        }
    }

    // 5. Detect the system for each candidate file.
    let mut identified: Vec<(PathBuf, String)> = Vec::new();
    for file in &files_to_process {
        let candidates = detector::detect_system_by_extension(&file.extension, &systems);
        let system_id = if candidates.len() == 1 {
            candidates[0].clone()
        } else if candidates.is_empty() {
            continue; // No system matches this extension
        } else {
            // Ambiguous extension — try header sniffing to disambiguate.
            match detector::detect_system_by_header(&file.path, &candidates) {
                Ok(Some(id)) => id,
                Ok(None) => continue, // Could not identify by header
                Err(_) => continue,   // File read error, skip
            }
        };
        identified.push((file.path.clone(), system_id));
    }

    // 6. Hash all identified ROMs in parallel using Rayon.
    let hash_results = hasher::hash_roms_parallel(&identified);

    // 7. Insert into the database and emit progress events.
    let total = hash_results.len() as u32;
    let mut new_games: u32 = 0;
    let mut systems_found: HashMap<String, u32> = HashMap::new();
    let mut last_emit = Instant::now();

    for (idx, (path, hash_result)) in hash_results.into_iter().enumerate() {
        let hashes = match hash_result {
            Ok(h) => h,
            Err(err) => {
                eprintln!("Warning: failed to hash {:?}: {}", path, err);
                continue;
            }
        };

        // Look up the system_id for this path from the identified list.
        let system_id = match identified.iter().find(|(p, _)| p == &path) {
            Some((_, s)) => s.clone(),
            None => continue,
        };

        // Look up the DiscoveredFile for metadata (size, timestamp).
        let disc_file = match files_to_process.iter().find(|f| f.path == path) {
            Some(f) => f,
            None => continue,
        };

        let file_name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let rom = ScannedRom {
            file_path: path.clone(),
            file_name,
            file_size: disc_file.file_size,
            last_modified: disc_file.last_modified.clone(),
            system_id: system_id.clone(),
            crc32: hashes.crc32,
            sha1: hashes.sha1,
        };

        match db.insert_game(&rom) {
            Ok(id) if id > 0 => {
                new_games += 1;
                *systems_found.entry(system_id.clone()).or_insert(0) += 1;

                // Look up No-Intro canonical name by CRC32.
                // First try the headerless hash, then try full-file hash
                // for headered No-Intro DATs (NES/SNES).
                let nointro_match = nointro
                    .lookup(&system_id, &rom.crc32)
                    .or_else(|| {
                        if system_id == "nes" || system_id == "snes" {
                            hasher::hash_rom_full(&path)
                                .ok()
                                .and_then(|full| nointro.lookup(&system_id, &full.crc32))
                        } else {
                            None
                        }
                    });
                if let Some(entry) = nointro_match {
                    if let Err(e) = db.update_nointro_match_by_path(
                        &rom.file_path.to_string_lossy(),
                        &entry.name,
                        entry.region.as_deref(),
                    ) {
                        eprintln!("Warning: failed to set No-Intro name: {}", e);
                    }
                }
            }
            Ok(_) => {} // Duplicate path, already in DB
            Err(err) => {
                eprintln!("Warning: failed to insert game {:?}: {}", path, err);
            }
        }

        // Throttled progress emission — at most ~10 events per second (every 100ms),
        // plus always emit on the final item.
        if last_emit.elapsed().as_millis() >= 100 || idx + 1 == total as usize {
            let progress = ScanProgress {
                scanned: (idx + 1) as u32,
                total,
                current_file: path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string(),
                systems_found: systems_found.clone(),
            };
            let _ = app.emit("scan-progress", &progress);
            last_emit = Instant::now();
        }
    }

    // 8. Update watched directories with total game count and scan timestamp.
    for dir in &directories {
        let dir_str = dir.to_string_lossy().to_string();
        let total_in_dir = db.count_games_in_directory(&dir_str).unwrap_or(0);
        let _ = db.update_watched_directory(&dir_str, total_in_dir as i32);
    }

    // 9. Build and emit the completion event.
    let complete = ScanComplete {
        total_games: total,
        new_games,
        total_systems: systems_found.len() as u32,
        duration_ms: start_time.elapsed().as_millis() as u64,
    };
    let _ = app.emit("scan-complete", &complete);

    Ok(complete)
}

/// Processes a single file through the ROM identification pipeline.
///
/// Returns `Some(Game)` if the file was identified as a new ROM and inserted,
/// or `None` if the file is not a ROM, already exists, or cannot be processed.
/// This is used by the file system watcher to process newly detected files.
pub fn process_single_file(
    file_path: &Path,
    db: &Arc<Database>,
    nointro: &nointro::NoIntroDatabase,
) -> Result<Option<Game>> {
    // 1. Load systems from DB.
    let systems = db.get_all_systems()?;

    // 2. Check extension against known ROM extensions.
    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .ok_or_else(|| anyhow::anyhow!("No file extension"))?;

    let known_extensions: HashSet<String> = systems
        .iter()
        .flat_map(|s| s.extensions.iter().cloned())
        .collect();

    if !known_extensions.contains(&ext) {
        return Ok(None);
    }

    // 3. Detect system via extension + header sniffing.
    let candidates = detector::detect_system_by_extension(&ext, &systems);
    let system_id = match candidates.len() {
        0 => return Ok(None),
        1 => candidates[0].clone(),
        _ => match detector::detect_system_by_header(file_path, &candidates)? {
            Some(id) => id,
            None => return Ok(None),
        },
    };

    // 4. Check for duplicates by path.
    let path_str = file_path.to_string_lossy().to_string();
    if db.game_exists_by_path(&path_str)? {
        return Ok(None);
    }

    // 5. Read file metadata.
    let metadata = std::fs::metadata(file_path)?;
    let file_size = metadata.len();
    let last_modified = metadata
        .modified()
        .map(|t| {
            let duration = t
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default();
            duration.as_secs().to_string()
        })
        .unwrap_or_else(|_| "0".to_string());

    // 6. Hash ROM contents (strips copier headers where applicable).
    let hashes = hasher::hash_rom(file_path, &system_id)?;

    // 7. Build ScannedRom and insert into the database.
    let file_name = file_path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let rom = ScannedRom {
        file_path: file_path.to_path_buf(),
        file_name,
        file_size,
        last_modified,
        system_id,
        crc32: hashes.crc32,
        sha1: hashes.sha1,
    };

    let id = db.insert_game(&rom)?;
    if id == 0 {
        return Ok(None); // Duplicate caught by INSERT OR IGNORE
    }

    // 8. Look up No-Intro canonical name by CRC32.
    // First try the headerless hash, then try full-file hash
    // for headered No-Intro DATs (NES/SNES).
    let nointro_match = nointro
        .lookup(&rom.system_id, &rom.crc32)
        .or_else(|| {
            if rom.system_id == "nes" || rom.system_id == "snes" {
                hasher::hash_rom_full(file_path)
                    .ok()
                    .and_then(|full| nointro.lookup(&rom.system_id, &full.crc32))
            } else {
                None
            }
        });
    if let Some(entry) = nointro_match {
        let _ = db.update_nointro_match_by_path(
            &file_path.to_string_lossy(),
            &entry.name,
            entry.region.as_deref(),
        );
    }

    // 9. Return the full Game record.
    db.get_game_by_path(&path_str)
}

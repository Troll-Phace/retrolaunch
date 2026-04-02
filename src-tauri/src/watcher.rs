//! File system watcher for real-time ROM detection.
//!
//! Monitors watched directories for new or modified files and runs them through
//! the ROM identification pipeline. When a new game is detected, a
//! `new-rom-detected` Tauri event is emitted so the frontend can update in
//! real time.
//!
//! Architecture:
//! - The `notify` crate's callback runs on its own thread, forwarding events
//!   through a `tokio::sync::mpsc` channel.
//! - A tokio task receives events, applies 2-second debouncing, and processes
//!   files on a blocking thread (since hashing is CPU-bound).

use crate::db::Database;
use crate::scanner;
use crate::scanner::nointro::NoIntroDatabase;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};
use std::time::Instant;
use tauri::{AppHandle, Emitter};

/// Manages a file system watcher for real-time ROM detection.
///
/// Wraps a `notify::RecommendedWatcher` behind a mutex so it can be stored
/// in Tauri's managed state (`Send + Sync`). The watcher can be started,
/// stopped, and have paths added/removed at runtime.
pub struct FsWatcher {
    inner: Mutex<Option<WatcherInner>>,
}

struct WatcherInner {
    watcher: RecommendedWatcher,
    watched_paths: HashSet<PathBuf>,
    /// Sends a shutdown signal to the processing loop task.
    shutdown_tx: tokio::sync::oneshot::Sender<()>,
}

impl Default for FsWatcher {
    fn default() -> Self {
        Self::new()
    }
}

impl FsWatcher {
    /// Creates an unstarted file system watcher.
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }

    /// Starts the file system watcher for all enabled watched directories.
    ///
    /// Reads `watched_directories` (where `enabled = 1`) from the database,
    /// creates a `notify::RecommendedWatcher`, and spawns a tokio task that
    /// processes incoming file events with debouncing.
    pub async fn start(
        &self,
        app: AppHandle,
        db: Arc<Database>,
        nointro: Arc<RwLock<NoIntroDatabase>>,
    ) -> Result<(), String> {
        // Stop any existing watcher first.
        self.stop()?;

        // Load enabled directories from the database.
        let dirs = db
            .get_watched_directories()
            .map_err(|e| format!("Failed to load watched directories: {}", e))?;

        let enabled_dirs: Vec<PathBuf> = dirs
            .iter()
            .filter(|d| d.enabled)
            .map(|d| PathBuf::from(&d.path))
            .collect();

        // Create channels for event forwarding and shutdown signaling.
        let (event_tx, event_rx) = tokio::sync::mpsc::unbounded_channel::<Event>();
        let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();

        // Create the notify watcher. Events are forwarded to the tokio channel.
        let watcher = RecommendedWatcher::new(
            move |result: Result<Event, notify::Error>| {
                if let Ok(event) = result {
                    let _ = event_tx.send(event);
                }
            },
            notify::Config::default(),
        )
        .map_err(|e| format!("Failed to create file watcher: {}", e))?;

        // Store inner state so we can add paths while holding the lock.
        let watched_paths;
        {
            let mut guard = self
                .inner
                .lock()
                .map_err(|e| format!("Watcher mutex poisoned: {}", e))?;

            let mut inner = WatcherInner {
                watcher,
                watched_paths: HashSet::new(),
                shutdown_tx,
            };

            for dir in &enabled_dirs {
                if dir.exists() {
                    if let Err(e) = inner.watcher.watch(dir, RecursiveMode::Recursive) {
                        eprintln!("Warning: failed to watch {:?}: {}", dir, e);
                    } else {
                        inner.watched_paths.insert(dir.clone());
                    }
                }
            }

            watched_paths = inner.watched_paths.clone();
            *guard = Some(inner);
        }

        // Spawn the background event processing loop.
        tokio::spawn(process_events(app, db, nointro, event_rx, shutdown_rx));

        if !watched_paths.is_empty() {
            eprintln!(
                "File watcher started for {} director{}",
                watched_paths.len(),
                if watched_paths.len() == 1 { "y" } else { "ies" }
            );
        }

        Ok(())
    }

    /// Stops the file system watcher and its processing loop.
    pub fn stop(&self) -> Result<(), String> {
        let mut guard = self
            .inner
            .lock()
            .map_err(|e| format!("Watcher mutex poisoned: {}", e))?;

        if let Some(inner) = guard.take() {
            // Send shutdown signal; ignore error if receiver is already dropped.
            // `send` consumes `shutdown_tx`, and the remaining fields of `inner`
            // are dropped at the end of this block, stopping the notify thread.
            let WatcherInner {
                watcher: _watcher,
                watched_paths: _paths,
                shutdown_tx,
            } = inner;
            let _ = shutdown_tx.send(());
            eprintln!("File watcher stopped");
        }

        Ok(())
    }

    /// Adds a path to the running watcher.
    ///
    /// If the watcher is not running, this is a no-op.
    pub fn add_path(&self, path: PathBuf) -> Result<(), String> {
        let mut guard = self
            .inner
            .lock()
            .map_err(|e| format!("Watcher mutex poisoned: {}", e))?;

        if let Some(ref mut inner) = *guard {
            if path.exists() && !inner.watched_paths.contains(&path) {
                inner
                    .watcher
                    .watch(&path, RecursiveMode::Recursive)
                    .map_err(|e| format!("Failed to watch {:?}: {}", path, e))?;
                inner.watched_paths.insert(path);
            }
        }

        Ok(())
    }

    /// Removes a path from the running watcher.
    ///
    /// If the watcher is not running or the path is not watched, this is a no-op.
    pub fn remove_path(&self, path: PathBuf) -> Result<(), String> {
        let mut guard = self
            .inner
            .lock()
            .map_err(|e| format!("Watcher mutex poisoned: {}", e))?;

        if let Some(ref mut inner) = *guard {
            if inner.watched_paths.remove(&path) {
                let _ = inner.watcher.unwatch(&path);
            }
        }

        Ok(())
    }

    /// Returns whether the watcher is currently active.
    pub fn is_active(&self) -> bool {
        self.inner
            .lock()
            .map(|guard| guard.is_some())
            .unwrap_or(false)
    }

    /// Returns the list of currently watched directory paths.
    pub fn get_watched_paths(&self) -> Vec<String> {
        self.inner
            .lock()
            .map(|guard| {
                guard
                    .as_ref()
                    .map(|inner| {
                        inner
                            .watched_paths
                            .iter()
                            .map(|p| p.to_string_lossy().to_string())
                            .collect()
                    })
                    .unwrap_or_default()
            })
            .unwrap_or_default()
    }
}

/// Background task that receives file system events, debounces them, and
/// processes new ROM files through the identification pipeline.
///
/// Debouncing strategy: all event paths are collected into a map with their
/// last-seen timestamp. Every 500ms, paths that have "settled" (no new events
/// for 500ms) are processed. At processing time we check whether the file
/// exists on disk to determine the action:
///   - File exists → treat as new/modified ROM (process through scanner)
///   - File missing → treat as deletion (remove from DB if tracked)
///
/// This approach handles macOS FSEvents rename behavior correctly: a rename
/// fires `Modify(Name(Any))` for both old and new paths. After settling, the
/// old path no longer exists (→ removal) and the new path does (→ addition).
async fn process_events(
    app: AppHandle,
    db: Arc<Database>,
    nointro: Arc<RwLock<NoIntroDatabase>>,
    mut event_rx: tokio::sync::mpsc::UnboundedReceiver<Event>,
    mut shutdown_rx: tokio::sync::oneshot::Receiver<()>,
) {
    let mut debounce: HashMap<PathBuf, Instant> = HashMap::new();

    // Ticker for processing settled paths. Fires every 250ms to check
    // whether any debounced paths are ready.
    let mut tick = tokio::time::interval(std::time::Duration::from_millis(250));
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    loop {
        tokio::select! {
            _ = &mut shutdown_rx => {
                break;
            }
            event = event_rx.recv() => {
                let event = match event {
                    Some(e) => e,
                    None => break,
                };

                eprintln!("Watcher event: {:?} - {:?}", event.kind, event.paths);

                // Only care about create, modify, and remove events.
                let dominated = matches!(
                    event.kind,
                    EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
                );
                if !dominated {
                    continue;
                }

                for path in event.paths {
                    debounce.insert(path, Instant::now());
                }
            }
            _ = tick.tick() => {
                // Process paths that have settled (no new event for 500ms).
                let now = Instant::now();
                let settled: Vec<PathBuf> = debounce
                    .iter()
                    .filter(|(_, last)| now.duration_since(**last).as_millis() >= 500)
                    .map(|(p, _)| p.clone())
                    .collect();

                for path in &settled {
                    debounce.remove(path);
                }

                for path in settled {
                    let exists = path.exists();
                    let is_dir = exists && path.is_dir();

                    if is_dir {
                        // Directory-level events are not actionable.
                        continue;
                    }

                    if !exists {
                        // File no longer on disk — remove from DB if tracked.
                        let db_clone = db.clone();
                        let app_clone = app.clone();
                        let file_path = path.clone();

                        tokio::task::spawn_blocking(move || {
                            let rom_path = file_path.to_string_lossy().to_string();
                            match db_clone.delete_game_by_path(&rom_path) {
                                Ok(true) => {
                                    eprintln!("Watcher: ROM removed - {}", rom_path);
                                    update_dir_game_count(&db_clone, &rom_path);
                                    let _ = app_clone.emit("rom-removed", &rom_path);
                                }
                                Ok(false) => {
                                    // Not in DB — old side of a rename or non-ROM file.
                                }
                                Err(e) => {
                                    eprintln!("Watcher: error removing {:?}: {}", file_path, e);
                                }
                            }
                        });
                    } else {
                        // File exists — process as new or modified ROM.
                        let db_clone = db.clone();
                        let app_clone = app.clone();
                        let nointro_clone = nointro.clone();
                        let file_path = path.clone();

                        tokio::task::spawn_blocking(move || {
                            let nointro_db = nointro_clone
                                .read()
                                .map(|g| g.clone())
                                .unwrap_or_else(|_| NoIntroDatabase::new());

                            match scanner::process_single_file(&file_path, &db_clone, &nointro_db) {
                                Ok(Some(game)) => {
                                    eprintln!(
                                        "Watcher: new ROM detected - {} ({})",
                                        game.title, game.system_id
                                    );
                                    let rom_path = file_path.to_string_lossy().to_string();
                                    update_dir_game_count(&db_clone, &rom_path);
                                    let _ = app_clone.emit("new-rom-detected", &game);
                                }
                                Ok(None) => {
                                    // Not a ROM, already exists, or unrecognized.
                                }
                                Err(e) => {
                                    eprintln!("Watcher: error processing {:?}: {}", file_path, e);
                                }
                            }
                        });
                    }
                }

                // Clean up stale debounce entries (shouldn't happen, but safety net).
                debounce.retain(|_, last| now.duration_since(*last).as_secs() < 30);
            }
        }
    }
}

/// Updates the game count for the watched directory that contains the given ROM path.
fn update_dir_game_count(db: &Database, rom_path: &str) {
    if let Ok(dirs) = db.get_watched_directories() {
        for dir in &dirs {
            let prefix = if dir.path.ends_with('/') || dir.path.ends_with('\\') {
                dir.path.clone()
            } else {
                format!("{}/", dir.path)
            };
            if rom_path.starts_with(&prefix) {
                if let Ok(count) = db.count_games_in_directory(&dir.path) {
                    let _ = db.update_watched_directory(&dir.path, count as i32);
                }
                break;
            }
        }
    }
}

/**
 * Typed wrappers around Tauri IPC invoke() calls.
 *
 * Each function maps 1:1 to a `#[tauri::command]` registered in src-tauri/src/lib.rs.
 * Parameter names in the invoke arg object MUST match the Rust function signatures.
 *
 * All functions are named exports — no default export.
 */

import { invoke } from '@tauri-apps/api/core';
import type {
  CacheStats,
  ClearCacheParams,
  DatFile,
  DetectedEmulator,
  EmulatorConfig,
  FetchMetadataParams,
  Game,
  GameDetailResponse,
  GameStatus,
  GetGamesParams,
  PlayStats,
  ScanComplete,
  System,
  WatchedDirectory,
  GitHubRelease,
  WatcherStatus,
} from '@/types';

// ---------------------------------------------------------------------------
// Scanner commands
// ---------------------------------------------------------------------------

/**
 * Scans the given directories for ROM files, identifies systems, hashes
 * contents, and inserts new games into the database.
 *
 * Emits `scan-progress` and `scan-complete` events during execution.
 */
export async function scanDirectories(directories: string[]): Promise<ScanComplete> {
  return invoke<ScanComplete>('scan_directories', { directories });
}

/** Queries games from the database with optional filtering, sorting, and pagination. */
export async function getGames(params: GetGamesParams): Promise<Game[]> {
  return invoke<Game[]>('get_games', { params });
}

/** Returns all supported emulation systems from the database. */
export async function getSystems(): Promise<System[]> {
  return invoke<System[]>('get_systems');
}

/** Adds a directory to the watched directories list. */
export async function addWatchedDirectory(path: string): Promise<WatchedDirectory> {
  return invoke<WatchedDirectory>('add_watched_directory', { path });
}

/** Removes a watched directory by its database ID. */
export async function removeWatchedDirectory(id: number): Promise<void> {
  return invoke<void>('remove_watched_directory', { id });
}

/** Returns all watched directories from the database. */
export async function getWatchedDirectories(): Promise<WatchedDirectory[]> {
  return invoke<WatchedDirectory[]>('get_watched_directories');
}

// ---------------------------------------------------------------------------
// Launcher commands
// ---------------------------------------------------------------------------

/** Returns all emulator configurations. */
export async function getEmulatorConfigs(): Promise<EmulatorConfig[]> {
  return invoke<EmulatorConfig[]>('get_emulator_configs');
}

/** Creates or updates an emulator configuration for a system. */
export async function setEmulatorConfig(config: EmulatorConfig): Promise<void> {
  return invoke<void>('set_emulator_config', { config });
}

/** Scans common install locations for known emulators. */
export async function autoDetectEmulators(): Promise<DetectedEmulator[]> {
  return invoke<DetectedEmulator[]>('auto_detect_emulators');
}

/**
 * Launches a game in its configured emulator and starts playtime tracking.
 *
 * Returns immediately after the emulator process is spawned. A background
 * task monitors the process and emits a `game-session-ended` event when
 * the emulator exits.
 */
export async function launchGame(gameId: number): Promise<void> {
  return invoke<void>('launch_game', { gameId });
}

/** Returns playtime stats for a specific game. */
export async function getPlayStats(gameId: number): Promise<PlayStats> {
  return invoke<PlayStats>('get_play_stats', { gameId });
}

// ---------------------------------------------------------------------------
// Metadata commands
// ---------------------------------------------------------------------------

/**
 * Fetches metadata for games from IGDB and ScreenScraper.
 *
 * If `params.game_ids` is empty, fetches metadata for all games that do not
 * yet have metadata. Progress is reported via `metadata-progress` events.
 */
export async function fetchMetadata(params: FetchMetadataParams): Promise<void> {
  return invoke<void>('fetch_metadata', { params });
}

/** Returns the number of games that still need metadata enrichment. */
export async function getGamesNeedingMetadataCount(): Promise<number> {
  return invoke<number>('get_games_needing_metadata_count');
}

/** Returns statistics about the on-disk image cache (file counts and sizes). */
export async function getCacheStats(): Promise<CacheStats> {
  return invoke<CacheStats>('get_cache_stats');
}

/**
 * Clears parts of (or the entire) image cache.
 *
 * If `params.all` is true, clears both covers and screenshots.
 * Otherwise, clears based on the individual `covers` and `screenshots` flags.
 */
export async function clearCache(params: ClearCacheParams): Promise<void> {
  return invoke<void>('clear_cache', { params });
}

// ---------------------------------------------------------------------------
// No-Intro DAT management
// ---------------------------------------------------------------------------

/** Imports a No-Intro DAT file for a system. */
export async function importDatFile(systemId: string, sourcePath: string): Promise<DatFile> {
  return invoke<DatFile>('import_dat_file', { systemId, sourcePath });
}

/** Returns all imported DAT files. */
export async function getDatFiles(): Promise<DatFile[]> {
  return invoke<DatFile[]>('get_dat_files');
}

/** Removes the DAT file associated with a system. */
export async function removeDatFile(systemId: string): Promise<void> {
  return invoke<void>('remove_dat_file', { systemId });
}

/** Re-matches all games against imported No-Intro DATs. Returns count of newly matched games. */
export async function rematchNointro(): Promise<number> {
  return invoke<number>('rematch_nointro');
}

// ---------------------------------------------------------------------------
// Config commands
// ---------------------------------------------------------------------------

/** Returns all preference key-value pairs. */
export async function getPreferences(): Promise<Record<string, string>> {
  return invoke<Record<string, string>>('get_preferences');
}

/** Creates or updates a preference value. */
export async function setPreference(key: string, value: string): Promise<void> {
  return invoke<void>('set_preference', { key, value });
}

// ---------------------------------------------------------------------------
// Game detail commands
// ---------------------------------------------------------------------------

/** Returns full game details including screenshots for the detail view. */
export async function getGameDetail(gameId: number): Promise<GameDetailResponse> {
  return invoke<GameDetailResponse>('get_game_detail', { gameId });
}

/** Toggles the favorite state of a game. Returns the new favorite state. */
export async function toggleFavorite(gameId: number): Promise<boolean> {
  return invoke<boolean>('toggle_favorite', { gameId });
}

/** Sets the completion status of a game. Returns the new status string. */
export async function setGameStatus(gameId: number, status: GameStatus): Promise<string> {
  return invoke<string>('set_game_status', { gameId, status });
}

// ---------------------------------------------------------------------------
// File system helpers
// ---------------------------------------------------------------------------

/** Removes games whose ROM files no longer exist on disk. Returns count of deleted rows. */
export async function cleanupOrphanedGames(): Promise<number> {
  return invoke<number>('cleanup_orphaned_games');
}

/** Reveals the given path in the platform's file manager (Finder / Explorer). */
export async function revealInFileManager(path: string): Promise<void> {
  const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
  return revealItemInDir(path);
}

// ---------------------------------------------------------------------------
// Watcher commands
// ---------------------------------------------------------------------------

/** Starts the file system watcher for all enabled watched directories. */
export async function startWatcher(): Promise<void> {
  return invoke<void>('start_watcher');
}

/** Stops the file system watcher. */
export async function stopWatcher(): Promise<void> {
  return invoke<void>('stop_watcher');
}

/** Returns the current status of the file system watcher. */
export async function getWatcherStatus(): Promise<WatcherStatus> {
  return invoke<WatcherStatus>('get_watcher_status');
}

// ---------------------------------------------------------------------------
// Reset / Debug commands
// ---------------------------------------------------------------------------

/**
 * Purges all application data (games, emulator configs, cached images,
 * preferences) and returns the app to a fresh state ready for onboarding.
 */
export async function resetToFresh(): Promise<number> {
  return invoke<number>('reset_to_fresh');
}

// ---------------------------------------------------------------------------
// GitHub Release commands
// ---------------------------------------------------------------------------

/** Fetches GitHub releases for the Patch Notes feature. */
export async function fetchGitHubReleases(): Promise<GitHubRelease[]> {
  return invoke<GitHubRelease[]>('fetch_github_releases');
}

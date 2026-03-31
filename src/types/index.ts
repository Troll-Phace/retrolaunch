/**
 * TypeScript type definitions mirroring the Rust models in src-tauri/src/models.rs.
 *
 * All field names use snake_case to match the serde JSON wire format.
 * All types are named exports — no default exports.
 */

// ---------------------------------------------------------------------------
// System & ROM types
// ---------------------------------------------------------------------------

/** A supported emulation system (mirrors the `systems` SQLite table). */
export interface System {
  id: string;
  name: string;
  manufacturer: string;
  short_name: string;
  generation: number | null;
  /** File extensions associated with this system. */
  extensions: string[];
  /** Byte offset for header magic check. -1 means no header check. */
  header_offset: number;
  /** Hex string of expected header magic bytes. */
  header_magic: string | null;
  /** Theme color for the system's UI presentation. */
  theme_color: string | null;
}

/** A ROM file discovered during directory scanning, before database insertion. */
export interface ScannedRom {
  file_path: string;
  file_name: string;
  file_size: number;
  /** ISO 8601 formatted timestamp of the file's last modification. */
  last_modified: string;
  system_id: string;
  /** CRC32 hash as a lowercase hex string. */
  crc32: string;
  /** SHA1 hash as a lowercase hex string, if computed. */
  sha1: string | null;
}

/** A screenshot image associated with a game. */
export interface Screenshot {
  id: number;
  game_id: number;
  url: string;
  local_path: string | null;
  sort_order: number;
}

/** Response payload for the `get_game_detail` command. */
export interface GameDetailResponse {
  game: Game;
  screenshots: Screenshot[];
}

/** Full game record matching the `games` SQLite table. */
export interface Game {
  id: number;
  title: string;
  system_id: string;
  rom_path: string;
  rom_hash_crc32: string | null;
  rom_hash_sha1: string | null;
  file_size_bytes: number | null;
  file_last_modified: string | null;
  nointro_name: string | null;
  region: string | null;
  igdb_id: number | null;
  developer: string | null;
  publisher: string | null;
  release_date: string | null;
  genre: string | null;
  description: string | null;
  cover_path: string | null;
  blurhash: string | null;
  total_playtime_seconds: number;
  last_played_at: string | null;
  currently_playing: boolean;
  is_favorite: boolean;
  date_added: string;
  metadata_source: string | null;
  metadata_fetched_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Scan events & parameters
// ---------------------------------------------------------------------------

/** Event payload emitted during a ROM scan to report progress. */
export interface ScanProgress {
  scanned: number;
  total: number;
  current_file: string;
  /** Map of system_id to count of games found for that system so far. */
  systems_found: Record<string, number>;
}

/** Event payload emitted when a ROM scan completes. */
export interface ScanComplete {
  total_games: number;
  new_games: number;
  total_systems: number;
  duration_ms: number;
}

/** Query parameters for fetching games from the database. */
export interface GetGamesParams {
  system_id?: string | null;
  search?: string | null;
  genre?: string | null;
  sort_by?: string | null;
  sort_order?: string | null;
  limit?: number | null;
  offset?: number | null;
}

// ---------------------------------------------------------------------------
// Watched directories
// ---------------------------------------------------------------------------

/** A watched directory entry (mirrors the `watched_directories` SQLite table). */
export interface WatchedDirectory {
  id: number;
  path: string;
  last_scanned_at: string | null;
  game_count: number;
  enabled: boolean;
}

/** Status of the file system watcher. */
export interface WatcherStatus {
  active: boolean;
  watched_paths: string[];
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/** Result of hashing a ROM file's contents. */
export interface RomHashes {
  /** CRC32 hash as a lowercase hex string. */
  crc32: string;
  /** SHA1 hash as a lowercase hex string, if computed. */
  sha1: string | null;
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/** A file discovered during directory walking, before system identification. */
export interface DiscoveredFile {
  path: string;
  /** Lowercase file extension without the leading dot. */
  extension: string;
  file_size: number;
  /** ISO 8601 formatted timestamp of the file's last modification. */
  last_modified: string;
}

// ---------------------------------------------------------------------------
// Emulator configuration & detection
// ---------------------------------------------------------------------------

/** Emulator configuration for a system (mirrors `emulator_configs` table). */
export interface EmulatorConfig {
  /** Database row ID. null when creating a new config. */
  id: number | null;
  system_id: string;
  system_name: string;
  executable_path: string;
  /** Launch argument template. The placeholder `{rom}` is expanded at launch time. */
  launch_args: string;
  /** JSON array string of supported file extensions. */
  supported_extensions: string;
  /** Whether this config was created by auto-detection (vs. manual setup). */
  auto_detected: boolean;
  created_at: string | null;
  updated_at: string | null;
}

/** Per-game emulator override (mirrors `game_emulator_overrides` table). */
export interface GameEmulatorOverride {
  game_id: number;
  executable_path: string;
  launch_args: string | null;
}

/** An emulator found by auto-detection scan. */
export interface DetectedEmulator {
  name: string;
  executable_path: string;
  system_ids: string[];
  default_args: string;
}

// ---------------------------------------------------------------------------
// Playtime tracking
// ---------------------------------------------------------------------------

/** A single play session record (mirrors `play_sessions` table). */
export interface PlaySession {
  id: number;
  game_id: number;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
}

/** Aggregated play statistics for a game. */
export interface PlayStats {
  game_id: number;
  total_playtime_seconds: number;
  last_played_at: string | null;
  session_count: number;
  sessions: PlaySession[];
}

/** Event payload emitted when a game session ends. */
export interface GameSessionEnded {
  game_id: number;
  duration_seconds: number;
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

/** Event payload emitted during metadata fetching to report progress. */
export interface MetadataProgress {
  fetched: number;
  total: number;
  current_game: string;
  source: string | null;
  cover_path: string | null;
}

/** Internal metadata retrieved from an API source (IGDB or ScreenScraper). */
export interface GameMetadata {
  igdb_id: number | null;
  developer: string | null;
  publisher: string | null;
  release_date: string | null;
  genre: string | null;
  description: string | null;
  cover_url: string | null;
  screenshot_urls: string[];
  source: string;
}

/** Parameters for the `fetch_metadata` command. */
export interface FetchMetadataParams {
  game_ids: number[];
  /** When true, re-fetch metadata even for games already processed. */
  force?: boolean;
}

// ---------------------------------------------------------------------------
// Cache management
// ---------------------------------------------------------------------------

/** Statistics about the image cache on disk. */
export interface CacheStats {
  covers_count: number;
  covers_size_bytes: number;
  screenshots_count: number;
  screenshots_size_bytes: number;
  total_size_bytes: number;
}

/** Parameters for clearing parts of the image cache. */
export interface ClearCacheParams {
  covers?: boolean | null;
  screenshots?: boolean | null;
  all?: boolean | null;
}

// ---------------------------------------------------------------------------
// Utility type aliases
// ---------------------------------------------------------------------------

/** Available application themes. */
export type ThemeName = 'dark' | 'light' | 'oled' | 'retro';

/** Sort fields supported by GetGamesParams. */
export type GameSortField = 'title' | 'date_added' | 'last_played' | 'playtime' | 'release_date';

/** Sort direction. */
export type SortOrder = 'asc' | 'desc';

-- Enable WAL mode and foreign keys
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- Core game library
CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    system_id TEXT NOT NULL,
    rom_path TEXT NOT NULL UNIQUE,
    rom_hash_crc32 TEXT,
    rom_hash_sha1 TEXT,
    file_size_bytes INTEGER,
    file_last_modified TEXT,
    nointro_name TEXT,
    region TEXT,
    igdb_id INTEGER,
    developer TEXT,
    publisher TEXT,
    release_date TEXT,
    genre TEXT,
    description TEXT,
    cover_path TEXT,
    blurhash TEXT,
    total_playtime_seconds INTEGER DEFAULT 0,
    last_played_at TEXT,
    currently_playing INTEGER DEFAULT 0,
    is_favorite INTEGER DEFAULT 0,
    date_added TEXT NOT NULL,
    metadata_source TEXT,
    metadata_fetched_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Play session history
CREATE TABLE IF NOT EXISTS play_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    duration_seconds INTEGER,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

-- Emulator configurations
CREATE TABLE IF NOT EXISTS emulator_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    system_id TEXT NOT NULL UNIQUE,
    system_name TEXT NOT NULL,
    executable_path TEXT NOT NULL,
    launch_args TEXT DEFAULT '"{rom}"',
    supported_extensions TEXT NOT NULL,
    auto_detected INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Per-game emulator overrides
CREATE TABLE IF NOT EXISTS game_emulator_overrides (
    game_id INTEGER PRIMARY KEY,
    executable_path TEXT NOT NULL,
    launch_args TEXT,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

-- Watched ROM directories
CREATE TABLE IF NOT EXISTS watched_directories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    last_scanned_at TEXT,
    game_count INTEGER DEFAULT 0,
    enabled INTEGER DEFAULT 1
);

-- User preferences
CREATE TABLE IF NOT EXISTS preferences (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Supported systems reference
CREATE TABLE IF NOT EXISTS systems (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    manufacturer TEXT NOT NULL,
    short_name TEXT NOT NULL,
    generation INTEGER,
    extensions TEXT NOT NULL,
    header_offset INTEGER,
    header_magic TEXT,
    theme_color TEXT
);

-- Screenshot cache metadata
CREATE TABLE IF NOT EXISTS screenshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    url TEXT NOT NULL,
    local_path TEXT,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

-- Full-text search virtual table
CREATE VIRTUAL TABLE IF NOT EXISTS games_fts USING fts5(
    title, developer, publisher, description, genre,
    content='games',
    content_rowid='id'
);

-- No-Intro DAT file tracking
CREATE TABLE IF NOT EXISTS dat_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    system_id TEXT NOT NULL UNIQUE,
    file_name TEXT NOT NULL,
    dat_name TEXT,
    entry_count INTEGER DEFAULT 0,
    imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_games_system ON games(system_id);
CREATE INDEX IF NOT EXISTS idx_games_favorite ON games(is_favorite) WHERE is_favorite = 1;
CREATE INDEX IF NOT EXISTS idx_games_last_played ON games(last_played_at) WHERE last_played_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_games_hash ON games(rom_hash_crc32);
CREATE INDEX IF NOT EXISTS idx_play_sessions_game ON play_sessions(game_id);
CREATE INDEX IF NOT EXISTS idx_play_sessions_date ON play_sessions(started_at);

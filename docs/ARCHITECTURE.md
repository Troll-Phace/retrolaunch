# RetroLaunch — Architecture Reference

## Table of Contents

1. [Project Philosophy](#1-project-philosophy)
2. [Complete Feature Set](#2-complete-feature-set)
3. [Technical Architecture](#3-technical-architecture)
4. [ROM Identification Pipeline](#4-rom-identification-pipeline)
5. [Metadata System](#5-metadata-system)
6. [Emulator Launch System](#6-emulator-launch-system)
7. [Playtime Tracking](#7-playtime-tracking)
8. [Asset Storage & Image Caching](#8-asset-storage--image-caching)
9. [Large Library Performance](#9-large-library-performance)
10. [Onboarding Flow](#10-onboarding-flow)
11. [Distribution & Updates](#11-distribution--updates)
12. [SQLite Schema](#12-sqlite-schema)
13. [IPC Command Reference](#13-ipc-command-reference)
14. [Reference](#14-reference)

---

## 1. Project Philosophy

RetroLaunch is a personal, visually stunning front-end launcher for retro game emulation built around three core principles:

### 1.1 UI/UX First
Every architectural decision serves the user experience. The app should feel alive — dynamic color palettes extracted from cover art, smooth page transitions, responsive hover states, and context-aware theming per system. The goal is a launcher that people *want* to look at, not just use.

### 1.2 Platform Agnostic
Fully compatible with macOS and Windows from day one. Tauri's Rust backend + web frontend architecture ensures native performance on both platforms without maintaining separate codebases. File paths, process spawning, and system integration are abstracted behind platform-aware Rust modules.

### 1.3 Standalone Emulator Philosophy
RetroLaunch does not embed emulators or bundle RetroArch cores. It is a launcher, not an emulator. Users point the app to their existing emulator executables (.app / .exe), and RetroLaunch spawns them with the correct ROM path and CLI flags. This keeps the tool lean, avoids licensing complexity, and lets users run their preferred emulator for each system.

---

## 2. Complete Feature Set

### 2.1 Core Features (MVP)

#### Feature 1: ROM Library Scanning
- Recursive directory scanning of user-specified paths
- File extension detection as first pass (`.nes`, `.sfc`, `.gba`, `.bin`, `.cue`, `.chd`, etc.)
- ROM header sniffing for system identification (magic bytes at known offsets)
- CRC32/SHA1 hashing for No-Intro database matching
- File system watcher for auto-detecting new ROMs in watched directories
- Incremental re-scan: store file path + last-modified timestamp, only re-hash changed files

#### Feature 2: System Categorization
- Automatic classification by system: NES, SNES, Genesis/Mega Drive, N64, GB/GBC/GBA, PS1, Saturn, Neo Geo, Atari 2600
- System-level metadata: console name, manufacturer, generation, supported file extensions
- Per-system game counts and storage usage
- System-themed color palettes for UI sections

#### Feature 3: Metadata Retrieval
- Primary API: IGDB (Twitch-owned, comprehensive game database)
- Fallback API: ScreenScraper (emulation-community focused, better obscure title coverage)
- Retrieved fields: title, cover art, screenshots, developer, publisher, release date, region, genre, description
- Background fetching with progress reporting to frontend
- Local caching in SQLite — fetch once, serve forever

#### Feature 4: Emulator Configuration
- Per-system mapping: system → emulator executable path + CLI launch arguments
- Launch argument template with `{rom}` placeholder: e.g., `--fullscreen "{rom}"`
- Auto-detection of common emulators in standard install locations
- Per-game emulator override capability
- Validation: check executable exists and is launchable on config save

#### Feature 5: One-Click Launch
- Spawn emulator as child process via Rust backend `Command::new()`
- Pass ROM path as argument using configured template
- Monitor process handle for exit (playtime tracking)
- Error handling for missing executables, corrupt ROMs, spawn failures

#### Feature 6: Search & Filtering
- Full-text search across game titles, developers, descriptions (SQLite FTS5)
- Filter by system, genre, year, favorites
- Sort by name, year, last played, play time, recently added
- Grid/list view toggle with persistent preference

### 2.2 UI/UX Features

#### Feature 7: Dynamic Color Palette
- Extract dominant colors from cover art using vibrant.js / colorthief
- Apply extracted palette to UI accent colors, gradients, glow effects, badges
- Smooth 300ms CSS transitions when palette changes (game hover, detail view)
- Fallback: system-themed default palette when no cover art exists

#### Feature 8: System-Themed Sections
- Each console gets a distinct visual identity (color palette, subtle background treatment)
- Theme color bleeds into header area when browsing a specific system
- Smooth transition between system themes on navigation

#### Feature 9: Animations & Micro-interactions
- Page transitions via Framer Motion (shared layout animations)
- Card hover states: scale, glow border, play icon overlay
- Hero banner parallax scrolling
- Glassmorphism/blur effects for overlays and modals
- Scroll-triggered fade-in for content sections

### 2.3 Post-MVP Features

#### Feature 10: Playtime Tracking
- Process-level time tracking (spawn → exit = session duration)
- Individual session logging + accumulated totals
- "Continue Playing" hero banner on home screen
- Play history and stats per game

#### Feature 11: Favorites & Collections
- Star/favorite any game
- User-created collections/playlists
- Smart collections (e.g., "Played this week", "Unplayed GBA games")

#### Feature 12: Theme System
- Dark (default), Light, OLED, Retro CRT themes
- Theme selection in preferences with live preview
- Consistent design token system for easy theme creation

---

## 3. Technical Architecture

### 3.1 System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                        User ROM Directories                          │
│                    /Games/ROMs, /Volumes/External, ...                │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────────┐
│                     Tauri Rust Backend                                │
│                                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌───────────┐ │
│  │ ROM Scanner │  │ ROM Identifier│  │ Process     │  │ Metadata  │ │
│  │ (FS + Watch)│  │ (Header+Hash)│  │ Launcher    │  │ Fetcher   │ │
│  └──────┬──────┘  └──────┬───────┘  └──────┬──────┘  └─────┬─────┘ │
│         │                │                  │               │       │
│         └────────────────┴─────────┬────────┴───────────────┘       │
│                                    │                                 │
│                           ┌────────▼────────┐                        │
│                           │  SQLite (WAL)   │                        │
│                           │  Game Library   │                        │
│                           │  Metadata Cache │                        │
│                           │  Play Sessions  │                        │
│                           │  User Prefs     │                        │
│                           └────────┬────────┘                        │
│                                    │                                 │
│                           ┌────────▼────────┐                        │
│                           │  IPC Bridge     │                        │
│                           │  Tauri Commands │                        │
│                           └────────┬────────┘                        │
└────────────────────────────────────┼─────────────────────────────────┘
                                     │
┌────────────────────────────────────▼─────────────────────────────────┐
│                       Web Frontend (Webview)                         │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │ React 18+    │  │ Framer Motion│  │ Tailwind CSS │               │
│  │ TypeScript   │  │ Animations   │  │ + Themes     │               │
│  └──────────────┘  └──────────────┘  └──────────────┘               │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │ React Router │  │ react-window │  │ vibrant.js   │               │
│  │ Navigation   │  │ Virtualized  │  │ Color Extract│               │
│  └──────────────┘  └──────────────┘  └──────────────┘               │
│                                                                      │
│  Views: Home │ System Grid │ Game Detail │ Settings │ Onboarding    │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.2 Tauri IPC Architecture

The Rust backend exposes commands that the frontend invokes via `@tauri-apps/api/core`:

```
Frontend (TypeScript)          Tauri IPC          Backend (Rust)
─────────────────────       ──────────────       ──────────────
invoke("scan_directories")  →  #[tauri::command]  →  ROM scanning
invoke("get_games")         →  #[tauri::command]  →  SQLite query
invoke("launch_game")       →  #[tauri::command]  →  Process spawn
invoke("fetch_metadata")    →  #[tauri::command]  →  IGDB/SS API
invoke("get_play_stats")    →  #[tauri::command]  →  SQLite query
```

Events flow back via Tauri's event system for long-running operations:
```
Backend emits: "scan-progress" → Frontend listens → updates progress UI
Backend emits: "metadata-progress" → Frontend listens → updates cards
Backend emits: "game-session-ended" → Frontend listens → updates playtime
```

### 3.3 Data Flow: ROM Scan to Library

```
User adds directory
       │
       ▼
┌─────────────────┐
│ 1. FS Walk       │  Recursive scan, collect file paths
│    (Rust thread) │  Filter by known extensions
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. System Detect │  Extension → probable system
│    (Extension)   │  .nes → NES, .sfc → SNES, etc.
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 3. Header Sniff  │  Read first N bytes
│    (Magic Bytes) │  Validate system identification
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 4. Hash + Match  │  CRC32 / SHA1 of ROM content
│    (No-Intro DB) │  Lookup in DAT files → exact game identity
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 5. Insert DB     │  games table: title, system, path, hash, region
│    (SQLite)      │  Emit event to frontend for each new game
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 6. Fetch Meta    │  Background job: IGDB → ScreenScraper fallback
│    (Async)       │  Cache cover art to disk, metadata to SQLite
└─────────────────┘
```

---

## 4. ROM Identification Pipeline

### 4.1 Extension Mapping

| System | Extensions | Notes |
|--------|-----------|-------|
| NES | `.nes`, `.unf`, `.unif` | iNES header at byte 0: `NES\x1a` |
| SNES | `.sfc`, `.smc`, `.fig`, `.swc` | Internal header at `0x7FC0` or `0xFFC0` |
| Genesis / Mega Drive | `.md`, `.gen`, `.bin`, `.smd` | `SEGA` string at `0x100` |
| Nintendo 64 | `.n64`, `.z64`, `.v64` | Magic bytes vary by byte-order format |
| Game Boy | `.gb` | Nintendo logo at `0x0104` |
| Game Boy Color | `.gbc` | CGB flag at `0x0143` |
| Game Boy Advance | `.gba`, `.agb` | Nintendo logo at `0x04`, ROM entry at `0x00` |
| PlayStation 1 | `.bin`, `.cue`, `.chd`, `.iso`, `.pbp` | Disc-based; `.cue` is canonical entry point |
| Sega Saturn | `.iso`, `.bin`, `.cue` | `SEGA SEGASATURN` at sector header |
| Neo Geo | `.zip` (MAME-style ROM sets) | ROM set name for identification |
| Atari 2600 | `.a26`, `.bin` | No standard header; rely on hash matching |

### 4.2 Header Sniffing Details

```rust
// NES: First 4 bytes = "NES\x1a"
fn detect_nes(bytes: &[u8]) -> bool {
    bytes.len() >= 4 && bytes[0..4] == [0x4E, 0x45, 0x53, 0x1A]
}

// SNES: Internal ROM name at 0x7FC0 (LoROM) or 0xFFC0 (HiROM)
// Check for valid ASCII in the title field + checksum complement
fn detect_snes(bytes: &[u8]) -> bool {
    let offsets = [0x7FC0, 0xFFC0];
    offsets.iter().any(|&off| {
        bytes.len() > off + 32
            && bytes[off..off + 21].iter().all(|&b| b >= 0x20 && b <= 0x7E)
            && validate_snes_checksum(bytes, off)
    })
}

// GBA: Nintendo logo at 0x04 (156 bytes), entry point at 0x00
fn detect_gba(bytes: &[u8]) -> bool {
    bytes.len() >= 0xC0 && bytes[0x04..0x08] == NINTENDO_LOGO_GBA[0..4]
}
```

### 4.3 No-Intro Hash Matching

No-Intro DAT files provide checksums for verified ROM dumps. After hashing:

1. Compute CRC32 of ROM content (excluding any copier header)
2. Look up CRC32 in the No-Intro DAT file for the detected system
3. Match returns: canonical game name, region, revision, languages
4. Use canonical name as the primary key for IGDB/ScreenScraper metadata lookup

DAT files stored locally at:
- macOS: `~/Library/Application Support/com.retrolaunch.app/dat/`
- Windows: `%APPDATA%/RetroLaunch/dat/`

Bundled with app at first install; user can update via settings.

---

## 5. Metadata System

### 5.1 IGDB API (Primary)

- **Authentication**: Twitch OAuth2 client credentials flow
- **Endpoint**: `https://api.igdb.com/v4/games`
- **Query**: Search by canonical game name from No-Intro match
- **Fields retrieved**: `name, cover.url, screenshots.url, involved_companies.company.name, first_release_date, genres.name, summary, platforms`
- **Rate limits**: 4 requests/second (Twitch app token)
- **Cover art**: IGDB returns URL template; request `t_cover_big` size (264×374)

### 5.2 ScreenScraper API (Fallback)

- **Authentication**: Username + password + dev credentials
- **Endpoint**: `https://api.screenscraper.fr/api2/jeuInfos.php`
- **Query**: Search by CRC32 hash, SHA1 hash, or ROM name + system ID
- **Fields retrieved**: title, box art, screenshots, developer, publisher, release date, genre, description
- **Rate limits**: 1 request/second (free tier)
- **Advantage**: Better coverage for obscure titles, Japan-only releases, homebrew

### 5.3 Metadata Caching Strategy

```
Game identified by hash
       │
       ▼
Check SQLite game_metadata table
       │
   ┌───┴───┐
   │ Hit   │ Miss
   │       │
   ▼       ▼
Return   Query IGDB
cached     │
data    ┌──┴──┐
        │ Hit │ Miss
        │     │
        ▼     ▼
      Cache  Query ScreenScraper
      + Return    │
              ┌───┴───┐
              │ Hit   │ Miss
              │       │
              ▼       ▼
            Cache   Store as
            + Return  "unmatched"
                      (use filename
                       as title)
```

---

## 6. Emulator Launch System

### 6.1 Configuration Model

```rust
struct EmulatorConfig {
    system_id: String,           // "snes", "nes", "ps1", etc.
    executable_path: PathBuf,    // /Applications/bsnes.app or C:\Emulators\bsnes.exe
    launch_args: String,         // --fullscreen "{rom}"
    supported_extensions: Vec<String>,
}
```

### 6.2 Launch Flow

```rust
// 1. Resolve emulator for the game's system
let config = db.get_emulator_config(game.system_id)?;

// 2. Build launch command by replacing {rom} placeholder
let args = config.launch_args.replace("{rom}", &game.rom_path.to_string_lossy());

// 3. Spawn child process
let child = Command::new(&config.executable_path)
    .args(shell_words::split(&args)?)
    .spawn()?;

// 4. Record session start for playtime tracking
db.start_play_session(game.id, Utc::now())?;

// 5. Monitor process in background task
tokio::spawn(async move {
    let _ = child.wait().await;
    db.end_play_session(game.id, Utc::now())?;
    app.emit("game-session-ended", game.id)?;
});
```

### 6.3 macOS .app Bundle Handling

On macOS, emulators are `.app` bundles. To launch:
```rust
#[cfg(target_os = "macos")]
fn resolve_executable(path: &Path) -> PathBuf {
    if path.extension().map_or(false, |ext| ext == "app") {
        // Use `open -a` for .app bundles, or resolve Contents/MacOS/<binary>
        path.join("Contents/MacOS").join(
            path.file_stem().unwrap_or_default()
        )
    } else {
        path.to_path_buf()
    }
}
```

### 6.4 Auto-Detection Paths

| Platform | Search Locations |
|----------|-----------------|
| macOS | `/Applications/`, `~/Applications/`, `/opt/homebrew/bin/` |
| Windows | `C:\Program Files\`, `C:\Program Files (x86)\`, `%LOCALAPPDATA%\` |

Known emulator names to scan for:

| System | Known Emulators |
|--------|----------------|
| NES | Mesen, FCEUX, Nestopia |
| SNES | bsnes, Snes9x |
| Genesis | BlastEm, Kega Fusion |
| N64 | simple64, Project64, mupen64plus |
| GB/GBC/GBA | mGBA, VBA-M |
| PS1 | DuckStation |
| Saturn | Mednafen, Yabause |

---

## 7. Playtime Tracking

### 7.1 Mechanism

The Rust backend spawns the emulator as a child process and monitors the process handle. Session timing is purely OS-level — no emulator cooperation required.

### 7.2 Session Lifecycle

```
User clicks "Launch"
       │
       ▼
Backend: Command::new().spawn()
       │
       ▼
Write play_sessions row:
  game_id, started_at, ended_at=NULL
Set games.currently_playing = true
       │
       ▼
Async: child.wait().await
       │
       ▼
On process exit:
  Update play_sessions: ended_at, duration_seconds
  Update games: total_playtime += duration, last_played_at, currently_playing = false
  Emit "game-session-ended" event to frontend
```

### 7.3 Edge Cases

- **Ungraceful exit / crash**: On app launch, check for `currently_playing = true` rows with `ended_at = NULL`. Either discard the orphaned session or estimate duration from `started_at` to last known app heartbeat.
- **Idle time**: Counts as playtime (process alive = tracked), consistent with Steam's approach.
- **App closes while emulator running**: The child process continues independently. On next RetroLaunch launch, detect orphaned sessions.

---

## 8. Asset Storage & Image Caching

### 8.1 Storage Layout

```
{APP_DATA}/
├── retrolaunch.db              # SQLite database
├── dat/                        # No-Intro DAT files
│   ├── Nintendo - NES.dat
│   ├── Nintendo - SNES.dat
│   └── ...
└── cache/
    ├── covers/                 # Cover art images
    │   ├── {game_id}.webp      # Optimized (if enabled)
    │   └── {game_id}.png       # Original (default)
    ├── screenshots/            # Game screenshots
    │   └── {game_id}/
    │       ├── 1.webp
    │       └── 2.webp
    └── thumbnails/             # Blurhash-derived placeholders
        └── {game_id}.thumb     # 16px base64 thumbnail
```

Platform paths:
- macOS: `~/Library/Application Support/com.retrolaunch.app/`
- Windows: `%APPDATA%/RetroLaunch/`

### 8.2 Image Optimization (Opt-in)

When "Optimize Image Cache" is enabled in preferences:

| Asset Type | Original | Optimized | Format | Max Width |
|-----------|----------|-----------|--------|-----------|
| Cover art | ~80-120KB PNG | ~15-30KB | WebP | 300px |
| Screenshots | ~200-400KB PNG | ~40-80KB | WebP | 640px |
| Blurhash thumb | N/A | ~100 bytes | Base64 string in SQLite | 16px |

Estimated savings: 60-70% reduction. For a 300-game library, ~148MB → ~50MB.

### 8.3 Blurhash Placeholders

On first metadata fetch, generate a blurhash string from the cover art. Store the 16px encoded string directly in the SQLite `games` table. The frontend decodes this instantly on render, providing a smooth blurred placeholder while the full image lazy-loads.

---

## 9. Large Library Performance

### 9.1 Virtualized Rendering

For libraries with 1,000+ games, the grid view uses **react-window** (or react-virtuoso) to only render visible rows plus a small overscan buffer.

```
Grid layout:
  6 columns × ~245px card height
  Viewport: ~4-5 visible rows at 1080p
  1,000 games = ~167 rows
  Only ~6-8 rows rendered at any time (vs. all 167)
```

### 9.2 Image Lazy Loading

```typescript
// IntersectionObserver triggers image load when card enters viewport
// Blurhash placeholder shown instantly, swapped with real image on load

<GameCard>
  {isInView ? (
    <img src={coverUrl} onLoad={fadeIn} />
  ) : (
    <BlurhashPlaceholder hash={game.blurhash} />
  )}
</GameCard>
```

### 9.3 Backend Scan Performance

- ROM scanning runs on a **dedicated Rust thread** (never blocks UI)
- File hashing parallelized via **Rayon** across CPU cores
- Incremental re-scan: store `file_path + last_modified` in SQLite, only re-hash files that changed
- SQLite in **WAL mode** for concurrent reads during background writes
- Emit progress events to frontend during scan: `{ scanned: 450, total: 1200, current_file: "..." }`

### 9.4 Search Performance

- SQLite **FTS5** virtual table for full-text search across `title`, `developer`, `description`
- Frontend debounces input (300ms) → Tauri command → FTS5 query → results returned
- FTS5 index built/rebuilt during scan completion
- For very large libraries (10k+), FTS5 queries return in <10ms

---

## 10. Onboarding Flow

Six-step first-run wizard:

| Step | Screen | Purpose |
|------|--------|---------|
| 1 | Welcome | Branding, feature highlights, Get Started CTA, skip option |
| 2 | ROM Directories | Drag/drop or browse folders, recursive scan, live system detection |
| 3 | Emulator Config | Auto-detect emulators, map to detected systems, manual browse fallback |
| 4 | Metadata Fetch | Background API download, live card preview, "continue in background" |
| 5 | Preferences | Theme, dynamic colors, default view, file watcher, image optimization |
| 6 | Setup Complete | Summary stats, quick tips, hero "Launch" CTA |

### 10.1 Key Design Decisions

- **Skip option on Step 1**: Power users can bypass wizard entirely and configure in Settings later
- **Non-blocking metadata fetch (Step 4)**: User can proceed to app while metadata downloads in background
- **Partial emulator config allowed (Step 3)**: Unconfigured systems show in library but can't launch; amber visual indicator
- **Detected systems only shown (Step 3)**: Only systems with ROMs found in Step 2 appear in emulator config

---

## 11. Distribution & Updates

### 11.1 Build Pipeline

| Platform | Runner | Output | Installer |
|----------|--------|--------|-----------|
| macOS | `macos-latest` (GitHub Actions) | `.app` bundle | `.dmg` |
| Windows | `windows-latest` (GitHub Actions) | `.exe` | `.msi` or `.nsis` |

Triggered by git tags: `v1.0.0` → GitHub Actions → build both platforms → upload to GitHub Releases.

### 11.2 Auto-Updates

Tauri's built-in updater plugin:
1. App checks JSON manifest at GitHub Releases endpoint on launch
2. If newer version exists, show non-intrusive toast: "Update available (v1.1.0) — Restart to update"
3. Download delta update, verify Ed25519 signature, apply on restart

Update manifest format:
```json
{
  "version": "1.1.0",
  "notes": "Bug fixes and performance improvements",
  "pub_date": "2026-04-01T00:00:00Z",
  "platforms": {
    "darwin-aarch64": { "url": "https://github.com/.../retrolaunch_1.1.0_aarch64.dmg.tar.gz", "signature": "..." },
    "darwin-x86_64": { "url": "https://github.com/.../retrolaunch_1.1.0_x64.dmg.tar.gz", "signature": "..." },
    "windows-x86_64": { "url": "https://github.com/.../retrolaunch_1.1.0_x64-setup.nsis.zip", "signature": "..." }
  }
}
```

### 11.3 Code Signing (Optional for Personal Use)

- **macOS**: $99/year Apple Developer Program. Without signing, Gatekeeper blocks app — user must right-click → Open.
- **Windows**: EV code signing certificate. Without signing, SmartScreen shows "unrecognized app" warning.
- For personal use, both can be bypassed manually.

---

## 12. SQLite Schema

```sql
-- Core game library
CREATE TABLE games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    system_id TEXT NOT NULL,
    rom_path TEXT NOT NULL UNIQUE,
    rom_hash_crc32 TEXT,
    rom_hash_sha1 TEXT,
    file_size_bytes INTEGER,
    file_last_modified TEXT,
    nointro_name TEXT,              -- Canonical No-Intro name if matched
    region TEXT,                     -- USA, Japan, Europe, World
    -- Metadata (from IGDB/ScreenScraper)
    igdb_id INTEGER,
    developer TEXT,
    publisher TEXT,
    release_date TEXT,
    genre TEXT,
    description TEXT,
    cover_path TEXT,                 -- Local path to cached cover art
    blurhash TEXT,                   -- 16px blurhash string for placeholder
    -- Playtime
    total_playtime_seconds INTEGER DEFAULT 0,
    last_played_at TEXT,
    currently_playing INTEGER DEFAULT 0,
    -- User data
    is_favorite INTEGER DEFAULT 0,
    date_added TEXT NOT NULL,
    metadata_source TEXT,            -- 'igdb', 'screenscraper', 'manual', NULL
    metadata_fetched_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Play session history
CREATE TABLE play_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    duration_seconds INTEGER,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

-- Emulator configurations
CREATE TABLE emulator_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    system_id TEXT NOT NULL UNIQUE,
    system_name TEXT NOT NULL,
    executable_path TEXT NOT NULL,
    launch_args TEXT DEFAULT '"{rom}"',
    supported_extensions TEXT NOT NULL, -- JSON array: [".sfc", ".smc"]
    auto_detected INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Per-game emulator overrides
CREATE TABLE game_emulator_overrides (
    game_id INTEGER PRIMARY KEY,
    executable_path TEXT NOT NULL,
    launch_args TEXT,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

-- Watched ROM directories
CREATE TABLE watched_directories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    last_scanned_at TEXT,
    game_count INTEGER DEFAULT 0,
    enabled INTEGER DEFAULT 1
);

-- User preferences
CREATE TABLE preferences (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Supported systems reference
CREATE TABLE systems (
    id TEXT PRIMARY KEY,              -- "nes", "snes", "genesis", etc.
    name TEXT NOT NULL,               -- "Nintendo Entertainment System"
    manufacturer TEXT NOT NULL,
    short_name TEXT NOT NULL,         -- "NES", "SNES", "Genesis"
    generation INTEGER,
    extensions TEXT NOT NULL,         -- JSON array of supported extensions
    header_offset INTEGER,            -- Byte offset for magic bytes (-1 if none)
    header_magic TEXT,                -- Expected bytes as hex string
    theme_color TEXT                  -- Default system accent color hex
);

-- Screenshot cache metadata
CREATE TABLE screenshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    url TEXT NOT NULL,
    local_path TEXT,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

-- Full-text search virtual table
CREATE VIRTUAL TABLE games_fts USING fts5(
    title, developer, publisher, description, genre,
    content='games',
    content_rowid='id'
);

-- Indexes
CREATE INDEX idx_games_system ON games(system_id);
CREATE INDEX idx_games_favorite ON games(is_favorite) WHERE is_favorite = 1;
CREATE INDEX idx_games_last_played ON games(last_played_at) WHERE last_played_at IS NOT NULL;
CREATE INDEX idx_games_hash ON games(rom_hash_crc32);
CREATE INDEX idx_play_sessions_game ON play_sessions(game_id);
CREATE INDEX idx_play_sessions_date ON play_sessions(started_at);

-- Enable WAL mode for concurrent read/write
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
```

---

## 13. IPC Command Reference

### 13.1 Tauri Commands (Backend → Frontend)

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `scan_directories` | `Vec<PathBuf>` | emits `scan-progress` events | Recursively scan directories for ROMs |
| `get_games` | `{system?, search?, sort?, limit?, offset?}` | `Vec<Game>` | Query game library with filters |
| `get_game_detail` | `game_id: i64` | `GameDetail` | Full metadata + screenshots for one game |
| `launch_game` | `game_id: i64` | `Result<()>` | Spawn emulator with ROM |
| `fetch_metadata` | `game_ids: Vec<i64>` | emits `metadata-progress` events | Batch metadata fetch from APIs |
| `get_systems` | none | `Vec<System>` | List all systems with game counts |
| `get_emulator_configs` | none | `Vec<EmulatorConfig>` | All emulator configurations |
| `set_emulator_config` | `EmulatorConfig` | `Result<()>` | Save/update emulator mapping |
| `auto_detect_emulators` | none | `Vec<DetectedEmulator>` | Scan common paths for known emulators |
| `get_play_stats` | `game_id: i64` | `PlayStats` | Playtime totals and session history |
| `get_preferences` | none | `HashMap<String, String>` | All user preferences |
| `set_preference` | `{key, value}` | `Result<()>` | Save a preference |
| `add_watched_directory` | `PathBuf` | `WatchedDirectory` | Add and scan a ROM directory |
| `remove_watched_directory` | `id: i64` | `Result<()>` | Remove a watched directory |
| `get_cache_stats` | none | `CacheStats` | Total cache size by category |
| `clear_cache` | `{covers?, screenshots?, all?}` | `Result<()>` | Clear image cache |

### 13.2 Tauri Events (Backend → Frontend)

| Event | Payload | Description |
|-------|---------|-------------|
| `scan-progress` | `{ scanned, total, current_file, systems_found }` | During ROM scan |
| `metadata-progress` | `{ fetched, total, current_game, source }` | During metadata fetch |
| `game-session-ended` | `{ game_id, duration_seconds }` | When emulator process exits |
| `new-rom-detected` | `{ game: Game }` | File watcher detected new ROM |
| `scan-complete` | `{ total_games, total_systems }` | Scan finished |

---

## 14. Reference

### 14.1 Supported Systems Quick Reference

| System | ID | Extensions | Header Check | Common Emulators |
|--------|----|-----------|-------------|-----------------|
| NES | `nes` | `.nes`, `.unf` | `NES\x1a` at 0x00 | Mesen, FCEUX |
| SNES | `snes` | `.sfc`, `.smc` | Title at 0x7FC0/0xFFC0 | bsnes, Snes9x |
| Genesis | `genesis` | `.md`, `.gen`, `.bin` | `SEGA` at 0x100 | BlastEm, Kega Fusion |
| N64 | `n64` | `.n64`, `.z64`, `.v64` | Magic bytes (endian-dependent) | simple64, Project64 |
| Game Boy | `gb` | `.gb` | Nintendo logo at 0x0104 | mGBA |
| Game Boy Color | `gbc` | `.gbc` | CGB flag at 0x0143 | mGBA |
| GBA | `gba` | `.gba`, `.agb` | Nintendo logo at 0x04 | mGBA |
| PS1 | `ps1` | `.bin/.cue`, `.chd`, `.iso`, `.pbp` | Disc-based | DuckStation |
| Saturn | `saturn` | `.iso`, `.bin/.cue` | `SEGA SEGASATURN` | Mednafen |
| Neo Geo | `neogeo` | `.zip` | ROM set name | MAME, FinalBurn Neo |
| Atari 2600 | `atari2600` | `.a26`, `.bin` | Hash only (no header) | Stella |

### 14.2 Performance Budgets

| Metric | Target |
|--------|--------|
| App cold start | < 2 seconds |
| Library render (1000 games) | < 500ms |
| Search results | < 100ms |
| Game launch (click to emulator window) | < 1 second |
| Metadata fetch per game | < 2 seconds |
| Scan speed | > 100 ROMs/second |

### 14.3 Binary Size Budgets

| Component | Target |
|-----------|--------|
| App bundle (no cache) | < 15MB |
| SQLite database (1000 games) | < 5MB |
| Image cache (1000 games, optimized) | < 200MB |
| Image cache (1000 games, original) | < 500MB |

---

*This document evolves with implementation. Sections will be expanded as technical decisions are refined during development.*

# Development Instructions — RetroLaunch

## Overview

Phased development guide for RetroLaunch. Each phase is deliberately small to fit within Claude Code's context window. The orchestrator (CLAUDE.md) delegates all implementation to subagents.

### Subagent Roles

| Subagent | Responsibilities |
|----------|-----------------|
| `rust-backend-dev` | Tauri commands, ROM scanning, process launching, SQLite, file system operations |
| `frontend-dev` | React components, pages, routing, state management, Tailwind styling |
| `ui-animation-dev` | Framer Motion animations, dynamic color system, transitions, visual polish |
| `metadata-dev` | IGDB/ScreenScraper API integration, image caching, metadata pipeline |
| `test-engineer` | Unit tests (Rust + TS), integration tests, E2E tests |
| `code-reviewer` | Code review, quality gates, cross-platform verification |

### Architecture Reference Requirement

Before implementing ANY phase, the orchestrator MUST read:
- `docs/ARCHITECTURE.md` — relevant sections for the phase
- `docs/DESIGN_SYSTEM.md` — for any UI work
- The phase's referenced wireframe SVG — for UI page implementation

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| App Framework | Tauri 2.x | Cross-platform desktop app (Rust + Webview) |
| Backend Language | Rust | FS scanning, process spawning, SQLite, API calls |
| Frontend Framework | React 18+ | UI components, state management |
| Type System | TypeScript | Type-safe frontend development |
| Styling | Tailwind CSS 4 | Utility-first CSS with custom theme tokens |
| Animations | Framer Motion | Page transitions, hover states, layout animations |
| Color Extraction | vibrant.js | Dynamic palette from cover art |
| Virtualization | react-window / react-virtuoso | Performant large list rendering |
| Database | SQLite (via tauri-plugin-sql) | Game library, metadata cache, preferences |
| Build/CI | GitHub Actions | Cross-platform builds, release automation |
| Package Manager | pnpm | Frontend dependency management |
| Rust Tooling | cargo, clippy, rustfmt | Rust build, lint, format |
| Testing (Rust) | cargo test | Backend unit/integration tests |
| Testing (TS) | Vitest | Frontend unit/component tests |
| E2E Testing | Playwright / Tauri driver | End-to-end app testing |

---

## Target Outcomes

- Scan user ROM directories and auto-detect games across 10+ retro systems
- Identify ROMs via extension, header sniffing, and No-Intro hash matching
- Fetch and cache metadata (cover art, developer, year, genre, description) from IGDB and ScreenScraper
- Launch any game with the correct standalone emulator in one click
- Display a visually stunning UI with dynamic color palettes, smooth animations, and system-themed sections
- Track playtime per game via process monitoring
- Provide a 6-step onboarding wizard for first-run setup
- Support grid/list views, search, filtering, favorites
- Run natively on macOS and Windows with auto-update support
- Handle libraries of 10,000+ ROMs without performance degradation

---

## Phase 1: Project Scaffold

### Objective
Create the Tauri project structure, install dependencies, and establish the development foundation.

### Prerequisites
- Rust toolchain installed (rustup)
- Node.js 18+ and pnpm installed
- Tauri CLI (`cargo install tauri-cli`)

### Reference Documents
- `docs/ARCHITECTURE.md` §3.1 (System Architecture)

### Tasks

#### 1.1 Initialize Tauri Project
**Delegate to**: `rust-backend-dev`

Create a new Tauri 2.x project with React + TypeScript frontend template. Configure `tauri.conf.json` with app metadata (name: "RetroLaunch", identifier: "com.retrolaunch.app"). Set up the project directory structure matching ARCHITECTURE.md §3.1.

#### 1.2 Install Frontend Dependencies
**Delegate to**: `frontend-dev`

Install and configure: React 18, TypeScript, Tailwind CSS 4, Framer Motion, react-router-dom, vibrant.js, react-window. Set up `tsconfig.json`, Tailwind config with custom theme tokens from DESIGN_SYSTEM.md. Configure path aliases.

#### 1.3 Set Up Rust Dependencies
**Delegate to**: `rust-backend-dev`

Add Cargo dependencies: `tauri`, `tauri-plugin-sql` (SQLite), `serde`, `serde_json`, `tokio`, `reqwest`, `crc32fast`, `sha1`, `rayon`, `notify` (file watcher), `shell-words`. Configure Tauri permissions for filesystem, shell, and SQL access.

#### 1.4 Create SQLite Schema
**Delegate to**: `rust-backend-dev`

Implement the complete SQLite schema from ARCHITECTURE.md §12. Run migrations on app startup. Seed the `systems` table with all supported systems and their metadata (extensions, header offsets, theme colors).

#### 1.5 Verify Build
**Delegate to**: `test-engineer`

Verify `cargo tauri dev` launches successfully on development machine. Frontend loads in webview. SQLite database is created. Run basic smoke test.

### Success Criteria
- [ ] `cargo tauri dev` launches a window with React frontend
- [ ] SQLite database created with all tables and seeded `systems` data
- [ ] Tailwind CSS compiles with custom theme tokens
- [ ] Framer Motion renders a test animation
- [ ] TypeScript compiles with no errors
- [ ] Project structure matches ARCHITECTURE.md

---

## Phase 2: ROM Scanner

### Objective
Implement the Rust backend ROM scanning pipeline: directory walking, extension filtering, and system detection.

### Prerequisites
- Phase 1 complete

### Reference Documents
- `docs/ARCHITECTURE.md` §3.3 (Data Flow), §4 (ROM Identification Pipeline)

### Tasks

#### 2.1 Directory Walker
**Delegate to**: `rust-backend-dev`

Implement recursive directory scanning in Rust. Walk all files, filter by known ROM extensions (from `systems` table). Emit `scan-progress` events to frontend via Tauri event system. Support multiple directories. Run on background thread (not blocking UI).

#### 2.2 System Detection (Extension)
**Delegate to**: `rust-backend-dev`

Map file extensions to system IDs using the extension mapping table in ARCHITECTURE.md §4.1. Handle ambiguous extensions (`.bin` could be Genesis, PS1, or Atari) by deferring to header sniffing.

#### 2.3 Header Sniffing
**Delegate to**: `rust-backend-dev`

Implement ROM header detection for each system per ARCHITECTURE.md §4.2. Read first N bytes of each file and check for magic bytes / known header patterns. Resolve ambiguous extensions.

#### 2.4 ROM Hashing
**Delegate to**: `rust-backend-dev`

Compute CRC32 (and optionally SHA1) hash of ROM content. Use Rayon for parallel hashing across CPU cores. Strip any copier headers before hashing (iNES 16-byte header for NES, etc.). Store hashes in `games` table.

#### 2.5 Database Insertion
**Delegate to**: `rust-backend-dev`

Insert discovered games into SQLite `games` table. Use `rom_path` UNIQUE constraint to prevent duplicates on re-scan. Store incremental scan state (`file_last_modified`) for efficient re-scans. Update `watched_directories` with scan results.

#### 2.6 Tauri Command Wiring
**Delegate to**: `rust-backend-dev`

Expose `scan_directories`, `add_watched_directory`, `remove_watched_directory` as Tauri commands. Wire up `scan-progress` and `scan-complete` events. Implement `get_games` query command with filtering (system, search, sort, limit, offset).

#### 2.7 Scanner Tests
**Delegate to**: `test-engineer`

Write Rust tests for: extension mapping, header sniffing (with sample ROM headers as byte arrays), CRC32 hashing, SQLite insertion. Test edge cases: empty directories, unsupported files, duplicate ROMs, nested directories.

### Success Criteria
- [ ] Scanning a directory with mixed ROM files correctly identifies systems
- [ ] Header sniffing resolves ambiguous `.bin` files
- [ ] CRC32 hashes computed correctly (verified against known No-Intro checksums)
- [ ] Re-scanning skips unchanged files (incremental)
- [ ] Progress events received by frontend
- [ ] All Rust tests pass

---

## Phase 3: Emulator Launch System

### Objective
Implement emulator configuration and game launching.

### Prerequisites
- Phase 2 complete

### Reference Documents
- `docs/ARCHITECTURE.md` §6 (Emulator Launch System)

### Tasks

#### 3.1 Emulator Config CRUD
**Delegate to**: `rust-backend-dev`

Implement Tauri commands for `get_emulator_configs`, `set_emulator_config`. Support the `{rom}` placeholder in launch args. Store in `emulator_configs` table.

#### 3.2 Auto-Detection
**Delegate to**: `rust-backend-dev`

Implement `auto_detect_emulators` command. Scan common install locations per platform (ARCHITECTURE.md §6.4). Match directory/executable names against known emulator list. Return detected emulators with suggested system mappings.

#### 3.3 Game Launch
**Delegate to**: `rust-backend-dev`

Implement `launch_game` command per ARCHITECTURE.md §6.2. Resolve emulator config for game's system. Handle macOS `.app` bundle resolution. Replace `{rom}` placeholder. Spawn child process. Handle per-game emulator overrides.

#### 3.4 Playtime Tracking
**Delegate to**: `rust-backend-dev`

Implement play session tracking per ARCHITECTURE.md §7. Start session on launch, monitor child process async, end session on process exit. Update `play_sessions` and `games` tables. Emit `game-session-ended` event. Handle orphaned sessions on app startup.

#### 3.5 Launch Tests
**Delegate to**: `test-engineer`

Test: config CRUD operations, `{rom}` template expansion, macOS .app resolution, session lifecycle. Mock process spawning for tests.

### Success Criteria
- [ ] Auto-detect finds installed emulators on development machine
- [ ] Clicking "Launch" on a configured game opens the correct emulator with the correct ROM
- [ ] Playtime is recorded after emulator closes
- [ ] macOS .app bundles resolve correctly
- [ ] Orphaned sessions cleaned up on app restart
- [ ] All tests pass

---

## Phase 4: Metadata Pipeline

### Objective
Implement IGDB and ScreenScraper API integration for metadata and cover art fetching.

### Prerequisites
- Phase 2 complete (games in database with hashes)

### Reference Documents
- `docs/ARCHITECTURE.md` §5 (Metadata System), §8 (Asset Storage)

### Tasks

#### 4.1 IGDB Client
**Delegate to**: `metadata-dev`

Implement Twitch OAuth2 client credentials flow for IGDB authentication. Build query builder for game search by name. Parse response for: title, cover URL, screenshot URLs, developer, publisher, release date, genre, description. Handle rate limits (4 req/s).

#### 4.2 ScreenScraper Client
**Delegate to**: `metadata-dev`

Implement ScreenScraper API client. Support search by CRC32 hash, SHA1, and name + system. Parse response fields. Handle rate limits (1 req/s free tier). Handle authentication.

#### 4.3 Metadata Orchestrator
**Delegate to**: `metadata-dev`

Implement the fetch cascade: check SQLite cache → IGDB → ScreenScraper fallback → mark as unmatched. Process games in batches. Emit `metadata-progress` events. Support background fetching (non-blocking).

#### 4.4 Image Download & Caching
**Delegate to**: `metadata-dev`

Download cover art and screenshots to local cache directory (ARCHITECTURE.md §8.1). Implement opt-in WebP downsampling for image optimization. Generate blurhash strings and store in SQLite. Track cache size.

#### 4.5 Cache Management Commands
**Delegate to**: `rust-backend-dev`

Expose `get_cache_stats` and `clear_cache` Tauri commands. Support selective clearing (covers only, screenshots only, all). Implement `fetch_metadata` command for batch/single game fetching.

#### 4.6 Metadata Tests
**Delegate to**: `test-engineer`

Test: IGDB query building, response parsing, ScreenScraper fallback logic, cache hit/miss flow, image download (with mock HTTP), blurhash generation. Mock all external API calls.

### Success Criteria
- [ ] IGDB returns correct metadata for well-known games (Super Metroid, Chrono Trigger)
- [ ] ScreenScraper fallback works when IGDB misses
- [ ] Cover art downloaded and cached to correct location
- [ ] Blurhash generated and stored in SQLite
- [ ] Image optimization reduces file size by ~60% when enabled
- [ ] Cache stats accurately report disk usage
- [ ] All tests pass (with mocked APIs)

---

## Phase 5: Core UI — App Shell & Navigation

### Objective
Build the foundational React app shell: routing, layout, navigation, and design system implementation.

### Prerequisites
- Phase 1 complete (Tailwind configured with design tokens)

### Reference Documents
- `docs/DESIGN_SYSTEM.md` (entire document)
- `docs/ARCHITECTURE.md` §3.2 (IPC Architecture)
- All wireframes for layout patterns

### Tasks

#### 5.1 Design System Foundation
**Delegate to**: `frontend-dev`

Implement Tailwind CSS custom properties for all design tokens (colors, spacing, radii) from DESIGN_SYSTEM.md. Set up theme system with `data-theme` attribute on root. Configure all four themes (Dark, Light, OLED, Retro). Import Inter and JetBrains Mono fonts.

#### 5.2 App Shell & Router
**Delegate to**: `frontend-dev`

Create the app shell layout with React Router. Routes: `/` (home), `/system/:id` (system grid), `/game/:id` (game detail), `/settings` (settings), `/onboarding` (onboarding wizard). Implement layout wrapper with top bar (logo, search, settings icon).

#### 5.3 Tauri IPC Layer
**Delegate to**: `frontend-dev`

Create a TypeScript service layer wrapping all Tauri `invoke()` calls. Type-safe interfaces for all commands and responses (matching ARCHITECTURE.md §13). Event listener setup for `scan-progress`, `metadata-progress`, `game-session-ended`, `new-rom-detected`.

#### 5.4 State Management
**Delegate to**: `frontend-dev`

Set up React state management (Context + useReducer or Zustand). Global state for: current theme, game library, active filters, search query, dynamic color palette. Persist preferences via Tauri preference commands.

#### 5.5 Shared Components
**Delegate to**: `frontend-dev`

Build reusable component library matching DESIGN_SYSTEM.md: GameCard, SystemCard, Badge, Button (all variants), Input, ProgressBar, StatusIndicator, BlurhashPlaceholder. All components use design tokens, no hardcoded colors.

#### 5.6 Component Tests
**Delegate to**: `test-engineer`

Write Vitest component tests for all shared components. Test: render with props, hover states, theme switching, responsive behavior.

### Success Criteria
- [ ] App launches with correct dark theme styling
- [ ] All four themes render correctly when toggled
- [ ] Router navigates between all routes
- [ ] IPC layer successfully calls Tauri backend commands
- [ ] All shared components render per DESIGN_SYSTEM.md specs
- [ ] Fonts load correctly (Inter, JetBrains Mono)
- [ ] All component tests pass

---

## Phase 6: Home Screen

### Objective
Build the home screen with hero banner, recently added row, and system cards.

### Prerequisites
- Phase 5 complete (app shell, shared components)
- Phase 2 complete (games in database)

### Reference Documents
- `docs/DESIGN_SYSTEM.md` — Hero Banner, System Cards, Horizontal Scroll Row
- `wireframes/wireframe-home.svg`

### Tasks

#### 6.1 Hero Banner — Continue Playing
**Delegate to**: `frontend-dev`

Implement the "Continue Playing" hero banner from wireframe-home.svg. Show the most recently played game with cover art, title, metadata, "Play Now" button, and play progress/stats. Gradient background using game's extracted colors. Fallback: "Welcome to RetroLaunch" if no play history.

#### 6.2 Recently Added Row
**Delegate to**: `frontend-dev`

Horizontal scrollable row of GameCards for recently added games. Partial last card (faded opacity) signals scrollability. Snap scrolling. "See All →" link. Query: games sorted by `date_added DESC`, limit 12.

#### 6.3 System Cards Row
**Delegate to**: `frontend-dev`

"Your Systems" section with SystemCards showing console name + game count. Horizontal scrollable. Click navigates to `/system/:id`. Only show systems with at least 1 game.

#### 6.4 Dynamic Color on Hero
**Delegate to**: `ui-animation-dev`

Implement vibrant.js color extraction on the hero game's cover art. Apply extracted palette to hero gradient, "Play Now" button accent, and glow effects. 300ms CSS transition on color change.

#### 6.5 Page Animations
**Delegate to**: `ui-animation-dev`

Add Framer Motion page enter animation (fade + Y translate). Stagger animation on card rows. Hover animations on all cards per DESIGN_SYSTEM.md.

### Success Criteria
- [ ] Home screen matches wireframe-home.svg layout
- [ ] Hero banner shows last played game with dynamic colors
- [ ] Recently added row scrolls horizontally with snap behavior
- [ ] System cards show correct game counts
- [ ] All animations smooth at 60fps
- [ ] Clicking a system card navigates to system grid

---

## Phase 7: System Grid View

### Objective
Build the system-specific game grid with filtering, sorting, and virtualized rendering.

### Prerequisites
- Phase 5 complete, Phase 6 complete

### Reference Documents
- `docs/DESIGN_SYSTEM.md` — Cards, Grid Layout, Filter Bar, Badges
- `docs/ARCHITECTURE.md` §9 (Large Library Performance)
- `wireframes/wireframe-system-grid.svg`

### Tasks

#### 7.1 Grid Layout
**Delegate to**: `frontend-dev`

Implement 6-column responsive game card grid using react-window or react-virtuoso for virtualized rendering. Cards per DESIGN_SYSTEM.md specs. Responsive column count based on viewport width.

#### 7.2 Filter Bar
**Delegate to**: `frontend-dev`

Genre filter pills (All, Action, RPG, Platform, Puzzle, etc.). Active pill shows accent background. "All" selected by default. Filters query the backend and re-render grid.

#### 7.3 Sort & View Toggle
**Delegate to**: `frontend-dev`

Sort dropdown (A→Z, Z→A, Year, Recently Added, Most Played). Grid/list view toggle. Persist preference in user settings.

#### 7.4 System Theme Header
**Delegate to**: `ui-animation-dev`

System-themed header area: back arrow + breadcrumb, system name + game count, theme color gradient bleed. Color transitions smoothly from home screen accent to system theme color on navigation.

#### 7.5 Lazy Image Loading
**Delegate to**: `frontend-dev`

Implement IntersectionObserver-based lazy loading for cover art images. Show blurhash placeholder while loading. Fade in real image on load. Only load images for visible + overscan rows.

#### 7.6 Search Integration
**Delegate to**: `frontend-dev`

Wire search bar to SQLite FTS5 via Tauri command. Debounce input (300ms). Show results inline in the grid (filtered). Highlight matching text in results.

### Success Criteria
- [ ] Grid matches wireframe-system-grid.svg layout
- [ ] Virtualized rendering handles 1000+ games without lag
- [ ] Scrolling is smooth at 60fps even with large libraries
- [ ] Filters and sort update the grid correctly
- [ ] Blurhash placeholders render instantly, real images lazy-load
- [ ] Search returns results within 100ms
- [ ] System theme color applies to header

---

## Phase 8: Game Detail View

### Objective
Build the game detail page with full metadata display, dynamic color, and launch functionality.

### Prerequisites
- Phase 5 complete, Phase 3 complete (launch system)

### Reference Documents
- `docs/DESIGN_SYSTEM.md` — Detail View layout, Dynamic Color, Buttons
- `docs/ARCHITECTURE.md` §5 (Metadata), §6 (Launch), §7 (Playtime)
- `wireframes/wireframe-game-detail.svg`

### Tasks

#### 8.1 Detail Layout
**Delegate to**: `frontend-dev`

Two-column layout from wireframe-game-detail.svg. Left: large cover art (300×300) with colored drop shadow. Right: title, system/genre badges, metadata grid (developer, publisher, release date, region), description text. Below: screenshot carousel, file info bar.

#### 8.2 Dynamic Color System
**Delegate to**: `ui-animation-dev`

Full dynamic color implementation: extract palette from cover art, apply to background orbs (large blurred circles), accent colors, badges, glow effects, drop shadow. Animate all color properties over 300ms on page entry.

#### 8.3 Action Buttons
**Delegate to**: `frontend-dev`

"Launch" button (primary, accent gradient, glow on hover). "Favorite" button (secondary). Overflow menu (ellipsis). Wire launch button to `launch_game` Tauri command. Show error toast if emulator not configured.

#### 8.4 Play Stats Section
**Delegate to**: `frontend-dev`

"Your Stats" area: play time total, last played timestamp. Fetch from `get_play_stats` command. Show session history if available.

#### 8.5 Screenshot Carousel
**Delegate to**: `frontend-dev`

Horizontal scrollable screenshot row. Lazy-loaded images. Click to expand (modal with larger view). Partial last screenshot for scroll affordance.

#### 8.6 File Info Bar
**Delegate to**: `frontend-dev`

Bottom bar showing: ROM filename, file size, CRC32 hash, No-Intro verification status (✓ or ✗), "Open in Finder/Explorer" link.

#### 8.7 Shared Element Transition
**Delegate to**: `ui-animation-dev`

Framer Motion `layoutId` on cover art for smooth shared element transition from grid card → detail view. Cover art appears to expand from the card to the detail view position.

### Success Criteria
- [ ] Detail view matches wireframe-game-detail.svg
- [ ] Dynamic colors extracted and applied correctly
- [ ] Launch button opens correct emulator
- [ ] Play stats display accurately
- [ ] Shared element transition from grid is smooth
- [ ] File info bar shows correct ROM metadata

---

## Phase 9: Settings Page

### Objective
Build the settings page with emulator configuration, ROM directories, and preferences.

### Prerequisites
- Phase 5 complete, Phase 3 complete

### Reference Documents
- `wireframes/wireframe-settings.svg`
- `docs/ARCHITECTURE.md` §6 (Emulator Config), §8 (Asset Storage)

### Tasks

#### 9.1 Settings Layout
**Delegate to**: `frontend-dev`

Sidebar navigation (Emulator Config, ROM Directories, Metadata & APIs, Appearance, Controls, About). Main content area. Match wireframe-settings.svg structure.

#### 9.2 Emulator Config Panel
**Delegate to**: `frontend-dev`

List all systems with: system icon, name, game count, config status (configured/not). Path input with file browser button. Launch args input. Auto-detect button that calls `auto_detect_emulators` and populates fields.

#### 9.3 ROM Directories Panel
**Delegate to**: `frontend-dev`

List watched directories with game counts and last scan time. Add/remove buttons. "Rescan" button per directory. Drag-drop zone for adding new directories.

#### 9.4 Appearance Panel
**Delegate to**: `frontend-dev`

Theme picker (Dark, Light, OLED, Retro) with preview swatches. Dynamic color palette toggle. Default view toggle (Grid/List). Image cache optimization toggle. Cache stats display with clear button.

#### 9.5 Wire to Backend
**Delegate to**: `frontend-dev`

Connect all settings UI to Tauri commands: `set_emulator_config`, `add_watched_directory`, `remove_watched_directory`, `set_preference`, `get_cache_stats`, `clear_cache`, `auto_detect_emulators`.

### Success Criteria
- [ ] Settings layout matches wireframe-settings.svg
- [ ] Emulator paths saved and persisted correctly
- [ ] Auto-detect populates known emulator paths
- [ ] ROM directory add/remove works with re-scan
- [ ] Theme switching applies immediately across entire app
- [ ] Cache stats accurate, clear function works

---

## Phase 10: Onboarding Wizard

### Objective
Build the 6-step first-run onboarding experience.

### Prerequisites
- Phase 5 (app shell), Phase 2 (scanner), Phase 3 (emulator config), Phase 4 (metadata)

### Reference Documents
- `docs/ARCHITECTURE.md` §10 (Onboarding Flow)
- `wireframes/wireframe-onboarding-1-welcome.svg` through `wireframe-onboarding-6-done.svg`

### Tasks

#### 10.1 Wizard Framework
**Delegate to**: `frontend-dev`

Multi-step wizard component with step indicator (dot navigation), back/continue buttons, skip option. Route: `/onboarding`. Store onboarding completion in preferences. Redirect to onboarding on first launch.

#### 10.2 Step 1: Welcome
**Delegate to**: `frontend-dev`

Branding, feature highlights, "Get Started" CTA, "Skip setup" link. Match wireframe-onboarding-1-welcome.svg.

#### 10.3 Step 2: ROM Directories
**Delegate to**: `frontend-dev`

Drag-drop zone + browse button. Live scanning with progress. System detection badges showing counts. Multiple directory support. Match wireframe-onboarding-2-roms.svg.

#### 10.4 Step 3: Emulator Config
**Delegate to**: `frontend-dev`

Auto-detect banner with "Apply All" button. System rows showing detected vs. unconfigured emulators. File browse per system. Match wireframe-onboarding-3-emulators.svg.

#### 10.5 Step 4: Metadata Fetch
**Delegate to**: `frontend-dev`

Progress bar + live preview cards showing games getting metadata. Stats summary (matched, cover art found, no match, cache size). "Continue in background" option. Match wireframe-onboarding-4-metadata.svg.

#### 10.6 Step 5: Preferences
**Delegate to**: `frontend-dev`

Theme picker, dynamic color toggle, default view, file watcher toggle, image optimization toggle. Match wireframe-onboarding-5-preferences.svg.

#### 10.7 Step 6: Complete
**Delegate to**: `frontend-dev`

Summary stats (games, emulators, metadata match rate, cache size). Quick tips. Hero "Launch RetroLaunch" button. Match wireframe-onboarding-6-done.svg.

#### 10.8 Onboarding Animations
**Delegate to**: `ui-animation-dev`

Step transition animations. Progress indicator transitions. Card fade-in during metadata fetch. Celebration effect on completion screen.

### Success Criteria
- [ ] Wizard redirects on first launch, not on subsequent launches
- [ ] All 6 steps match their wireframes
- [ ] ROM scanning works live during step 2
- [ ] Auto-detect populates emulators in step 3
- [ ] Metadata fetches in background after step 4
- [ ] "Skip" bypasses all steps correctly
- [ ] All preferences saved and applied

---

## Phase 11: File System Watcher

### Objective
Implement real-time ROM detection when new files are added to watched directories.

### Prerequisites
- Phase 2 complete (scanner)

### Reference Documents
- `docs/ARCHITECTURE.md` §3.3 (Data Flow)

### Tasks

#### 11.1 FS Watcher Implementation
**Delegate to**: `rust-backend-dev`

Use the `notify` crate to watch all directories in `watched_directories` table. On new file detection: check if ROM extension, run identification pipeline, insert to database, emit `new-rom-detected` event.

#### 11.2 Frontend Integration
**Delegate to**: `frontend-dev`

Listen for `new-rom-detected` events. Show non-intrusive toast notification. Update game counts and grid view if currently visible. Trigger background metadata fetch for new game.

#### 11.3 Watcher Tests
**Delegate to**: `test-engineer`

Test: file creation triggers detection, non-ROM files ignored, duplicate handling, watcher enable/disable toggle.

### Success Criteria
- [ ] Dropping a ROM into a watched directory triggers detection within 5 seconds
- [ ] New game appears in library without manual rescan
- [ ] Non-ROM files are ignored
- [ ] Watcher respects enable/disable preference

---

## Phase 12: No-Intro Database Integration

### Objective
Implement CRC32 hash matching against No-Intro DAT files for accurate game identification.

### Prerequisites
- Phase 2 complete (hashing)

### Reference Documents
- `docs/ARCHITECTURE.md` §4.3 (No-Intro Hash Matching)

### Tasks

#### 12.1 DAT File Parser
**Delegate to**: `rust-backend-dev`

Parse No-Intro XML DAT files (ClrMamePro format). Extract: game name, CRC32, SHA1, ROM size, region, revision. Store parsed data in a lookup-optimized structure (HashMap<CRC32, GameInfo>).

#### 12.2 Hash Lookup Integration
**Delegate to**: `rust-backend-dev`

After ROM hashing in scan pipeline, look up CRC32 in parsed DAT data. On match: store canonical No-Intro name, region, and revision in `games` table. Use canonical name for improved metadata API matching.

#### 12.3 Bundle DAT Files
**Delegate to**: `rust-backend-dev`

Bundle initial DAT files with app distribution. Store in app data directory. Implement update mechanism in settings (download latest DATs from No-Intro).

#### 12.4 Tests
**Delegate to**: `test-engineer`

Test: DAT parsing, CRC32 lookup accuracy, handling of unmatched ROMs, multiple regions for same game.

### Success Criteria
- [ ] Known ROMs match correctly against No-Intro DATs
- [ ] Canonical names improve metadata search accuracy
- [ ] Region and revision data populated
- [ ] Unknown/homebrew ROMs handled gracefully (no crash, marked as unmatched)

---

## Phase 13: Polish & Performance

### Objective
Performance optimization, edge case handling, and visual polish across all views.

### Prerequisites
- Phases 5-10 complete

### Reference Documents
- `docs/ARCHITECTURE.md` §9 (Performance), §14.2 (Performance Budgets)
- `docs/DESIGN_SYSTEM.md` — Animation Rules, Accessibility

### Tasks

#### 13.1 Performance Audit
**Delegate to**: `code-reviewer`

Profile app startup time (target < 2s). Measure grid render with 1000+ games. Check for memory leaks in virtualized list. Verify lazy loading works under scroll stress.

#### 13.2 Accessibility Pass
**Delegate to**: `frontend-dev`

Add keyboard navigation for grid (arrow keys, Enter to select, Escape to go back). Focus indicators on all interactive elements. `prefers-reduced-motion` support. Verify contrast ratios.

#### 13.3 Error State UI
**Delegate to**: `frontend-dev`

Design and implement error states: emulator not found, ROM corrupt, API rate limited, no internet, scan failed. Toast notifications for transient errors. Inline error messages for configuration errors.

#### 13.4 Empty State UI
**Delegate to**: `frontend-dev`

Design empty states: no games (first launch without onboarding), no search results, no metadata found, no play history. Helpful messaging with action buttons ("Add ROM Directory", "Scan Now").

#### 13.5 Cross-Platform Testing
**Delegate to**: `test-engineer`

Verify on both macOS and Windows: file paths resolve correctly, .app bundle handling (macOS), emulator spawning, file watcher, cache directory creation, theme rendering.

### Success Criteria
- [ ] App cold start < 2 seconds
- [ ] Grid renders 1000 games with smooth scrolling
- [ ] Full keyboard navigation functional
- [ ] All error states display helpful messages
- [ ] All empty states display helpful messages
- [ ] Works correctly on both macOS and Windows

---

## Phase 14: Distribution & Auto-Update

### Objective
Set up CI/CD build pipeline and auto-update system.

### Prerequisites
- Phase 13 complete (app is stable and polished)

### Reference Documents
- `docs/ARCHITECTURE.md` §11 (Distribution & Updates)

### Tasks

#### 14.1 GitHub Actions CI
**Delegate to**: `rust-backend-dev`

Create GitHub Actions workflow: build on `macos-latest` (produces .dmg) and `windows-latest` (produces .msi/.nsis). Trigger on git tag push (v*). Upload artifacts to GitHub Releases.

#### 14.2 Tauri Updater Configuration
**Delegate to**: `rust-backend-dev`

Configure Tauri updater plugin. Generate Ed25519 signing key pair. Set update endpoint to GitHub Releases. Build update manifest JSON as part of CI pipeline.

#### 14.3 Update UI
**Delegate to**: `frontend-dev`

Non-intrusive update toast: "Update available (vX.Y.Z) — Restart to update". Show in top bar or as a floating notification. "Dismiss" and "Restart" buttons.

#### 14.4 Release Verification
**Delegate to**: `test-engineer`

Verify: CI builds succeed for both platforms, installers produce working apps, auto-update check works, update manifest is valid JSON.

### Success Criteria
- [ ] GitHub Actions builds .dmg and .msi from git tag
- [ ] Built apps launch correctly on both platforms
- [ ] Auto-update detects new version and downloads update
- [ ] Update toast displays and restart applies update
- [ ] Signed update manifest validates correctly

---

## Phase 15: End-to-End Validation

### Objective
Full integration testing and final validation of the complete application.

### Prerequisites
- All prior phases complete

### Tasks

#### 15.1 Full User Flow Test
**Delegate to**: `test-engineer`

Test the complete first-run flow: onboarding → scan ROMs → configure emulators → fetch metadata → browse library → launch game → check playtime. Verify on both macOS and Windows.

#### 15.2 Large Library Stress Test
**Delegate to**: `test-engineer`

Test with 5,000+ ROM files across all supported systems. Verify scan completes, metadata fetches handle volume, grid remains smooth, search performs well, memory usage stays reasonable.

#### 15.3 Edge Case Sweep
**Delegate to**: `test-engineer`

Test: ROM in non-ASCII path, very long filenames, read-only directories, network drives, external drives disconnected mid-scan, emulator uninstalled after config, corrupt ROM files, zero-byte files, symlinks.

#### 15.4 Final Code Review
**Delegate to**: `code-reviewer`

Full codebase review: Rust code quality (clippy clean, no unsafe), TypeScript strictness, no hardcoded paths, no leaked API keys, consistent design system usage, proper error handling throughout.

### Success Criteria
- [ ] Complete user flow works end-to-end on both platforms
- [ ] 5,000+ ROM library handles without crashes or significant slowdowns
- [ ] All edge cases handled gracefully
- [ ] Code review passes with no critical issues
- [ ] App is ready for personal daily use

---

## Checklist Summary

### Foundation
- [ ] Phase 1: Project Scaffold
- [ ] Phase 2: ROM Scanner
- [ ] Phase 3: Emulator Launch System
- [ ] Phase 4: Metadata Pipeline

### UI
- [ ] Phase 5: Core UI — App Shell & Navigation
- [ ] Phase 6: Home Screen
- [ ] Phase 7: System Grid View
- [ ] Phase 8: Game Detail View
- [ ] Phase 9: Settings Page
- [ ] Phase 10: Onboarding Wizard

### Features & Polish
- [ ] Phase 11: File System Watcher
- [ ] Phase 12: No-Intro Database Integration
- [ ] Phase 13: Polish & Performance
- [ ] Phase 14: Distribution & Auto-Update
- [ ] Phase 15: End-to-End Validation

---

## Quick Reference

### Subagent Assignments

| Domain | Subagent |
|--------|----------|
| Tauri backend, Rust, SQLite, FS, process spawning | `rust-backend-dev` |
| React components, pages, routing, Tailwind | `frontend-dev` |
| Framer Motion, dynamic colors, visual polish | `ui-animation-dev` |
| IGDB, ScreenScraper, image caching | `metadata-dev` |
| All testing (Rust, TS, E2E) | `test-engineer` |
| Code review, quality gates | `code-reviewer` |

### Key Commands

```bash
cargo tauri dev                     # Run in development mode
cargo tauri build                   # Production build
pnpm dev                            # Frontend dev server only
pnpm build                          # Frontend production build
cargo test                          # Rust tests
pnpm test                           # Frontend tests (Vitest)
cargo clippy                        # Rust linting
pnpm lint                           # TS/ESLint
```

### Performance Targets

| Metric | Target |
|--------|--------|
| Cold start | < 2s |
| Grid render (1000 games) | < 500ms |
| Search results | < 100ms |
| Game launch (click → emulator) | < 1s |
| Metadata fetch per game | < 2s |
| Scan speed | > 100 ROMs/s |

### Required Docs Per Phase Type

| Phase Type | Required Reading |
|-----------|-----------------|
| Backend | ARCHITECTURE.md (relevant sections) |
| Frontend/UI | ARCHITECTURE.md + DESIGN_SYSTEM.md + relevant wireframe |
| Testing | ARCHITECTURE.md (for expected behavior) |
| All phases | INSTRUCTIONS.md (current phase section) |

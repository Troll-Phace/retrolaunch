# Feature Ideas — Small Wins

Quick-win features that add polish and delight without requiring major architectural changes. Organized by effort level.

---

## Tier 1: Low Effort (1-2 hours each)

### 1. "Recently Played" Home Carousel

The Home page currently shows "Recently Added" and "Your Systems" but has no "Recently Played" row. The data already exists (`last_played_at` on the games table, plus `play_sessions`). Add a horizontal scroll row showing the 12 most recently played games, positioned between the hero banner and "Recently Added".

- **Why**: High-value surface for returning users. Most launchers lead with "continue where you left off."
- **Backend**: No changes needed. `getGames` already supports `sort_by: 'last_played'`.
- **Frontend**: ~20 lines in `Home.tsx` — filter games with `last_played_at`, sort descending, render a `HorizontalScrollRow`.

---

### 2. Random Game Picker ("Surprise Me")

A button (on Home and/or System Grid) that picks a random game and navigates to its detail page. Great for large libraries where users suffer choice paralysis.

- **Why**: Fun, delightful, zero-friction engagement. Every streaming service has this.
- **Backend**: None. Pick a random index client-side from the loaded game list.
- **Frontend**: Small button component + `Math.random()` logic. Could add a dice-roll animation for flair.

---

### 3. Grid Card Size Slider

Let users adjust game card size in the System Grid view with a slider (small / medium / large). Currently the grid uses fixed column counts based on breakpoints.

- **Why**: Personal preference varies. Some users want to see more titles; others want to admire cover art.
- **Backend**: Store preference via existing `setPreference` mechanism.
- **Frontend**: Add a slider to the grid toolbar. Adjust `react-window` item size + column count dynamically.

---

### 4. Game Completion Status

Add a simple status tag to games: "Backlog", "Playing", "Completed", "Dropped". Visible as a small badge on game cards and on the detail page.

- **Why**: Core quality-of-life for anyone managing a large library. Pairs naturally with the existing favorites system.
- **Backend**: Add a `status TEXT DEFAULT 'backlog'` column to the `games` table + a migration. New IPC command `set_game_status(game_id, status)`.
- **Frontend**: Badge component on `GameCard`, dropdown on `GameDetail`, filter option on System Grid.

---

### 5. Cover Art Override

Let users manually set or replace a game's cover art by selecting an image file. Useful for games where the metadata APIs return the wrong art or nothing at all.

- **Why**: Metadata APIs aren't perfect, especially for obscure or region-specific titles. Users want control.
- **Backend**: New command `set_cover_art(game_id, image_path)` — copies the image to the cache directory, updates `cover_path` and regenerates `blurhash`.
- **Frontend**: "Change Cover" button on GameDetail page, opens a file dialog.

---

### 6. Duplicate ROM Detection

Scan the library for games with identical CRC32/SHA1 hashes across different directories. Surface duplicates in settings or as a toast notification after scan.

- **Why**: Users with multiple ROM directories often have duplicates wasting space and cluttering the library.
- **Backend**: SQL query: `SELECT rom_hash_crc32, COUNT(*) FROM games GROUP BY rom_hash_crc32 HAVING COUNT(*) > 1`. New command `get_duplicate_games()`.
- **Frontend**: A "Duplicates" section in settings or a dedicated modal showing groups of duplicate files with options to keep one / remove others.

---

## Tier 2: Medium Effort (2-4 hours each)

### 7. Quick Launch Bar (Cmd+K / Ctrl+K)

A command-palette-style overlay for instant game search and launch. Type a game name, arrow-key to select, Enter to launch (or Shift+Enter for detail page).

- **Why**: Power-user feature. Once you have 500+ games, navigating through the UI is slow. This is the fastest path from "I want to play X" to playing it.
- **Backend**: None. Use existing `getGames` with search query.
- **Frontend**: Modal with debounced search input, filtered results list, keyboard navigation. Framer Motion for slide-down animation.

---

### 8. Library Statistics Dashboard

A stats panel (in Settings or as its own page) showing aggregate play data: total playtime across all games, most played games (top 10), playtime by system (bar chart), games per system (pie chart), play streak calendar (GitHub contribution-style), library size.

- **Why**: Users love seeing their stats. It rewards engagement and makes the app feel more personal.
- **Backend**: New command `get_library_stats()` returning aggregate queries (already have all the raw data in `games` + `play_sessions`).
- **Frontend**: Stats card grid with simple CSS bar/donut charts (no charting library needed for MVP — pure div-based bars).

---

### 9. Collections / Playlists

User-created game collections (e.g., "Beat 'em Ups", "Couch Co-op Night", "Childhood Favorites"). Already mentioned in ARCHITECTURE.md as a post-MVP feature.

- **Why**: Favorites is a single list. Collections let users organize by mood, genre mashups, multiplayer sessions, or any personal taxonomy.
- **Backend**: New `collections` table (id, name, description, cover_game_id, sort_order) + `collection_games` junction table. CRUD commands.
- **Frontend**: Collections section on Home page, collection detail view (reuse SystemGrid layout), "Add to Collection" action on game cards/detail.

---

### 10. Smart Collections (Auto-Filtered)

Saved filter presets that act like dynamic playlists. Examples:
- "Unplayed" — games with `total_playtime_seconds = 0`
- "Played This Week" — games with a `play_session` in the last 7 days
- "Short Sessions" — games with average session under 15 minutes
- "No Cover Art" — games missing `cover_path`

- **Why**: Surfaces games that would otherwise be buried. Helps users rediscover their library.
- **Backend**: Store filter definitions as JSON in a `smart_collections` table. Resolve at query time using existing `getGames` filter logic.
- **Frontend**: Render alongside user collections. Each smart collection shows a live count badge.

---

### 11. Batch Metadata Refresh

Multi-select games in the System Grid and trigger a bulk metadata re-fetch. Currently you can only re-fetch metadata one game at a time from the detail page.

- **Why**: After importing a large library, users may want to retry metadata for games that failed or got wrong results.
- **Backend**: Already have `fetch_metadata` which works on batches. Just need a new command or modify existing to accept a list of game IDs.
- **Frontend**: Checkbox selection mode on game cards (long-press or toolbar toggle), floating action bar with "Re-fetch Metadata" button.

---

### 12. Per-Game Notes

A free-text notes field on each game. Users can jot down save file locations, cheat codes, control tips, or personal ratings.

- **Why**: Retro games often need external knowledge (e.g., "use save state slot 3", "needs BIOS file X"). Having notes in-app beats a separate text file.
- **Backend**: Add `notes TEXT` column to `games` table + migration. Command `set_game_notes(game_id, notes)`.
- **Frontend**: Expandable text area on GameDetail page, auto-saving on blur.

---

## Tier 3: Larger but High-Impact

### 13. Multi-ROM Launch Profiles

Support multiple emulators per system and let users pick which one to use at launch time. Example: SNES games could launch in bsnes (accuracy) or Snes9x (speed).

- **Why**: Power users often have multiple emulators. The current system maps one emulator per system, which is limiting.
- **Backend**: Allow multiple `emulator_configs` per `system_id` (remove UNIQUE constraint, add `is_default` flag). Modify `launch_game` to accept an optional `emulator_config_id`.
- **Frontend**: Emulator picker dropdown on GameDetail, long-press on Play button shows alternatives.

---

### 14. Import/Export Library

Export the full game library (metadata, playtime, favorites, collections, notes) as a JSON file. Import on another machine to migrate.

- **Why**: Users reinstalling, switching machines, or backing up want to preserve their curated library data.
- **Backend**: `export_library()` → serialize relevant tables to JSON. `import_library(json)` → merge/replace with conflict resolution.
- **Frontend**: Export/Import buttons in Settings > About panel.

---

### 15. Ambient Background Mode

An idle screensaver-style mode that cycles through random game cover art with the dynamic color system, showing game title + system. Activates after N minutes of inactivity or on demand.

- **Why**: RetroLaunch is a visual-first app. This turns it into living wall art. Great for streamers, game rooms, or just leaving on a second monitor.
- **Backend**: None.
- **Frontend**: Full-screen overlay, 10-second crossfade between random games, dynamic color orbs animating in background. Toggle via toolbar button or auto after idle timeout.

---

## Priority Recommendation

For maximum user-facing impact with minimum effort, start with these three:

1. **Recently Played Carousel** (#1) — near-zero effort, immediate value for returning users
2. **Quick Launch Bar** (#7) — transforms the app for power users, high "wow" factor
3. **Game Completion Status** (#4) — turns RetroLaunch from a launcher into a library manager

These three features compose well together: the Recently Played row shows what you've been doing, completion status tracks progress, and Quick Launch gets you back into any game instantly.

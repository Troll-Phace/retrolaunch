<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" alt="RetroLaunch" width="128" height="128" />
</p>

<h1 align="center">RetroLaunch</h1>

<p align="center">
  <strong>A visually stunning, platform-agnostic launcher for retro game emulation.</strong>
</p>

<p align="center">
  <a href="https://github.com/Troll-Phace/retrolaunch/releases"><img src="https://img.shields.io/github/v/release/Troll-Phace/retrolaunch?style=flat-square&color=6366f1" alt="Release" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-8888aa?style=flat-square" alt="Platform" />
  <img src="https://img.shields.io/badge/tauri-2.x-24C8D8?style=flat-square&logo=tauri&logoColor=white" alt="Tauri 2" />
  <img src="https://img.shields.io/badge/react-19-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/rust-2021-DEA584?style=flat-square&logo=rust&logoColor=black" alt="Rust" />
  <a href="https://github.com/Troll-Phace/retrolaunch/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Troll-Phace/retrolaunch?style=flat-square&color=4ade80" alt="License" /></a>
</p>

<br />

---

RetroLaunch is a desktop application that organizes your retro game ROM library, enriches it with metadata and cover art, and lets you launch any game with your preferred standalone emulator — all wrapped in a modern, dynamic UI that adapts its colors to the art of whatever you're playing.

> **Not an emulator.** RetroLaunch is a launcher. You bring your own emulators and ROMs. RetroLaunch makes them beautiful and accessible.

<br />

## Highlights

🎮 **Smart ROM Detection** — Scans directories recursively, identifies systems by file extension + header magic bytes + No-Intro hash matching

🖼️ **Rich Metadata** — Cover art, screenshots, developer, publisher, release date, genre & description from IGDB and ScreenScraper

🚀 **One-Click Launch** — Map each system to your preferred emulator, then launch any game instantly with the right CLI flags

🎨 **Dynamic Color Palettes** — Colors are extracted from cover art in real-time, bleeding into backgrounds, glows, and accents

⚡ **Blazing Performance** — Virtualized grids handle 10,000+ game libraries at 60 fps; SQLite FTS5 for instant search

📊 **Playtime Tracking** — Process-level session monitoring with per-game accumulated stats

🔄 **Auto-Update** — Built-in updater via GitHub Releases keeps you on the latest version

<br />

## Supported Systems

| System | Extensions |
|--------|-----------|
| NES / Famicom | `.nes`, `.unf` |
| SNES / Super Famicom | `.sfc`, `.smc` |
| Sega Genesis / Mega Drive | `.md`, `.gen`, `.bin` |
| Nintendo 64 | `.n64`, `.z64`, `.v64` |
| Game Boy / Game Boy Color | `.gb`, `.gbc` |
| Game Boy Advance | `.gba` |
| PlayStation 1 | `.bin`, `.cue`, `.chd`, `.iso` |
| Sega Saturn | `.bin`, `.cue`, `.chd`, `.iso` |
| Neo Geo | `.zip` |
| Atari 2600 | `.a26`, `.bin` |

<br />

## Screenshots

> *Coming soon — the app features an ultra-modern dark aesthetic with glassmorphism, system-themed sections, and cover-art-driven color palettes.*

<br />

## Getting Started

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| [Rust](https://rustup.rs) | stable | Backend compilation |
| [Node.js](https://nodejs.org) | 18+ | Frontend tooling |
| [pnpm](https://pnpm.io) | 10+ | Package management |
| [Tauri CLI](https://v2.tauri.app) | 2.x | `cargo install tauri-cli` |

Platform-specific requirements are covered in the [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/).

### Installation

```bash
# Clone the repository
git clone https://github.com/Troll-Phace/retrolaunch.git
cd retrolaunch

# Install frontend dependencies
pnpm install

# Run in development mode (starts both Vite dev server and Tauri)
pnpm tauri dev
```

### Building for Production

```bash
# Create an optimized, distributable build
pnpm tauri build
```

Outputs are placed in `src-tauri/target/release/bundle/` — `.dmg` / `.app` on macOS, `.msi` / `.exe` on Windows.

<br />

## Architecture

RetroLaunch uses **Tauri 2.x** — a Rust backend paired with a web-based frontend rendered in the platform's native webview. No Electron, no bundled Chromium.

```
┌─────────────────────────────────────────────────────┐
│                   Rust Backend                       │
│                                                     │
│  ROM Scanner ─── Header Sniffer ─── No-Intro Match  │
│  Process Launcher ── Playtime Tracker               │
│  IGDB Client ── ScreenScraper Client ── Image Cache │
│  SQLite (WAL mode) ── FTS5 Search                   │
│                                                     │
│                  ▼ Tauri IPC ▼                       │
│                                                     │
│                  Web Frontend                        │
│                                                     │
│  React 19 ── TypeScript ── Tailwind CSS 4           │
│  Framer Motion ── react-window ── vibrant.js        │
│  Zustand ── React Router                            │
└─────────────────────────────────────────────────────┘
```

### Key Design Decisions

- **Standalone emulators only** — RetroLaunch does not embed emulators or bundle RetroArch cores. Users point to their existing executables and RetroLaunch spawns them with the correct arguments.
- **SQLite as the single source of truth** — Game library, metadata cache, play sessions, and user preferences all live in one local database (WAL mode for concurrent reads).
- **Dynamic color everywhere** — `vibrant.js` extracts dominant colors from cover art; these are applied as CSS custom properties and animated with 300ms transitions.
- **Virtualized rendering** — `react-window` ensures the grid view stays at 60 fps even with massive libraries.

<br />

## Project Structure

```
retrolaunch/
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── commands/       # Tauri IPC command handlers
│   │   ├── scanner/        # ROM identification pipeline
│   │   ├── metadata/       # IGDB & ScreenScraper API clients
│   │   ├── launcher/       # Emulator process management
│   │   ├── db/             # SQLite schema, migrations, queries
│   │   └── models.rs       # Shared data types
│   └── tauri.conf.json     # Tauri app configuration
├── src/                    # React frontend
│   ├── pages/              # Home, SystemGrid, GameDetail, Settings, Onboarding
│   ├── components/         # Reusable UI components
│   ├── hooks/              # Custom React hooks
│   ├── services/           # Typed Tauri IPC wrappers
│   ├── store/              # Zustand state management
│   ├── styles/             # Tailwind globals & theme definitions
│   └── types/              # TypeScript type definitions
├── docs/                   # Architecture, design system, dev instructions
├── ui-wireframes/          # SVG wireframes for all views
└── .github/workflows/      # CI/CD release automation
```

<br />

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **App Framework** | [Tauri 2.x](https://v2.tauri.app) |
| **Backend** | Rust 2021 — tokio, reqwest, serde, rayon, rusqlite, notify |
| **Database** | SQLite (WAL mode, FTS5) |
| **Frontend** | React 19 + TypeScript |
| **Styling** | Tailwind CSS 4 with custom design tokens |
| **Animations** | Framer Motion |
| **Color Extraction** | vibrant.js / node-vibrant |
| **Virtualization** | react-window |
| **State Management** | Zustand |
| **Routing** | React Router v7 |
| **Testing** | `cargo test` (Rust) · Vitest (frontend) |
| **CI/CD** | GitHub Actions |

<br />

## Development

### Commands

```bash
pnpm dev              # Start Vite dev server
pnpm build            # Build frontend for production
pnpm test             # Run Vitest frontend tests
pnpm tauri dev        # Run full app in dev mode
pnpm tauri build      # Production build with bundling
```

### Rust Backend

```bash
cd src-tauri
cargo test            # Run Rust unit & integration tests
cargo clippy          # Lint
cargo fmt             # Format
```

### Code Style

- **Rust** — `clippy` clean, `rustfmt` formatted, no `unwrap()` in production, error handling via `thiserror` / `anyhow`
- **TypeScript** — Strict mode, functional components only, fully typed IPC layer, no `any`
- **CSS** — Design tokens via CSS custom properties, never hardcoded hex values

<br />

## Roadmap

- [x] Project scaffold & Tauri 2.x setup
- [x] ROM scanner with extension + header sniffing
- [x] Emulator launch system with process management
- [x] Metadata pipeline (IGDB & ScreenScraper)
- [x] App shell, navigation & routing
- [x] Home screen with hero banner
- [ ] System grid view with virtualization
- [ ] Game detail view with dynamic colors
- [ ] Settings page
- [ ] Onboarding wizard
- [ ] File system watcher for auto-detection
- [ ] No-Intro database integration
- [ ] Polish, performance tuning & accessibility
- [ ] Distribution & auto-update pipeline
- [ ] End-to-end validation

<br />

## Contributing

Contributions are welcome! If you'd like to help:

1. **Fork** the repository
2. **Create a branch** for your feature (`git checkout -b feature/amazing-thing`)
3. **Commit** your changes with clear messages
4. **Push** to your branch and open a **Pull Request**

Please ensure `cargo clippy` and `pnpm test` pass before submitting.

<br />

## License

This project is licensed under the [ISC License](LICENSE).

<br />

---

<p align="center">
  <sub>Built with <a href="https://v2.tauri.app">Tauri</a>, <a href="https://react.dev">React</a>, and a love for retro games.</sub>
</p>

---
description: Initialize project from scratch
allowed-tools: Read, Write, Bash(cargo *), Bash(pnpm *), Bash(rustup *), Bash(git *), Bash(mkdir *)
---

# Project Setup

## Instructions

1. Verify prerequisites: `rustup --version`, `node --version`, `pnpm --version`
2. Install Tauri CLI: `cargo install tauri-cli`
3. Create Tauri project: `pnpm create tauri-app retrolaunch --template react-ts`
4. Install frontend deps: `pnpm install`
5. Install additional deps: framer-motion, react-router-dom, node-vibrant, react-window
6. Configure Tailwind CSS with design tokens from DESIGN_SYSTEM.md
7. Add Rust deps to Cargo.toml (serde, tokio, reqwest, crc32fast, sha1, rayon, notify, shell-words)
8. Initialize SQLite with schema from ARCHITECTURE.md
9. Initialize git repository
10. Verify: `cargo tauri dev` launches successfully

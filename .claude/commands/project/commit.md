---
description: Create a well-formatted git commit
allowed-tools: Bash(git *)
---

# Commit Changes

## Instructions

1. Run `git status` to see changes
2. Run `git diff --stat` for overview
3. Stage relevant files (not node_modules/, not target/, not .env)
4. Create commit with format: `phase(N): description`
5. Examples:
   - `phase(1): project scaffold with Tauri + React + Tailwind`
   - `phase(2): implement ROM scanner with header sniffing`
   - `phase(5): core UI shell with routing and design tokens`
   - `phase(8): game detail view with dynamic color palette`

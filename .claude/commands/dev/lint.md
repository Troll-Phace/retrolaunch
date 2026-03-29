---
description: Run code formatting and linting
allowed-tools: Bash(cargo *), Bash(pnpm *), Bash(npx *)
---

# Lint & Format

## Instructions

1. Rust: `cargo clippy -- -D warnings` (check) and `cargo fmt --check` (format check)
2. TypeScript: `pnpm lint` (ESLint) and `npx prettier --check "src/**/*.{ts,tsx}"`
3. If issues found, ask user if they want to auto-fix
4. Auto-fix: `cargo fmt && npx prettier --write "src/**/*.{ts,tsx}"`

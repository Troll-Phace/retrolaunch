---
description: Show current project status
allowed-tools: Read, Bash(git log *), Bash(cargo test *), Bash(pnpm test *), Bash(wc *)
---

# Project Status

## Instructions

1. Read INSTRUCTIONS.md and determine current phase
2. Check git log for recent commits
3. Run test suite and report results
4. Count lines of code: Rust (`find src-tauri -name "*.rs" | xargs wc -l`) and TS (`find src -name "*.tsx" -o -name "*.ts" | xargs wc -l`)
5. Check for any TODO/FIXME comments
6. Report overall status

## Output Format

### Project Status Report
- **Current Phase**: [N] — [Title]
- **Completed Phases**: [list]
- **Tests**: [X passing, Y failing, Z total] (Rust + TS)
- **Lines of Code**: [Rust count] Rust, [TS count] TypeScript
- **Open TODOs**: [count and locations]
- **Last Commit**: [hash] — [message] — [date]

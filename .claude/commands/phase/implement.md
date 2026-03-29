---
description: Execute the current phase implementation
allowed-tools: Read, Write, Edit, Bash(cargo *), Bash(pnpm *), Bash(cargo tauri *), Bash(git *)
---

# Implement Phase

Execute the planned implementation for the current phase.

## Instructions

1. Confirm the plan from /phase plan is approved
2. For each task in order:
   a. Prepare the delegation prompt with full context
   b. Delegate to the appropriate subagent
   c. Review the output against success criteria
   d. If issues found, provide feedback and re-delegate
3. After all tasks complete:
   a. Run the test suite: `cargo test && pnpm test`
   b. Run linting: `cargo clippy && pnpm lint`
   c. Verify all success criteria from INSTRUCTIONS.md
4. Report phase completion status

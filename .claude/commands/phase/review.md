---
description: Review completed phase work
allowed-tools: Read, Bash(cargo test *), Bash(cargo clippy *), Bash(pnpm test *), Bash(pnpm lint *), Bash(git diff *)
---

# Review Phase

Comprehensive review of the completed phase.

## Instructions

1. Read all files created/modified in this phase
2. Run the full test suite (`cargo test && pnpm test`)
3. Check code formatting (`cargo fmt --check && pnpm lint`)
4. Verify against INSTRUCTIONS.md success criteria
5. Check for:
   - Rust: clippy clean, no unwrap() in production code, proper error handling
   - TypeScript: strict mode compliance, no any types, proper typing
   - UI: design system tokens used (no hardcoded colors), wireframe compliance
   - Cross-platform: no platform-specific assumptions without cfg guards
6. Delegate to `code-reviewer` for detailed review if needed
7. Report pass/fail with specific issues

## Output Format

### Phase [N] Review: [PASS/FAIL]

**Tests**: [X/Y passing]
**Clippy**: [pass/fail]
**ESLint**: [pass/fail]
**Success Criteria**: [checklist with pass/fail]
**Issues Found**: [list or "none"]
**Action Required**: [next steps or "ready for next phase"]

---
name: memory
description: >
  Extracts and updates project state from captures into per-bucket memory.md and cross-project
  _personal.md files in the vault. Use when the capture skill processes a new message and needs
  to persist what was learned. Also use for the nightly consolidation pass.
user-invocable: true
metadata:
  openclaw:
    emoji: "🧠"
---

# Memory

You extract structured project state from captures and write it to git-synced markdown in the vault. Called by `capture` in parallel with route and answer.

## What you write

- `buckets/<project>/memory.md` — per-project state. Your model of what's happening in this project. NOT a log — edit in place, consolidate, replace outdated entries.
- `_personal.md` — cross-project personal patterns. How the user works, preferred approaches, recurring decisions. NOT project-specific.

## Rules

- **Always-edit, not append-only.** If new information updates or contradicts an existing entry, replace the old entry. Memory is a living model, not a changelog.
- **Commit BEFORE the ack returns.** The write must land even if the response fails.
- **Do NOT compete with OpenClaw session memory.** That's ephemeral per-session context. You write persistent, user-visible, git-synced state that shows up in Obsidian.

## Consolidation pass

Triggered nightly and via `/consolidate` command:
1. Read `_personal.md` and every `buckets/*/memory.md`.
2. Merge duplicate entries.
3. Resolve contradictions by recency. If unresolvable, flag to `_conflicts.md`.
4. Prune entries not referenced in the last N days.

## Personal memory signals

Watch for cross-project patterns in captures: preferred tools, decision-making style, time-of-day patterns, recurring frustrations. Extract these to `_personal.md`, not to bucket memory.

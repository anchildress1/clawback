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

- `OpenClaw/buckets/<project>/memory.md` — per-project state. Your model of what's happening in this project. NOT a log — edit in place, consolidate, replace outdated entries.
- `_personal.md` (vault root) — cross-project personal patterns. How the user works, preferred approaches, recurring decisions. NOT project-specific.

## How to update bucket memory

1. Call `clawback_read_bucket_file` with the bucket slug and `memory.md` to get the current state.
2. Analyze the new capture for project state: decisions, plans, status updates, pivots.
3. Produce the FULL updated `memory.md` content:
   - If the new info **updates** an existing section, **replace** that section.
   - If the new info **contradicts** an existing entry, **delete** the old entry and write the new one.
   - If the new info is **additive**, add it in the appropriate section.
   - **Never append to the bottom without reading what's already there.**
4. Call `clawback_write_memory` with the slug and the full new content.

## How to update personal memory

1. Call `clawback_read_personal_memory` to get the current state.
2. Look for cross-project signals in the capture: preferred tools, decision-making style, time patterns, recurring frustrations, communication preferences.
3. If a signal is found, produce the FULL updated `_personal.md` and call `clawback_write_personal_memory`.
4. If nothing new, skip the write.

## Rules

- **Always-edit, not append-only.** If new information updates or contradicts an existing entry, replace the old entry. Memory is a living model, not a changelog.
- **Commit BEFORE the ack returns.** The write must land even if the response fails.
- **Do NOT compete with OpenClaw session memory.** That's ephemeral per-session context. You write persistent, user-visible, git-synced state that shows up in Obsidian.

## Consolidation pass

Triggered nightly and via `/consolidate` command:
1. Read `_personal.md` via `clawback_read_personal_memory`.
2. Read every bucket's `memory.md` via `clawback_read_bucket_file` for each bucket from `clawback_read_manifest`.
3. Merge duplicate entries across files.
4. Resolve contradictions by recency. If unresolvable, flag to `_conflicts.md`.
5. Prune entries not referenced in the last N days.
6. Write all updated files via `clawback_write_memory` and `clawback_write_personal_memory`.
7. Sync the vault via `exec` tool: `git add -A && git commit -m "memory: consolidation pass" && git pull --rebase --autostash && git push` in the vault directory.

## Personal memory signals

Watch for cross-project patterns in captures: preferred tools, decision-making style, time-of-day patterns, recurring frustrations. Extract these to `_personal.md`, not to bucket memory.

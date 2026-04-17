# Clawback — Project Instructions

Read [`AGENTS.md`](./AGENTS.md) for architecture, skill inventory, memory layers, and hard rules.
Read [`sprint-board.md`](./sprint-board.md) for day-by-day timeline and gates.

## Git workflow

- Work from `main`. All changes via feature branch → PR → squash merge.
- **No force push.** Ever.
- **Conventional commits** with attribution: `feat:`, `fix:`, `docs:`, `chore:`, etc.
- Fresh commit history — development started 2026-04-16 (challenge requirement).

## Provider

Gemini Flash Lite 3.1 preview (`google/gemini-3.1-flash-lite-preview`). Configured locally.

## Code conventions

- **No backwards compatibility code.** No shims, no deprecated re-exports, no feature flags for old behavior. Just change it.
- **Use built-in OpenClaw features first.** Audit ClawHub before writing custom skills. Don't reinvent session memory, web search, or channel handling.
- **Always-edit, not append-only.** Memory files are the agent's model of the world, not a log. Consolidate by default.
- **Parallel LLM calls.** The capture orchestrator fans out route + memory + answer concurrently. Never serialize what can run in parallel.
- **Thesis filter.** Agent ACTS and learns. If a feature doesn't do both, cut it.

## Public / private boundary

**Public (this repo):** all skills in `skills/`, `openclaw.plugin.json`, `src/`, templates with zero personal content.

**Private (never in this repo):**
- `ashley-voice` → `~/.openclaw/skills/ashley-voice/`
- `ashley-personal-memory` → `~/.openclaw/skills/ashley-personal-memory/`
- `ashley-interaction-notes.md`, `build-proposal.md`, `_personal.md` → vault or private scratch

## Plugin structure

```
openclaw.plugin.json    # Manifest: id, configSchema, skills paths
skills/                 # One folder per skill, each with SKILL.md
src/index.ts            # Plugin entry point
```

## Vault conventions

Agent creates vault structure on first use. Do not pre-scaffold buckets.
See AGENTS.md § Vault structure for full layout.

## Challenge rules

- Credit all OSS used.
- Drop ClawCon Michigan section from DEV submission.
- Demo: pre-recorded video with voice + camera.

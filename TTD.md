# TTD — Things To Do

Drift tracker. The PRD (`openclaw-adhd-agent-prd.md`) is the source of truth. This file catalogs where the codebase diverged during a sprint-board-driven build.

**Rule: fix drift before adding features.**

---

## Critical — architecture is wrong

### 1. Directory layout

**PRD:** Two sibling directories in one repo:
```
~/home/
  .git/
  vault/          # Obsidian opens this
  openclaw/       # Agent workspace (MEMORY.md, AGENTS.md, focus.md, etc.)
```

**Built:** Vault at `~/git_personal/clawback-vault` with `OpenClaw/buckets/` inside it. No sibling `openclaw/` workspace directory. No shared repo.

**Status:** PARTIALLY RESOLVED. Plugin code now supports `workspacePath` config alongside `vaultPath`. All new workspace primitives (focus, pause, holds, triage-log, daily notes, runtime AGENTS.md) write to the workspace path. Actual vault repo restructuring is a runtime task outside this plugin repo.

---

### ~~2. Skill decomposition (13 skills -> 5)~~ RESOLVED

Skills collapsed to PRD's 5: `triage`, `bucket-manage`, `obsidian-sync`, `dispatcher` (stub), `pattern-review` (stub). Old skills moved to `skills/v2/` or deleted.

---

### ~~3. Capture is parallel; PRD says synchronous~~ RESOLVED

Triage skill now specifies synchronous single-pass. No parallel fanout.

---

### 4. No dispatcher

**PRD:** Dispatcher skill ticks every minute, reads job files from `openclaw/memory/jobs/*.md`, fires subagents per `kind`.

**Status:** STUB. `skills/dispatcher/SKILL.md` documents the full spec. Implementation depends on OpenClaw cron infrastructure. No tool code yet.

---

### ~~5. AGENTS.md role confusion~~ RESOLVED

Repo's `AGENTS.md` stays as dev onboarding. Runtime `openclaw/AGENTS.md` is scaffolded on first boot by `before_agent_start` hook with structure-only content per PRD.

---

### ~~6. Bucket schema divergence~~ RESOLVED

Schema aligned: `canonical` (not `slug`), `git_repo` (singular, not `repos[]`), `vault_refs` added, `last_activity` (not `last-commit`), `state` removed, `description` removed.

---

### ~~7. Unknown reference handling is backwards~~ RESOLVED

Triage skill now specifies ask-on-unknown: "New to me -- <reference>. Which bucket, or is this a new one?"

---

## Significant — behavior doesn't match

### ~~8. No focus model~~ RESOLVED

`focus.md` write/read implemented. Tools: `clawback_write_focus`, `clawback_read_focus`. Decay logic is a dispatcher concern (deferred).

---

### ~~9. No pause model~~ RESOLVED

`pause.md` with expiry implemented. Tools: `clawback_write_pause`, `clawback_read_pause`, `clawback_clear_pause`.

---

### ~~10. No holds model~~ RESOLVED

Ephemeral and persistent holds implemented. Tools: `clawback_add_hold`, `clawback_remove_hold`, `clawback_list_holds`.

---

### ~~11. No triage log~~ RESOLVED

`triage-log.md` implemented. Tools: `clawback_append_triage_log`, `clawback_read_triage_log`. Every triage decision gets a row.

---

### 12. No pattern-review / learning loop

**PRD:** Daily `review-patterns` job scans triage log and corrections, proposes AGENTS.md rule additions.

**Status:** STUB. `skills/pattern-review/SKILL.md` documents the full spec. Implementation depends on dispatcher + triage log accumulation.

---

### ~~13. Future-me is per-bucket; PRD says flat file~~ RESOLVED

Single flat `future-me.md` at vault root with bucket hints. `writeFutureMe()` and `promoteFutureMe()` updated.

---

### ~~14. Correction is emoji; PRD says text~~ RESOLVED

Triage skill specifies text-based correction. All emoji reaction references removed from active code and skills.

---

### ~~15. No daily notes~~ RESOLVED

Daily note creation implemented. Tools: `clawback_append_daily_note`, `clawback_read_daily_note`. Files at `memory/YYYY-MM-DD.md`.

---

### 16. memory-wiki / active-memory plugins not referenced

**PRD:** `memory-wiki` for provenance tracking and contradiction detection. `active-memory` for pre-reply context injection.

**Status:** DEFERRED. OpenClaw plugin configuration, not Clawback plugin code.

---

## Feature drift — exists but shouldn't (or wrong shape)

### ~~17. Lifecycle FSM (remove)~~ RESOLVED

FSM removed. `state` field removed from schema. `clawback_update_bucket_state` tool removed. `last_activity` timestamp is the only temporal field.

---

### ~~18. draft / blog-writer skill (park)~~ RESOLVED

Moved to `skills/v2/draft/`. Tool `clawback_write_draft` removed. `writeDraft()` removed from vault.ts.

---

### ~~19. voice-template skill (decide)~~ RESOLVED

Parked in `skills/v2/voice-template/`. Not v1, not harmful, but not active.

---

### ~~20. status skill (park)~~ RESOLVED

Parked in `skills/v2/status/`. `clawback_status` tool remains as it's useful for bucket overview.

---

### ~~21. pr-watcher / dev-watcher / surface -> dispatcher job kinds~~ RESOLVED

Parked in `skills/v2/`. Will become dispatcher job kind handlers when dispatcher is implemented.

---

### ~~22. Watchers directory in vault (wrong location)~~ RESOLVED

`writeWatcher()`, `readWatcher()`, and corresponding tools removed. No watchers directory concept in active code.

---

## Not yet assessed

- [x] `openclaw.plugin.json` configSchema — updated: `workspacePath` added, `devToUsername` removed
- [x] `src/openclaw.d.ts` — types still valid (generic interface, no schema-specific types)
- [x] Test coverage (`vault.test.ts`) — tests updated for new schema, new primitives tested (48 tests)
- [ ] Ancillary docs: `demo-script.md`, `pitch.md`, `testing-checklist.md`, `clawhub-audit.md` — review needed
- [ ] `CREDITS.md` — verify accuracy

---

## Summary

**Resolved:** 17 of 22 items (2, 3, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 17, 18, 19, 20, 21, 22)
**Partially resolved:** 1 item (1 — directory layout plugin support done, vault restructure deferred)
**Deferred:** 3 items (4 — dispatcher impl, 12 — pattern-review impl, 16 — plugin config)
**Remaining:** 1 item (ancillary docs review)

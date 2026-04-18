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

**Fix:** Restructure to match PRD. Vault and openclaw workspace are siblings in one repo, not nested.

---

### 2. Skill decomposition (13 skills → 5)

**PRD skills:**
1. `triage` — parse inbound, classify, route to files
2. `bucket-manage` — CRUD, aliases, rename
3. `obsidian-sync` — vault I/O via git
4. `dispatcher` — tick every minute, fire jobs
5. `pattern-review` — scan triage log, propose AGENTS.md rules

**Built skills (13):** capture, intent-classify, route, memory, answer, buckets, obsidian-sync, pr-watcher, dev-watcher, surface, draft, voice-template, status

**Fix:** Collapse to PRD's 5. `triage` replaces capture + intent-classify + route + answer + memory. `bucket-manage` replaces buckets. `dispatcher` replaces pr-watcher + dev-watcher + surface. `pattern-review` is unbuilt. draft, voice-template, status are not v1 skills — park them.

---

### 3. Capture is parallel; PRD says synchronous

**PRD (Non-goals, explicit):** "Async/parallel capture orchestration (v1 capture is single-pass synchronous)."

**Built:** Parallel fanout (route + memory + answer concurrently). AGENTS.md and multiple skills describe the orchestrator pattern in detail.

**Fix:** Revert to synchronous single-pass triage. Parallel is v2.

---

### 4. No dispatcher

**PRD:** Dispatcher skill ticks every minute, reads job files from `openclaw/memory/jobs/*.md`, fires subagents per `kind`. Job files have YAML frontmatter (kind, schedule, state, on_hit, fail_count). This is the core scheduling primitive.

v1 job kinds: `poll-url-for-keyword`, `watch-github-repo-activity`, `review-future-me`, `review-patterns`.

**Built:** Individual cron jobs per watcher skill. No job file format. No dispatcher loop. No `kind` subagents.

**Fix:** Build the dispatcher. Job files with frontmatter. Four v1 kinds.

---

### 5. AGENTS.md role confusion

**PRD:** `openclaw/AGENTS.md` is the agent's living config loaded every session. Starts with structure only (no rules). Rules accumulate through `review-patterns` observing corrections. Co-authored by user and agent. This is the centerpiece — "the thing that makes the rest function."

**Built:** AGENTS.md in the plugin repo is a developer onboarding doc for coding agents.

**Fix:** These are two different files. The repo's AGENTS.md stays as dev onboarding. The runtime `openclaw/AGENTS.md` is a separate deliverable — scaffold it with structure-only content as the PRD specifies.

---

### 6. Bucket schema divergence

**PRD frontmatter:**
```yaml
canonical: architect-of-suspicion
aliases: [mansion]
git_repo: github.com/user/architect-of-suspicion
vault_refs: [projects/architect-of-suspicion/, blog/architect-of-suspicion/]
last_activity: 2026-04-17T15:40:00Z
```
No lifecycle states. `last_activity` is the only temporal field. Staleness is a query filter, not a state change.

**Built frontmatter:**
```yaml
slug: ...
description: ...
aliases: []
state: active
last-commit: ""
repos: []
```

**Fix:** Align schema. `canonical` not `slug`. `git_repo` (singular) not `repos` (array). `vault_refs` added. `last_activity` not `last-commit`. Remove `state` field and lifecycle FSM. Remove `description` (not in PRD schema).

---

### 7. Unknown reference handling is backwards

**PRD:** "When triage encounters an unknown reference, it asks. Short question, one at a time. 'New to me — mansion. Which bucket, or is this a new one?' The user answers in one word."

**Built:** "NEVER ask the user which bucket. Always default-route." (capture/SKILL.md, route/SKILL.md, AGENTS.md)

**Fix:** Implement the PRD's ask-on-unknown behavior. Silent routing is for known references only.

---

## Significant — behavior doesn't match

### 8. No focus model

**PRD:** `openclaw/focus.md` — mode (idle/drafting/watching), active bucket, artifact ref, start timestamp. Decays to idle after 8.25 min silence. Prior focus tails into daily note.

**Built:** Nothing.

**Fix:** Implement focus.md write/read in triage flow. Add decay logic to dispatcher.

---

### 9. No pause model

**PRD:** `openclaw/pause.md` with expiry. Dispatcher and agent check before any unsolicited message. "paused" / "ok" cycle. "Pause is the fix-mechanism when the agent is fucking up."

**Built:** Nothing.

**Fix:** Implement pause.md. Dispatcher checks before firing. Main agent checks before non-reply DMs.

---

### 10. No holds model

**PRD:** "Leave journal.md alone" → agent holds that path for the session. Ephemeral unless user says "remember that."

**Built:** Nothing.

**Fix:** Implement ephemeral holds with optional persistence to MEMORY.md.

---

### 11. No triage log

**PRD:** `triage-log.md` — every decision logged with raw message, classification, target file, action taken. Enables reversal and feeds pattern-review.

**Built:** Nothing. Decisions are fire-and-forget.

**Fix:** Implement triage-log.md. Every triage decision gets a row. Rolls into daily notes.

---

### 12. No pattern-review / learning loop

**PRD:** Daily `review-patterns` job scans triage log and corrections, proposes AGENTS.md rule additions, soft-confirms with user. "The agent never stops being ask-heavy if review-patterns doesn't run." Instrumented from day one.

**Built:** Nothing. No learning mechanism exists.

**Fix:** Build as a dispatcher job kind. This is the most important unbuilt feature — without it, the agent never gets smarter.

---

### 13. Future-me is per-bucket; PRD says flat file

**PRD:** One flat file at `vault/future-me.md` — timestamped, bucket-hinted entries. "No per-bucket split; one flat file."

**Built:** Per-bucket `future-me.md` files inside each bucket folder. Tool `clawback_write_future_me` writes to bucket-specific files.

**Fix:** Single flat file at vault root. Update tool and skill.

---

### 14. Correction is emoji; PRD says text

**PRD:** "Correction is text in chat — not emoji, not a UI affordance." User says "no, wrong bucket" in chat. Agent finds prior write via triage log.

**Built:** ❌ emoji reaction triggers correction. 🎯 reaction triggers promotion. Skills and tools built around reaction events.

**Fix:** Replace emoji-based correction with text-based. Triage log enables finding the prior write. Emoji handling can stay as a convenience but text must be primary.

---

### 15. No daily notes

**PRD:** `openclaw/memory/YYYY-MM-DD.md` — prior focus states and triage log entries roll into daily notes.

**Built:** Nothing.

**Fix:** Implement daily note creation. Focus changes and triage log entries append here.

---

### 16. memory-wiki / active-memory plugins not referenced

**PRD:** `memory-wiki` for provenance tracking and contradiction detection. `active-memory` for pre-reply context injection ("agent remembers without explicitly searching").

**Built:** Not configured or referenced anywhere in the plugin.

**Fix:** Enable in OpenClaw config. Document dependencies. Verify they don't conflict with Clawback's memory skill.

---

## Feature drift — exists but shouldn't (or wrong shape)

### 17. Lifecycle FSM (remove)

**Built:** `active → submitted → monitoring → archived` state machine in `_bucket.md` frontmatter. Enforced in `clawback_update_bucket_state` tool. Referenced by watchers and status.

**PRD:** "No lifecycle states. `last_activity` is the only temporal field; staleness is a query filter applied at read time, not a state change."

**Fix:** Remove FSM from vault.ts, index.ts, all skills. Replace with `last_activity` timestamp.

---

### 18. draft / blog-writer skill (park)

**Built:** Full draft skill with templates (dev-submission, blog-post, status-update) and contradiction flagging. Tool: `clawback_write_draft`.

**PRD:** Not in v1 scope.

**Fix:** Don't delete — move to a `v2/` directory or branch. Remove from active skills list.

---

### 19. voice-template skill (decide)

**Built:** Voice template with tone rules, ack phrasing, pushback tone.

**PRD:** Not mentioned as a v1 skill.

**Fix:** Decide: keep as harmless nice-to-have or park with draft. Doesn't violate the PRD, just isn't specified.

---

### 20. status skill (park)

**Built:** Summary card with emoji, capture counts, idle days.

**PRD:** Not a v1 skill.

**Fix:** Park alongside draft.

---

### 21. pr-watcher / dev-watcher / surface → dispatcher job kinds

**Built:** Three separate skills with hardcoded behavior and individual cron schedules.

**PRD:** These are dispatcher job kinds (`poll-url-for-keyword`, `watch-github-repo-activity`), not standalone skills. Behavior defined in job file frontmatter, not skill markdown.

**Fix:** Rewrite as job kind handlers inside the dispatcher. Current skill logic informs the implementation but the shape is wrong.

---

### 22. Watchers directory in vault (wrong location)

**Built:** `watchers/pr-alerts.md` and `watchers/dev-comments.md` in the vault.

**PRD:** Job results live in `openclaw/memory/jobs/*.md`. `on_hit` actions send DMs directly. No separate watchers directory.

**Fix:** Remove watchers directory concept. Results flow through dispatcher job files.

---

## Not yet assessed

- [ ] `openclaw.plugin.json` configSchema alignment with PRD
- [ ] `src/openclaw.d.ts` — types match PRD schema?
- [ ] Test coverage (`vault.test.ts`) — tests the wrong behavior?
- [ ] Ancillary docs: `demo-script.md`, `pitch.md`, `testing-checklist.md`, `clawhub-audit.md` — still useful?
- [ ] `CREDITS.md` — still accurate?

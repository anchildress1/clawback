# OpenClaw ADHD Orchestrator — PRD

## Summary

A single OpenClaw-based agent that offloads the executive-function cost of working with ADHD across thought capture, project context, writing, and passive watching. It runs locally. Discord DMs are the capture channel. A single private git repo holds both the Obsidian vault (user-facing notes and drafts) and OpenClaw's own memory workspace (agent-internal state). The agent learns the user's patterns over time instead of being pre-programmed with rules.

## Problem

ADHD brains leak context the moment focus shifts. Thoughts land in Discord DMs, voice memos, and scrollback, and stay there. Project context lives in the author's head and nowhere else, which means every restart costs an executive-function tax that's disproportionate to the work. Existing assistants demand pre-structured input and punish tangents. They don't notice when you stop touching a project. They don't catch a sideways thought mid-sentence. They make the user translate their brain into the assistant's schema, which is the opposite of what someone with ADHD needs.

## Goals (v1)

- Zero-friction capture from Discord DMs, whether a coherent request or a sideways fragment.
- Persistent bucket context that survives restarts, renames, and vocabulary drift (aliases).
- Passive watching of external signals the user actually cares about, without hand-coding each watcher.
- A living behavior spec (`AGENTS.md`) that the agent co-authors with the user through observed corrections, not a hand-written ruleset.
- Flow preservation: the agent never blocks the user mid-thought. Triage is immediate and synchronous; every decision is reversible.

### Nice-to-have v1

- **Deployability.** Packaged so the user could hand a config to a second machine and stand the same agent up. Demoted from hard requirement; acceptable to ship without.

## Non-goals (v1, deferred)

Code workflow (agent-driven git operations on user repos, PR handling, reviews). Calendar-trigger context assembly. Gmail integration. OS contribution watcher. Dispatcher self-cleanup. Autonomous rule promotion without soft-confirm. Fast-capture no-ask mode. Publishing split between vault and openclaw workspace for public sharing. Auto-discovery of existing vault content (v1 assumes an empty or near-empty start). Bucket lifecycle states beyond `last_activity` timestamp. Async/parallel capture orchestration (v1 capture is single-pass synchronous).

## Architecture

### Runtime

OpenClaw gateway runs locally on the user's machine. Discord DMs collapse into a single OpenClaw session called `main`. One main agent handles all inbound; it dispatches to subagents per task (triage, bucket lookup, job creation, pattern review, monitoring checks). Capture is synchronous in v1: message arrives → single triage pass → write to files → reply. Slow work (pattern review, vault git batching, monitoring checks) moves out of the hot path into the dispatcher.

The `memory-wiki` plugin is enabled. It adds provenance tracking and contradiction detection to memory, which matters because aliases and rules will contradict themselves over time as the user's brain reshapes projects.

The `active-memory` plugin is enabled. Before every main reply, a read-only sub-agent searches memory for context relevant to the incoming message and injects a compact summary into the main agent's context. This means the agent "remembers" without having to stop and explicitly search mid-reply.

### Three places data lives

1. **OpenClaw framework code.** Untouched. An app running locally.
2. **OpenClaw workspace** — a directory on disk that OpenClaw owns. Contains `MEMORY.md`, `AGENTS.md`, daily notes, bucket records, job files, pause flag, focus file, triage log. Agent reads and writes freely. User sets it up once and rarely opens it directly.
3. **Obsidian vault** — a directory on disk that the user owns. Contains notes, blog drafts, `future-me.md`. User edits in Obsidian. Agent writes via git push.

### Directory layout

A single "home" directory serves as the git repo root, with the vault and the OpenClaw workspace as sibling subdirectories:

```
~/home/
  .git/
  vault/               # Obsidian opens this as its vault root
    projects/
    blog/
    future-me.md
  openclaw/            # OpenClaw workspace
    MEMORY.md
    AGENTS.md
    focus.md
    pause.md
    triage-log.md
    memory/
      YYYY-MM-DD.md    # daily notes
      buckets/
        <canonical-name>.md
      jobs/
        <job-name>.md
```

One git remote. One history, one audit trail. Obsidian's git plugin commits vault-side changes; the agent commits openclaw-side changes; both ride the same remote.

### Skills

Skills are the authored capabilities the agent uses. v1 skills:

- **triage** — parse inbound, classify, route to files.
- **bucket-manage** — create/update/rename buckets, manage aliases.
- **obsidian-sync** — read/write vault files, commit via git, surface conflicts.
- **dispatcher** — tick every minute, fire due jobs, handle hit/miss/error.
- **pattern-review** — scan triage log and corrections, propose `AGENTS.md` rules.

`AGENTS.md` is not a skill. It is the living config the agent reads every session. We write the skills; `AGENTS.md` writes itself through use.

## Behavior

### Capture triage

Every inbound Discord DM is processed immediately through a single synchronous pass. Triage classifies along several axes that it learns over time (not seeded): thought vs. request, known bucket vs. unknown reference, on-focus vs. tangent, single thought vs. multi-part.

Triage is never blocking. Every decision it makes is written to `triage-log.md` with enough context to be reversed: the raw message, the classification, the target file it wrote to, the action taken. If a follow-up message changes the interpretation, the agent finds its own prior write via the log and fixes it. The same mechanism handles explicit user corrections in chat ("no, wrong bucket"), triggered differently. Correction is text in chat — not emoji, not a UI affordance.

When triage encounters an unknown reference (a name or term it can't map to a known bucket), it asks. Short question, one at a time, no forms. A typical exchange is two lines: "New to me — 'mansion.' Which bucket, or is this a new one?" The user answers in one word. The agent writes the alias into the bucket record and moves on.

When a message reads as a tangent from current focus, the agent adds an entry to `vault/future-me.md` — a flat list of timestamped, bucket-hinted notes — without asking. Tangents get parked where the user can see and edit them directly in Obsidian. No per-bucket split; one flat file.

### Focus

The agent maintains a single-file current state at `openclaw/focus.md` containing: mode (idle, drafting, watching), active bucket (canonical name), artifact reference (which file if any), and a start timestamp. Focus is overwritten on change, and the prior focus tails into the daily note for audit. After 8.25 minutes of silence, focus decays to idle.

### Buckets and aliases

A bucket is the canonical unit the agent files things under. Each bucket has a record at `openclaw/memory/buckets/<canonical-name>.md` with front-matter holding its canonical name, known aliases, git repo URL (if any), vault folder references, and `last_activity` timestamp. Example:

```yaml
---
canonical: architect-of-suspicion
aliases: [mansion]
git_repo: github.com/user/architect-of-suspicion
vault_refs: [projects/architect-of-suspicion/, blog/architect-of-suspicion/]
last_activity: 2026-04-17T15:40:00Z
---
```

No lifecycle states (no `active` / `archived` / `paused`). `last_activity` is the only temporal field; staleness is a query filter applied at read time, not a state change.

Aliases grow through use. First unknown reference triggers a question; once the user confirms, the alias lands in front-matter and routes silently after that. One confirmation is enough. The user can correct at any time ("no, 'mansion' is the other bucket now") and the record updates.

### Dirty edits and concurrency

The agent writes to vault files freely via git. If the user has also written to the same file locally, the agent's `git push` fails, it pulls, and either auto-merges (non-overlapping changes) or DMs the user with the conflict ("merge conflict on `blog/x.md`, your local vs. my draft — pick one"). No file locks, no Obsidian plugin required. Git does the coordination for free.

When the user is AFK and a decision is needed (conflict, unknown reference surfaced by a job), the agent takes its best guess, commits, and tells the user what it did when the user is back. Everything is undoable because everything is tracked in git.

### Holds

Default: agent touches everything. If the user says "leave `journal.md` alone," the agent writes a hold at the path level and respects it for the current session. Holds are ephemeral — cleared on session reset — unless the user says "remember that," in which case it persists to `MEMORY.md`.

### Pause

If the user says "be quiet a minute" (or any recognizable pause phrase), the agent acknowledges with a single short text line ("paused") and writes `openclaw/pause.md` with an expiry (or unbounded if the user didn't specify). The dispatcher checks this file before firing any unsolicited messages; the main agent checks it before any non-reply DM. The user resumes with "ok," "unpause," or any similar signal, which clears the file.

Pause is the fix-mechanism when the agent is fucking up. It does or does not — no confidence tripwires, no graceful-degradation modes. If the agent is wrong, the user pauses, corrects, and resumes.

### Interrupts

When a dispatcher job fires the agent DMs the user immediately. If the user replies, triage classifies the reply the same as any other inbound: it might be a response to the alert, or it might be a new tangent. The reply flows through normal triage.

## Dispatcher

### Design

One always-on background task runs every minute. It lists every file in `openclaw/memory/jobs/*.md`, parses each file's front-matter, and fires any job whose trigger is due. The dispatcher itself is dumb — all logic lives in the job file and its matching `kind` subagent.

### Job file shape

```yaml
---
kind: poll-url-for-keyword
schedule: every 30m
url: https://dev.to/challenges/clerk
keyword: winner
state: watching
last_run: 2026-04-17T14:30:00Z
fail_count: 0
on_hit: dm "Winner posted: {{match_url}}"
on_hit_then: disable
---
```

Agent-authored free-form notes go below the front-matter.

### Dispatcher loop

Every tick: list jobs, parse front-matter, skip if `state != watching` or if `last_run + interval > now`, otherwise hand off to a subagent keyed on `kind`. The subagent runs the check and returns hit / no hit / error. On hit, dispatcher executes `on_hit`, then `on_hit_then` (disable, rearm) and updates `last_run`. On error, increments `fail_count`. When `fail_count` hits N (default 5), dispatcher DMs the user with the failure reason and disables the job.

### v1 job kinds

- `poll-url-for-keyword` — HTTP GET a URL, scan for a keyword in new content since last run. For things like DEV challenge winners, guest-post publication dates, GitHub issue responses.
- `watch-github-repo-activity` — resolve the target bucket via its record (bucket → repo mapping), poll for commit or activity signal, fire on condition. Rename-safe because the job references the canonical bucket name, not the repo URL directly.
- `review-future-me` — one job, runs daily. Scans `vault/future-me.md` for entries untouched past a staleness threshold, DMs a short list.
- `review-patterns` — one job, runs daily. Scans the triage log and corrections for patterns, drafts a proposed rule addition to `AGENTS.md`, soft-confirms with the user, writes on acceptance.

### Job management

The user creates jobs through natural language ("alert me when DEV posts winners of the Clerk challenge"). The agent selects a `kind`, fills variables, writes the job file, and soft-confirms the target and schedule. The user can correct any field in reply. The user removes a job by telling the agent; the agent finds the file and disables or deletes it.

## Learning

### AGENTS.md as a living document

`AGENTS.md` is OpenClaw's standing-orders file, auto-loaded every session. It is the single source of truth for agent behavior, and it is explicitly designed to grow and change over time. It is co-authored by the user and the agent.

`AGENTS.md` is the centerpiece. It is the thing that makes the rest function, because it is where the agent's model of the user accumulates. Skills are authored by us; `AGENTS.md` writes itself through use. That asymmetry is the design.

Day-one `AGENTS.md` contains *structure only, not rules*:

- The categories of decisions the agent faces (thought vs. request, known vs. unknown, on-focus vs. tangent, single vs. multi-part).
- The default posture: when in doubt, ask. One question at a time. Short. No forms.
- The correction-logging behavior: every user correction is logged as an observation with timestamp, context, and the decision that got corrected.
- The `review-patterns` job and its cadence.
- Directory conventions and file roles.
- The holds model.
- Soft-confirm behavior for guesses; guess-and-act for factual corrections.
- Dispatcher behavior and the current job kinds.
- Pause behavior.

### Rule growth

Rules themselves are absent on day one. They accumulate as the agent observes the user. Every correction is an observation; every confirmed alias is a fact; every tangent the agent identifies (silently or via user signal) gets logged. The daily `review-patterns` job surfaces patterns worth promoting into `AGENTS.md` as explicit rules. The user soft-confirms; the agent writes. Over time, ask-rate drops because more routing can be decided from learned rules.

### Fact vs. rule

The agent distinguishes silent updates from proposed updates. Facts — aliases, bucket-to-repo mappings, current focus — change silently on user correction. Rules — classification logic, prioritization — require a soft-confirm step in v1. In v2, both become silent with an audit trail.

## Risks

**Cold-start friction.** The first week or two, the agent asks a lot because it knows nothing about the user's vocabulary or projects. This is obnoxious if the user isn't expecting it. Mitigation: keep every ask to one line, one-word answers, no forms. The user should be able to dispatch most asks in under five seconds.

**Pattern-review is critical-path.** The agent never stops being ask-heavy if `review-patterns` doesn't run or doesn't produce useful proposals. Instrument from day one: count corrections per week, count proposals, count acceptances. If proposal count stays at zero for two weeks, something is broken and needs hand-tuning.

**MEMORY.md bloat.** It loads every session. Over months, it can grow into a significant token cost. `memory-wiki` handles consolidation, and OpenClaw's dreaming cycle promotes/prunes. We wave at this cycle; we do not reinvent it. Design assumes these OpenClaw primitives work; if they don't, MEMORY.md needs an index-plus-on-demand structure.

**Triage log noise.** Logging every decision means the log grows continuously. It rolls into daily notes, which themselves eventually get consolidated into `DREAMS.md` by OpenClaw's dreaming cycle. If consolidation lags, the log becomes a performance drag on reconciliation passes.

## Success signals

- Time-to-first-alias: hours, not days, from first mention to silent routing.
- Weekly ratio of silent-routes to corrections: should trend up. If corrections stay flat or climb, learning isn't happening.
- Rule-proposal acceptance rate from `review-patterns`: non-zero. Zero means the agent isn't noticing useful patterns.
- Interrupt noise: jobs fire at expected rates. If the user mutes everything for days, job thresholds are wrong.

## v2 roadmap

- **Code workflow.** Agent operates on repos under configured code roots, handles commits/PRs with soft-confirm, reviews diffs on request, maintains per-repo state in memory.
- **Calendar-trigger subsystem.** Scheduled context assembly tied to calendar events (pre-brief before meetings, capture prompt after). Not notifications — context work.
- **Gmail integration.** Triage-grade inbox surfacing on the same model as Discord capture.
- **OS contribution watcher.** Passive "you haven't touched project X in N days" nudges, scoped to repos the user cares about.
- **Dispatcher self-cleanup.** Identify and disable stale, duplicated, or broken jobs.
- **Autonomous rule updates.** Drop soft-confirm on `review-patterns` once trusted; keep audit trail.
- **Fast-capture mode.** Prefix or keyword that bypasses triage and captures raw to an unsorted inbox for lazy triage. Build when the user asks for it.
- **Publishing split.** Carve openclaw workspace out of the home repo when the user wants to publish vault content publicly.
- **Voice.** Voice-notes through Discord transcribed and flowed through triage. v1 nice-to-have, may slip.
- **Auto-discovery.** Walk existing vault content to seed buckets and aliases. Deferred because v1 assumes an empty or near-empty start.
- **Async capture orchestration.** Parallel fan-out from triage to multiple skills with a join. Deferred until v1 synchronous capture actually hits latency pain.

## Build order

**Priority 1 — makes anything work.**

1. OpenClaw installed, gateway running, Discord channel paired.
2. Home repo initialized, vault and openclaw subdirs configured, git remote set.
3. Obsidian pointed at vault subdir, git plugin configured, first commit pushed end-to-end.
4. `memory-wiki` and `active-memory` plugins enabled.
5. Day-one `AGENTS.md` authored with structure-only content.

**Priority 2 — minimum viable behavior.**

6. Triage skill: synchronous single pass (unknown → ask; tangent → future-me; multi-part → log-and-reconcile).
7. Focus file, pause file, holds model.
8. Bucket record creation flow, alias learning.
9. `obsidian-sync` skill: vault read/write via git, conflict surfacing.

**Priority 3 — dispatcher and learning.**

10. Dispatcher skill running every minute, reading jobs dir.
11. `poll-url-for-keyword` and `watch-github-repo-activity` subagents.
12. `review-future-me` job scheduled.
13. Triage-log written for every decision.
14. `review-patterns` skill scheduled daily, writes soft-confirmed rule proposals to `AGENTS.md`.

## Open questions for build time

These don't affect the design but will come up during build:

- Model choice for main agent and subagents. `active-memory` defaults to gemini-3-flash per OpenClaw docs, which is fine for that role. Main agent model TBD.
- Exact Obsidian git plugin selection and config.
- Whether to run the dispatcher as an OpenClaw scheduled task or a standalone hook. Pick whichever is simpler to reload when jobs change.
- Initial onboarding script: whether the first DM exchange is scripted at all, or the agent just starts raw.

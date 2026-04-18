# Clawback — Agent onboarding

Bootstrap doc for any coding agent picking up this repo. Read top-to-bottom before touching files.

**Source of truth:** [`openclaw-adhd-agent-prd.md`](./openclaw-adhd-agent-prd.md)
**Drift tracker:** [`TTD.md`](./TTD.md) — the codebase diverged from the PRD. Fix drift before adding features.

---

## Product thesis

Clawback is an OpenClaw plugin — a single agent that offloads executive-function cost for ADHD. Discord DMs are the capture channel. A single private git repo holds both the Obsidian vault (user-facing notes and drafts) and OpenClaw's own memory workspace (agent-internal state). The agent learns the user's patterns over time through observed corrections, not pre-programmed rules.

**Filter:** the agent ACTS and learns. If it doesn't do both, cut it.

---

## Current state

**The codebase is misaligned with the PRD.** An earlier sprint-board-driven build produced 13 skills, parallel capture, a lifecycle FSM, emoji-based correction, and per-bucket future-me files — none of which match the PRD. See `TTD.md` for the full catalog. Do not build new features until critical drift is resolved.

**Infra:**
- VM provisioned on GCP (`anchildress1` project, `clawback` instance, `us-east1-b`), stopped. Ubuntu 24.04 + Docker CE + OpenClaw image pre-pulled.
- Local OpenClaw on Mac: gateway token in `~/.openclaw/openclaw.json`, Gemini web-search wired, OpenAI registered.
- `clawback-vault` (private GitHub repo) cloned at `~/git_personal/clawback-vault`. Opened in Obsidian.

**Tokens:**
- Gateway token: done
- Gemini API key: done
- OpenAI API key: done (for Whisper later)
- GitHub PAT: done
- Discord bot token: not done (channel-picker bug in OpenClaw — "all channels" sends `undefined`)

**Model:** `google/gemini-3.1-flash-lite-preview`

---

## Architecture

### Runtime

OpenClaw gateway runs locally. Discord DMs collapse into a single session (`main`). One main agent handles all inbound; dispatches to subagents per task. **Capture is synchronous in v1** — message arrives, single triage pass, write to files, reply. Slow work (pattern review, vault git batching, monitoring checks) moves to the dispatcher.

`memory-wiki` plugin enabled (provenance + contradiction detection).
`active-memory` plugin enabled (pre-reply context injection).

### Three data locations

| Location | What | Who writes |
|---|---|---|
| OpenClaw framework | Runtime. Untouched. | OpenClaw |
| OpenClaw workspace (`openclaw/`) | MEMORY.md, AGENTS.md (living config), daily notes, bucket records, job files, focus, pause, triage log | Agent |
| Obsidian vault (`vault/`) | Notes, blog drafts, `future-me.md` | User + agent via git |

### Directory layout

Single git repo, vault and workspace as siblings:

```
~/home/
  .git/
  vault/                        # Obsidian opens this
    projects/
    blog/
    future-me.md                # One flat file, all tangents
  openclaw/                     # Agent workspace
    MEMORY.md
    AGENTS.md                   # Living config (grows rules over time)
    focus.md
    pause.md
    triage-log.md
    memory/
      YYYY-MM-DD.md             # Daily notes
      buckets/
        <canonical-name>.md
      jobs/
        <job-name>.md
```

One remote. Obsidian's git plugin commits vault-side; agent commits openclaw-side.

### Bucket record schema

```yaml
canonical: architect-of-suspicion
aliases: [mansion]
git_repo: github.com/user/architect-of-suspicion
vault_refs: [projects/architect-of-suspicion/, blog/architect-of-suspicion/]
last_activity: 2026-04-17T15:40:00Z
```

No lifecycle states. `last_activity` is the only temporal field. Staleness is a query filter at read time, not a state change.

---

## Skills (v1)

Five skills. Each is a folder with a `SKILL.md` under `skills/`.

| Skill | Role |
|---|---|
| `triage` | Parse inbound, classify, route to files. Single synchronous pass. |
| `bucket-manage` | Bucket CRUD, alias management, rename. |
| `obsidian-sync` | Vault I/O via git (through OpenClaw's `exec` tool). |
| `dispatcher` | Tick every minute, read job files, fire subagents per `kind`. |
| `pattern-review` | Scan triage log + corrections, propose AGENTS.md rules, soft-confirm. |

### Triage

Every Discord DM goes through triage. Classifies along axes the agent learns over time: thought vs. request, known bucket vs. unknown, on-focus vs. tangent, single vs. multi-part.

- Known reference -> route silently.
- Unknown reference -> **ask**. One short question, one-word answer expected. Alias learned on confirmation.
- Tangent from current focus -> park in `vault/future-me.md` without asking.
- Every decision logged to `triage-log.md` with raw message, classification, target, action.

Correction is **text in chat**: "no, wrong bucket." Agent finds prior write via triage log and fixes it.

### Dispatcher

Background task, ticks every minute. Reads `openclaw/memory/jobs/*.md`. Fires subagent per job `kind` when trigger is due.

Job file shape:
```yaml
kind: poll-url-for-keyword
schedule: every 30m
url: https://dev.to/challenges/clerk
keyword: winner
state: watching
last_run: 2026-04-17T14:30:00Z
fail_count: 0
on_hit: dm "Winner posted: {{match_url}}"
on_hit_then: disable
```

v1 job kinds:
- `poll-url-for-keyword` — HTTP GET + keyword scan
- `watch-github-repo-activity` — repo activity via bucket-to-repo mapping
- `review-future-me` — daily, scans stale entries in `vault/future-me.md`
- `review-patterns` — daily, proposes AGENTS.md rules from triage log

### Pattern-review (the learning loop)

Daily job. Scans triage log and corrections for patterns. Proposes rule additions to the runtime `openclaw/AGENTS.md` (the living config, not this file). Soft-confirms with user. Over time, ask-rate drops as learned rules cover more routing.

This is the most important skill. Without it, the agent never gets smarter. Instrument from day one: count corrections per week, count proposals, count acceptances.

---

## Behavior

### Focus

`openclaw/focus.md`: mode (idle/drafting/watching), active bucket, artifact ref, start timestamp. Decays to idle after 8.25 min silence. Prior focus tails into daily note.

### Pause

"Be quiet" -> agent writes `openclaw/pause.md` with expiry, replies "paused." Dispatcher and agent check before any unsolicited message. User resumes with "ok."

### Holds

"Leave journal.md alone" -> agent holds that path for the session. Ephemeral unless user says "remember that" (persists to MEMORY.md).

### Aliases

First unknown reference triggers a question. Once confirmed, alias lands in bucket frontmatter. Routes silently after that. User can reassign: "no, 'mansion' is the other bucket now."

### Dirty edits

Agent writes vault files via git. User writes locally via Obsidian. On conflict: agent pulls, auto-merges if possible, DMs user if not. No file locks. When user is AFK and decision is needed, agent takes best guess, commits, tells user what it did when they're back.

---

## Plugin development model

OpenClaw plugins run in-process, unsandboxed. The install scanner enforces security at install time.

### Two layers

| Layer | Lives in | Does | Cannot do |
|---|---|---|---|
| **Plugin code** (`src/index.ts`) | Compiled JS loaded by `openclaw.extensions` | Register tools, hooks, commands. Read/write files via `fs`. | Use `child_process`, `eval`, dynamic code generation. |
| **Skills** (`skills/*/SKILL.md`) | Markdown injected into agent's system prompt | Teach the agent when/how to use tools. Orchestrate workflows. | Call each other directly. Skills are prompt text. |

Connection is implicit: SKILL.md says "call `clawback_write_capture`" by name; agent resolves to registered tool.

### System commands

Never use `child_process` in plugin code. Skills tell the agent to use OpenClaw's built-in `exec` tool for git and shell operations.

### Config files

| File | Purpose | Validated |
|---|---|---|
| `openclaw.plugin.json` | Static manifest: id, configSchema, skills paths. | At install |
| `package.json` -> `openclaw.extensions` | Runtime entry point(s). | At load |
| `skills/*/SKILL.md` | YAML frontmatter for selection, markdown body for behavior. | At skill load |

### Plugin API surface

- `api.registerTool()` — register a callable tool
- `api.registerHook()` — lifecycle hooks
- `api.registerCommand()` — slash commands
- `api.pluginConfig` — config object (property, not method)
- `api.logger` — scoped logger (not `console.log`)
- `api.rootDir` — plugin root
- `api.resolvePath()` — resolve relative to plugin root

### Type declarations

`openclaw/plugin-sdk/plugin-entry` is runtime-provided, not an npm package. Maintain `src/openclaw.d.ts` locally. Import from subpaths only.

### Skill precedence (highest wins)

1. `<workspace>/skills`
2. `<workspace>/.agents/skills`
3. `~/.agents/skills`
4. `~/.openclaw/skills`
5. Bundled
6. `skills.load.extraDirs` (plugin-shipped — us)

---

## Hard rules

1. **Synchronous capture in v1.** Single triage pass. Parallel fanout is v2.
2. **Always-edit, not append-only.** Memory is the agent's model of the world, not a log.
3. **Thesis filter.** Agent ACTS and learns. If it doesn't, cut it.
4. **Ask on unknown.** Unknown references trigger one short question. Known references route silently.
5. **Correction is text, not emoji.** "No, wrong bucket" in chat. Agent finds prior write via triage log.
6. **No lifecycle states.** `last_activity` only. Staleness is computed, not stored.
7. **One future-me file.** `vault/future-me.md`, flat, all tangents. Not per-bucket.
8. **Privacy.** Private content never in this public repo.
9. **No `child_process`.** Use skill instructions + `exec` tool.
10. **Fix drift before features.** See `TTD.md`.

---

## Private workspace skills (not in this repo)

| Skill | Location | Role |
|---|---|---|
| `ashley-voice` | `~/.openclaw/skills/ashley-voice/` | Voice rules from interaction notes. |
| `ashley-personal-memory` | `~/.openclaw/skills/ashley-personal-memory/` | Personal extraction overrides. |

---

## Parallel docs

- `openclaw-adhd-agent-prd.md` — full spec (source of truth).
- `challenge-baseline.md` — OpenClaw Challenge rules and submission requirements.
- `TTD.md` — drift tracker.
- `clawhub-audit.md` — ClawHub skill audit results.

---

## What NOT to do

- Don't use `child_process` in plugin code. Use skill instructions + OpenClaw `exec` tool.
- Don't install phantom npm packages. `openclaw/plugin-sdk/*` is runtime.
- Don't use `console.log`. Use `api.logger`.
- Don't use `api.getConfig()`. Use `api.pluginConfig` (property).
- Don't rebuild OpenClaw's session memory.
- Don't pre-scaffold vault buckets.
- Don't add features that only report without learning.
- Don't ship private content in this repo.
- Don't build parallel capture orchestration — that's v2.
- Don't add lifecycle states to buckets.
- Don't build new features until TTD.md critical drift is resolved.

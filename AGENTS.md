# Clawback — Agent onboarding

Bootstrap doc for any coding agent (Claude Code, Cursor, etc.) picking up this repo. Read top-to-bottom before touching files.

---

## Product thesis

Clawback is an **OpenClaw plugin** that turns Discord DMs into a routed, ADHD-friendly Obsidian vault across multiple projects. Memory that learns, captures that land in the right bucket, future-you not hating past-you.

**Filter for every feature**: the agent **ACTS and learns**. Anything passive or non-learning is v2 or cut. Don't add a skill that just reports, displays, or waits — if it doesn't do something and get smarter, it doesn't ship.

**Demo format**: video (voice + camera), not live. No public webhook endpoint needed for the demo; local Mac is fine. VM is staged for post-challenge production.

---

## Current state (as of 2026-04-16)

**Infra:**
- VM provisioned on GCP (`anchildress1` project, `clawback` instance, `us-east1-b`), **stopped** to conserve free-tier hours. Ubuntu 24.04 + Docker CE + OpenClaw image pre-pulled. Provisioning scripts live in `/sessions/.../outputs/` (not in this repo; they're infra, not plugin code).
- Local OpenClaw install on Mac: `~/.openclaw/openclaw.json` has gateway token (plaintext — loopback only, low stakes), Gemini web-search wired, OpenAI registered (for Whisper later), Gemini Flash-Lite 3.1 Preview set as default model via `openclaw models set google/gemini-3.1-flash-lite-preview`.
- `clawback-vault` (private GitHub repo) cloned at `~/git_personal/clawback-vault`. `.gitignore` committed. Opened in Obsidian. Fit plugin pointed at the repo.

**Tokens (status):**
- Gateway token: ✓ (in `~/.openclaw/openclaw.json`, plaintext, OK for loopback)
- Gemini API key: ✓ (used for both web-search and default model)
- OpenAI API key: ✓ (registered, for Whisper later)
- GitHub PAT (scoped to `clawback-vault`): ✓ (Fit plugin needs it)
- Discord bot token: ✗ (bot is created; wizard crashed on the channel-picker — "all channels" sends `undefined` → `.trim()` bug in OpenClaw. File the bug; pick a specific channel as workaround.)

**Model:** `google/gemini-3.1-flash-lite-preview` ($0.25/$1.50 per M tokens, 45% faster than 2.5 Flash). Right call for 4x fanout per capture.

---

## Architecture

### Three intents

Every Discord DM routes through intent classification first. Only three buckets:

1. **command** — imperative ("move this to project X", "promote capture 3", "status"). Dispatch directly.
2. **question** — Ashley asking Clawback something ("what did I decide about Y?", "show me open threads for Z"). Read-mostly; may hit web-search.
3. **capture** — everything else. The default. This is the orchestrator.

`intent-classify` is the **only serial step** in the whole pipeline. Everything after fans out.

### Capture orchestrator

On `capture` intent:

```
intent-classify (serial, ~200ms)
    │
    ▼
   capture (orchestrator — everything below runs in parallel)
    │
    ├── route         (LLM — which bucket? create new?)
    ├── memory        (LLM — extract project state, update memory.md and _personal.md)
    └── answer        (LLM — ack in 1 sentence, return to user)

Memory commits BEFORE the ack returns to Discord.
Ack returns in ~1s. If the process crashes, the write already landed.
```

This is the chatbot-feel: no perceptible wait. Three LLM calls, one round-trip.

### Memory layers

Do NOT collapse these. They are different:

| Layer | Lives in | Scope | Who writes |
|---|---|---|---|
| OpenClaw session memory | OpenClaw internals | per-session, ephemeral | OpenClaw (don't touch) |
| Bucket memory (`OpenClaw/buckets/<project>/memory.md`) | `clawback-vault` | per-project, persistent | Clawback `memory` skill |
| Personal memory (`_personal.md`) | `clawback-vault` | cross-project, persistent | Clawback `memory` skill |

**Clawback's memory skill never competes with OpenClaw's session memory.** It does something OpenClaw doesn't: writes structured project state to user-visible, git-synced markdown that future-you reads in Obsidian on your phone.

### Template + overlay pattern

Same pattern as `voice/template` → `ashley-voice`:

- **Public template** — ships in this repo at `skills/memory/` (schema + extraction rules + consolidation logic, zero content).
- **Private overlay** — `ashley-personal-memory` skill, workspace-scope, user-created. Not in this repo. Ever.
- **Private data** — `_personal.md` lives in the **vault**, not here.

Anyone installing Clawback gets the template. They create their own overlay.

### Vault structure

Do NOT pre-scaffold buckets. The agent shapes the vault from first captures. Starting minimal:

```
clawback-vault/
├── .gitignore               # committed
├── .obsidian/               # Obsidian creates
└── (everything else emerges as Clawback runs)
```

Clawback creates on first use: `_inbox.md`, `_personal.md`, `_conflicts.md`, `OpenClaw/buckets/<project>/{memory.md, captures.md, future-me.md, drafts/}`, `watchers/{pr-alerts.md, dev-comments.md}` — only the ones it needs, only when it needs them.

---

## Plugin development model

OpenClaw plugins run **in-process, unsandboxed**. The install scanner enforces security at install time, not at runtime. Understand what each layer is for and stay inside its boundaries.

### Two layers

| Layer | Lives in | Does | Cannot do |
|---|---|---|---|
| **Plugin code** (`src/index.ts`) | Compiled JS loaded by `openclaw.extensions` | Register tools, hooks, commands. Read/write files via `fs`. Access `api.logger`, `api.getConfig()`. | Use `child_process`, `eval`, or dynamic code generation. Blocked by install scanner. |
| **Skills** (`skills/*/SKILL.md`) | Markdown injected into the agent's system prompt | Teach the agent *when and how* to use tools. Orchestrate multi-step workflows. Reference the built-in `exec` tool for system commands. | Call each other directly. Skills are prompt text, not code. |

**The connection between them is implicit.** A SKILL.md says "call `clawback_write_capture`" by name; the agent resolves it to the registered tool. There is no programmatic invocation from skill to tool.

### System commands (git, shell)

**Never use `child_process` in plugin code.** The scanner blocks it.

For git operations and other system commands, skill instructions tell the agent to use OpenClaw's **built-in `exec` tool**. Example from `capture/SKILL.md`:

```
Run in the vault directory using the exec tool:
  git add -A
  git commit -m "capture: <summary>"
  git pull --rebase --autostash
  git push
```

The agent executes these through OpenClaw's sandboxed `exec`, not through plugin code.

### Three config files

| File | Purpose | Validated |
|---|---|---|
| `openclaw.plugin.json` | Static manifest: `id`, `configSchema`, `skills` paths. Validated *without executing code*. | At install |
| `package.json` → `openclaw.extensions` | Runtime: tells the loader which entry point(s) to load. Must resolve inside the package directory. | At load |
| `skills/*/SKILL.md` | Prompt injection: YAML frontmatter for selection, markdown body for behavior. | At skill load |

### Plugin API surface

Available on the `api` parameter in `register(api)`:

- `api.registerTool()` — register a callable tool (name, label, description, parameters, execute)
- `api.registerHook()` — register lifecycle hooks (e.g., `before_agent_start`)
- `api.registerCommand()` — register slash commands
- `api.getConfig()` — read plugin config from `openclaw.plugin.json` configSchema
- `api.logger` — scoped logger (debug/info/warn/error). **Use this, not `console.log`.**
- `api.rootDir` — plugin root directory
- `api.resolvePath()` — resolve paths relative to plugin root

### Type declarations

`openclaw/plugin-sdk/plugin-entry` is provided by the OpenClaw runtime — it's not an npm package. For TypeScript, maintain a local `src/openclaw.d.ts` with the types used. Import from subpaths only (e.g., `openclaw/plugin-sdk/plugin-entry`, not `openclaw/plugin-sdk`).

### Skill precedence (highest wins)

1. `<workspace>/skills`
2. `<workspace>/.agents/skills`
3. `~/.agents/skills`
4. `~/.openclaw/skills`
5. Bundled skills
6. `skills.load.extraDirs` (plugin-shipped — this is us)

Private workspace skills (`ashley-voice`, `ashley-personal-memory`) override public templates because they sit at level 4.

---

## Skills to scaffold

Five skills for v1. All in `skills/`. Each is a folder with a `SKILL.md`.

### Core pipeline (Day 2)

| Skill | Role | Parallel? |
|---|---|---|
| `capture` | Orchestrator. Runs intent-classify → fans out route + memory + answer. | spawns parallel |
| `intent-classify` | Three-way classifier (command / question / capture). The only serial step. | serial |
| `route` | Picks the bucket (existing or create new). Learns aliases over time. | parallel |
| `memory` | Extracts project state, writes to `memory.md` / `_personal.md`. Always-edit (not append-only). | parallel |
| `answer` | 1-sentence ack. Returns fast. | parallel |

**Web-search** is an OpenClaw built-in (Gemini-backed). Not shipped here. `question` intent uses it.

### Bucket management (Day 2-3)

| Skill | Role |
|---|---|
| `buckets` | Bucket CRUD, auto-discovery from vault folders, lifecycle FSM (`active` → `submitted` → `monitoring` → `archived`), future-me sidecar, 🎯-promotion. |
| `obsidian-sync` | Documents the canonical git sync procedure (via `exec` tool). Other skills reference this. Poll every 5 min via cron. Conflict stubs only in v1. |

### Watchers + outputs (Day 4)

| Skill | Role |
|---|---|
| `pr-watcher` | Scheduled. Polls GitHub repos per-bucket for PRs awaiting action. Records last-Ashley-commit timestamp from contribution graph → feeds temporal tiebreaker + stale-contribution alert. |
| `dev-watcher` | Scheduled. Three jobs: (1) post comments for `monitoring` buckets, (2) Ashley's DEV notification feed, (3) challenge index. All share `~/.clawback/cache.json`. |
| `surface` | Rules-based Discord alerting. PR >24h, stale bucket, stale contribution ("still current?"), new DEV activity. |
| `draft` | Takes bucket slug + template → produces markdown under `drafts/`. Contradiction flagging directive in system prompt. Editor, not just writer. |
| `voice-template` | Public voice interface — structure only, zero personal content. Private `ashley-voice` overrides at workspace scope. |

### Status (Day 5)

| Skill | Role |
|---|---|
| `status` | Single summary card: all buckets with counts, states, staleness, last watcher alerts. |

### Private workspace skills (not in this repo)

| Skill | Location | Role |
|---|---|---|
| `ashley-voice` | `~/.openclaw/skills/ashley-voice/` | Actual voice rules from interaction notes. Overrides `voice-template`. |
| `ashley-personal-memory` | `~/.openclaw/skills/ashley-personal-memory/` | Personal extraction overrides for `memory` skill. Can be empty in v1. |

### SKILL.md format (per OpenClaw docs)

```markdown
---
name: skill-name
description: One-line what-it-does
user-invocable: true
---

# Skill name

Instructions. Markdown. Tells the model how to behave.
```

Valid YAML frontmatter. Multi-line is allowed when needed (e.g., `description: >` and nested `metadata`), though simple single-line fields are preferred when sufficient. See `https://docs.openclaw.ai/tools/skills`.

### Plugin manifest

`openclaw.plugin.json` at repo root:

```json
{
  "id": "clawback",
  "configSchema": { "type": "object", "properties": {} },
  "skills": ["./skills"]
}
```

`configSchema` TBD — pre-populate with vault path, GitHub PAT env var name, Discord token env var name before shipping.

---

## Hard rules

1. **Always-edit, not append-only.** Every skill that writes to the vault edits in place. The memory is the agent's model of the world, not a log. Consolidation is the default, not an exception.
2. **Thesis filter on every feature.** Agent ACTS and learns. If it doesn't, cut it.
3. **Filters, not line-item votes.** When prioritizing, apply a top-level filter rather than voting per item.
4. **Privacy.** `ashley-interaction-notes.md`, `build-proposal.md`, `_personal.md` — NEVER committed to this public repo. Ever. They live in `clawback-vault` or a private scratch location.
5. **Agent-maintained hygiene.** Memory self-cleanup is a skill (dedupe, merge, prune, flag contradictions to `_conflicts.md`). Runs nightly + on-demand.
6. **Chat-bot responsiveness.** Parallel LLM calls, no perceptible wait. Memory commits before ack.
7. **Demo is video-locked.** Pre-recorded, voice + camera. Don't architect around a live demo.
8. **OpenClaw precedence**: workspace > `.agents` > `~/.agents` > `~/.openclaw` > bundled > `extraDirs`. Clawback ships as a plugin → lands in bundled.

---

## Resolved decisions

1. **SKILL.md body depth**: stubs with architectural intent, fleshed out as each skill is implemented.
2. **configSchema**: pre-populated with `discordToken`, `githubPat`, `vaultPath`, `devToUsername`. See `openclaw.plugin.json`.
3. **Provider**: Gemini Flash Lite 3.1 preview (`google/gemini-3.1-flash-lite-preview`). Not Anthropic API key — changed from original plan.
4. **Git workflow**: main → feature branch → PR → squash merge. Conventional commits + attribution. No force push.

---

## Parallel docs

- `sprint-board.md` — day-by-day build plan, cut order, demo script beats.
- `challenge-baseline.md` — OpenClaw Challenge rules and submission requirements.
- `build-proposal.md` — living spec. **Not in this repo** (privacy). Stored in `clawback-vault` or equivalent private location.
- `ashley-interaction-notes.md` — personal meta-notes. **Private, never in this repo.**

---

## What NOT to do

- Don't use `child_process` in plugin code. Use skill instructions + OpenClaw `exec` tool.
- Don't install phantom npm packages. `openclaw/plugin-sdk/*` is a runtime module, not an npm dep.
- Don't use `console.log`. Use `api.logger`.
- Don't rebuild OpenClaw's session memory. Use it.
- Don't pre-scaffold vault buckets. Agent builds them from first captures.
- Don't add features that only display/report without learning.
- Don't ship private content in this public repo.
- Don't use append-only patterns. Edit in place.
- Don't run 4 LLM calls serially. Fan them out.
- Don't collapse the three intents into a generic "handle message" skill.

---

## Day 1 gate

Before any skill body gets written, audit **ClawHub** (OpenClaw's skill directory: https://github.com/openclaw/clawhub) for:
- Existing skills that already do any of capture/intent-classify/route/memory/answer — don't reinvent.
- Async-orchestration patterns — how do other plugins fan out LLM calls in parallel?

Then scaffold the five skills as stubs. Then iterate.

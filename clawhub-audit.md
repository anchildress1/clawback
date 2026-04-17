# ClawHub Audit — Day 1

Searched ClawHub, github.com/openclaw/skills, and OpenClaw docs for existing skills to reuse before writing custom code.

## Use as-is (don't reinvent)

| Skill | Source | What it does | Action |
|---|---|---|---|
| `steipete/discord` | ClawHub | Full Discord bot control — send messages, react, threads, pins, polls, moderation | Use for all Discord messaging. Our skills call this, not raw Discord API. |
| `steipete/github` | ClawHub | GitHub CLI wrapper — PRs, issues, CI runs, `gh api` queries | Use for all GitHub queries. Our `pr-watcher` adds polling/scheduling on top. |

## Fork or adapt

| Skill | Source | What it does | Action |
|---|---|---|---|
| `srikanth235/clawflow` | ClawHub | Message-passing protocol for multi-agent task DAGs with fan-out/fan-in | Fork pattern for `capture` orchestrator's 3-way parallel fanout. |
| `steipete/blogwatcher` | ClawHub | RSS/Atom feed watcher with read-tracking | Fork for `dev-watcher` job 3 (challenge index). DEV.to has RSS feeds. |
| `AndyBold/obsidian-sync` | ClawHub | Local HTTP server with bearer auth + conflict detection for Obsidian | Reference for conflict handling. We'll use direct git ops instead of HTTP server. |

## Reference only (patterns, not code)

| Skill | Source | Useful pattern |
|---|---|---|
| `marmikcfc/memory-manager` | ClawHub | Three-tier episodic/semantic/procedural memory with compression thresholds |
| `briancolinger/pr-reviewer` | ClawHub | PR diff analysis + tracking HEAD SHA to avoid re-reviewing |
| `bastos/obsidian-daily` | GitHub | Date-keyed markdown organization for daily notes |
| `alexanderkinging/obsidian-cli-official` | ClawHub | Comprehensive vault automation via obsidian-cli |
| `fogyoy/let-me-know` | ClawHub | Heartbeat progress updates with live log reading |

## Not found — must write custom

| Skill | Why |
|---|---|
| `dev-watcher` (jobs 1-2) | No DEV.to comment/notification API skill exists. RSS covers posts, not comments. Need DEV API integration. |
| `memory` (structured markdown) | Community memory skills use SQLite or JSONL. None write structured per-project markdown files to a git-synced vault. Custom. |
| `route` (bucket classifier) | Project-specific. No generic "classify message into project" skill exists. |
| `surface` (rules-based alerting) | Project-specific alert rules. No generic equivalent. |
| `buckets` (lifecycle FSM) | Project-specific vault structure. |

## Decisions

1. **Discord**: OpenClaw's built-in Discord channel handles bot connection. `steipete/discord` skill handles message sending. We configure, not code.
2. **GitHub**: `steipete/github` wraps `gh` CLI. Our `pr-watcher` adds scheduled polling + contribution-graph tracking on top.
3. **DEV.to**: Fork `blogwatcher` for RSS-based challenge monitoring. Write custom DEV API calls for comment polling and notifications.
4. **Orchestration**: Fork `clawflow` fan-out pattern for the capture skill's 3-way parallel (route + memory + answer).
5. **Memory**: OpenClaw's built-in session memory stays untouched. Our `memory` skill writes structured markdown — fully custom.
6. **Obsidian sync**: Direct git operations (pull-rebase-commit-push). Reference `obsidian-sync` for conflict detection patterns but don't use the HTTP server approach.
7. **Voice**: No existing voice/tone skill worth forking. `voice-template` is custom but simple.

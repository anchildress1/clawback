# Credits

Open-source skills and tools used by Clawback.

## Community skills — used as-is

| Skill | Author | License | Usage |
|---|---|---|---|
| [steipete/discord](https://clawhub.ai/steipete/discord) | Peter Steinberger | MIT | All Discord messaging — send, react, threads, pins |
| [steipete/github](https://clawhub.ai/steipete/github) | Peter Steinberger | MIT | GitHub PR/issue queries via `gh` CLI |

## Community skills — forked patterns

| Skill | Author | License | What we took |
|---|---|---|---|
| [srikanth235/clawflow](https://clawhub.ai/srikanth235/clawflow) | Srikanth Agaram | MIT | Fan-out/fan-in message-passing pattern for `capture` orchestrator |
| [steipete/blogwatcher](https://clawhub.ai/steipete/blogwatcher) | Peter Steinberger | MIT | RSS feed polling pattern for `dev-watcher` challenge index job |

## Community skills — referenced for patterns

| Skill | Author | License | Pattern referenced |
|---|---|---|---|
| [AndyBold/obsidian-sync](https://clawhub.ai/AndyBold/obsidian-sync) | Andy Bold | MIT | Conflict detection for vault sync |
| [marmikcfc/memory-manager](https://clawhub.ai/marmikcfc/memory-manager) | Marmik | MIT | Three-tier memory architecture with compression thresholds |
| [briancolinger/pr-reviewer](https://clawhub.ai/briancolinger/pr-reviewer) | Brian Colinger | MIT | HEAD SHA tracking to avoid re-reviewing PRs |
| [bastos/obsidian-daily](https://github.com/openclaw/skills/blob/main/skills/bastos/obsidian-daily/SKILL.md) | Bastos | MIT | Date-keyed markdown organization |

## NPM dependencies

| Package | Version | License | Usage |
|---|---|---|---|
| [yaml](https://github.com/eemeli/yaml) | ^2.8 | ISC | YAML parsing/serialization for _bucket.md frontmatter |
| [@sinclair/typebox](https://github.com/sinclairzx81/typebox) | ^0.34 | MIT | JSON Schema types for tool parameter definitions |

## Platform

| Project | Usage |
|---|---|
| [OpenClaw](https://github.com/openclaw/openclaw) | Gateway, plugin system, session memory, channel handling |

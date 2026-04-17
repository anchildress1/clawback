# OpenClaw Challenge — Baseline

_Sources: dev.to/challenges/openclaw-2026-04-16, dev.to/page/official-hackathon-rules, docs.openclaw.ai (partial / unverified — flag in red below)._

## The two prompts

**Prompt 1 — "OpenClaw in Action" (Build It)** — target this one. Ship a project using OpenClaw and show it working. The post must walk through the skills / integrations / workflows that power it.

**Prompt 2 — "Wealth of Knowledge" (Write It)** — deferred. Educational post about OpenClaw (tutorials, how-tos, essays). Can be a follow-up once Prompt 1 is done since the same build supplies the material.

## Judging (Build prompt)

Creativity · Technical Execution · Writing Quality. All three weigh — a clever build with a sloppy writeup loses to a decent build with a crisp writeup.

## Dates / prize

- Entry window: **Apr 16 – Apr 26, 2026** (10 days, starting today).
- 3 winners per prompt × 2 prompts = 6 × ($200 + DEV++ + winner badge). Completion badge for every valid submission.

## Rules that actually bite

- **Development must start during the entry period.** Not before. This is the trap — any pre-existing repo is DQ territory. Build from a clean slate starting today.
- **Original work.** Credit any OSS used.
- **English for prizes.** Other languages only get the completion badge.
- **18+**, DEV account, no sanctioned-country residents, no MLH/DEV employees.
- **Teams ≤ 4**, one submission per team, but individuals may submit to both prompts.
- **AI usage permitted.** No explicit disclosure format required in the rules document, but being transparent in the writeup is expected for the "Writing Quality" score anyway.
- **IP**: entrant keeps ownership; DEV gets a perpetual non-exclusive license to promo the entry.

## Submission template (as provided by Ashley)

```
---
title:
published:
tags: devchallenge, openclawchallenge
---
*This is a submission for the [OpenClaw Challenge](https://dev.to/challenges/openclaw-2026-04-16).*

## What I Built
## How I Used OpenClaw
## Demo
## What I Learned
## ClawCon Michigan   <-- DROP THIS SECTION. Ashley did not attend.
```

Cover image recommended. A real demo video beats screenshots.

## What OpenClaw actually is — verified

Cross-checked against docs.openclaw.ai (Getting Started, llms.txt index, tools/skills, providers/anthropic) and TechCrunch / Wikipedia / GitHub coverage from Feb–Apr 2026. Call out if anything looks wrong.

**Origin story.** OSS project by Peter Steinberger. Shipped Nov 2025 as "Clawdbot" → renamed "Moltbot" after Anthropic trademark complaint → renamed **"OpenClaw"** three days later. ~60k GitHub stars in 72h. Steinberger joined OpenAI in Feb 2026 and the project moved under a non-profit foundation.

**What it is technically.** A self-hosted **gateway** — one background process — that connects messaging channels to AI agents. Runs on your hardware, your keys. Node.js-based; also deploys via Docker / Kubernetes / Podman / cloud (Fly, Railway, Render, etc.).

**Primitives that matter for our build:**

- **Channels** — Discord, Slack, iMessage, Telegram, WhatsApp, Signal, Matrix, Teams, Google Chat, WebChat in the dashboard, plus more. This IS the "coordinates updates from anywhere" layer for free.
- **Skills** — a directory with a `SKILL.md` (YAML frontmatter + instructions). Loaded from six paths in precedence order: workspace/skills → workspace/.agents/skills → ~/.agents/skills → ~/.openclaw/skills → bundled → `skills.load.extraDirs`. Gating via `metadata.openclaw.requires.{bins,env,config}` and `os`. This is how we encode behavior / voice / workflows.
- **Plugins** — bundle of skills + tools declared in `openclaw.plugin.json`. Plugin skills load at lowest precedence so workspace skills can override.
- **Memory** — persistent context across sessions. Built-in plus pluggable engines (Honcho, QMD). This is the "resume where I left off" primitive.
- **Sessions** — tracked conversations with state.
- **Automation** — scheduled tasks, webhooks, background jobs. This is what fires "nudge" behavior without the user asking.
- **Control surfaces** — Dashboard (web UI), WebChat, TUI, native macOS app, iOS/Android clients. The "UI users can log into" already exists; we don't have to build it.
- **Providers** — Anthropic (API key or reuse local Claude CLI creds), OpenAI, Google, DeepSeek, Qwen, Ollama, LM Studio, Groq, etc. Model-agnostic.
- **ClawHub** — public skills registry at clawhub.ai; 5,700+ community skills. We can ship our build there too, and we can pull existing skills as dependencies.

**Relevant recent Anthropic policy wrinkle.** Anthropic briefly banned OpenClaw's creator / restricted Claude-subscription usage inside OpenClaw, then walked it back — "OpenClaw-style Claude CLI usage is allowed again" per recent clarification. For a demo we'll use an **Anthropic API key**, not a Claude Pro sub, to keep the submission defensible.

## Locked decisions

- **Direction:** persistent background agent, check-in from anywhere, ADHD-friendly chunked workflow, encodes Ashley's interaction style.
- **Solo submission.**
- **Ashley did not attend ClawCon Michigan** — drop that section.
- **Provider:** Anthropic API key (not reuse of Claude CLI sub) to stay on the safe side of Anthropic's policy churn.

## Still-open questions (see next step)

Demo channel(s), hosting choice, public repo name, scope of the first plugin.

## Things NOT to forget

- New repo, fresh commit history, timestamped today or later.
- Cover image.
- Credit any OSS (including any OpenClaw plugins/skills reused).
- Drop the ClawCon Michigan section from the template before publishing.
- Record demo early and often — a rough demo cut on day 2 is cheaper than scrambling on day 10.

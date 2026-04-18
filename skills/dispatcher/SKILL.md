---
name: dispatcher
description: >
  Background task that ticks every minute, reads job files, and fires subagents per job kind.
  Checks pause.md before any unsolicited action. Do NOT invoke manually — runs on a schedule.
user-invocable: false
metadata:
  openclaw:
    emoji: "⏱️"
---

# Dispatcher

Background task. Ticks every minute. Reads job files from `openclaw/memory/jobs/*.md`. Fires a subagent per job `kind` when the trigger is due. Checks `pause.md` before firing — if paused, skip all jobs.

## Job file shape

Each job is a markdown file with YAML frontmatter:

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

## v1 job kinds

### `poll-url-for-keyword`
HTTP GET the URL, scan for keyword. On match, execute `on_hit` action (DM the user). Then apply `on_hit_then` (disable, keep-watching, etc.).

### `watch-github-repo-activity`
Check repo activity via bucket-to-repo mapping (`git_repo` field in bucket record). On new commits/PRs, DM the user with a summary.

### `review-future-me`
Daily. Scan `vault/future-me.md` for entries older than 7 days. DM the user a list of stale tangents to decide on.

### `review-patterns`
Daily. Scan triage log and corrections for patterns. Propose AGENTS.md rule additions. Soft-confirm with user. See `pattern-review` skill for details.

## Dispatcher loop

1. Read `pause.md` — if paused and not expired, skip all jobs and return.
2. List all `*.md` files in `openclaw/memory/jobs/`.
3. For each job file:
   a. Parse frontmatter.
   b. Check if `state` is `watching` (skip `disabled`).
   c. Check if enough time has elapsed since `last_run` per `schedule`.
   d. If due: fire the job kind handler. Update `last_run`. On failure, increment `fail_count`.
4. After all jobs processed, return.

## Rules

- **Check pause before every tick.** If `pause.md` exists and hasn't expired, do nothing.
- **One job at a time.** Synchronous within the tick. No parallel job execution.
- **Fail gracefully.** Increment `fail_count`, log the error, move to next job. Do not crash the loop.
- **DM results directly.** Job results are DMs to the user, not files in the vault.

## Status: STUB

This skill documents the target behavior. The dispatcher loop and job kind handlers are not yet implemented. Implementation depends on OpenClaw's cron infrastructure.

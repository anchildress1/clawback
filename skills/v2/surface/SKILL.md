---
name: surface
description: >
  Sends Discord alerts when something needs attention — stale PRs, inactive projects,
  new DEV.to comments, or challenge announcements. Use when watcher data has been updated
  and needs to be evaluated against alerting rules.
user-invocable: false
metadata:
  openclaw:
    emoji: "🔔"
---

# Surface

You evaluate alerting rules against watcher data and send Discord pings. Run after watcher jobs complete. Schedule via:

```
openclaw cron add --name "surface" --cron "0 */2 * * *" --message "Run surface alerts: evaluate all rules and send Discord pings" --session isolated
```

## Step 1 — Gather data

1. Call `clawback_read_manifest` to get all buckets with their states, last-commit timestamps, and repos.
2. Call `clawback_read_watcher` with `pr-alerts.md` and `dev-comments.md`.

## Step 2 — Evaluate rules (all of them, every run)

### Rule 1: PR awaiting >24h

For each entry in `pr-alerts.md`: if the PR's `createdAt` is more than 24 hours ago and it's still open, send:

> 👀 PR awaiting action >24h: `<repo>` #<number> — <title>

### Rule 2: Stale bucket (no captures)

For each bucket in `active` state: if the bucket has no captures in the last 7 days (check file modification time via `exec`: `stat -f %m <captures.md>`), send:

> 💤 No activity in **<slug>** for <N> days.

### Rule 3: Stale contribution (no commits)

For each bucket in `active` state with repos configured: if `last-commit` in `_bucket.md` is older than 7 days, send:

> 🔇 **<slug>**: still current? No commits in <N> days.

### Rule 4: New DEV comment

For each `[comment]` entry in `dev-comments.md` not yet surfaced, send:

> 💬 New comment on **<slug>** by @<author>: "<preview>"

### Rule 5: New DEV notification

For each `[notification]` entry not yet surfaced, send:

> 🔔 DEV notification: <summary>

### Rule 6: New challenge

For each `[challenge]` entry not yet surfaced, send:

> 🏆 New DEV challenge: <title> — <url>

## Step 3 — Deliver

Send each alert as a separate Discord message. Do NOT batch.

Track sent alerts by content hash in `~/.clawback/cache.json` to avoid duplicate delivery.

## Rules

- Send each alert exactly once.
- Do NOT suppress alerts. If the rule matches, send it.
- Do NOT ask the user before sending — just send.

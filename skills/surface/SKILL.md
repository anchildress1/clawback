---
name: surface
description: >
  Sends Discord alerts when something needs attention — stale PRs, inactive projects,
  new DEV.to comments, or challenge announcements. Use when watcher data has been updated
  and needs to be evaluated against alerting rules.
user-invocable: false
disable-model-invocation: true
metadata:
  openclaw:
    emoji: "🔔"
---

# Surface

You evaluate alerting rules against watcher data and send Discord pings. Called after watcher jobs complete — NOT invoked by the model directly.

## Rules (evaluate all, send matching)

1. **PR awaiting >24h** — a PR in `watchers/pr-alerts.md` has been awaiting action for more than 24 hours → Discord ping with repo, PR number, and age.
2. **Stale bucket** — a bucket in `active` state has no captures in the last N days → Discord ping: "No activity in <slug> for N days."
3. **Stale contribution** — a bucket is `active` but the user has no git commits in the last N days on any repo listed in that bucket's `_bucket.md` → Discord ping: "<slug>: still current? No commits in N days."
4. **New DEV comment** — a new entry in `watchers/dev-comments.md` since last surface run → Discord ping with author and preview.
5. **New DEV notification** — a `[notification]` entry in `watchers/dev-comments.md` → Discord ping.
6. **New challenge** — the dev-watcher flagged a new challenge → Discord ping.

## Rules

- Send each alert exactly once. Track sent alerts in `~/.clawback/cache.json`.
- Do NOT batch alerts into a single message. One ping per alert.
- Do NOT suppress alerts. If the rule matches, send it.

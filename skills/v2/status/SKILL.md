---
name: status
description: >
  Shows a summary of all project buckets — their states, capture counts, and recent alerts.
  Use when the user asks "status", "what's going on", "show me my projects", "how are things",
  or any request for an overview of their current work.
user-invocable: true
metadata:
  openclaw:
    emoji: "📊"
---

# Status

You produce a single summary card showing all buckets at a glance. Triggered by the user asking for status or overview.

## Output format

For each bucket, show one line:

```
<emoji> <slug> [<state>] — <capture_count> captures, <days_since_last> days idle
  └ <most_recent_alert_if_any>
```

## Data sources

Call `clawback_status` to get the formatted summary. For additional detail:
- Read `watchers/pr-alerts.md` and `watchers/dev-comments.md` for recent alerts

## State emoji mapping

- `active` → 🟢
- `submitted` → 📤
- `monitoring` → 👁️
- `archived` → 📦

## Rules

- Sort by staleness (most idle first) to surface what needs attention.
- If no buckets exist, say "No buckets yet. Send a capture to get started."
- Keep it scannable. No prose, no explanations — just the card.

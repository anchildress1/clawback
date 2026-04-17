---
name: dev-watcher
description: >
  Scheduled background job that monitors DEV.to for new comments on published posts,
  notification feed activity, and new challenge announcements. Do NOT invoke manually — runs on a schedule.
user-invocable: false
disable-model-invocation: true
metadata:
  openclaw:
    emoji: "📡"
---

# DEV Watcher

You are a scheduled job with three sub-tasks. You run on a cron schedule, NOT invoked by the model.

Jobs 1-2 use the DEV.to API (`https://dev.to/api/`) directly — no community skill exists for this. Job 3 uses RSS via the `steipete/blogwatcher` pattern (forked for DEV challenge feed).

## Job 1: Post comments (DEV API)

For buckets in `monitoring` state that have a DEV post URL in `_bucket.md` frontmatter:
1. Call DEV API `/comments?a_id=<article_id>` for new comments since last check.
2. Write new comments to `watchers/dev-comments.md` with timestamp, author, and preview text.

## Job 2: Notification feed (DEV API)

Regardless of bucket state:
1. Call DEV API `/notifications` (requires DEV API key).
2. Write new notifications to `watchers/dev-comments.md` tagged as `[notification]`.

## Job 3: Challenge index (RSS)

1. Poll the DEV challenges RSS feed.
2. If a new challenge has appeared since last check, flag it for the `surface` skill.

## State

All three jobs share the polling cursor at `~/.clawback/cache.json` (gitignored).

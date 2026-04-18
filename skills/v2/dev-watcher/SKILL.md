---
name: dev-watcher
description: >
  Scheduled background job that monitors DEV.to for new comments on published posts,
  notification feed activity, and new challenge announcements. Do NOT invoke manually — runs on a schedule.
user-invocable: false
metadata:
  openclaw:
    emoji: "📡"
---

# DEV Watcher

You are a scheduled job with three sub-tasks. Run on a cron schedule via:

```
openclaw cron add --name "dev-watcher" --cron "*/30 * * * *" --message "Run DEV watcher: check post comments, notifications, and challenge feed" --session isolated
```

## Job 1: Post comments

For buckets in `monitoring` state (from `clawback_read_manifest`) that have a DEV post URL in their description or memory:

1. Extract the article ID from the DEV URL.
2. Use the `exec` tool to call the DEV API:
   ```
   curl -s "https://dev.to/api/comments?a_id=<article_id>" -H "Accept: application/json"
   ```
3. Parse the JSON response. For each comment not already in the watcher file:
   ```
   \n---\n**<ISO timestamp>** [comment] `<bucket-slug>` — @<username>: <first 100 chars of body>\n
   ```
4. Call `clawback_write_watcher` with `dev-comments.md` and the new entries.

## Job 2: Notification feed

Regardless of bucket state:

1. Use the `exec` tool to call:
   ```
   curl -s "https://dev.to/api/notifications" -H "api-key: $DEV_API_KEY" -H "Accept: application/json"
   ```
2. For each new notification:
   ```
   \n---\n**<ISO timestamp>** [notification] <type>: <summary>\n
   ```
3. Call `clawback_write_watcher` with `dev-comments.md` and the new entries.

## Job 3: Challenge index

1. Use the `exec` tool to fetch the DEV challenges page:
   ```
   curl -s "https://dev.to/challenges" -H "Accept: text/html"
   ```
2. Parse for any new challenge not already seen (compare against `~/.clawback/cache.json`).
3. If a new challenge is found, write a notification entry:
   ```
   \n---\n**<ISO timestamp>** [challenge] New challenge: <title> — <url>\n
   ```
4. Call `clawback_write_watcher` with `dev-comments.md` and the entry.

## After all jobs complete

Sync the vault using the `exec` tool in the vault directory.

## State

All three jobs share the polling cursor at `~/.clawback/cache.json` (gitignored). Store last-checked timestamps per article ID, last notification ID, and last challenge slug.

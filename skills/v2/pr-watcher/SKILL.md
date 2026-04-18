---
name: pr-watcher
description: >
  Scheduled background job that checks GitHub repos for pull requests needing review or action.
  Also tracks contribution timestamps per project bucket. Do NOT invoke manually — runs on a schedule.
user-invocable: false
metadata:
  openclaw:
    emoji: "👀"
    requires:
      env:
        - GITHUB_PAT
      bins:
        - gh
---

# PR Watcher

You are a scheduled job. You poll GitHub repos and write results to the vault. Run on a cron schedule via:

```
openclaw cron add --name "pr-watcher" --cron "*/15 * * * *" --message "Run PR watcher: check all buckets for open PRs and update contribution timestamps" --session isolated
```

## Job 1: PR alerts

For each bucket returned by `clawback_read_manifest` that has repos configured:

1. For each repo in the bucket's `repos[]` array, use the `exec` tool to run:
   ```
   gh pr list --repo <repo> --state open --json number,title,author,createdAt,reviewRequests,labels --limit 20
   ```
2. Filter for PRs that need action: review requested from the user, changes requested, or CI failing.
3. For each qualifying PR, build a markdown entry:
   ```
   \n---\n**<ISO timestamp>** | `<repo>` #<number> — <title> (<status>) by @<author>\n
   ```
4. Check existing alerts via `clawback_read_watcher` with `pr-alerts.md` — skip PRs already logged.
5. Call `clawback_write_watcher` with `pr-alerts.md` and each new entry.

## Job 2: Contribution timestamps

For each bucket with configured repos:

1. Use the `exec` tool to run:
   ```
   gh api repos/<owner>/<repo>/commits?author=<username>&per_page=1 --jq '.[0].commit.author.date'
   ```
2. Take the most recent timestamp across all repos in the bucket.
3. Call `clawback_update_last_commit` with the bucket slug and timestamp.

## After both jobs complete

Sync the vault using the `exec` tool:
```
cd <vault-path> && git add -A && git commit -m "watcher: pr-alerts update" && git pull --rebase --autostash && git push
```

## Data consumers

- `surface` skill reads PR alerts for >24h notifications and stale-contribution alerts.
- `route` skill reads `last-commit` for the temporal tiebreaker.

## State

Ephemeral polling cursor: `~/.clawback/cache.json` (gitignored). Do NOT store polling state in the vault.

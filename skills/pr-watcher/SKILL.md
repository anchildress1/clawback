---
name: pr-watcher
description: >
  Scheduled background job that checks GitHub repos for pull requests needing review or action.
  Also tracks contribution timestamps per project bucket. Do NOT invoke manually — runs on a schedule.
user-invocable: false
disable-model-invocation: true
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

You are a scheduled job. You poll GitHub repos and write results to the vault. You are NOT invoked by the model — you run on a cron schedule.

Uses `steipete/github` skill (wraps `gh` CLI) for all GitHub queries. Do NOT call the GitHub API directly.

## Job 1: PR alerts

For each bucket with configured repos (listed in `_bucket.md` frontmatter `repos[]`):
1. Use `gh pr list --state open --json ...` to find PRs awaiting action (review requested, changes requested, CI failing).
2. Write new alerts to `watchers/pr-alerts.md` with timestamp, repo, PR number, and status.
3. Skip PRs already in the alert history.

## Job 2: Contribution timestamps

For each bucket with configured repos:
1. Use `gh api` to check the user's last commit timestamp on each repo.
2. Write the most recent timestamp to the bucket's `_bucket.md` frontmatter `last-commit` field.

## Data consumers

- `surface` skill reads PR alerts for >24h notifications and stale-contribution alerts.
- `route` skill reads `last-commit` for the temporal tiebreaker.

## State

Ephemeral polling cursor: `~/.clawback/cache.json` (gitignored). Do NOT store polling state in the vault.

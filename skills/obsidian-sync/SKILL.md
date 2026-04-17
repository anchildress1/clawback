---
name: obsidian-sync
description: >
  Syncs the Obsidian vault via git — pulls, commits, and pushes changes. Use when any skill
  writes to the vault and needs the changes persisted to GitHub. Runs automatically on every
  vault write and polls every 5 minutes for external changes from Obsidian.
user-invocable: false
metadata:
  openclaw:
    always: true
    emoji: "🔄"
    requires:
      bins:
        - git
---

# Obsidian Sync

Other skills sync the vault after writing by running git commands via OpenClaw's built-in `exec` tool. This skill documents the canonical sync procedure.

## Sync procedure

Use the `exec` tool to run these git commands in the vault directory, in this order:

1. `git add -A` — stage all changes
2. `git commit -m <message>` — commit with a descriptive message (skip if nothing staged)
3. `git pull --rebase --autostash` — rebase on remote, stashing any uncommitted changes
4. `git push` — push to GitHub

## Poll (every 5 minutes)

Set up via `openclaw cron add`:
```
openclaw cron add --name "vault-pull" --cron "*/5 * * * *" --message "Pull latest vault changes" --session isolated
```

## Conflict handling

If the rebase or push fails, the calling skill should:
1. Notify via Discord: "Sync conflict — resolve manually"
2. Do NOT retry automatically
3. Do NOT force-push

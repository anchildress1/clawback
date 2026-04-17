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

Vault sync is handled by the `clawback_vault_sync` tool registered in `src/index.ts`. Other skills call that tool after writing to the vault — this skill exists as documentation.

## How sync works

The `clawback_vault_sync` tool:
1. `git pull --rebase` — picks up Obsidian-side changes
2. `git add -A` — stages all changes
3. `git commit -m <message>` — commits with the provided message
4. `git push` — pushes to GitHub

## Poll (every 5 minutes)

Set up via `openclaw cron add`:
```
openclaw cron add --name "vault-pull" --cron "*/5 * * * *" --message "Pull latest vault changes" --session isolated
```

## Conflict handling

If rebase fails, `clawback_vault_sync` returns `{ ok: false, error: "..." }`. The calling skill should:
1. Notify via Discord: "Sync conflict — resolve manually"
2. Do NOT retry automatically
3. Do NOT force-push

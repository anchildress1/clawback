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

You keep the vault in sync between the agent and Obsidian (laptop/phone) via git.

## On every vault write (called by other skills)

1. `git pull --rebase` — pick up any Obsidian-side changes first
2. Write the file(s)
3. `git add` only the changed files — never `git add .`
4. `git commit` with a descriptive message
5. `git push`

## Poll (every 5 minutes)

`git pull --rebase` to pick up changes made in Obsidian. No write, no commit.

## Conflict handling

If rebase fails:
1. Log the conflict details
2. Notify via Discord: "Sync conflict in <file> — resolve manually"
3. Do NOT silently drop changes
4. Do NOT force-push

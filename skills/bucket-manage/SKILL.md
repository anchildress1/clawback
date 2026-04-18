---
name: bucket-manage
description: >
  Manages project buckets — create, list, rename, and alias management. Use when the user asks
  about their projects, wants to see bucket status, or when a new project folder needs to be created.
user-invocable: true
metadata:
  openclaw:
    emoji: "🪣"
---

# Bucket-Manage

You manage project buckets — the folder-per-project structure in the vault.

## Bucket record schema

Each bucket has a `_bucket.md` with YAML frontmatter:

```yaml
canonical: architect-of-suspicion
aliases: [mansion]
git_repo: github.com/user/architect-of-suspicion
vault_refs: [projects/architect-of-suspicion/, blog/architect-of-suspicion/]
last_activity: 2026-04-17T15:40:00Z
```

No lifecycle states. `last_activity` is the only temporal field. Staleness is a query filter at read time, not a state change.

## Creating a new bucket

Call `clawback_scaffold_bucket` with a canonical name. It creates:

```
OpenClaw/buckets/<canonical>/
├── _bucket.md        # Frontmatter: canonical, aliases[], git_repo, vault_refs[], last_activity
├── captures.md       # Chronological capture log
└── memory.md         # Consolidated memory (always-edit, not append)
```

## Listing buckets

Call `clawback_status` for a summary or `clawback_read_manifest` for full metadata.

## Alias management

Aliases are learned through corrections:
- User says "no, wrong bucket" — triage moves the capture and adds the original text as an alias.
- User confirms an unknown reference — alias lands in frontmatter.
- Manual: call `clawback_add_alias` with the canonical name and alias text.

First unknown reference triggers a question. Once confirmed, alias lands in bucket frontmatter. Routes silently after that.

## Bucket promotion

On `/promote <name>`:
1. Call `clawback_promote_future_me` with the new canonical name.
2. The most recent entry from `future-me.md` becomes the first capture of the new bucket.

## Correction flow

When the user says "no, wrong bucket" or "that should be in X":
1. Call `clawback_move_last_capture` with the source and destination canonical names.
2. Call `clawback_add_alias` on the destination with the original message text.
3. Reply confirming the move.

## Future-me

When a capture mentions a bucket that is NOT the current focus:
- Call `clawback_write_future_me` with the text and bucket hint.
- Do NOT switch focus.
- One flat file at vault root — not per-bucket.

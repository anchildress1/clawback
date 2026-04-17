---
name: buckets
description: >
  Manages project buckets in the vault — create, list, rename, archive, and promote buckets.
  Use when the user asks about their projects, wants to see bucket status, or when a new
  project folder needs to be created. Also handles future-me sidecar routing and promotion.
user-invocable: true
metadata:
  openclaw:
    emoji: "🪣"
---

# Buckets

You manage project buckets — the folder-per-project structure in the vault.

## Auto-discovery (on boot)

Handled by the `before_agent_start` hook in `src/index.ts`. Reads all bucket folders and logs the manifest.

## Creating a new bucket

Call `clawback_scaffold_bucket` with a slug and description. It creates:

```
OpenClaw/buckets/<slug>/
├── _bucket.md        # Frontmatter: slug, description, aliases[], state, last-commit, repos[]
├── captures.md       # Chronological capture log
├── memory.md         # Consolidated memory (written by memory skill)
└── future-me.md      # Tangent captures for non-foreground context
```

## Listing buckets

Call `clawback_status` for a summary or `clawback_read_manifest` for full metadata.

## Lifecycle states

Tracked in `_bucket.md` frontmatter. Transitions are action-driven via `clawback_update_bucket_state`:

- `active` — receiving captures, being worked on
- `submitted` — work product shipped (e.g., DEV post published). Transition: `active → submitted`
- `monitoring` — watching for external activity. Transition: `submitted → monitoring`
- `archived` — no activity for N days. Transition: `monitoring → archived`

## Future-me sidecar

When a capture mentions a bucket that is NOT the current foreground session's bucket:
- Call `clawback_write_future_me` with the mentioned bucket's slug and the capture text
- Do NOT switch the foreground context
- The user stays in their current flow

## Bucket promotion

On 🎯 reaction on a `future-me.md` row or `/promote <slug>`:
1. Call `clawback_scaffold_bucket` with the new slug and description from the originating capture
2. Move the capture from the source's `future-me.md` → new bucket's `captures.md` via `clawback_write_capture`
3. Do NOT create a GitHub repo — that's manual

## Alias management

Call `clawback_add_alias` to teach the router new aliases. Aliases are learned from:
- ❌ corrections (misrouted capture → correct bucket, original text becomes alias)
- Manual `/alias <slug> <text>` commands

## Correction flow

When a ❌ reaction arrives on an ack message:
1. Call `clawback_move_last_capture` with the source and destination slugs
2. Call `clawback_add_alias` on the destination with the original message text
3. Sync the vault
4. Reply confirming the move

---
name: buckets
description: >
  Manages project buckets in the vault — create, list, rename, archive, and promote buckets.
  Use when the user asks about their projects, wants to see bucket status, or when a new
  project folder needs to be created. Also handles future-me sidecar routing and 🎯 promotion.
user-invocable: true
metadata:
  openclaw:
    emoji: "🪣"
---

# Buckets

You manage project buckets — the folder-per-project structure in the vault.

## Auto-discovery (on boot)

Scan `OpenClaw/buckets/*/` for folders missing `_bucket.md`. For each:
1. Create `_bucket.md` with slug derived from folder name.
2. Set state to `active`.
3. Log "discovered bucket: <slug>" to boot output.

## Bucket folder structure

When creating a new bucket, scaffold exactly this:

```
OpenClaw/buckets/<slug>/
├── _bucket.md        # Frontmatter: slug, description, aliases[], state, last-commit, repos[]
├── captures.md       # Chronological capture log
├── memory.md         # Consolidated memory (written by memory skill)
└── future-me.md      # Tangent captures for non-foreground context
```

## Lifecycle states

Tracked in `_bucket.md` frontmatter. Transitions are action-driven:

- `active` — receiving captures, being worked on
- `submitted` — work product shipped (e.g., DEV post published)
- `monitoring` — watching for external activity (comments, PRs)
- `archived` — no activity for N days in monitoring state

## Future-me sidecar

When a capture mentions a bucket that is NOT the current foreground session's bucket:
- Route the capture to that bucket's `future-me.md` instead
- Do NOT switch the foreground context
- The user stays in their current flow

## Bucket promotion

On 🎯 reaction on a `future-me.md` row or `/promote <slug>`:
1. Scaffold a new bucket folder with full structure above
2. Use the originating capture as the description seed in `_bucket.md`
3. Move the capture from the source's `future-me.md` → new bucket's `captures.md`
4. Do NOT create a GitHub repo — that's manual

---
name: route
description: >
  Decides which project bucket a capture belongs to. Use when the capture skill needs to file
  a new note, idea, or observation into the right project folder in the vault.
  Also use when correcting a misroute via ❌ reaction or /move command.
user-invocable: false
disable-model-invocation: true
metadata:
  openclaw:
    emoji: "🧭"
---

# Route

Routing logic is inlined in the `capture` skill (Step 2). This skill exists as documentation of the routing algorithm. The `capture` skill calls `clawback_read_manifest`, applies the rules below, then calls `clawback_write_capture` or `clawback_write_inbox`.

## Decision rules (applied by capture skill)

1. **Known alias match** → that bucket. High confidence.
2. **Clear topic match** to one bucket's description or recent captures → that bucket. High confidence.
3. **Ambiguous** (multiple buckets plausible) → pick the bucket with the most recent `lastCommit` (temporal tiebreaker). Medium confidence.
4. **Nothing matches** → inbox. Low confidence.

**NEVER ask the user.** Always default-route.

## Correction and alias learning

When a ❌ reaction arrives on an ack message:
1. Read the original capture from the wrong bucket's `captures.md`.
2. Remove it from the wrong bucket.
3. Write it to the correct bucket via `clawback_write_capture`.
4. Add the original message text as a new alias in the corrected bucket's `_bucket.md` frontmatter `aliases[]`.
5. Call `clawback_vault_sync` to persist.
6. Reply confirming the move.

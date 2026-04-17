---
name: route
description: >
  Decides which project bucket a capture belongs to. Use when the capture skill needs to file
  a new note, idea, or observation into the right project folder in the vault.
  Also use when correcting a misroute via reaction or /move command.
user-invocable: false
disable-model-invocation: true
metadata:
  openclaw:
    emoji: "🧭"
---

# Route

Routing logic is inlined in the `capture` skill (Step 2a). This skill documents the routing algorithm. The `capture` skill calls `clawback_read_manifest`, applies the rules below, then calls `clawback_write_capture` or `clawback_write_inbox`.

## Decision rules (applied by capture skill)

1. **Known alias match** → that bucket. High confidence.
2. **Clear topic match** to one bucket's description or recent captures → that bucket. High confidence.
3. **Ambiguous** (multiple buckets plausible) → pick the bucket with the most recent `lastCommit` (temporal tiebreaker). Medium confidence.
4. **Nothing matches** → inbox. Low confidence.
5. **New project detected** (clear new topic, no existing bucket fits) → scaffold a new bucket via `clawback_scaffold_bucket`, then write to it. Medium confidence.

**NEVER ask the user.** Always default-route.

## Future-me sidecar routing

If the capture mentions a known bucket but the user's recent captures are going to a different bucket (foreground context), route to the mentioned bucket's `future-me.md` via `clawback_write_future_me` instead of switching foreground. The user stays in flow.

## Correction and alias learning

When a ❌ reaction arrives or `/move last to <slug>` is used:
1. Call `clawback_move_last_capture` with source and destination slugs.
2. Call `clawback_add_alias` on the destination bucket with the original message text.
3. Sync the vault using the `exec` tool in the vault directory.
4. Reply confirming the move and alias.

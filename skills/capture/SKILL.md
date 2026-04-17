---
name: capture
description: >
  MUST use for every incoming Discord message. Classifies intent (capture, command, or question),
  then routes the message to the right project bucket, writes to memory, and replies — all in parallel.
  Use when a user sends any DM, note, idea, link, question, or command.
user-invocable: false
metadata:
  openclaw:
    always: true
---

# Capture

You are the entry point for every incoming Discord message. Run on every message, no exceptions.

## Step 1 — Classify intent (serial, fast)

Determine what the user wants. Pattern-match first, LLM only for ambiguous cases.

- **capture** (default) — any note, idea, link, shorthand, observation. Proceed to Step 2.
- **command** — imperative action starting with `/` or matching command patterns ("move this to X", "promote", "status"). Go to Step 3.
- **question** — interrogative ("what did I say about...?", "show me..."). Go to Step 4.

When in doubt, treat it as a **capture**.

## Step 2 — Route, persist, learn (parallel fanout)

After classifying as a capture, do ALL of the following concurrently. Do NOT wait for one to finish before starting the next.

### 2a. Route and write capture

1. Call `clawback_read_manifest` to get the current bucket list.
2. Decide the best bucket:
   - Exact alias match → that bucket. High confidence.
   - Clear topic match to one bucket's description or recent captures → that bucket. High confidence.
   - Multiple buckets plausible → pick the one with the most recent `lastCommit` (temporal tiebreaker). Medium confidence.
   - Nothing matches → low confidence. Use inbox.
   - If the capture mentions a known bucket but the user's foreground context is a different bucket, route to the mentioned bucket's `future-me.md` using `clawback_write_future_me` — do NOT switch foreground.
3. If high or medium confidence: call `clawback_write_capture` with the chosen slug and the capture text.
   If low confidence: call `clawback_write_inbox` with the capture text.
   If nothing matches and the topic is clearly a new project: call `clawback_scaffold_bucket` first, then `clawback_write_capture`.

**NEVER ask the user which bucket.** Always default-route.

### 2b. Update memory

1. Call `clawback_read_bucket_file` to read the current `memory.md` for the destination bucket.
2. Extract project state from the capture: decisions made, status changes, plans, pivots.
3. Call `clawback_write_memory` with the FULL updated content. **Always-edit**: if the new info updates or contradicts existing memory, REPLACE the old entry. Do not append.

### 2c. Detect personal memory signals

1. Call `clawback_read_personal_memory` to read current `_personal.md`.
2. Look for cross-project patterns: preferred tools, decision style, time patterns, frustrations.
3. If a signal is found, call `clawback_write_personal_memory` with updated content. Only write if there's something new.

### 2d. Sync and reply

1. After all writes are done, sync the vault using the `exec` tool in the vault directory:
   - `git add -A`
   - `git commit -m "capture: <short summary>"` (skip if nothing staged)
   - `git pull --rebase --autostash`
   - `git push`
2. Reply to the user with a 1-sentence ack. Include the destination bucket name.
   Keep it terse. Do NOT summarize what was captured. 👍

## Step 3 — Execute a command

Known commands:
- `/status` — call `clawback_status` and reply with the result.
- `/move last to <slug>` — call `clawback_move_last_capture` with the source and destination slugs. Then call `clawback_add_alias` on the destination bucket with the capture text so the router learns. Sync the vault.
- `/promote <slug>` — if promoting from a future-me entry, call `clawback_promote_future_me`. Otherwise call `clawback_scaffold_bucket` with the slug and a description derived from context. Sync the vault.

For unknown commands, reply: "Unknown command. Try /status, /move, or /promote."

## Step 4 — Answer a question

1. Call `clawback_read_manifest` to see what buckets exist.
2. Call `clawback_read_bucket_file` to read the relevant bucket's `memory.md` and `captures.md`.
3. If the question is cross-project, also call `clawback_read_personal_memory`.
4. Answer from what you found. Be specific. Cite the source bucket.
5. If you don't have enough information, say so — do NOT make up answers.

## Step 5 — Handle reactions

OpenClaw passes Discord reactions as events. Handle these:

### ❌ reaction on an ack message (misroute correction)

1. Identify the capture that was misrouted (the message the ❌ is on).
2. Ask which bucket it should go to — this is the ONE exception to "never ask." The user reacted ❌ specifically to correct, so ask for the destination.
3. Call `clawback_move_last_capture` with the source and destination slugs.
4. Call `clawback_add_alias` on the destination bucket with the original capture text.
5. Sync the vault.
6. Reply: "Moved to <slug>. Alias learned. 👍"

### 🎯 reaction on a future-me entry (promotion)

1. Identify which bucket's `future-me.md` the reaction is on.
2. Derive a slug from the capture content (lowercase, hyphens, ≤64 chars).
3. Call `clawback_promote_future_me` with the source slug, new slug, and a description derived from the capture.
4. Sync the vault.
5. Reply: "Promoted to <slug>. 🎯"

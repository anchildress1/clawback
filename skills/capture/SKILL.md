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

Pattern-match first, LLM fallback for ambiguous cases. Exactly one of:

- **capture** — default. Any note, idea, link, shorthand, observation. Proceed to Step 2.
- **command** — imperative action starting with `/` or matching command patterns (e.g., "move this to X", "promote", "status"). Execute the command, report done.
- **question** — interrogative ("what did I say about...?", "show me..."). Answer from session memory + bucket memory + recent captures. Never grep.

## Step 2 — Fan out (parallel, all three concurrent)

Use the clawflow fan-out pattern (forked from `srikanth235/clawflow`). Fire these three concurrently. Do NOT run them serially:

1. **Route** — invoke the `route` skill to pick the destination bucket.
2. **Memory** — invoke the `memory` skill to extract project state and personal signals. Memory MUST commit before the ack returns.
3. **Ack** — invoke the `answer` skill to generate a 1-sentence reply. Send reply via `steipete/discord`. Return to Discord within ~1s.

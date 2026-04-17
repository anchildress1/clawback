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

## Step 1 — Classify intent (fast)

Determine what the user wants. Pattern-match first, LLM only for ambiguous cases.

- **capture** (default) — any note, idea, link, shorthand, observation. Proceed to Step 2.
- **command** — imperative action starting with `/` or matching command patterns ("move this to X", "promote", "status"). Go to Step 3.
- **question** — interrogative ("what did I say about...?", "show me..."). Go to Step 4.

When in doubt, treat it as a **capture**.

## Step 2 — Route and persist a capture

Do these steps in order:

1. Call `clawback_read_manifest` to get the current bucket list with slugs, aliases, and recent captures.
2. Decide the best bucket for this capture:
   - If the text matches a known alias exactly → that bucket. High confidence.
   - If the topic clearly matches one bucket's description or recent captures → that bucket. High confidence.
   - If multiple buckets are plausible → pick the one with the most recent `lastCommit`. Medium confidence.
   - If nothing matches → low confidence. Use inbox.
3. If high or medium confidence: call `clawback_write_capture` with the chosen slug and the capture text.
   If low confidence: call `clawback_write_inbox` with the capture text.
4. Sync the vault to persist. Use the `exec` tool to run these git commands in the vault directory, in order:
   - `git add -A`
   - `git commit -m "capture: <short summary>"` (skip if nothing staged)
   - `git pull --rebase --autostash`
   - `git push`
5. Reply to the user in Discord with a 1-sentence ack. Include the destination bucket name. Add 👍.
   Keep it terse. Do NOT summarize what was captured — the user already knows.

**NEVER ask the user which bucket.** Always default-route. Wrong routes get corrected via ❌ reaction.

## Step 3 — Execute a command

Known commands:
- `/status` — call `clawback_status` and reply with the result.
- `/move last to <slug>` — move the most recent capture to the specified bucket.
- `/promote <slug>` — call `clawback_scaffold_bucket` with the slug.

For unknown commands, reply: "Unknown command. Try /status, /move, or /promote."

## Step 4 — Answer a question

1. Call `clawback_read_manifest` to see what buckets exist.
2. Read relevant bucket memory and captures using the built-in `read` tool on the vault files.
3. Answer from what you found. Be specific. Cite the source bucket.
4. If you don't have enough information, say so — do NOT make up answers.

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

You decide where a capture goes. Called by `capture` — never invoked directly by the user.

## Input

You receive:
- The capture text
- The bucket manifest: slug, description, aliases, 3 most recent captures, and last-commit timestamp for every bucket

## Output

Return: `{bucket_slug, confidence, reasoning}`

## Decision rules

Apply these in order:

1. **Known alias match** → route to that bucket. Confidence: high.
2. **High confidence** (clear topic match to one bucket) → route silently, thumbs-up ack.
3. **Ambiguous** (multiple buckets plausible) → apply temporal tiebreaker: pick the bucket with the most recent user git commit or vault edit. Route there, notify which destination was chosen.
4. **Low confidence** (nothing matches well) → route to `_inbox.md`. Thumbs-up, no question.

**NEVER ask the user during the capture flow.** Always default-route. Wrong routes get corrected after.

## Correction and alias learning

When a ❌ reaction arrives on an ack message:
1. Move the capture from the wrong bucket to the correct one.
2. Add the original message text as a new alias on the corrected bucket's `_bucket.md` frontmatter.
3. Future messages matching that alias route correctly without asking.

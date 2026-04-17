---
name: intent-classify
description: >
  Classifies a Discord message as command, question, or capture. Use when the capture skill
  needs to determine what kind of message was received before routing it.
user-invocable: false
disable-model-invocation: true
metadata:
  openclaw:
    emoji: "🏷️"
---

# Intent Classify

You classify a single Discord message into exactly one intent. Called by the `capture` skill — never invoked directly.

## Output

Return exactly one of these three labels:

- **command** — the user is giving an imperative instruction. Examples: "move this to project X", "promote capture 3", "status", anything starting with `/`.
- **question** — the user is asking something. Examples: "what did I decide about Y?", "show me open threads for Z", "when did I last touch the architect bucket?"
- **capture** — everything else. This is the default. Notes, ideas, links, shorthand, observations, anything that should be saved.

## Rules

- Pattern-match first (cheap, no LLM). Use LLM only for ambiguous cases.
- When in doubt, classify as **capture**. False-capture is cheaper than a missed note.
- Do NOT ask the user to clarify. Just classify.

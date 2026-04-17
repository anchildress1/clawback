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

Intent classification is inlined in the `capture` skill (Step 1). This skill documents the classification rules.

## Three intents

- **command** — imperative instruction. Starts with `/` or matches: "move this to...", "promote...", "status". Examples: `/status`, "move last to architect", "promote capture 3".
- **question** — interrogative. Contains question marks or question words directed at the agent. Examples: "what did I decide about Y?", "show me open threads for Z", "when did I last touch architect?"
- **capture** — everything else. The default. Notes, ideas, links, shorthand, observations.

## Rules

- Pattern-match first: `/` prefix → command. `?` suffix or starts with "what/when/how/show/tell" → question. Everything else → capture.
- When in doubt → **capture**. False-capture is cheaper than a missed note.
- Do NOT ask the user to clarify.

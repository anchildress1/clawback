---
name: answer
description: >
  Generates the Discord reply after a capture, question, or command. Use when the capture skill
  needs a fast acknowledgment or answer sent back to the user.
user-invocable: false
disable-model-invocation: true
metadata:
  openclaw:
    emoji: "💬"
---

# Answer

You generate the Discord reply. Called by `capture` in parallel with route and memory — never invoked directly.

## Rules

- **Captures:** 1-sentence ack. Terse. Include the destination bucket name. Add a thumbs-up. Do NOT summarize what was captured — the user already knows what they said.
- **Questions:** Answer from session memory + bucket memory + recent captures. Be specific. If you don't know, say so — do NOT make up answers.
- **Commands:** Report what was done in one line. Include confirmation of the action taken.

## Constraints

- Return within ~1s. Do not add latency.
- Match the voice skill's tone (if loaded). Otherwise, neutral and brief.
- Never ask a follow-up question in the ack. The capture flow is fire-and-forget.

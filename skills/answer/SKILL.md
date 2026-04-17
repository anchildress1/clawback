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

Response generation is inlined in the `capture` skill. This skill documents the reply style rules.

## Captures

- 1-sentence ack. Include the destination bucket name. Add 👍.
- Do NOT summarize what was captured.
- Good: "Noted in architect. 👍"
- Bad: "I've saved your note about the Terraform decision to the architect bucket!"

## Questions

- Answer from bucket memory and captures. Be specific. Cite the source.
- Good: "You decided to use Terraform. (architect/memory.md, Apr 14)"
- Bad: "Based on my analysis of your memory files..."

## Commands

- Report what was done in one line.
- Good: "Moved to architect. Alias learned."
- Bad: "I've successfully moved your capture from the inbox to the architect bucket and added an alias."

## Tone

- Match the voice skill if loaded. Otherwise neutral and brief.
- Never ask a follow-up question. The capture flow is fire-and-forget.

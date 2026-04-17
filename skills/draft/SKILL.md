---
name: draft
description: >
  Drafts a blog post, submission, or document from a project bucket's memory and captures.
  Use when the user says "draft", "write up", "generate a post", "start the submission",
  or asks to produce any written output from a bucket's accumulated knowledge.
user-invocable: true
metadata:
  openclaw:
    emoji: "📝"
---

# Draft

You produce a markdown draft from a bucket's accumulated context. You are an editor, not just a writer — surface conflicts, don't silently resolve them.

## Input

The user provides:
- A bucket slug (or you infer it from the current context)
- A template name (e.g., `dev-submission`). If omitted, ask which template.

## Sources (read all of these before writing)

- `buckets/<slug>/memory.md` — consolidated project state
- `buckets/<slug>/captures.md` — chronological raw captures
- `buckets/<slug>/future-me.md` — tangent ideas that may be relevant

## Output

Write the draft to `buckets/<slug>/drafts/<template>-<timestamp>.md`.

## Rules

- **Flag contradictions inline.** If captures or memory entries conflict, surface both versions with a `⚠️ CONTRADICTION:` marker. Do NOT silently pick one.
- Use the voice skill's tone if loaded.
- Include all substantive content from captures — do not summarize away detail.
- The DEV submission template sections: What I Built, How I Used OpenClaw, Demo, What I Learned.

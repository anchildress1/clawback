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

## Step 1 — Gather sources

Read ALL of these before writing:

1. Call `clawback_read_bucket_file` with slug and `memory.md`
2. Call `clawback_read_bucket_file` with slug and `captures.md`
3. Call `clawback_read_bucket_file` with slug and `future-me.md`
4. Call `clawback_read_personal_memory` for voice/style context

## Step 2 — Write the draft

Apply the template structure, pulling content from the sources gathered above.

### Templates

**dev-submission** (DEV.to challenge post):
```markdown
# <Project Name>

## What I Built
<Description of what the project does and who it's for>

## How I Used OpenClaw
<Specific OpenClaw features used: skills, memory, channels, scheduling>

## Demo
<Link to demo video or embed>

## What I Learned
<Honest reflection: what worked, what didn't, what surprised you>
```

**blog-post** (general):
```markdown
# <Title>

<Introduction — hook the reader>

## <Section per major topic from memory/captures>

## What's Next
<Forward-looking based on future-me entries>
```

**status-update** (internal):
```markdown
# Status: <slug>

## Progress
<What's been done, pulled from captures>

## Decisions
<Key decisions from memory.md>

## Open Questions
<Unresolved items, future-me entries>
```

## Step 3 — Flag contradictions

**CRITICAL:** If captures or memory entries conflict with each other, surface BOTH versions with a marker:

```
⚠️ CONTRADICTION: Memory says "using Terraform" (Apr 14) but capture says "switched to Pulumi" (Apr 16). Resolve before publishing.
```

Do NOT silently pick one version. The user decides.

## Step 4 — Save and reply

1. Call `clawback_write_draft` with the slug, template name, and full draft content.
2. Sync the vault via `exec` tool.
3. Reply with the draft filename and a 1-line summary of what was generated.

## Rules

- Use the voice skill's tone if loaded.
- Include all substantive content from captures — do not summarize away detail.
- Flag contradictions inline. This is what makes you an editor, not just a summarizer.

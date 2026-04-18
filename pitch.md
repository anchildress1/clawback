# Clawback — Overview

An ADHD orchestrator that offloads executive function by being the thing that remembers for you.
The problem. ADHD brains leak context the moment focus shifts. Thoughts land in Discord DMs, voice memos, and scrollback and stay there. Every project restart costs an executive-function tax disproportionate to the work. Existing assistants demand pre-structured input and punish tangents. They make you translate your brain into their schema, which is the opposite of what an ADHD brain needs.

## The pitch.

One agent, running locally on OpenClaw, paired to a single Discord DM channel. You think out loud. It catches every message, figures out what bucket it belongs to, and files it — into a private git repo that holds both an Obsidian vault (your notes) and the agent's own memory workspace. When you say "mansion," it knows you mean architect-of-suspicion. When you tangent mid-sentence, it parks the tangent in a flat future-me.md so you can come back to it. When DEV posts the Clerk challenge winners, it tells you — because you asked it to watch, once, in one line.

## Why it's different.

No seeded ruleset. Day-one AGENTS.md has structure and nothing else. The agent learns your vocabulary, your projects, your tangent patterns from observed corrections. A daily review-patterns pass proposes rules; you soft-confirm; AGENTS.md grows into a model of how you actually work. Skills are authored; AGENTS.md writes itself. That asymmetry is the design.

## Why it works.

Git as concurrency. Dispatcher pattern as self-scheduling. OpenClaw's memory primitives as the substrate — we wave at the dreaming cycle, we do not rewrite the moon. Synchronous capture so the hot path is debuggable. One pause command as the fix-mechanism when the agent is wrong.

## v1 scope.
Capture triage, buckets/aliases, focus file, holds, pause, dispatcher with two job kinds (URL-keyword poll, GitHub repo watch), obsidian-sync, pattern-review. Deployable as nice-to-have.
Deferred. Code workflow. Gmail. Calendar. Voice. Auto-discovery. Async orchestration. Everything that isn't the loop of message in → filed correctly → retrievable later.

## The bet.

If this works, the cold-start friction of the first two weeks pays back forever, because the agent stops asking and starts knowing. If it doesn't work, the daily correction count never drops and we find out fast.

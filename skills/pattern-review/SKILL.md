---
name: pattern-review
description: >
  Daily job that scans triage log and corrections for patterns, then proposes rule additions
  to the runtime AGENTS.md. The learning loop that makes the agent get smarter over time.
user-invocable: false
metadata:
  openclaw:
    emoji: "🔍"
---

# Pattern-Review

Daily dispatcher job (`review-patterns` kind). Scans triage log and corrections for routing patterns. Proposes rule additions to the runtime `openclaw/AGENTS.md`. Soft-confirms with user before writing.

This is the most important skill. Without it, the agent never gets smarter. The ask-rate never drops. Instrument from day one.

## Trigger

Runs daily via dispatcher. Job file:

```yaml
kind: review-patterns
schedule: every 24h
state: watching
last_run: 2026-04-17T03:00:00Z
fail_count: 0
on_hit: dm "Pattern review complete. N new rules proposed."
on_hit_then: keep-watching
```

## Steps

1. **Read triage log:** Call `clawback_read_triage_log` for the current log.
2. **Identify patterns:**
   - Repeated corrections (same source bucket → same destination) = routing rule candidate.
   - Repeated unknown-reference questions that resolve to the same bucket = alias candidate.
   - Repeated classification overrides = classification rule candidate.
3. **Propose rules:** For each pattern found, draft a rule in AGENTS.md format:
   - Decision category (routing, classification, tone, etc.)
   - Condition (when this pattern is seen...)
   - Action (route to X, classify as Y, etc.)
   - Source evidence (triage log entries that triggered this proposal)
4. **Soft-confirm:** DM the user with the proposed rules. Wait for confirmation.
   - "yes" or "ok" → write the rule to `openclaw/AGENTS.md`.
   - "no" → discard. Log the rejection so the same pattern isn't re-proposed.
   - No response within 24h → discard silently.
5. **Roll triage log into daily note:** Append today's triage log entries to `openclaw/memory/YYYY-MM-DD.md`.

## Metrics (instrument from day one)

- Corrections per week (should trend down)
- Proposals per review (non-zero means the system is learning)
- Acceptance rate (should be positive)
- Ask-rate (unknown references / total captures — should trend down)

## Rules

- **Never auto-write rules.** Always soft-confirm with user first.
- **Evidence-based.** Every proposed rule cites the triage log entries that generated it.
- **No duplicate proposals.** Track previously proposed + rejected patterns.

## Status: STUB

This skill documents the target behavior. Implementation depends on dispatcher and triage log accumulation.

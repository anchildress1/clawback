# Clawback — local testing checklist

Run in order. Check each box as you go. Come back with results.

---

## Prerequisites

- [x] Get DEV API key from https://dev.to/settings/extensions

```bash
# Add to your shell profile or run before starting the gateway
export DEV_API_KEY=<paste-key-here>
```

---

## 1. Start gateway

```bash
openclaw gateway start
```

Verify in the logs:

```
auto-discovered bucket: architect
auto-discovered bucket: fit
manifest loaded: 4 buckets.
```

- [ ] 4 buckets loaded (clawback, unearthed, architect, fit)

---

## 2. Capture routing (10 messages via Discord DM)

Send each message to the bot. Record where it routed.

| # | Message | Expected bucket | Actual | Correct? |
|---|---------|-----------------|--------|----------|
| 1 | `terraform looks right for the infra layer` | architect | | |
| 2 | `need to add vitest coverage to clawback` | clawback | | |
| 3 | `ran 3 miles today, felt good` | fit | | |
| 4 | `unearthed bug: the parser drops trailing newlines` | unearthed | | |
| 5 | `clawback pr-watcher needs the gh cli` | clawback | | |
| 6 | `maybe a sauna after workouts` | fit | | |
| 7 | `arch decision: no SQL, md only` | architect | | |
| 8 | `something about woodworking` | inbox | | |
| 9 | `oh also for clawback we need to handle the conflict file` | clawback or future-me | | |
| 10 | `status` | (status card) | | |

- [ ] All 10 sent
- [ ] At least 7/9 captures routed correctly (status is a command, not a capture)
- [ ] Status card returned bucket summary

---

## 3. Correction (❌ reaction)

Pick one misrouted capture from step 2 (or intentionally misroute one).

- [ ] React ❌ on the bot's ack message
- [ ] Bot asks which bucket it should go to
- [ ] Reply with the correct bucket slug
- [ ] Bot confirms: "Moved to <slug>. Alias learned. 👍"
- [ ] Open the vault and verify the alias was added to `OpenClaw/buckets/<slug>/_bucket.md` frontmatter

---

## 4. Future-me sidecar

While sending captures about one bucket (e.g. architect), mention a different project:

```
oh wait, for clawback we should also track reaction counts
```

- [ ] Bot routes to clawback's `future-me.md` (not architect's captures)
- [ ] Bot ack says something like "Parked in clawback/future-me.md"
- [ ] Verify file: `OpenClaw/buckets/clawback/future-me.md` has the entry

---

## 5. Promotion (🎯 reaction)

- [ ] React 🎯 on the future-me ack from step 4
- [ ] Bot scaffolds a new bucket from the entry
- [ ] Bot confirms: "Promoted to <slug>. 🎯"
- [ ] Verify new folder exists in `OpenClaw/buckets/<new-slug>/` with `_bucket.md`, `captures.md`, `memory.md`, `future-me.md`

---

## 6. Question from memory

```
what did I say about terraform?
```

- [ ] Bot answers from architect's memory.md or captures.md
- [ ] Answer cites the source bucket
- [ ] Answer is specific, not generic

---

## 7. Set up crons

Only run these after steps 1–6 pass.

```bash
openclaw cron add --name "vault-pull" --cron "*/5 * * * *" --message "Pull latest vault changes" --session isolated
```

```bash
openclaw cron add --name "pr-watcher" --cron "*/15 * * * *" --message "Run PR watcher: check all buckets for open PRs and update contribution timestamps" --session isolated
```

```bash
openclaw cron add --name "dev-watcher" --cron "*/30 * * * *" --message "Run DEV watcher: check post comments, notifications, and challenge feed" --session isolated
```

```bash
openclaw cron add --name "surface" --cron "0 */2 * * *" --message "Run surface alerts: evaluate all rules and send Discord pings" --session isolated
```

```bash
openclaw cron add --name "memory-consolidate" --cron "0 3 * * *" --message "Run memory consolidation: merge duplicates, resolve contradictions, prune stale entries" --session isolated
```

```bash
# Verify all crons registered
openclaw cron list
```

- [ ] vault-pull registered
- [ ] pr-watcher registered
- [ ] dev-watcher registered
- [ ] surface registered
- [ ] memory-consolidate registered

---

## 8. Verify pr-watcher fires

Wait for the pr-watcher cron to run (up to 15 min), or trigger it manually:

```bash
openclaw run "Run PR watcher: check all buckets for open PRs and update contribution timestamps"
```

- [ ] `watchers/pr-alerts.md` created in the vault (may be empty if no open PRs)
- [ ] `clawback/_bucket.md` `last-commit` field updated with a timestamp

---

## 9. Review private skills

Check these files and tweak anything that feels off:

```bash
cat ~/.openclaw/skills/ashley-voice/SKILL.md
```

```bash
cat ~/.openclaw/skills/ashley-personal-memory/SKILL.md
```

- [ ] Voice sounds right
- [ ] Personal memory signals are accurate

---

## Done

Bring back:
- The filled-in routing table from step 2
- Any errors from the gateway logs
- Which crons succeeded/failed
- Notes on anything that felt wrong

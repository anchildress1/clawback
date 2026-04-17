# Clawback — Demo Script

End-to-end test that proves the Discord → vault round-trip. Run this before recording the submission video.

## Preconditions

- OpenClaw gateway running on Mac; `openclaw status` clean
- Clawback plugin loaded from workspace (`openclaw plugins install` or symlink into `~/.openclaw/plugins/`)
- Discord bot online, **one specific channel** chosen (all-channels still crashes the wizard)
- `google/gemini-3.1-flash-lite-preview` set as default model; `openclaw models status --probe` green
- `~/.openclaw/skills/ashley-voice/` and `ashley-personal-memory/` exist (stubs OK)
- `clawback-vault` committed clean; Obsidian open to the vault root; Fit configured
- Stage one fake-stale PR on a GitHub repo you control (bucket will point at it) — needed for the watcher beat

## The script

| # | Intent | DM | Expected ack (~1.5s) | Expected in vault |
|---|---|---|---|---|
| 1 | capture (new project) | `writing the clawback post outline tonight, leading with thesis filter + three intents` | "Got it — filed to `clawback`" (or new bucket slug) | `buckets/clawback/{memory.md, captures.md}` created; memory.md reflects plan |
| 2 | capture (same project, **consolidate**) | `actually pivoting — lead with the ADHD framing, not the thesis filter` | "Updated `clawback`" | `memory.md` **edited in place** — reflects pivot only. `git diff` shows a replacement, not a new line. `captures.md` has both entries (raw log). |
| 3 | capture (different project) | `ordered retaining wall blocks from the sand yard, delivery Saturday` | "Filed to new bucket `yard`" (or similar) | Second bucket created. **Zero writes** to `buckets/clawback/`. |
| 4 | question | `what's the current plan for the clawback post?` | Replies with 1–2 sentence summary sourced from `memory.md` | No vault change |
| 5 | command | `promote the thesis-filter capture to a draft` | "Drafted → `buckets/clawback/drafts/thesis-filter.md`" | draft file written |
| 6 | watcher nudge | (no DM — wait) | Inbound DM from bot: "PR #X on `clawback` has been open >24h" | `watchers/pr-alerts.md` updated |

## Pass criteria

- **Latency**: every ack ≤ 1.5s perceived. If it's visibly slow, the orchestrator is serializing something it shouldn't.
- **Always-edit proof**: `git diff buckets/clawback/memory.md` after step 2 shows a replacement, not an append. This is the money shot of the demo.
- **Bucket isolation**: step 3 writes zero bytes under `buckets/clawback/`.
- **Agent ACTS**: step 6 fires without you asking. If it doesn't, the watcher isn't running — cron/automation misconfigured.
- **Vault commits**: every agent write produces a commit in `clawback-vault` (Fit does this).

## Failure triage

- No ack at all → gateway not dispatching to the plugin. Check `openclaw logs`.
- Ack arrives but vault unchanged → `memory` skill ran but `obsidian-sync` didn't fire. Check skill chaining.
- Memory appends instead of edits → `memory` skill violating the always-edit contract. Biggest risk; test this one cold before recording.
- Wrong bucket picked → `route` skill returned low confidence and defaulted to `_inbox`. Accept it on camera, show the command-intent rescue ("move to `clawback`").
- Step 6 never fires → `pr-watcher` schedule not registered. `openclaw automation list` should show it.

## Minimum viable demo if time runs short

Steps **1 → 2 → 4** only. That's the whole product in 3 DMs: capture, consolidate, recall. Everything else is garnish.

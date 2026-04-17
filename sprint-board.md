# Clawback — sprint board

**Challenge window:** April 16 → April 26, 2026 (today is April 16 = day 0).
**Submit target:** day 5 (April 21) stretch, day 6 (April 22) realistic.
**Polish window:** remaining 4–5 days — demo re-record, writeup iteration, community share, maybe ClawHub publish.

## Prereqs — Ashley, in parallel (can start now, not gated on me)

These unblock build day 1. Do them whenever you have a window; we don't have to wait.

- [ ] GCP project picked (new or existing under `anchildress1.dev`). e2-micro VM provisioned in a free-tier region (us-central1, us-east1, us-west1). Static external IP. Firewall: 22 (you), 80/443 (Dashboard over HTTPS).
- [ ] Subdomain decided (`clawback.anchildress1.dev`?) and Cloud DNS A-record pointed at the static IP.
- [ ] OpenAI API key with billing enabled. Put it somewhere you can paste once.
- [ ] Discord Application created at discord.com/developers/applications. Bot user added. Bot token saved. Intents enabled: MESSAGE CONTENT, GUILD MESSAGES, DIRECT MESSAGES. Test server created + bot invited (OAuth scopes: `bot` + `applications.commands`; permissions: Send Messages, Read Message History).
- [ ] GitHub personal access token with `repo:read` scope (or fine-grained token on the OSS repos you want watched). Save it.
- [ ] New private GitHub repo for the Obsidian vault (`clawback-vault` or similar). Empty is fine. I'll hand you the folder scaffold.
- [ ] Obsidian: install Obsidian Git community plugin on your laptop + phone; point at the new vault repo; set auto-pull/push cadence to 5 min.

If any of these hits friction, ping me and we'll unblock. Discord bot setup is the most likely trip-hazard; I'll walk it step by step when we get there.

## Build sprint — days 1–5

Each day has a **gate**: the thing that must work end-of-day, or we cut to the cut-order list to keep shipping.

### Day 1 (Apr 17) — Infra + scaffold

**Goal:** nothing built yet; everything *deployable*.

- SSH into the VM, install Node, install OpenClaw via the official install script, verify gateway starts.
- **ClawHub audit** (do this first, before writing anything): search for existing skills we can reuse or fork — Discord channel (confirm `openclaw-channel-discord` is the right one), GitHub PR watcher, DEV post watcher, notifications delivery, memory engine choice, **and any async-orchestration pattern for parallel LLM calls** (we need it for `capture`). Anything we'd write from scratch that already exists as a maintained community skill → fork or configure, don't rewrite.
- Create the Clawback plugin repo (local, not on GitHub yet; push on day 2 when it has content).
- Scaffold `openclaw.plugin.json` with skill directories stubbed (exact count depends on audit outcome).
- Clone the Obsidian vault repo onto the VM; hand Ashley the vault folder scaffold for her to commit on her side.
- Wire the Discord channel via the community skill, paste bot token, verify the bot appears online in the test server and can echo a message.
- Wire the OpenAI provider with the API key.
- Configure OpenClaw's built-in memory engine for per-bucket session state.
- Stub the cold-start boot sequence: on gateway start, read every `_bucket.md` frontmatter into memory (empty map is fine today; real buckets arrive day 3).

**Gate:** you can DM the bot on Discord, the gateway logs the message, the bot replies with a placeholder. Vault is syncing both directions. Boot log prints "manifest loaded: 0 buckets." Audit outcome committed as a short note in the plugin repo.

### Day 2 (Apr 18) — Capture + memory plumbing

**Goal:** messages land, they persist, you can see them.

- `capture` skill v0 — **orchestrator pattern**. Serial: classify intent (pattern + cheap LLM). Parallel after that: route + bucket-memory-write + personal-memory-signal-detect + ack generation, all fired concurrently via OpenClaw's async primitive (audit Day 1; fall back to Promise.all). Ack returns in ~1s; memory commits before the response. Commands execute + report done. Questions answer from session memory + recent captures (buckets land Day 3).
- `memory/template` skill stub: schema for `memory.md` (per-bucket) + `_personal.md` (how Ashley works) + extraction prompts + consolidation prompts. Ships in the plugin, zero personal content. Full schedule-based trigger lands Day 3 when buckets exist; consolidation pass lands Day 4.
- `_personal.md` scaffold committed to the vault with a placeholder header. Agent will fill it as signals arrive.
- `obsidian-sync` skill MVP: pull-merge-commit on every bot write; pull every 5 min; conflict stubs only.
- Basic `buckets` skill: reads/writes `_bucket.md` frontmatter in the vault; one hardcoded test bucket so captures have somewhere to go before the router exists.

**Gate:** Ashley DMs 3 captures + 1 question + 1 command from her phone. Captures land in `_inbox.md` within the sync window. The question gets answered from session memory, not a grep. The command executes and reports done. Vault committed to GitHub.

### Day 3 (Apr 19) — Router + aliases + lifecycle

**Goal:** the smart part.

- **Bucket auto-discovery on boot**: scan `OpenClaw/buckets/*/` for folders without `_bucket.md` → scaffold one with slug from folder name; optionally scan allowlisted GitHub repos with recent Ashley commits → surface as suggested buckets.
- `route` skill: GPT-5 classifier. Input = new capture + bucket manifest (slug + description + aliases + 3 most recent captures + last-commit timestamp per bucket). Output = `{bucket_slug, confidence, reasoning}`.
  - High confidence or known alias → route silently with thumbs-up.
  - Ambiguous (multi-bucket plausible) → **temporal tiebreaker**: pick the bucket with most recent Ashley git commit or vault edit. Default-route + notify destination.
  - Low confidence (nothing matches well) → route to `_inbox.md`, thumbs-up, no question.
  - **Never ask during the capture flow.**
- **Correction surface**: ❌ reaction on the ack message OR text command `/move last to <slug>` → agent rewrites the capture's destination, appends the original message text as a new alias on the corrected bucket's `_bucket.md` frontmatter.
- Future-me sidecar: if the capture mentions a non-active-foreground bucket while a foreground session is underway, route to that bucket's `future-me.md`, don't switch foreground.
- **Bucket promotion**: 🎯 reaction on a future-me row OR `/promote <slug>` → agent scaffolds a new bucket folder, creates `_bucket.md` with originating capture as description seed, moves the capture from source's `future-me.md` → new bucket's `captures.md`. Does NOT create a GitHub repo.
- Bucket lifecycle: state tracked in `_bucket.md` frontmatter; transitions (`active` → `submitted` → `monitoring` → `archived`) triggered by actions, not manual toggles.

**Gate:** 3 buckets auto-discovered from vault folders Ashley pre-seeded. Ashley DMs 10 mixed captures (shorthand, full names, ambiguous, outright unknown); router default-routes all 10 without asking; Ashley corrects wrong ones with ❌; corrections write aliases that stick on the retry. Future-me sidecar catches one obvious tangent. One 🎯-promotion works end-to-end. One question ("what did I say last week about architect?") answers from the bucket's `memory.md` + recent captures.

### Day 4 (Apr 20) — Watchers + drafting

**Goal:** outputs.

- `pr-watcher`: scheduled job, polls a list of repos configured per-bucket, finds PRs awaiting action, writes alert history to `watchers/pr-alerts.md`. **Also** records per-bucket last-Ashley-commit timestamp from the GitHub contribution graph; writes to each bucket's `_bucket.md` frontmatter (feeds router temporal tiebreaker + `surface` stale-contribution alert). Ephemeral polling cursor lives in `~/.clawback/cache.json` (gitignored).
- `dev-watcher`: three jobs in one skill. (1) For buckets in `monitoring` state, polls the DEV post URL for new comments → `watchers/dev-comments.md`. (2) Polls Ashley's DEV notifications feed regardless of bucket state → same file, notification rows tagged. (3) Polls the DEV challenge index → pings when a new challenge drops. All three share the cache cursor file.
- `surface`: rules-based. PR awaiting >24h → Discord ping. Stale bucket >N days → Discord ping. **Stale-contribution** (bucket is `active` but no Ashley commits in N days on any repo tied to the bucket) → Discord ping: "still current?" New DEV comment/notification/challenge → Discord ping.
- `draft` skill: takes a bucket slug + template name; pulls bucket's `memory.md` + captures + future-me items; produces a markdown file under `drafts/`. Template library includes the DEV submission template. **System prompt includes a "flag potential contradictions in the output inline" directive** so the draft surfaces conflicts rather than silently picking one — editor, not just writer.
- `memory/template` schedule: runs after every N captures per bucket or every 30 min of bucket activity. Edits `memory.md` in place. Separately, extracts personal-memory signals from recent captures into `_personal.md`. Pull-merge-commit sync pattern.
- `memory` **consolidation pass**: nightly job + on-demand command. Reads `_personal.md` and each `buckets/*/memory.md`; merges duplicates; resolves contradictions by recency or flags to `_conflicts.md`; prunes entries unused in N days. Agent maintains its own memory hygiene.
- `voice/template` (public, ships in plugin): interface skill with structure but zero personal content.
- `ashley-voice` (private, workspace-scope, NOT in the public plugin repo): actual voice rules sourced from `ashley-interaction-notes.md`. Loaded at higher precedence than `voice/template`. Lives under `~/.openclaw/skills/ashley-voice/` or equivalent workspace path.
- `ashley-personal-memory` (private, workspace-scope): optional overrides to `memory/template`'s extraction rules. Can be empty in v1 — template does the work; the skill slot exists so personal tuning has a home.

**Gate:** watchers surface at least one real alert (you have OSS repos to point them at); stale-contribution rule fires on a test bucket you leave cold; `draft` produces a coherent blog-post-shaped thing from the Clawback submission bucket's captures with at least one contradiction flag surfaced if the captures contain one; voice skill is visible in the prose. Assistant also produces the exact demo script (what to type, what to click, in order) for Day 5 recording.

### Day 5 (Apr 21) — Status, dashboard, end-to-end, *submit*

**Goal:** ship.

- `status` skill: produces a single card — buckets with counts + states + staleness + last watcher alerts.
- Dashboard card: deferred to late v1 if time. Ashley already said nice-to-have. Don't spend Day 5 energy here.
- End-to-end integration test: walk the full demo script manually, fix the first 3 things that break.
- **Record the demo** (see Demo artifact section below — locked: video with voice + camera). Execute from the script produced on Day 4.
- **Dogfood:** run `draft` on the Clawback submission bucket with the DEV template. That output becomes the first draft of the submission post. Edit by hand to fix what the tool got wrong; keep notes on what it got wrong (feeds the "what I learned" section).
- **Submit** the DEV post. Publish the Clawback plugin repo to public GitHub (verify `ashley-voice` is NOT in the public repo). Add the cover image. Drop the ClawCon Michigan section.

**Gate:** post is live on DEV; repo is public; at least one demo artifact of the three options above is embedded in the post.

### Day 6 (Apr 22) — Contingency / soft polish

**Goal:** nothing new. Fix what the submit exposed.

- Re-do demo artifact if day 5's cut was rough.
- Respond to any early DEV comments.
- Trigger the `dev-watcher` against your own DEV post URL — meta loop.

## Demo artifact — locked

**Full screen recording with voice + camera.** Not negotiable. Screenshots and silent GIFs can't show the smart-routing behavior that makes the product defensible; the whole beat is messages going in one side and landing in the right place on the other, narrated.

**What the video shows (script drafted by assistant on Day 4):**

1. Discord on phone, vault on laptop, Dashboard card visible (or raw `status` Discord output if dashboard cut).
2. Three shorthand captures → default-route + destination ack. No questions asked.
3. One intentional wrong-route → ❌-react → alias learned. Retry routes silently.
4. Tangent → future-me sidecar. Current-me context never loads.
5. 🎯-promotion turns a future-me row into a new bucket.
6. PR-watcher alert + stale-contribution alert fire to Discord.
7. "draft the dev.to submission" → draft produced with a contradiction flag inline.
8. Lifecycle: `active` → `submitted`. `dev-watcher` surfaces a scripted post comment.
9. Ask the bot a question: "what did I say last week about architect?" → answered from bucket `memory.md`.
10. End on the dashboard view of the full loop.

**Ashley:** voice narrates each beat, camera on for the cold-open and the wrap. Record once Day 5, re-record Day 6 if the first cut is rough.

## Polish window — days 7–10 (Apr 23–26)

- Respond to DEV comments; let the `dev-watcher` surface them and demonstrate the flywheel publicly.
- Cross-post in OpenClaw Discord (`discord.gg/clawd`) showcase channel + r/openclaw.
- If time: publish the Clawback plugin to ClawHub (signed; spec was updated after the security crisis). That's a credibility beat in the writeup update.
- Iterate the DEV post body if something's off.
- If any of the v1 deferred items are small enough, flip a flag and add a "what changed since submit" section.

## Cut order — if a day slips

Thesis filter: the agent **acts** and **learns**. Anything that drifts passive or kills the learning loop cannot be cut. Only truly passive conveniences are cut candidates.

Trim from the bottom first:

1. **Dashboard card** (Day 5) — purely passive surface (you go look at it). Demo can show the raw `status` skill output in Discord instead.
2. **Text-command `/move` reroute** (Day 3) — keep ❌ reaction (still teaches aliases). Lose the text command as a duplicate surface.
3. **Text-command `/promote`** (Day 3) — keep 🎯 reaction. Lose the text command.
4. **Auto-discovery from GitHub repos** (Day 3) — keep vault-folder auto-discovery; drop the repo scan on boot. Still agentic, just narrower input.
5. **DO NOT CUT** — the product's act + learn loop: intent detection, `capture` **orchestrator with parallel LLM calls**, `memory/template` + `_personal.md` write + memory consolidation pass, `route` default-routing, alias auto-learning from ❌-corrections, temporal tiebreaker, auto-discovery (vault folders), future-me sidecar, 🎯-promotion, `buckets` lifecycle, `draft` (with contradiction flagging), `pr-watcher` + contribution-graph last-commit, `dev-watcher` (all three jobs), `surface` stale-contribution rule, `voice/ashley`, `obsidian-sync`, demo video. If this core slips, we reschedule submission to Day 6 — not cut.

## Parallel tracks (run alongside the build days)

| Track | Owner | Window |
|---|---|---|
| Prereqs checklist above | Ashley | Days 0–1 |
| Obsidian vault repo setup | Ashley | Day 0 or 1 |
| Plugin repo scaffold + all skill implementations | Ashley (in her CLI) | Days 1–5 |
| Skill specs, templates, review | assistant | Days 1–5 |
| DEV submission post drafting | `draft` skill output + Ashley edit | Day 5 |
| Demo artifact (video with voice + camera) | Ashley, from assistant-provided script | Days 5 + 6 |
| Community cross-posts | Ashley | Days 7–10 |
| Interaction notes maintenance | assistant | every turn |

## Risk tripwires

- **Day 2 gate fails** (capture/sync not working) → likely a Discord bot config or vault git auth issue; spend max 4h debugging before falling back to WebChat-only capture for the demo.
- **Day 3 router <60% accurate on first pass** → raise the low-confidence threshold so more captures route to `_inbox.md` instead of wrong buckets. Inbox-fallback is cheaper than wrong-routes-with-no-question — don't ship a silent wrong-router.
- **Day 4 voice skill sounds fake** → cut the rewrite pass; let the model generate in neutral voice and layer voice/ashley only on greetings and pushback moments. Partial voice is better than uncanny-valley voice.
- **Day 5 can't finish** → ship without dashboard card; demo recording uses the raw Discord + vault surfaces.

## Success criteria

- DEV post published by day 6 at latest.
- Plugin repo public, install instructions tested on a clean VM.
- Demo video (voice + camera) shows the full loop: DM → default-route + notify → ❌-reroute with alias learn → future-me sidecar → 🎯-promotion → PR watcher alert + stale-contribution alert → draft the submission (with contradiction flag) → lifecycle transition → question answered from `memory.md`.
- At least one non-trivial piece of real personal work went through the tool end-to-end before submit.
- Voice/Ashley is visible in agent output without being cringe.

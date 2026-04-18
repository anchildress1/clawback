import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "@sinclair/typebox";
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  validateSlug, assertWithinBase, getVaultPath,
  matter, stringifyMatter,
  readBucketManifest, writeCapture, writeInbox, autoDiscoverBuckets,
  addAlias, moveLastCapture, promoteFutureMe,
  writeWatcher, readWatcher, writeDraft, writeConflicts, readConflicts, updateLastCommit,
} from "./vault.js";

export default definePluginEntry({
  id: "clawback",
  name: "Clawback",
  description:
    "Routes Discord captures into an Obsidian vault by project bucket with learning memory.",

  register(api) {
    // --- Tool: Read bucket manifest ---
    api.registerTool({
      name: "clawback_read_manifest",
      label: "Read Bucket Manifest",
      description:
        "Read all bucket metadata from the vault. Returns slug, description, aliases, state, " +
        "last-commit timestamp, configured repos, and 3 most recent captures per bucket. " +
        "Use this before routing a capture to see what buckets exist.",
      parameters: Type.Object({}),
      async execute() {
        const vaultPath = getVaultPath(api.pluginConfig);
        // Run auto-discovery on every manifest read so new folders are caught
        autoDiscoverBuckets(vaultPath);
        const manifest = readBucketManifest(vaultPath);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(manifest, null, 2) }],
          details: { bucketCount: manifest.length },
        };
      },
    });

    // --- Tool: Write capture to a bucket ---
    api.registerTool({
      name: "clawback_write_capture",
      label: "Write Capture",
      description:
        "Write a capture to a specific bucket's captures.md file in the vault. " +
        "Use after routing decides the destination bucket. Pass the bucket slug and capture text.",
      parameters: Type.Object({
        slug: Type.String({ description: "Bucket slug (folder name)" }),
        text: Type.String({ description: "The capture text to write" }),
      }),
      async execute(_toolCallId, params) {
        const { slug, text } = params as { slug: string; text: string };
        const vaultPath = getVaultPath(api.pluginConfig);
        const timestamp = new Date().toISOString();
        writeCapture(vaultPath, slug, text, timestamp);
        return {
          content: [
            { type: "text" as const, text: `Capture written to ${slug}/captures.md` },
          ],
          details: { slug, timestamp },
        };
      },
    });

    // --- Tool: Write to inbox (low confidence) ---
    api.registerTool({
      name: "clawback_write_inbox",
      label: "Write to Inbox",
      description:
        "Write a capture to _inbox.md when routing confidence is low and no bucket matches. " +
        "Use this instead of clawback_write_capture when the route skill returns low confidence.",
      parameters: Type.Object({
        text: Type.String({ description: "The capture text to write" }),
      }),
      async execute(_toolCallId, params) {
        const { text } = params as { text: string };
        const vaultPath = getVaultPath(api.pluginConfig);
        const timestamp = new Date().toISOString();
        writeInbox(vaultPath, text, timestamp);
        return {
          content: [{ type: "text" as const, text: "Capture written to _inbox.md" }],
          details: { timestamp },
        };
      },
    });

    // --- Tool: Scaffold a new bucket ---
    api.registerTool({
      name: "clawback_scaffold_bucket",
      label: "Scaffold Bucket",
      description:
        "Create a new bucket folder in the vault with _bucket.md, captures.md, memory.md, " +
        "and future-me.md. Use when routing discovers a new project or promoting from future-me.",
      parameters: Type.Object({
        slug: Type.String({
          description: "Bucket slug (folder name, lowercase, hyphens)",
        }),
        description: Type.String({ description: "One-line bucket description" }),
      }),
      async execute(_toolCallId, params) {
        const { slug, description } = params as { slug: string; description: string };
        validateSlug(slug);
        const vaultPath = getVaultPath(api.pluginConfig);
        const bucketsBase = join(vaultPath, "OpenClaw", "buckets");
        const bucketDir = join(bucketsBase, slug);
        assertWithinBase(bucketsBase, bucketDir);
        if (existsSync(bucketDir)) {
          return {
            content: [
              { type: "text" as const, text: `Bucket ${slug} already exists.` },
            ],
            details: { created: false },
          };
        }
        mkdirSync(bucketDir, { recursive: true });
        const bucketMd = stringifyMatter(
          { slug, description, aliases: [], state: "active", "last-commit": "", repos: [] },
          `\n# ${slug}\n\n${description}\n`,
        );
        writeFileSync(join(bucketDir, "_bucket.md"), bucketMd);
        writeFileSync(join(bucketDir, "captures.md"), `# Captures — ${slug}\n`);
        writeFileSync(join(bucketDir, "memory.md"), `# Memory — ${slug}\n`);
        writeFileSync(
          join(bucketDir, "future-me.md"),
          `# Future Me — ${slug}\n\nTangent captures parked here for later.\n`,
        );
        return {
          content: [
            { type: "text" as const, text: `Bucket ${slug} scaffolded.` },
          ],
          details: { created: true, slug },
        };
      },
    });

    // --- Tool: Read bucket status summary ---
    api.registerTool({
      name: "clawback_status",
      label: "Bucket Status",
      description:
        "Get a summary of all buckets — name, state, capture count, days idle. " +
        "Use when the user asks for status, overview, or 'how are things'.",
      parameters: Type.Object({}),
      async execute() {
        const vaultPath = getVaultPath(api.pluginConfig);
        const manifest = readBucketManifest(vaultPath);
        if (manifest.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No buckets yet. Send a capture to get started.",
              },
            ],
            details: { bucketCount: 0 },
          };
        }
        const stateEmoji: Record<string, string> = {
          active: "🟢",
          submitted: "📤",
          monitoring: "👁️",
          archived: "📦",
        };
        const now = Date.now();
        const bucketLines = manifest.map((b) => {
          const emoji = stateEmoji[b.state] || "❓";
          const capturesFile = join(vaultPath, "OpenClaw", "buckets", b.slug, "captures.md");
          const totalCaptures = existsSync(capturesFile)
            ? readFileSync(capturesFile, "utf-8").split("\n---\n").filter((chunk) => chunk.includes("**")).length
            : 0;
          const lastCaptureStat = existsSync(capturesFile) ? statSync(capturesFile).mtimeMs : 0;
          const daysIdle = lastCaptureStat > 0 ? Math.floor((now - lastCaptureStat) / 86_400_000) : -1;
          let idleStr: string;
          if (daysIdle < 0) idleStr = "no captures";
          else if (daysIdle === 0) idleStr = "today";
          else idleStr = `${daysIdle}d idle`;
          return { line: `${emoji} **${b.slug}** [${b.state}] — ${totalCaptures} captures, ${idleStr}`, daysIdle };
        });
        bucketLines.sort((a, b) => b.daysIdle - a.daysIdle);
        const lines = bucketLines.map((b) => b.line);
        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          details: { bucketCount: manifest.length },
        };
      },
    });

    // --- Tool: Write memory (always-edit, not append) ---
    api.registerTool({
      name: "clawback_write_memory",
      label: "Write Bucket Memory",
      description:
        "Replace a bucket's memory.md with updated content. This is an ALWAYS-EDIT operation — " +
        "pass the full new content, not a diff. The old file is completely replaced. " +
        "Use after extracting project state from a new capture.",
      parameters: Type.Object({
        slug: Type.String({ description: "Bucket slug" }),
        content: Type.String({ description: "Full new memory.md content (replaces everything)" }),
      }),
      async execute(_toolCallId, params) {
        const { slug, content } = params as { slug: string; content: string };
        validateSlug(slug);
        const vaultPath = getVaultPath(api.pluginConfig);
        const bucketsBase = join(vaultPath, "OpenClaw", "buckets");
        const bucketDir = join(bucketsBase, slug);
        assertWithinBase(bucketsBase, bucketDir);
        if (!existsSync(bucketDir)) {
          mkdirSync(bucketDir, { recursive: true });
        }
        const memoryFile = join(bucketDir, "memory.md");
        writeFileSync(memoryFile, content);
        return {
          content: [{ type: "text" as const, text: `Memory updated for ${slug}.` }],
          details: { slug },
        };
      },
    });

    // --- Tool: Write personal memory (always-edit, not append) ---
    api.registerTool({
      name: "clawback_write_personal_memory",
      label: "Write Personal Memory",
      description:
        "Replace _personal.md at the vault root with updated content. This is an ALWAYS-EDIT " +
        "operation — pass the full new content. Use when a capture reveals cross-project personal " +
        "patterns (preferred tools, decision style, recurring frustrations).",
      parameters: Type.Object({
        content: Type.String({ description: "Full new _personal.md content (replaces everything)" }),
      }),
      async execute(_toolCallId, params) {
        const { content } = params as { content: string };
        const vaultPath = getVaultPath(api.pluginConfig);
        const personalFile = join(vaultPath, "_personal.md");
        writeFileSync(personalFile, content);
        return {
          content: [{ type: "text" as const, text: "Personal memory updated." }],
          details: {},
        };
      },
    });

    // --- Tool: Read a bucket file ---
    api.registerTool({
      name: "clawback_read_bucket_file",
      label: "Read Bucket File",
      description:
        "Read any file from a bucket folder — memory.md, captures.md, future-me.md, or _bucket.md. " +
        "Use when answering questions or before writing memory updates (to see current state).",
      parameters: Type.Object({
        slug: Type.String({ description: "Bucket slug" }),
        filename: Type.String({
          description: "File to read: memory.md, captures.md, future-me.md, or _bucket.md",
        }),
      }),
      async execute(_toolCallId, params) {
        const { slug, filename } = params as { slug: string; filename: string };
        validateSlug(slug);
        const allowed = ["memory.md", "captures.md", "future-me.md", "_bucket.md"];
        if (!allowed.includes(filename)) {
          throw new Error(`Cannot read "${filename}". Allowed: ${allowed.join(", ")}`);
        }
        const vaultPath = getVaultPath(api.pluginConfig);
        const bucketsBase = join(vaultPath, "OpenClaw", "buckets");
        const filePath = join(bucketsBase, slug, filename);
        assertWithinBase(bucketsBase, filePath);
        if (!existsSync(filePath)) {
          return {
            content: [{ type: "text" as const, text: `File not found: ${slug}/${filename}` }],
            details: { found: false },
          };
        }
        const text = readFileSync(filePath, "utf-8");
        return {
          content: [{ type: "text" as const, text }],
          details: { found: true, slug, filename },
        };
      },
    });

    // --- Tool: Read personal memory ---
    api.registerTool({
      name: "clawback_read_personal_memory",
      label: "Read Personal Memory",
      description:
        "Read _personal.md from the vault root. Contains cross-project personal patterns. " +
        "Read this before writing updates to avoid losing existing content.",
      parameters: Type.Object({}),
      async execute() {
        const vaultPath = getVaultPath(api.pluginConfig);
        const personalFile = join(vaultPath, "_personal.md");
        if (!existsSync(personalFile)) {
          return {
            content: [{ type: "text" as const, text: "No _personal.md yet." }],
            details: { found: false },
          };
        }
        const text = readFileSync(personalFile, "utf-8");
        return {
          content: [{ type: "text" as const, text }],
          details: { found: true },
        };
      },
    });

    // --- Tool: Add alias to a bucket ---
    api.registerTool({
      name: "clawback_add_alias",
      label: "Add Bucket Alias",
      description:
        "Add a routing alias to a bucket's _bucket.md frontmatter. Use after a ❌ correction " +
        "so the router learns from mistakes. The alias is the original message text that was misrouted.",
      parameters: Type.Object({
        slug: Type.String({ description: "Bucket slug to add the alias to" }),
        alias: Type.String({ description: "Alias text to add" }),
      }),
      async execute(_toolCallId, params) {
        const { slug, alias } = params as { slug: string; alias: string };
        const vaultPath = getVaultPath(api.pluginConfig);
        const result = addAlias(vaultPath, slug, alias);
        return {
          content: [{
            type: "text" as const,
            text: result.added ? `Alias added to ${slug}.` : `Alias already exists on ${slug}.`,
          }],
          details: { added: result.added, alias: result.normalized },
        };
      },
    });

    // --- Tool: Update bucket state ---
    api.registerTool({
      name: "clawback_update_bucket_state",
      label: "Update Bucket State",
      description:
        "Transition a bucket's lifecycle state in _bucket.md frontmatter. " +
        "Valid transitions: active→submitted, submitted→monitoring, monitoring→archived.",
      parameters: Type.Object({
        slug: Type.String({ description: "Bucket slug" }),
        newState: Type.String({
          description: "Target state: submitted, monitoring, or archived",
        }),
      }),
      async execute(_toolCallId, params) {
        const { slug, newState } = params as { slug: string; newState: string };
        validateSlug(slug);
        const validStates = ["active", "submitted", "monitoring", "archived"];
        if (!validStates.includes(newState)) {
          throw new Error(`Invalid state "${newState}". Valid: ${validStates.join(", ")}`);
        }
        const transitions: Record<string, string[]> = {
          active: ["submitted"],
          submitted: ["monitoring"],
          monitoring: ["archived"],
          archived: [],
        };
        const vaultPath = getVaultPath(api.pluginConfig);
        const bucketsBase = join(vaultPath, "OpenClaw", "buckets");
        const bucketFile = join(bucketsBase, slug, "_bucket.md");
        assertWithinBase(bucketsBase, bucketFile);
        if (!existsSync(bucketFile)) {
          throw new Error(`Bucket ${slug} does not exist.`);
        }
        const { data: fm, content: body } = matter(readFileSync(bucketFile, "utf-8"));
        const allowed = transitions[fm.state] ?? [];
        if (!allowed.includes(newState)) {
          throw new Error(
            `Cannot transition ${slug} from "${fm.state}" to "${newState}". ` +
            `Allowed: ${allowed.length > 0 ? allowed.join(", ") : "none (terminal state)"}.`,
          );
        }
        fm.state = newState;
        writeFileSync(bucketFile, stringifyMatter(fm, body));
        return {
          content: [
            { type: "text" as const, text: `${slug} → ${newState}.` },
          ],
          details: { slug, previousState: fm.state, newState },
        };
      },
    });

    // --- Tool: Move last capture between buckets ---
    api.registerTool({
      name: "clawback_move_last_capture",
      label: "Move Last Capture",
      description:
        "Move the most recent capture from one bucket to another. Use for ❌-correction or " +
        "'/move last to <slug>' command. Also adds an alias on the destination bucket so the " +
        "router learns from the correction.",
      parameters: Type.Object({
        fromSlug: Type.String({ description: "Source bucket slug" }),
        toSlug: Type.String({ description: "Destination bucket slug" }),
      }),
      async execute(_toolCallId, params) {
        const { fromSlug, toSlug } = params as { fromSlug: string; toSlug: string };
        const vaultPath = getVaultPath(api.pluginConfig);
        const result = moveLastCapture(vaultPath, fromSlug, toSlug);
        return {
          content: [
            { type: "text" as const, text: `Moved to ${toSlug}. Alias learned.` },
          ],
          details: { fromSlug, toSlug, captureText: result.captureText },
        };
      },
    });

    // --- Tool: Write to future-me sidecar ---
    api.registerTool({
      name: "clawback_write_future_me",
      label: "Write Future-Me",
      description:
        "Write a capture to a bucket's future-me.md when the capture mentions a non-foreground " +
        "bucket. Keeps the user in their current flow without switching context.",
      parameters: Type.Object({
        slug: Type.String({ description: "Bucket slug for the tangent topic" }),
        text: Type.String({ description: "The capture text" }),
      }),
      async execute(_toolCallId, params) {
        const { slug, text } = params as { slug: string; text: string };
        validateSlug(slug);
        const vaultPath = getVaultPath(api.pluginConfig);
        const bucketsBase = join(vaultPath, "OpenClaw", "buckets");
        const bucketDir = join(bucketsBase, slug);
        assertWithinBase(bucketsBase, bucketDir);
        if (!existsSync(bucketDir)) {
          mkdirSync(bucketDir, { recursive: true });
        }
        const futureFile = join(bucketDir, "future-me.md");
        const timestamp = new Date().toISOString();
        const entry = `\n---\n**${timestamp}**\n${text}\n`;
        if (existsSync(futureFile)) {
          appendFileSync(futureFile, entry);
        } else {
          writeFileSync(
            futureFile,
            `# Future Me — ${slug}\n\nTangent captures parked here for later.\n${entry}`,
          );
        }
        return {
          content: [{ type: "text" as const, text: `Parked in ${slug}/future-me.md.` }],
          details: { slug, timestamp },
        };
      },
    });

    // --- Tool: Promote from future-me ---
    api.registerTool({
      name: "clawback_promote_future_me",
      label: "Promote Future-Me Entry",
      description:
        "Promote the most recent entry from a bucket's future-me.md into a new bucket. " +
        "Scaffolds the new bucket, moves the entry to its captures.md, and removes it from " +
        "the source future-me.md. Use on 🎯 reaction or /promote command.",
      parameters: Type.Object({
        sourceSlug: Type.String({ description: "Bucket slug where the future-me entry lives" }),
        newSlug: Type.String({ description: "Slug for the new bucket to create" }),
        description: Type.String({ description: "One-line description for the new bucket" }),
      }),
      async execute(_toolCallId, params) {
        const { sourceSlug, newSlug, description } = params as {
          sourceSlug: string; newSlug: string; description: string;
        };
        const vaultPath = getVaultPath(api.pluginConfig);
        const result = promoteFutureMe(vaultPath, sourceSlug, newSlug, description);
        return {
          content: [
            { type: "text" as const, text: `Promoted to ${newSlug}. 🎯` },
          ],
          details: { sourceSlug, newSlug, captureText: result.captureText },
        };
      },
    });

    // --- Tool: Write watcher alert ---
    api.registerTool({
      name: "clawback_write_watcher",
      label: "Write Watcher Alert",
      description:
        "Append an alert entry to a watcher file (pr-alerts.md or dev-comments.md) in the " +
        "vault's watchers/ directory. Use from pr-watcher and dev-watcher scheduled jobs.",
      parameters: Type.Object({
        filename: Type.String({ description: "Watcher file: pr-alerts.md or dev-comments.md" }),
        entry: Type.String({ description: "Markdown entry to append (include timestamp, details)" }),
      }),
      async execute(_toolCallId, params) {
        const { filename, entry } = params as { filename: string; entry: string };
        const vaultPath = getVaultPath(api.pluginConfig);
        writeWatcher(vaultPath, filename, entry);
        return {
          content: [{ type: "text" as const, text: `Alert written to watchers/${filename}` }],
          details: { filename },
        };
      },
    });

    // --- Tool: Read watcher alerts ---
    api.registerTool({
      name: "clawback_read_watcher",
      label: "Read Watcher Alerts",
      description:
        "Read all entries from a watcher file (pr-alerts.md or dev-comments.md). " +
        "Use from the surface skill to evaluate alerting rules.",
      parameters: Type.Object({
        filename: Type.String({ description: "Watcher file: pr-alerts.md or dev-comments.md" }),
      }),
      async execute(_toolCallId, params) {
        const { filename } = params as { filename: string };
        const vaultPath = getVaultPath(api.pluginConfig);
        const content = readWatcher(vaultPath, filename);
        return {
          content: [{ type: "text" as const, text: content || "No alerts yet." }],
          details: { filename, empty: !content },
        };
      },
    });

    // --- Tool: Write draft ---
    api.registerTool({
      name: "clawback_write_draft",
      label: "Write Draft",
      description:
        "Write a generated draft to a bucket's drafts/ directory. Creates a timestamped file " +
        "like drafts/dev-submission-2026-04-20T14-30-00.md. Use from the draft skill.",
      parameters: Type.Object({
        slug: Type.String({ description: "Bucket slug" }),
        templateName: Type.String({ description: "Template name (e.g., dev-submission)" }),
        content: Type.String({ description: "Full draft content in markdown" }),
      }),
      async execute(_toolCallId, params) {
        const { slug, templateName, content } = params as {
          slug: string; templateName: string; content: string;
        };
        const vaultPath = getVaultPath(api.pluginConfig);
        const filename = writeDraft(vaultPath, slug, templateName, content);
        return {
          content: [{ type: "text" as const, text: `Draft written: ${slug}/drafts/${filename}` }],
          details: { slug, filename },
        };
      },
    });

    // --- Tool: Write conflicts ---
    api.registerTool({
      name: "clawback_write_conflicts",
      label: "Write Conflicts",
      description:
        "Replace _conflicts.md at the vault root with updated conflict entries. Use during " +
        "the memory consolidation pass when contradictions are found that cannot be auto-resolved.",
      parameters: Type.Object({
        content: Type.String({ description: "Full new _conflicts.md content (replaces everything)" }),
      }),
      async execute(_toolCallId, params) {
        const { content } = params as { content: string };
        const vaultPath = getVaultPath(api.pluginConfig);
        writeConflicts(vaultPath, content);
        return {
          content: [{ type: "text" as const, text: "Conflicts file updated." }],
          details: {},
        };
      },
    });

    // --- Tool: Read conflicts ---
    api.registerTool({
      name: "clawback_read_conflicts",
      label: "Read Conflicts",
      description:
        "Read _conflicts.md from the vault root. Use during the consolidation pass to see " +
        "existing unresolved conflicts before writing updates.",
      parameters: Type.Object({}),
      async execute() {
        const vaultPath = getVaultPath(api.pluginConfig);
        const content = readConflicts(vaultPath);
        return {
          content: [{ type: "text" as const, text: content || "No conflicts." }],
          details: { empty: !content },
        };
      },
    });

    // --- Tool: Update last commit timestamp ---
    api.registerTool({
      name: "clawback_update_last_commit",
      label: "Update Last Commit",
      description:
        "Update a bucket's last-commit timestamp in _bucket.md frontmatter. Use from " +
        "pr-watcher after checking the user's latest commit on repos tied to the bucket.",
      parameters: Type.Object({
        slug: Type.String({ description: "Bucket slug" }),
        timestamp: Type.String({ description: "ISO timestamp of the last commit" }),
      }),
      async execute(_toolCallId, params) {
        const { slug, timestamp } = params as { slug: string; timestamp: string };
        const vaultPath = getVaultPath(api.pluginConfig);
        updateLastCommit(vaultPath, slug, timestamp);
        return {
          content: [{ type: "text" as const, text: `${slug} last-commit → ${timestamp}` }],
          details: { slug, timestamp },
        };
      },
    });

    // --- Boot: auto-discover + log manifest on start ---
    api.registerHook("before_agent_start", async () => {
      const vaultPath = getVaultPath(api.pluginConfig);
      const discovered = autoDiscoverBuckets(vaultPath);
      for (const slug of discovered) {
        api.logger.info(`auto-discovered bucket: ${slug}`);
      }
      const manifest = readBucketManifest(vaultPath);
      api.logger.info(`manifest loaded: ${manifest.length} buckets.`);
      for (const b of manifest) {
        api.logger.debug(`  ${b.slug} [${b.state}] — ${b.aliases.length} aliases`);
      }
    }, { name: "clawback_boot" });
  },
});

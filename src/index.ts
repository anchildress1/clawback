import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "@sinclair/typebox";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  validateSlug, assertWithinBase, getVaultPath, getWorkspacePath,
  stringifyMatter,
  readBucketManifest, writeCapture, writeInbox, autoDiscoverBuckets,
  addAlias, moveLastCapture, promoteFutureMe, writeFutureMe, updateLastActivity,
  appendTriageLog, readTriageLog,
  writeFocus, readFocus,
  writePause, readPause, clearPause,
  addHold, removeHold, listHolds,
  appendDailyNote, readDailyNote,
  scaffoldRuntimeAgentsMd,
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
        "Read all bucket metadata from the vault. Returns canonical name, aliases, git_repo, " +
        "vault_refs, last_activity, and 3 most recent captures per bucket. " +
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
        "Use after routing decides the destination bucket. Pass the bucket canonical name and capture text.",
      parameters: Type.Object({
        canonical: Type.String({ description: "Bucket canonical name (folder name)" }),
        text: Type.String({ description: "The capture text to write" }),
      }),
      async execute(_toolCallId, params) {
        const { canonical, text } = params as { canonical: string; text: string };
        const vaultPath = getVaultPath(api.pluginConfig);
        const timestamp = new Date().toISOString();
        writeCapture(vaultPath, canonical, text, timestamp);
        return {
          content: [
            { type: "text" as const, text: `Capture written to ${canonical}/captures.md` },
          ],
          details: { canonical, timestamp },
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
        "Create a new bucket folder in the vault with _bucket.md, captures.md, and memory.md. " +
        "Use when triage discovers a new project or promoting from future-me.",
      parameters: Type.Object({
        canonical: Type.String({
          description: "Bucket canonical name (folder name, lowercase, hyphens)",
        }),
      }),
      async execute(_toolCallId, params) {
        const { canonical } = params as { canonical: string };
        validateSlug(canonical);
        const vaultPath = getVaultPath(api.pluginConfig);
        const bucketsBase = join(vaultPath, "OpenClaw", "buckets");
        const bucketDir = join(bucketsBase, canonical);
        assertWithinBase(bucketsBase, bucketDir);
        if (existsSync(bucketDir)) {
          return {
            content: [
              { type: "text" as const, text: `Bucket ${canonical} already exists.` },
            ],
            details: { created: false },
          };
        }
        mkdirSync(bucketDir, { recursive: true });
        const bucketMd = stringifyMatter(
          { canonical, aliases: [], git_repo: "", vault_refs: [], last_activity: "" },
          `\n# ${canonical}\n`,
        );
        writeFileSync(join(bucketDir, "_bucket.md"), bucketMd);
        writeFileSync(join(bucketDir, "captures.md"), `# Captures — ${canonical}\n`);
        writeFileSync(join(bucketDir, "memory.md"), `# Memory — ${canonical}\n`);
        return {
          content: [
            { type: "text" as const, text: `Bucket ${canonical} scaffolded.` },
          ],
          details: { created: true, canonical },
        };
      },
    });

    // --- Tool: Read bucket status summary ---
    api.registerTool({
      name: "clawback_status",
      label: "Bucket Status",
      description:
        "Get a summary of all buckets — name, capture count, last activity age. " +
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
        const now = Date.now();
        const bucketLines = manifest.map((b) => {
          const capturesFile = join(vaultPath, "OpenClaw", "buckets", b.canonical, "captures.md");
          const totalCaptures = existsSync(capturesFile)
            ? readFileSync(capturesFile, "utf-8").split("\n---\n").filter((chunk) => chunk.includes("**")).length
            : 0;
          const lastAct = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
          const daysIdle = lastAct > 0 ? Math.floor((now - lastAct) / 86_400_000) : -1;
          let idleStr: string;
          if (daysIdle < 0) idleStr = "no activity";
          else if (daysIdle === 0) idleStr = "today";
          else idleStr = `${daysIdle}d idle`;
          return { line: `**${b.canonical}** — ${totalCaptures} captures, ${idleStr}`, daysIdle };
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
        canonical: Type.String({ description: "Bucket canonical name" }),
        content: Type.String({ description: "Full new memory.md content (replaces everything)" }),
      }),
      async execute(_toolCallId, params) {
        const { canonical, content } = params as { canonical: string; content: string };
        validateSlug(canonical);
        const vaultPath = getVaultPath(api.pluginConfig);
        const bucketsBase = join(vaultPath, "OpenClaw", "buckets");
        const bucketDir = join(bucketsBase, canonical);
        assertWithinBase(bucketsBase, bucketDir);
        if (!existsSync(bucketDir)) {
          mkdirSync(bucketDir, { recursive: true });
        }
        const memoryFile = join(bucketDir, "memory.md");
        writeFileSync(memoryFile, content);
        return {
          content: [{ type: "text" as const, text: `Memory updated for ${canonical}.` }],
          details: { canonical },
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
        canonical: Type.String({ description: "Bucket canonical name" }),
        filename: Type.String({
          description: "File to read: memory.md, captures.md, or _bucket.md",
        }),
      }),
      async execute(_toolCallId, params) {
        const { canonical, filename } = params as { canonical: string; filename: string };
        validateSlug(canonical);
        const allowed = ["memory.md", "captures.md", "_bucket.md"];
        if (!allowed.includes(filename)) {
          throw new Error(`Cannot read "${filename}". Allowed: ${allowed.join(", ")}`);
        }
        const vaultPath = getVaultPath(api.pluginConfig);
        const bucketsBase = join(vaultPath, "OpenClaw", "buckets");
        const filePath = join(bucketsBase, canonical, filename);
        assertWithinBase(bucketsBase, filePath);
        if (!existsSync(filePath)) {
          return {
            content: [{ type: "text" as const, text: `File not found: ${canonical}/${filename}` }],
            details: { found: false },
          };
        }
        const text = readFileSync(filePath, "utf-8");
        return {
          content: [{ type: "text" as const, text }],
          details: { found: true, canonical, filename },
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
        "Add a routing alias to a bucket's _bucket.md frontmatter. Use after a text correction " +
        "so the router learns from mistakes. The alias is the original message text that was misrouted.",
      parameters: Type.Object({
        canonical: Type.String({ description: "Bucket canonical name to add the alias to" }),
        alias: Type.String({ description: "Alias text to add" }),
      }),
      async execute(_toolCallId, params) {
        const { canonical, alias } = params as { canonical: string; alias: string };
        const vaultPath = getVaultPath(api.pluginConfig);
        const result = addAlias(vaultPath, canonical, alias);
        return {
          content: [{
            type: "text" as const,
            text: result.added ? `Alias added to ${canonical}.` : `Alias already exists on ${canonical}.`,
          }],
          details: { added: result.added, alias: result.normalized },
        };
      },
    });

    // --- Tool: Move last capture between buckets ---
    api.registerTool({
      name: "clawback_move_last_capture",
      label: "Move Last Capture",
      description:
        "Move the most recent capture from one bucket to another. Use for text-based correction " +
        "('no, wrong bucket') or '/move last to <name>' command.",
      parameters: Type.Object({
        from: Type.String({ description: "Source bucket canonical name" }),
        to: Type.String({ description: "Destination bucket canonical name" }),
      }),
      async execute(_toolCallId, params) {
        const { from, to } = params as { from: string; to: string };
        const vaultPath = getVaultPath(api.pluginConfig);
        const result = moveLastCapture(vaultPath, from, to);
        return {
          content: [
            { type: "text" as const, text: `Moved to ${to}. Alias learned.` },
          ],
          details: { from, to, captureText: result.captureText },
        };
      },
    });

    // --- Tool: Write to future-me (flat file at vault root) ---
    api.registerTool({
      name: "clawback_write_future_me",
      label: "Write Future-Me",
      description:
        "Park a tangent capture in vault-root future-me.md. Use when the capture mentions a " +
        "non-foreground bucket. Keeps the user in their current flow without switching context.",
      parameters: Type.Object({
        text: Type.String({ description: "The capture text" }),
        bucketHint: Type.String({ description: "Which bucket this tangent relates to" }),
      }),
      async execute(_toolCallId, params) {
        const { text, bucketHint } = params as { text: string; bucketHint: string };
        const vaultPath = getVaultPath(api.pluginConfig);
        const timestamp = new Date().toISOString();
        writeFutureMe(vaultPath, text, bucketHint, timestamp);
        return {
          content: [{ type: "text" as const, text: `Parked in future-me.md [${bucketHint}].` }],
          details: { bucketHint, timestamp },
        };
      },
    });

    // --- Tool: Promote from future-me ---
    api.registerTool({
      name: "clawback_promote_future_me",
      label: "Promote Future-Me Entry",
      description:
        "Promote the most recent entry from vault-root future-me.md into a new bucket. " +
        "Scaffolds the new bucket, moves the entry to its captures.md, and removes it from " +
        "future-me.md. Use on /promote command.",
      parameters: Type.Object({
        newCanonical: Type.String({ description: "Canonical name for the new bucket to create" }),
      }),
      async execute(_toolCallId, params) {
        const { newCanonical } = params as { newCanonical: string };
        const vaultPath = getVaultPath(api.pluginConfig);
        const result = promoteFutureMe(vaultPath, newCanonical);
        return {
          content: [
            { type: "text" as const, text: `Promoted to ${newCanonical}.` },
          ],
          details: { newCanonical, captureText: result.captureText },
        };
      },
    });

    // --- Tool: Update last activity timestamp ---
    api.registerTool({
      name: "clawback_update_last_activity",
      label: "Update Last Activity",
      description:
        "Update a bucket's last_activity timestamp in _bucket.md frontmatter. " +
        "Called automatically on capture writes; also usable from dispatcher jobs.",
      parameters: Type.Object({
        canonical: Type.String({ description: "Bucket canonical name" }),
        timestamp: Type.String({ description: "ISO timestamp of the activity" }),
      }),
      async execute(_toolCallId, params) {
        const { canonical, timestamp } = params as { canonical: string; timestamp: string };
        const vaultPath = getVaultPath(api.pluginConfig);
        updateLastActivity(vaultPath, canonical, timestamp);
        return {
          content: [{ type: "text" as const, text: `${canonical} last_activity → ${timestamp}` }],
          details: { canonical, timestamp },
        };
      },
    });

    // --- Tool: Append to triage log ---
    api.registerTool({
      name: "clawback_append_triage_log",
      label: "Append Triage Log",
      description:
        "Log a triage decision. Every capture/route/correction gets a row. " +
        "Feeds pattern-review and enables reversal.",
      parameters: Type.Object({
        raw: Type.String({ description: "Original message text" }),
        classification: Type.String({ description: "capture, command, question, or correction" }),
        target: Type.String({ description: "Target file or bucket" }),
        action: Type.String({ description: "What was done (wrote, routed, moved, asked)" }),
      }),
      async execute(_toolCallId, params) {
        const { raw, classification, target, action } = params as {
          raw: string; classification: string; target: string; action: string;
        };
        const workspacePath = getWorkspacePath(api.pluginConfig);
        appendTriageLog(workspacePath, {
          timestamp: new Date().toISOString(),
          raw, classification, target, action,
        });
        return {
          content: [{ type: "text" as const, text: "Triage decision logged." }],
          details: {},
        };
      },
    });

    // --- Tool: Read triage log ---
    api.registerTool({
      name: "clawback_read_triage_log",
      label: "Read Triage Log",
      description:
        "Read the full triage log. Use to find prior writes for correction, " +
        "or from pattern-review to analyze routing patterns.",
      parameters: Type.Object({}),
      async execute() {
        const workspacePath = getWorkspacePath(api.pluginConfig);
        const content = readTriageLog(workspacePath);
        return {
          content: [{ type: "text" as const, text: content || "No triage log entries yet." }],
          details: { empty: !content },
        };
      },
    });

    // --- Tool: Write focus ---
    api.registerTool({
      name: "clawback_write_focus",
      label: "Write Focus",
      description:
        "Set the agent's current focus state. Mode (idle/drafting/watching), active bucket, " +
        "artifact ref, start timestamp. Decays to idle after 8.25 min silence.",
      parameters: Type.Object({
        mode: Type.String({ description: "idle, drafting, or watching" }),
        activeBucket: Type.String({ description: "Canonical name of focused bucket" }),
        artifactRef: Type.Optional(Type.String({ description: "Artifact being worked on" })),
      }),
      async execute(_toolCallId, params) {
        const { mode, activeBucket, artifactRef } = params as {
          mode: string; activeBucket: string; artifactRef?: string;
        };
        const workspacePath = getWorkspacePath(api.pluginConfig);
        writeFocus(workspacePath, {
          mode: mode as "idle" | "drafting" | "watching",
          activeBucket,
          artifactRef: artifactRef || "",
          startedAt: new Date().toISOString(),
        });
        return {
          content: [{ type: "text" as const, text: `Focus → ${mode} on ${activeBucket}` }],
          details: { mode, activeBucket },
        };
      },
    });

    // --- Tool: Read focus ---
    api.registerTool({
      name: "clawback_read_focus",
      label: "Read Focus",
      description: "Read the current focus state (mode, active bucket, start time).",
      parameters: Type.Object({}),
      async execute() {
        const workspacePath = getWorkspacePath(api.pluginConfig);
        const focus = readFocus(workspacePath);
        if (!focus) {
          return {
            content: [{ type: "text" as const, text: "No focus set (idle)." }],
            details: { mode: "idle" },
          };
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(focus, null, 2) }],
          details: { ...focus },
        };
      },
    });

    // --- Tool: Write pause ---
    api.registerTool({
      name: "clawback_write_pause",
      label: "Write Pause",
      description:
        "Pause the agent. Dispatcher and agent check pause.md before any unsolicited message. " +
        "User resumes with 'ok'.",
      parameters: Type.Object({
        expiry: Type.String({ description: "ISO timestamp when pause expires" }),
      }),
      async execute(_toolCallId, params) {
        const { expiry } = params as { expiry: string };
        const workspacePath = getWorkspacePath(api.pluginConfig);
        writePause(workspacePath, expiry);
        return {
          content: [{ type: "text" as const, text: "Paused." }],
          details: { expiry },
        };
      },
    });

    // --- Tool: Read pause ---
    api.registerTool({
      name: "clawback_read_pause",
      label: "Read Pause",
      description: "Check if the agent is paused and when the pause expires.",
      parameters: Type.Object({}),
      async execute() {
        const workspacePath = getWorkspacePath(api.pluginConfig);
        const expiry = readPause(workspacePath);
        if (!expiry) {
          return {
            content: [{ type: "text" as const, text: "Not paused." }],
            details: { paused: false },
          };
        }
        return {
          content: [{ type: "text" as const, text: `Paused until ${expiry}` }],
          details: { paused: true, expiry },
        };
      },
    });

    // --- Tool: Clear pause ---
    api.registerTool({
      name: "clawback_clear_pause",
      label: "Clear Pause",
      description: "Resume the agent by clearing pause.md. Use when user says 'ok'.",
      parameters: Type.Object({}),
      async execute() {
        const workspacePath = getWorkspacePath(api.pluginConfig);
        const cleared = clearPause(workspacePath);
        return {
          content: [{ type: "text" as const, text: cleared ? "Resumed." : "Was not paused." }],
          details: { cleared },
        };
      },
    });

    // --- Tool: Add hold ---
    api.registerTool({
      name: "clawback_add_hold",
      label: "Add Hold",
      description:
        "Mark a path the agent must not touch. Ephemeral (session) by default; " +
        "persistent if user says 'remember that'.",
      parameters: Type.Object({
        path: Type.String({ description: "File or directory path to hold" }),
        persistent: Type.Optional(Type.Boolean({ description: "True to persist across sessions" })),
      }),
      async execute(_toolCallId, params) {
        const { path, persistent } = params as { path: string; persistent?: boolean };
        const workspacePath = getWorkspacePath(api.pluginConfig);
        addHold(workspacePath, path, persistent ?? false);
        return {
          content: [{ type: "text" as const, text: `Hold added: ${path}${persistent ? " (persistent)" : ""}` }],
          details: { path, persistent: persistent ?? false },
        };
      },
    });

    // --- Tool: Remove hold ---
    api.registerTool({
      name: "clawback_remove_hold",
      label: "Remove Hold",
      description: "Remove a hold on a path, allowing the agent to touch it again.",
      parameters: Type.Object({
        path: Type.String({ description: "File or directory path to unhold" }),
      }),
      async execute(_toolCallId, params) {
        const { path } = params as { path: string };
        const workspacePath = getWorkspacePath(api.pluginConfig);
        const removed = removeHold(workspacePath, path);
        return {
          content: [{ type: "text" as const, text: removed ? `Hold removed: ${path}` : `No hold on ${path}` }],
          details: { removed },
        };
      },
    });

    // --- Tool: List holds ---
    api.registerTool({
      name: "clawback_list_holds",
      label: "List Holds",
      description: "List all active holds (paths the agent must not touch).",
      parameters: Type.Object({}),
      async execute() {
        const workspacePath = getWorkspacePath(api.pluginConfig);
        const holds = listHolds(workspacePath);
        if (holds.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No holds." }],
            details: { count: 0 },
          };
        }
        const lines = holds.map((h) => `- ${h.path}${h.persistent ? " (persistent)" : ""}`);
        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          details: { count: holds.length },
        };
      },
    });

    // --- Tool: Append daily note ---
    api.registerTool({
      name: "clawback_append_daily_note",
      label: "Append Daily Note",
      description:
        "Append an entry to today's daily note (memory/YYYY-MM-DD.md). " +
        "Focus changes and triage log entries roll in here.",
      parameters: Type.Object({
        entry: Type.String({ description: "Markdown content to append" }),
        date: Type.Optional(Type.String({ description: "Date (YYYY-MM-DD). Defaults to today." })),
      }),
      async execute(_toolCallId, params) {
        const { entry, date } = params as { entry: string; date?: string };
        const workspacePath = getWorkspacePath(api.pluginConfig);
        const d = date || new Date().toISOString().slice(0, 10);
        appendDailyNote(workspacePath, d, entry);
        return {
          content: [{ type: "text" as const, text: `Appended to daily note ${d}.` }],
          details: { date: d },
        };
      },
    });

    // --- Tool: Read daily note ---
    api.registerTool({
      name: "clawback_read_daily_note",
      label: "Read Daily Note",
      description: "Read a daily note by date.",
      parameters: Type.Object({
        date: Type.String({ description: "Date (YYYY-MM-DD)" }),
      }),
      async execute(_toolCallId, params) {
        const { date } = params as { date: string };
        const workspacePath = getWorkspacePath(api.pluginConfig);
        const content = readDailyNote(workspacePath, date);
        return {
          content: [{ type: "text" as const, text: content || `No daily note for ${date}.` }],
          details: { date, empty: !content },
        };
      },
    });

    // --- Boot: auto-discover + log manifest + scaffold runtime AGENTS.md ---
    api.registerHook("before_agent_start", async () => {
      const vaultPath = getVaultPath(api.pluginConfig);
      const workspacePath = getWorkspacePath(api.pluginConfig);

      // Scaffold runtime AGENTS.md if missing
      if (scaffoldRuntimeAgentsMd(workspacePath)) {
        api.logger.info("scaffolded runtime AGENTS.md");
      }

      const discovered = autoDiscoverBuckets(vaultPath);
      for (const canonical of discovered) {
        api.logger.info(`auto-discovered bucket: ${canonical}`);
      }
      const manifest = readBucketManifest(vaultPath);
      api.logger.info(`manifest loaded: ${manifest.length} buckets.`);
      for (const b of manifest) {
        api.logger.debug(`  ${b.canonical} — ${b.aliases.length} aliases`);
      }
    }, { name: "clawback_boot" });
  },
});

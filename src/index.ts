import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "@sinclair/typebox";
import { readFileSync, writeFileSync, appendFileSync, readdirSync, existsSync, mkdirSync, statSync } from "fs";
import { join, resolve, relative, sep } from "path";
import { homedir } from "os";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function validateSlug(slug: string): void {
  if (!SLUG_PATTERN.test(slug) || slug.length > 64) {
    throw new Error(`Invalid slug: "${slug}". Must match /^[a-z0-9][a-z0-9-]*$/ and be ≤64 chars.`);
  }
}

function assertWithinBase(basePath: string, targetPath: string): void {
  const resolved = resolve(targetPath);
  const base = resolve(basePath);
  if (resolved === base) return;
  const rel = relative(base, resolved);
  if (rel.startsWith("..") || rel.startsWith(sep) || /^[a-zA-Z]:/.test(rel)) {
    throw new Error(`Path traversal blocked: ${resolved} is outside ${base}`);
  }
}

function getVaultPath(pluginConfig: Record<string, unknown>): string {
  const raw = (pluginConfig.vaultPath as string) || "~/clawback-vault";
  return raw.replace(/^~/, homedir());
}

interface BucketManifestEntry {
  slug: string;
  description: string;
  aliases: string[];
  state: string;
  lastCommit: string;
  repos: string[];
  recentCaptures: string[];
}

function readBucketManifest(vaultPath: string): BucketManifestEntry[] {
  const bucketsDir = join(vaultPath, "OpenClaw", "buckets");
  if (!existsSync(bucketsDir)) return [];

  const entries: BucketManifestEntry[] = [];
  for (const slug of readdirSync(bucketsDir, { withFileTypes: true })) {
    if (!slug.isDirectory()) continue;
    const bucketFile = join(bucketsDir, slug.name, "_bucket.md");
    if (!existsSync(bucketFile)) continue;

    const { data: fm } = matter(readFileSync(bucketFile, "utf-8"));
    const capturesFile = join(bucketsDir, slug.name, "captures.md");
    const recentCaptures = existsSync(capturesFile)
      ? readFileSync(capturesFile, "utf-8")
          .split("\n---\n")
          .filter((chunk) => chunk.includes("**"))
          .slice(-3)
      : [];

    entries.push({
      slug: slug.name,
      description: fm.description,
      aliases: fm.aliases,
      state: fm.state,
      lastCommit: fm["last-commit"],
      repos: fm.repos,
      recentCaptures,
    });
  }
  return entries;
}

interface BucketFrontmatter {
  [key: string]: unknown;
  slug: string;
  description: string;
  aliases: string[];
  state: string;
  "last-commit": string;
  repos: string[];
}

const BUCKET_DEFAULTS: BucketFrontmatter = {
  slug: "",
  description: "",
  aliases: [],
  state: "active",
  "last-commit": "",
  repos: [],
};

interface MatterResult {
  data: BucketFrontmatter;
  content: string;
}

function matter(input: string): MatterResult {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(input);
  if (!match) return { data: { ...BUCKET_DEFAULTS }, content: input };
  const raw = parseYaml(match[1]) ?? {};
  return {
    data: { ...BUCKET_DEFAULTS, ...raw },
    content: input.slice(match[0].length),
  };
}

function stringifyMatter(data: Record<string, unknown>, content: string): string {
  return `---\n${stringifyYaml(data).trim()}\n---${content}`;
}

function writeCapture(
  vaultPath: string,
  slug: string,
  text: string,
  timestamp: string,
): void {
  validateSlug(slug);
  const bucketsBase = join(vaultPath, "OpenClaw", "buckets");
  const bucketDir = join(bucketsBase, slug);
  assertWithinBase(bucketsBase, bucketDir);
  if (!existsSync(bucketDir)) {
    mkdirSync(bucketDir, { recursive: true });
  }
  const capturesFile = join(bucketDir, "captures.md");
  const entry = `\n---\n**${timestamp}**\n${text}\n`;
  if (existsSync(capturesFile)) {
    appendFileSync(capturesFile, entry);
  } else {
    writeFileSync(capturesFile, `# Captures — ${slug}\n${entry}`);
  }
}

function writeInbox(vaultPath: string, text: string, timestamp: string): void {
  const inboxFile = join(vaultPath, "_inbox.md");
  const entry = `\n---\n**${timestamp}**\n${text}\n`;
  if (existsSync(inboxFile)) {
    appendFileSync(inboxFile, entry);
  } else {
    writeFileSync(
      inboxFile,
      `# Inbox\n\nLow-confidence captures. Review and route manually or correct with ❌.\n${entry}`,
    );
  }
}

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
        validateSlug(slug);
        const vaultPath = getVaultPath(api.pluginConfig);
        const bucketsBase = join(vaultPath, "OpenClaw", "buckets");
        const bucketFile = join(bucketsBase, slug, "_bucket.md");
        assertWithinBase(bucketsBase, bucketFile);
        if (!existsSync(bucketFile)) {
          throw new Error(`Bucket ${slug} does not exist.`);
        }
        const { data: fm, content: body } = matter(readFileSync(bucketFile, "utf-8"));
        const normalized = alias.toLowerCase().trim();
        if (fm.aliases.includes(normalized)) {
          return {
            content: [{ type: "text" as const, text: `Alias already exists on ${slug}.` }],
            details: { added: false },
          };
        }
        fm.aliases.push(normalized);
        writeFileSync(bucketFile, stringifyMatter(fm, body));
        return {
          content: [{ type: "text" as const, text: `Alias added to ${slug}.` }],
          details: { added: true, alias: normalized },
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
        validateSlug(fromSlug);
        validateSlug(toSlug);
        const vaultPath = getVaultPath(api.pluginConfig);
        const bucketsBase = join(vaultPath, "OpenClaw", "buckets");
        const fromCapturesFile = join(bucketsBase, fromSlug, "captures.md");
        assertWithinBase(bucketsBase, fromCapturesFile);

        if (!existsSync(fromCapturesFile)) {
          throw new Error(`No captures found in ${fromSlug}.`);
        }

        const content = readFileSync(fromCapturesFile, "utf-8");
        const chunks = content.split("\n---\n");
        const captureChunks = chunks.filter((chunk) => chunk.includes("**"));
        if (captureChunks.length === 0) {
          throw new Error(`No captures to move in ${fromSlug}.`);
        }

        const lastCapture = captureChunks[captureChunks.length - 1];
        // Remove last capture from source
        const lastIndex = chunks.lastIndexOf(lastCapture);
        chunks.splice(lastIndex, 1);
        writeFileSync(fromCapturesFile, chunks.join("\n---\n"));

        // Extract timestamp and text from the capture
        const tsMatch = RegExp(/\*\*(.+?)\*\*/).exec(lastCapture);
        const timestamp = tsMatch ? tsMatch[1] : new Date().toISOString();
        const captureText = lastCapture.replace(/\*\*.*?\*\*\n?/, "").trim();

        // Write to destination
        writeCapture(vaultPath, toSlug, captureText, timestamp);

        return {
          content: [
            { type: "text" as const, text: `Moved to ${toSlug}. Alias learned.` },
          ],
          details: { fromSlug, toSlug, captureText },
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

    // --- Boot: log manifest on start ---
    api.registerHook("before_agent_start", async () => {
      const vaultPath = getVaultPath(api.pluginConfig);
      const manifest = readBucketManifest(vaultPath);
      api.logger.info(`manifest loaded: ${manifest.length} buckets.`);
      for (const b of manifest) {
        api.logger.debug(`  ${b.slug} [${b.state}] — ${b.aliases.length} aliases`);
      }
    }, { name: "clawback_boot" });
  },
});

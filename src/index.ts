import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "@sinclair/typebox";
import { execFileSync } from "child_process";
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from "fs";
import { join, resolve } from "path";
import yaml from "js-yaml";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function validateSlug(slug: string): void {
  if (!SLUG_PATTERN.test(slug) || slug.length > 64) {
    throw new Error(`Invalid slug: "${slug}". Must match /^[a-z0-9][a-z0-9-]*$/ and be ≤64 chars.`);
  }
}

function assertWithinBase(basePath: string, targetPath: string): void {
  const resolved = resolve(targetPath);
  const base = resolve(basePath);
  if (!resolved.startsWith(base + "/") && resolved !== base) {
    throw new Error(`Path traversal blocked: ${resolved} is outside ${base}`);
  }
}

function getVaultPath(config: Record<string, unknown>): string {
  const raw = (config.vaultPath as string) || "~/clawback-vault";
  return raw.replace(/^~/, process.env.HOME || "");
}

function vaultSync(vaultPath: string, message: string): { ok: boolean; error?: string } {
  try {
    // Commit local changes first (capture writes dirty the worktree before sync is called)
    execFileSync("git", ["add", "-A"], { cwd: vaultPath, stdio: "pipe" });
    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd: vaultPath,
      encoding: "utf-8",
    });
    if (status.trim()) {
      execFileSync("git", ["commit", "-m", message], { cwd: vaultPath, stdio: "pipe" });
    }
    // Then pull with autostash to handle any remote changes
    execFileSync("git", ["pull", "--rebase", "--autostash"], { cwd: vaultPath, stdio: "pipe" });
    execFileSync("git", ["push"], { cwd: vaultPath, stdio: "pipe" });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
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

    const content = readFileSync(bucketFile, "utf-8");
    const frontmatter = parseFrontmatter(content);
    const capturesFile = join(bucketsDir, slug.name, "captures.md");
    const recentCaptures = existsSync(capturesFile)
      ? readFileSync(capturesFile, "utf-8")
          .split("\n---\n")
          .filter((chunk) => chunk.includes("**"))  // captures have **timestamp** — skip heading preamble
          .slice(-3)
      : [];

    entries.push({
      slug: slug.name,
      description: frontmatter.description,
      aliases: frontmatter.aliases,
      state: frontmatter.state,
      lastCommit: frontmatter["last-commit"],
      repos: frontmatter.repos,
      recentCaptures,
    });
  }
  return entries;
}

interface BucketFrontmatter {
  description: string;
  aliases: string[];
  state: string;
  "last-commit": string;
  repos: string[];
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function parseFrontmatter(content: string): BucketFrontmatter {
  const defaults: BucketFrontmatter = {
    description: "",
    aliases: [],
    state: "active",
    "last-commit": "",
    repos: [],
  };
  const match = RegExp(/^---\n([\s\S]*?)\n---/).exec(content);
  if (!match) return defaults;

  let raw: Record<string, unknown>;
  try {
    raw = (yaml.load(match[1]) as Record<string, unknown>) ?? {};
  } catch {
    return defaults;
  }

  return {
    description: typeof raw["description"] === "string" ? raw["description"] : defaults.description,
    aliases: toStringArray(raw["aliases"]),
    state: typeof raw["state"] === "string" ? raw["state"] : defaults.state,
    "last-commit": typeof raw["last-commit"] === "string" ? raw["last-commit"] : defaults["last-commit"],
    repos: toStringArray(raw["repos"]),
  };
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
    const existing = readFileSync(capturesFile, "utf-8");
    writeFileSync(capturesFile, existing + entry);
  } else {
    writeFileSync(capturesFile, `# Captures — ${slug}\n${entry}`);
  }
}

function writeInbox(vaultPath: string, text: string, timestamp: string): void {
  const inboxFile = join(vaultPath, "_inbox.md");
  const entry = `\n---\n**${timestamp}**\n${text}\n`;
  if (existsSync(inboxFile)) {
    const existing = readFileSync(inboxFile, "utf-8");
    writeFileSync(inboxFile, existing + entry);
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
        const vaultPath = getVaultPath(api.getConfig());
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
        const vaultPath = getVaultPath(api.getConfig());
        const timestamp = new Date().toISOString();
        writeCapture(vaultPath, params.slug, params.text, timestamp);
        return {
          content: [
            { type: "text" as const, text: `Capture written to ${params.slug}/captures.md` },
          ],
          details: { slug: params.slug, timestamp },
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
        const vaultPath = getVaultPath(api.getConfig());
        const timestamp = new Date().toISOString();
        writeInbox(vaultPath, params.text, timestamp);
        return {
          content: [{ type: "text" as const, text: "Capture written to _inbox.md" }],
          details: { timestamp },
        };
      },
    });

    // --- Tool: Sync vault (git pull/commit/push) ---
    api.registerTool({
      name: "clawback_vault_sync",
      label: "Sync Vault",
      description:
        "Sync the Obsidian vault via git — pulls latest, commits pending changes, pushes. " +
        "Call this AFTER writing captures or updating memory to persist changes. " +
        "Obsidian picks up changes via its git plugin.",
      parameters: Type.Object({
        message: Type.String({ description: "Git commit message" }),
      }),
      async execute(_toolCallId, params) {
        const vaultPath = getVaultPath(api.getConfig());
        const result = vaultSync(vaultPath, params.message);
        return {
          content: [
            {
              type: "text" as const,
              text: result.ok ? "Vault synced." : `Sync failed: ${result.error}`,
            },
          ],
          details: result,
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
        validateSlug(params.slug);
        const vaultPath = getVaultPath(api.getConfig());
        const bucketsBase = join(vaultPath, "OpenClaw", "buckets");
        const bucketDir = join(bucketsBase, params.slug);
        assertWithinBase(bucketsBase, bucketDir);
        if (existsSync(bucketDir)) {
          return {
            content: [
              { type: "text" as const, text: `Bucket ${params.slug} already exists.` },
            ],
            details: { created: false },
          };
        }
        mkdirSync(bucketDir, { recursive: true });
        const frontmatter = [
          "---",
          `slug: ${params.slug}`,
          `description: ${params.description}`,
          "aliases: []",
          "state: active",
          "last-commit: ",
          "repos: []",
          "---",
          "",
          `# ${params.slug}`,
          "",
          params.description,
          "",
        ].join("\n");
        writeFileSync(join(bucketDir, "_bucket.md"), frontmatter);
        writeFileSync(join(bucketDir, "captures.md"), `# Captures — ${params.slug}\n`);
        writeFileSync(join(bucketDir, "memory.md"), `# Memory — ${params.slug}\n`);
        writeFileSync(
          join(bucketDir, "future-me.md"),
          `# Future Me — ${params.slug}\n\nTangent captures parked here for later.\n`,
        );
        return {
          content: [
            { type: "text" as const, text: `Bucket ${params.slug} scaffolded.` },
          ],
          details: { created: true, slug: params.slug },
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
        const vaultPath = getVaultPath(api.getConfig());
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
          const capturesFile = join(getVaultPath(api.getConfig()), "OpenClaw", "buckets", b.slug, "captures.md");
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

    // --- Boot: log manifest on start ---
    api.registerHook("before_agent_start", async () => {
      const vaultPath = getVaultPath(api.getConfig());
      const manifest = readBucketManifest(vaultPath);
      console.log(`[clawback] manifest loaded: ${manifest.length} buckets.`);
      for (const b of manifest) {
        console.log(`  ${b.slug} [${b.state}] — ${b.aliases.length} aliases`);
      }
    });
  },
});

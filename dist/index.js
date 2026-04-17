import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "@sinclair/typebox";
import { readFileSync, writeFileSync, appendFileSync, readdirSync, existsSync, mkdirSync, statSync } from "fs";
import { join, resolve, relative, sep } from "path";
import { homedir } from "os";
import yaml from "js-yaml";
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
function validateSlug(slug) {
    if (!SLUG_PATTERN.test(slug) || slug.length > 64) {
        throw new Error(`Invalid slug: "${slug}". Must match /^[a-z0-9][a-z0-9-]*$/ and be ≤64 chars.`);
    }
}
function assertWithinBase(basePath, targetPath) {
    const resolved = resolve(targetPath);
    const base = resolve(basePath);
    if (resolved === base)
        return;
    const rel = relative(base, resolved);
    if (rel.startsWith("..") || rel.startsWith(sep) || /^[a-zA-Z]:/.test(rel)) {
        throw new Error(`Path traversal blocked: ${resolved} is outside ${base}`);
    }
}
function getVaultPath(pluginConfig) {
    const raw = pluginConfig.vaultPath || "~/clawback-vault";
    return raw.replace(/^~/, homedir());
}
function readBucketManifest(vaultPath) {
    const bucketsDir = join(vaultPath, "OpenClaw", "buckets");
    if (!existsSync(bucketsDir))
        return [];
    const entries = [];
    for (const slug of readdirSync(bucketsDir, { withFileTypes: true })) {
        if (!slug.isDirectory())
            continue;
        const bucketFile = join(bucketsDir, slug.name, "_bucket.md");
        if (!existsSync(bucketFile))
            continue;
        const content = readFileSync(bucketFile, "utf-8");
        const frontmatter = parseFrontmatter(content);
        const capturesFile = join(bucketsDir, slug.name, "captures.md");
        const recentCaptures = existsSync(capturesFile)
            ? readFileSync(capturesFile, "utf-8")
                .split("\n---\n")
                .filter((chunk) => chunk.includes("**")) // captures have **timestamp** — skip heading preamble
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
function toStringArray(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter((v) => typeof v === "string");
}
function parseFrontmatter(content) {
    const defaults = {
        description: "",
        aliases: [],
        state: "active",
        "last-commit": "",
        repos: [],
    };
    const match = RegExp(/^---\r?\n([\s\S]*?)\r?\n---/).exec(content);
    if (!match)
        return defaults;
    let raw;
    try {
        raw = yaml.load(match[1]) ?? {};
    }
    catch {
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
function writeCapture(vaultPath, slug, text, timestamp) {
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
    }
    else {
        writeFileSync(capturesFile, `# Captures — ${slug}\n${entry}`);
    }
}
function writeInbox(vaultPath, text, timestamp) {
    const inboxFile = join(vaultPath, "_inbox.md");
    const entry = `\n---\n**${timestamp}**\n${text}\n`;
    if (existsSync(inboxFile)) {
        appendFileSync(inboxFile, entry);
    }
    else {
        writeFileSync(inboxFile, `# Inbox\n\nLow-confidence captures. Review and route manually or correct with ❌.\n${entry}`);
    }
}
export default definePluginEntry({
    id: "clawback",
    name: "Clawback",
    description: "Routes Discord captures into an Obsidian vault by project bucket with learning memory.",
    register(api) {
        // --- Tool: Read bucket manifest ---
        api.registerTool({
            name: "clawback_read_manifest",
            label: "Read Bucket Manifest",
            description: "Read all bucket metadata from the vault. Returns slug, description, aliases, state, " +
                "last-commit timestamp, configured repos, and 3 most recent captures per bucket. " +
                "Use this before routing a capture to see what buckets exist.",
            parameters: Type.Object({}),
            async execute() {
                const vaultPath = getVaultPath(api.pluginConfig);
                const manifest = readBucketManifest(vaultPath);
                return {
                    content: [{ type: "text", text: JSON.stringify(manifest, null, 2) }],
                    details: { bucketCount: manifest.length },
                };
            },
        });
        // --- Tool: Write capture to a bucket ---
        api.registerTool({
            name: "clawback_write_capture",
            label: "Write Capture",
            description: "Write a capture to a specific bucket's captures.md file in the vault. " +
                "Use after routing decides the destination bucket. Pass the bucket slug and capture text.",
            parameters: Type.Object({
                slug: Type.String({ description: "Bucket slug (folder name)" }),
                text: Type.String({ description: "The capture text to write" }),
            }),
            async execute(_toolCallId, params) {
                const { slug, text } = params;
                const vaultPath = getVaultPath(api.pluginConfig);
                const timestamp = new Date().toISOString();
                writeCapture(vaultPath, slug, text, timestamp);
                return {
                    content: [
                        { type: "text", text: `Capture written to ${slug}/captures.md` },
                    ],
                    details: { slug, timestamp },
                };
            },
        });
        // --- Tool: Write to inbox (low confidence) ---
        api.registerTool({
            name: "clawback_write_inbox",
            label: "Write to Inbox",
            description: "Write a capture to _inbox.md when routing confidence is low and no bucket matches. " +
                "Use this instead of clawback_write_capture when the route skill returns low confidence.",
            parameters: Type.Object({
                text: Type.String({ description: "The capture text to write" }),
            }),
            async execute(_toolCallId, params) {
                const { text } = params;
                const vaultPath = getVaultPath(api.pluginConfig);
                const timestamp = new Date().toISOString();
                writeInbox(vaultPath, text, timestamp);
                return {
                    content: [{ type: "text", text: "Capture written to _inbox.md" }],
                    details: { timestamp },
                };
            },
        });
        // --- Tool: Scaffold a new bucket ---
        api.registerTool({
            name: "clawback_scaffold_bucket",
            label: "Scaffold Bucket",
            description: "Create a new bucket folder in the vault with _bucket.md, captures.md, memory.md, " +
                "and future-me.md. Use when routing discovers a new project or promoting from future-me.",
            parameters: Type.Object({
                slug: Type.String({
                    description: "Bucket slug (folder name, lowercase, hyphens)",
                }),
                description: Type.String({ description: "One-line bucket description" }),
            }),
            async execute(_toolCallId, params) {
                const { slug, description } = params;
                validateSlug(slug);
                const vaultPath = getVaultPath(api.pluginConfig);
                const bucketsBase = join(vaultPath, "OpenClaw", "buckets");
                const bucketDir = join(bucketsBase, slug);
                assertWithinBase(bucketsBase, bucketDir);
                if (existsSync(bucketDir)) {
                    return {
                        content: [
                            { type: "text", text: `Bucket ${slug} already exists.` },
                        ],
                        details: { created: false },
                    };
                }
                mkdirSync(bucketDir, { recursive: true });
                const frontmatter = [
                    "---",
                    `slug: ${slug}`,
                    `description: ${description}`,
                    "aliases: []",
                    "state: active",
                    "last-commit: ",
                    "repos: []",
                    "---",
                    "",
                    `# ${slug}`,
                    "",
                    description,
                    "",
                ].join("\n");
                writeFileSync(join(bucketDir, "_bucket.md"), frontmatter);
                writeFileSync(join(bucketDir, "captures.md"), `# Captures — ${slug}\n`);
                writeFileSync(join(bucketDir, "memory.md"), `# Memory — ${slug}\n`);
                writeFileSync(join(bucketDir, "future-me.md"), `# Future Me — ${slug}\n\nTangent captures parked here for later.\n`);
                return {
                    content: [
                        { type: "text", text: `Bucket ${slug} scaffolded.` },
                    ],
                    details: { created: true, slug },
                };
            },
        });
        // --- Tool: Read bucket status summary ---
        api.registerTool({
            name: "clawback_status",
            label: "Bucket Status",
            description: "Get a summary of all buckets — name, state, capture count, days idle. " +
                "Use when the user asks for status, overview, or 'how are things'.",
            parameters: Type.Object({}),
            async execute() {
                const vaultPath = getVaultPath(api.pluginConfig);
                const manifest = readBucketManifest(vaultPath);
                if (manifest.length === 0) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: "No buckets yet. Send a capture to get started.",
                            },
                        ],
                        details: { bucketCount: 0 },
                    };
                }
                const stateEmoji = {
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
                    let idleStr;
                    if (daysIdle < 0)
                        idleStr = "no captures";
                    else if (daysIdle === 0)
                        idleStr = "today";
                    else
                        idleStr = `${daysIdle}d idle`;
                    return { line: `${emoji} **${b.slug}** [${b.state}] — ${totalCaptures} captures, ${idleStr}`, daysIdle };
                });
                bucketLines.sort((a, b) => b.daysIdle - a.daysIdle);
                const lines = bucketLines.map((b) => b.line);
                return {
                    content: [{ type: "text", text: lines.join("\n") }],
                    details: { bucketCount: manifest.length },
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

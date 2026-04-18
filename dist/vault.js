import { readFileSync, writeFileSync, appendFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve, relative, sep } from "node:path";
import { homedir } from "node:os";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
// --- Slug validation ---
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
export function validateSlug(slug) {
    if (!SLUG_PATTERN.test(slug) || slug.length > 64) {
        throw new Error(`Invalid slug: "${slug}". Must match /^[a-z0-9][a-z0-9-]*$/ and be ≤64 chars.`);
    }
}
// --- Path safety ---
export function assertWithinBase(basePath, targetPath) {
    const resolved = resolve(targetPath);
    const base = resolve(basePath);
    if (resolved === base)
        return;
    const rel = relative(base, resolved);
    if (rel.startsWith("..") || rel.startsWith(sep) || /^[a-zA-Z]:/.test(rel)) {
        throw new Error(`Path traversal blocked: ${resolved} is outside ${base}`);
    }
}
// --- Config ---
export function getVaultPath(pluginConfig) {
    const raw = pluginConfig.vaultPath || "~/clawback-vault";
    return raw.replace(/^~/, homedir());
}
export const BUCKET_DEFAULTS = {
    slug: "",
    description: "",
    aliases: [],
    state: "active",
    "last-commit": "",
    repos: [],
};
export function matter(input) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(input);
    if (!match)
        return { data: { ...BUCKET_DEFAULTS }, content: input };
    const raw = parseYaml(match[1]) ?? {};
    return {
        data: { ...BUCKET_DEFAULTS, ...raw },
        content: input.slice(match[0].length),
    };
}
export function stringifyMatter(data, content) {
    return `---\n${stringifyYaml(data).trim()}\n---${content}`;
}
export function readBucketManifest(vaultPath) {
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
// --- File writers ---
export function writeCapture(vaultPath, slug, text, timestamp) {
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
export function writeInbox(vaultPath, text, timestamp) {
    const inboxFile = join(vaultPath, "_inbox.md");
    const entry = `\n---\n**${timestamp}**\n${text}\n`;
    if (existsSync(inboxFile)) {
        appendFileSync(inboxFile, entry);
    }
    else {
        writeFileSync(inboxFile, `# Inbox\n\nLow-confidence captures. Review and route manually or correct with ❌.\n${entry}`);
    }
}
// --- Auto-discovery ---
function scaffoldBucket(bucketsDir, slug) {
    const description = `Auto-discovered from vault folder "${slug}"`;
    const bucketMd = stringifyMatter({ slug, description, aliases: [], state: "active", "last-commit": "", repos: [] }, `\n# ${slug}\n\n${description}\n`);
    writeFileSync(join(bucketsDir, slug, "_bucket.md"), bucketMd);
    const files = [
        ["captures.md", `# Captures — ${slug}\n`],
        ["memory.md", `# Memory — ${slug}\n`],
        ["future-me.md", `# Future Me — ${slug}\n\nTangent captures parked here for later.\n`],
    ];
    for (const [name, content] of files) {
        const filePath = join(bucketsDir, slug, name);
        if (!existsSync(filePath))
            writeFileSync(filePath, content);
    }
}
export function autoDiscoverBuckets(vaultPath) {
    const bucketsDir = join(vaultPath, "OpenClaw", "buckets");
    if (!existsSync(bucketsDir))
        return [];
    const discovered = [];
    for (const entry of readdirSync(bucketsDir, { withFileTypes: true })) {
        if (!entry.isDirectory())
            continue;
        if (!SLUG_PATTERN.test(entry.name))
            continue;
        if (existsSync(join(bucketsDir, entry.name, "_bucket.md")))
            continue;
        scaffoldBucket(bucketsDir, entry.name);
        discovered.push(entry.name);
    }
    return discovered;
}
export function addAlias(vaultPath, slug, alias) {
    validateSlug(slug);
    const bucketsBase = join(vaultPath, "OpenClaw", "buckets");
    const bucketFile = join(bucketsBase, slug, "_bucket.md");
    assertWithinBase(bucketsBase, bucketFile);
    if (!existsSync(bucketFile)) {
        throw new Error(`Bucket ${slug} does not exist.`);
    }
    const { data: fm, content: body } = matter(readFileSync(bucketFile, "utf-8"));
    const normalized = alias.toLowerCase().trim();
    if (fm.aliases.includes(normalized)) {
        return { added: false, normalized };
    }
    fm.aliases.push(normalized);
    writeFileSync(bucketFile, stringifyMatter(fm, body));
    return { added: true, normalized };
}
export function moveLastCapture(vaultPath, fromSlug, toSlug) {
    validateSlug(fromSlug);
    validateSlug(toSlug);
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
    const lastIndex = chunks.lastIndexOf(lastCapture);
    chunks.splice(lastIndex, 1);
    writeFileSync(fromCapturesFile, chunks.join("\n---\n"));
    const tsMatch = /\*\*(.+?)\*\*/.exec(lastCapture);
    const timestamp = tsMatch ? tsMatch[1] : new Date().toISOString();
    const captureText = lastCapture.replace(/\*\*.*?\*\*\n?/, "").trim();
    writeCapture(vaultPath, toSlug, captureText, timestamp);
    return { captureText, timestamp };
}
export function promoteFutureMe(vaultPath, sourceSlug, newSlug, description) {
    validateSlug(sourceSlug);
    validateSlug(newSlug);
    if (sourceSlug === newSlug) {
        throw new Error("Cannot promote into the same bucket.");
    }
    const bucketsBase = join(vaultPath, "OpenClaw", "buckets");
    const newBucketDir = join(bucketsBase, newSlug);
    assertWithinBase(bucketsBase, newBucketDir);
    if (existsSync(newBucketDir)) {
        throw new Error(`Bucket ${newSlug} already exists. Promotion creates a new bucket.`);
    }
    const futureFile = join(bucketsBase, sourceSlug, "future-me.md");
    assertWithinBase(bucketsBase, futureFile);
    if (!existsSync(futureFile)) {
        throw new Error(`No future-me.md in ${sourceSlug}.`);
    }
    const content = readFileSync(futureFile, "utf-8");
    const chunks = content.split("\n---\n");
    const entryChunks = chunks.filter((chunk) => chunk.includes("**"));
    if (entryChunks.length === 0) {
        throw new Error(`No entries in ${sourceSlug}/future-me.md to promote.`);
    }
    const lastEntry = entryChunks[entryChunks.length - 1];
    const tsMatch = /\*\*(.+?)\*\*/.exec(lastEntry);
    const timestamp = tsMatch ? tsMatch[1] : new Date().toISOString();
    const captureText = lastEntry.replace(/\*\*.*?\*\*\n?/, "").trim();
    // Write destination first — if this fails, source is untouched
    mkdirSync(newBucketDir, { recursive: true });
    const bucketMd = stringifyMatter({ slug: newSlug, description, aliases: [], state: "active", "last-commit": "", repos: [] }, `\n# ${newSlug}\n\n${description}\n`);
    writeFileSync(join(newBucketDir, "_bucket.md"), bucketMd);
    writeFileSync(join(newBucketDir, "memory.md"), `# Memory — ${newSlug}\n`);
    writeFileSync(join(newBucketDir, "future-me.md"), `# Future Me — ${newSlug}\n\nTangent captures parked here for later.\n`);
    writeCapture(vaultPath, newSlug, captureText, timestamp);
    // Destination succeeded — now remove from source
    const lastIndex = chunks.lastIndexOf(lastEntry);
    chunks.splice(lastIndex, 1);
    writeFileSync(futureFile, chunks.join("\n---\n"));
    return { captureText, timestamp };
}
// --- Day 4: watchers, draft, conflicts, last-commit ---
export function writeWatcher(vaultPath, filename, entry) {
    const allowed = ["pr-alerts.md", "dev-comments.md"];
    if (!allowed.includes(filename)) {
        throw new Error(`Invalid watcher file: "${filename}". Allowed: ${allowed.join(", ")}`);
    }
    const watchersDir = join(vaultPath, "watchers");
    if (!existsSync(watchersDir)) {
        mkdirSync(watchersDir, { recursive: true });
    }
    const filePath = join(watchersDir, filename);
    const heading = filename === "pr-alerts.md" ? "# PR Alerts" : "# DEV Comments & Notifications";
    if (existsSync(filePath)) {
        appendFileSync(filePath, entry);
    }
    else {
        writeFileSync(filePath, `${heading}\n${entry}`);
    }
}
export function readWatcher(vaultPath, filename) {
    const allowed = ["pr-alerts.md", "dev-comments.md"];
    if (!allowed.includes(filename)) {
        throw new Error(`Invalid watcher file: "${filename}". Allowed: ${allowed.join(", ")}`);
    }
    const filePath = join(vaultPath, "watchers", filename);
    if (!existsSync(filePath))
        return "";
    return readFileSync(filePath, "utf-8");
}
export function writeDraft(vaultPath, slug, templateName, content) {
    validateSlug(slug);
    const bucketsBase = join(vaultPath, "OpenClaw", "buckets");
    const draftsDir = join(bucketsBase, slug, "drafts");
    assertWithinBase(bucketsBase, draftsDir);
    if (!existsSync(draftsDir)) {
        mkdirSync(draftsDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `${templateName}-${timestamp}.md`;
    const filePath = join(draftsDir, filename);
    writeFileSync(filePath, content);
    return filename;
}
export function writeConflicts(vaultPath, content) {
    const conflictsFile = join(vaultPath, "_conflicts.md");
    writeFileSync(conflictsFile, content);
}
export function readConflicts(vaultPath) {
    const conflictsFile = join(vaultPath, "_conflicts.md");
    if (!existsSync(conflictsFile))
        return "";
    return readFileSync(conflictsFile, "utf-8");
}
export function updateLastCommit(vaultPath, slug, timestamp) {
    validateSlug(slug);
    const bucketsBase = join(vaultPath, "OpenClaw", "buckets");
    const bucketFile = join(bucketsBase, slug, "_bucket.md");
    assertWithinBase(bucketsBase, bucketFile);
    if (!existsSync(bucketFile)) {
        throw new Error(`Bucket ${slug} does not exist.`);
    }
    const { data: fm, content: body } = matter(readFileSync(bucketFile, "utf-8"));
    fm["last-commit"] = timestamp;
    writeFileSync(bucketFile, stringifyMatter(fm, body));
}

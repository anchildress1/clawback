import { readFileSync, writeFileSync, appendFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve, relative, sep } from "node:path";
import { homedir } from "node:os";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

// --- Slug validation ---

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export function validateSlug(slug: string): void {
  if (!SLUG_PATTERN.test(slug) || slug.length > 64) {
    throw new Error(`Invalid slug: "${slug}". Must match /^[a-z0-9][a-z0-9-]*$/ and be ≤64 chars.`);
  }
}

// --- Path safety ---

export function assertWithinBase(basePath: string, targetPath: string): void {
  const resolved = resolve(targetPath);
  const base = resolve(basePath);
  if (resolved === base) return;
  const rel = relative(base, resolved);
  if (rel.startsWith("..") || rel.startsWith(sep) || /^[a-zA-Z]:/.test(rel)) {
    throw new Error(`Path traversal blocked: ${resolved} is outside ${base}`);
  }
}

// --- Config ---

export function getVaultPath(pluginConfig: Record<string, unknown>): string {
  const raw = (pluginConfig.vaultPath as string) || "~/clawback-vault";
  return raw.replace(/^~/, homedir());
}

// --- Frontmatter ---

export interface BucketFrontmatter {
  [key: string]: unknown;
  slug: string;
  description: string;
  aliases: string[];
  state: string;
  "last-commit": string;
  repos: string[];
}

export const BUCKET_DEFAULTS: BucketFrontmatter = {
  slug: "",
  description: "",
  aliases: [],
  state: "active",
  "last-commit": "",
  repos: [],
};

export interface MatterResult {
  data: BucketFrontmatter;
  content: string;
}

export function matter(input: string): MatterResult {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(input);
  if (!match) return { data: { ...BUCKET_DEFAULTS }, content: input };
  const raw = parseYaml(match[1]) ?? {};
  return {
    data: { ...BUCKET_DEFAULTS, ...raw },
    content: input.slice(match[0].length),
  };
}

export function stringifyMatter(data: Record<string, unknown>, content: string): string {
  return `---\n${stringifyYaml(data).trim()}\n---${content}`;
}

// --- Bucket manifest ---

export interface BucketManifestEntry {
  slug: string;
  description: string;
  aliases: string[];
  state: string;
  lastCommit: string;
  repos: string[];
  recentCaptures: string[];
}

export function readBucketManifest(vaultPath: string): BucketManifestEntry[] {
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

// --- File writers ---

export function writeCapture(
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

export function writeInbox(vaultPath: string, text: string, timestamp: string): void {
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

// --- Auto-discovery ---

function scaffoldBucket(bucketsDir: string, slug: string): void {
  const description = `Auto-discovered from vault folder "${slug}"`;
  const bucketMd = stringifyMatter(
    { slug, description, aliases: [], state: "active", "last-commit": "", repos: [] },
    `\n# ${slug}\n\n${description}\n`,
  );
  writeFileSync(join(bucketsDir, slug, "_bucket.md"), bucketMd);

  const files: [string, string][] = [
    ["captures.md", `# Captures — ${slug}\n`],
    ["memory.md", `# Memory — ${slug}\n`],
    ["future-me.md", `# Future Me — ${slug}\n\nTangent captures parked here for later.\n`],
  ];
  for (const [name, content] of files) {
    const filePath = join(bucketsDir, slug, name);
    if (!existsSync(filePath)) writeFileSync(filePath, content);
  }
}

export function autoDiscoverBuckets(vaultPath: string): string[] {
  const bucketsDir = join(vaultPath, "OpenClaw", "buckets");
  if (!existsSync(bucketsDir)) return [];

  const discovered: string[] = [];
  for (const entry of readdirSync(bucketsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!SLUG_PATTERN.test(entry.name)) continue;
    if (existsSync(join(bucketsDir, entry.name, "_bucket.md"))) continue;
    scaffoldBucket(bucketsDir, entry.name);
    discovered.push(entry.name);
  }
  return discovered;
}

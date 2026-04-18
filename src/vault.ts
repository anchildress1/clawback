import { readFileSync, writeFileSync, appendFileSync, readdirSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
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
  canonical: string;
  aliases: string[];
  git_repo: string;
  vault_refs: string[];
  last_activity: string;
}

export const BUCKET_DEFAULTS: BucketFrontmatter = {
  canonical: "",
  aliases: [],
  git_repo: "",
  vault_refs: [],
  last_activity: "",
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
  canonical: string;
  aliases: string[];
  gitRepo: string;
  vaultRefs: string[];
  lastActivity: string;
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
      canonical: slug.name,
      aliases: fm.aliases,
      gitRepo: fm.git_repo,
      vaultRefs: fm.vault_refs,
      lastActivity: fm.last_activity,
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
      `# Inbox\n\nLow-confidence captures. Review and route manually.\n${entry}`,
    );
  }
}

// --- Auto-discovery ---

function scaffoldBucket(bucketsDir: string, canonical: string): void {
  const bucketMd = stringifyMatter(
    { canonical, aliases: [], git_repo: "", vault_refs: [], last_activity: "" },
    `\n# ${canonical}\n`,
  );
  writeFileSync(join(bucketsDir, canonical, "_bucket.md"), bucketMd);

  const files: [string, string][] = [
    ["captures.md", `# Captures — ${canonical}\n`],
    ["memory.md", `# Memory — ${canonical}\n`],
  ];
  for (const [name, content] of files) {
    const filePath = join(bucketsDir, canonical, name);
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

// --- Day 3: alias, move, promote (extracted from tool handlers) ---

export interface AddAliasResult {
  added: boolean;
  normalized: string;
}

export function addAlias(vaultPath: string, canonical: string, alias: string): AddAliasResult {
  validateSlug(canonical);
  const bucketsBase = join(vaultPath, "OpenClaw", "buckets");
  const bucketFile = join(bucketsBase, canonical, "_bucket.md");
  assertWithinBase(bucketsBase, bucketFile);
  if (!existsSync(bucketFile)) {
    throw new Error(`Bucket ${canonical} does not exist.`);
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

export interface MoveLastCaptureResult {
  captureText: string;
  timestamp: string;
}

export function moveLastCapture(vaultPath: string, fromSlug: string, toSlug: string): MoveLastCaptureResult {
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

export interface PromoteFutureMeResult {
  captureText: string;
  timestamp: string;
}

export function promoteFutureMe(
  vaultPath: string,
  newCanonical: string,
): PromoteFutureMeResult {
  validateSlug(newCanonical);
  const bucketsBase = join(vaultPath, "OpenClaw", "buckets");

  const newBucketDir = join(bucketsBase, newCanonical);
  assertWithinBase(bucketsBase, newBucketDir);
  if (existsSync(newBucketDir)) {
    throw new Error(`Bucket ${newCanonical} already exists. Promotion creates a new bucket.`);
  }

  const futureFile = join(vaultPath, "future-me.md");
  if (!existsSync(futureFile)) {
    throw new Error("No future-me.md at vault root.");
  }
  const content = readFileSync(futureFile, "utf-8");
  const chunks = content.split("\n---\n");
  const entryChunks = chunks.filter((chunk) => chunk.includes("**"));
  if (entryChunks.length === 0) {
    throw new Error("No entries in future-me.md to promote.");
  }

  const lastEntry = entryChunks[entryChunks.length - 1];
  const tsMatch = /\*\*(.+?)\*\*/.exec(lastEntry);
  const timestamp = tsMatch ? tsMatch[1] : new Date().toISOString();
  const captureText = lastEntry.replace(/\*\*.*?\*\*[^\n]*\n?/, "").trim();

  // Write destination first — if this fails, source is untouched
  mkdirSync(newBucketDir, { recursive: true });
  const bucketMd = stringifyMatter(
    { canonical: newCanonical, aliases: [], git_repo: "", vault_refs: [], last_activity: "" },
    `\n# ${newCanonical}\n`,
  );
  writeFileSync(join(newBucketDir, "_bucket.md"), bucketMd);
  writeFileSync(join(newBucketDir, "memory.md"), `# Memory — ${newCanonical}\n`);
  writeCapture(vaultPath, newCanonical, captureText, timestamp);

  // Destination succeeded — now remove from source
  const lastIndex = chunks.lastIndexOf(lastEntry);
  chunks.splice(lastIndex, 1);
  writeFileSync(futureFile, chunks.join("\n---\n"));

  return { captureText, timestamp };
}

// --- Future-me (flat file at vault root) ---

export function writeFutureMe(vaultPath: string, text: string, bucketHint: string, timestamp: string): void {
  const futureFile = join(vaultPath, "future-me.md");
  const entry = `\n---\n**${timestamp}** [${bucketHint}]\n${text}\n`;
  if (existsSync(futureFile)) {
    appendFileSync(futureFile, entry);
  } else {
    writeFileSync(futureFile, `# Future Me\n\nTangent captures parked here for later.\n${entry}`);
  }
}

// --- Workspace path ---

export function getWorkspacePath(pluginConfig: Record<string, unknown>): string {
  const raw = (pluginConfig.workspacePath as string) || "~/clawback-vault/openclaw";
  return raw.replace(/^~/, homedir());
}

// --- Triage log ---

export interface TriageLogEntry {
  timestamp: string;
  raw: string;
  classification: string;
  target: string;
  action: string;
}

export function appendTriageLog(workspacePath: string, entry: TriageLogEntry): void {
  if (!existsSync(workspacePath)) {
    mkdirSync(workspacePath, { recursive: true });
  }
  const logFile = join(workspacePath, "triage-log.md");
  const row = `\n| ${entry.timestamp} | ${entry.classification} | ${entry.target} | ${entry.action} | ${entry.raw.slice(0, 80)} |\n`;
  if (existsSync(logFile)) {
    appendFileSync(logFile, row);
  } else {
    writeFileSync(logFile, `# Triage Log\n\n| Time | Class | Target | Action | Message |\n|---|---|---|---|---|\n${row}`);
  }
}

export function readTriageLog(workspacePath: string): string {
  const logFile = join(workspacePath, "triage-log.md");
  if (!existsSync(logFile)) return "";
  return readFileSync(logFile, "utf-8");
}

// --- Focus ---

export interface FocusState {
  mode: "idle" | "drafting" | "watching";
  activeBucket: string;
  artifactRef: string;
  startedAt: string;
}

export function writeFocus(workspacePath: string, focus: FocusState): void {
  if (!existsSync(workspacePath)) {
    mkdirSync(workspacePath, { recursive: true });
  }
  const focusFile = join(workspacePath, "focus.md");
  const content = stringifyMatter(focus as unknown as Record<string, unknown>, `\n# Focus\n\nCurrent agent focus state.\n`);
  writeFileSync(focusFile, content);
}

export function readFocus(workspacePath: string): FocusState | null {
  const focusFile = join(workspacePath, "focus.md");
  if (!existsSync(focusFile)) return null;
  const { data } = matter(readFileSync(focusFile, "utf-8"));
  return {
    mode: (data.mode as string as FocusState["mode"]) || "idle",
    activeBucket: (data.activeBucket as string) || "",
    artifactRef: (data.artifactRef as string) || "",
    startedAt: (data.startedAt as string) || "",
  };
}

// --- Pause ---

export function writePause(workspacePath: string, expiry: string): void {
  if (!existsSync(workspacePath)) {
    mkdirSync(workspacePath, { recursive: true });
  }
  const pauseFile = join(workspacePath, "pause.md");
  writeFileSync(pauseFile, `---\nexpiry: "${expiry}"\n---\n\nAgent is paused.\n`);
}

export function readPause(workspacePath: string): string | null {
  const pauseFile = join(workspacePath, "pause.md");
  if (!existsSync(pauseFile)) return null;
  const { data } = matter(readFileSync(pauseFile, "utf-8"));
  return (data.expiry as string) || null;
}

export function clearPause(workspacePath: string): boolean {
  const pauseFile = join(workspacePath, "pause.md");
  if (!existsSync(pauseFile)) return false;
  unlinkSync(pauseFile);
  return true;
}

// --- Holds ---

export interface Hold {
  path: string;
  persistent: boolean;
}

export function addHold(workspacePath: string, holdPath: string, persistent: boolean): void {
  if (!existsSync(workspacePath)) {
    mkdirSync(workspacePath, { recursive: true });
  }
  const holdsFile = join(workspacePath, "holds.md");
  const entry = `- ${holdPath}${persistent ? " (persistent)" : ""}\n`;
  if (existsSync(holdsFile)) {
    appendFileSync(holdsFile, entry);
  } else {
    writeFileSync(holdsFile, `# Holds\n\nPaths the agent must not touch.\n\n${entry}`);
  }
}

export function listHolds(workspacePath: string): Hold[] {
  const holdsFile = join(workspacePath, "holds.md");
  if (!existsSync(holdsFile)) return [];
  const content = readFileSync(holdsFile, "utf-8");
  const holds: Hold[] = [];
  for (const line of content.split("\n")) {
    const match = /^- (.+?)( \(persistent\))?$/.exec(line);
    if (match) {
      holds.push({ path: match[1], persistent: !!match[2] });
    }
  }
  return holds;
}

export function removeHold(workspacePath: string, holdPath: string): boolean {
  const holdsFile = join(workspacePath, "holds.md");
  if (!existsSync(holdsFile)) return false;
  const content = readFileSync(holdsFile, "utf-8");
  const lines = content.split("\n");
  const filtered = lines.filter((line) => {
    const match = /^- (.+?)( \(persistent\))?$/.exec(line);
    return !(match && match[1] === holdPath);
  });
  if (filtered.length === lines.length) return false;
  writeFileSync(holdsFile, filtered.join("\n"));
  return true;
}

// --- Daily notes ---

export function appendDailyNote(workspacePath: string, date: string, entry: string): void {
  const memoryDir = join(workspacePath, "memory");
  if (!existsSync(memoryDir)) {
    mkdirSync(memoryDir, { recursive: true });
  }
  const noteFile = join(memoryDir, `${date}.md`);
  if (existsSync(noteFile)) {
    appendFileSync(noteFile, `\n${entry}\n`);
  } else {
    writeFileSync(noteFile, `# ${date}\n\n${entry}\n`);
  }
}

export function readDailyNote(workspacePath: string, date: string): string {
  const noteFile = join(workspacePath, "memory", `${date}.md`);
  if (!existsSync(noteFile)) return "";
  return readFileSync(noteFile, "utf-8");
}

// --- Runtime AGENTS.md scaffold ---

export function scaffoldRuntimeAgentsMd(workspacePath: string): boolean {
  if (!existsSync(workspacePath)) {
    mkdirSync(workspacePath, { recursive: true });
  }
  const agentsFile = join(workspacePath, "AGENTS.md");
  if (existsSync(agentsFile)) return false;

  const content = `# AGENTS.md — Living Config

This file is the agent's runtime configuration. It starts with structure only.
Rules accumulate through corrections observed by the \`review-patterns\` job.
Co-authored by user and agent.

---

## Decision categories

### Routing
<!-- Rules for routing captures to buckets will be added here by review-patterns -->

### Classification
<!-- Rules for classifying intent (capture/command/question) -->

### Tone
<!-- Voice and response style rules -->

## Default posture

- Ask on unknown references.
- Route silently on known aliases.
- Correction is text in chat.
- Log every decision to triage-log.md.

## Correction logging

Every correction the user makes is logged with:
- Original classification/routing
- Corrected classification/routing
- Timestamp

## Job cadence

- Triage log roll-up: daily
- Pattern review: daily
- Future-me review: daily
- GitHub activity check: per job schedule

## Holds

- Ephemeral by default (session-scoped)
- Persistent if user says "remember that"

## Dispatcher

- Check pause.md before every tick
- One job at a time within a tick
- Fail gracefully, increment fail_count

## Pause

- "Be quiet" → write pause.md with expiry
- "Ok" → clear pause.md
- Check before any unsolicited message
`;

  writeFileSync(agentsFile, content);
  return true;
}

// --- Last activity ---

export function updateLastActivity(vaultPath: string, canonical: string, timestamp: string): void {
  validateSlug(canonical);
  const bucketsBase = join(vaultPath, "OpenClaw", "buckets");
  const bucketFile = join(bucketsBase, canonical, "_bucket.md");
  assertWithinBase(bucketsBase, bucketFile);
  if (!existsSync(bucketFile)) {
    throw new Error(`Bucket ${canonical} does not exist.`);
  }
  const { data: fm, content: body } = matter(readFileSync(bucketFile, "utf-8"));
  fm.last_activity = timestamp;
  writeFileSync(bucketFile, stringifyMatter(fm, body));
}

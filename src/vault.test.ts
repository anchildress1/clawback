import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import {
  validateSlug, assertWithinBase, matter, stringifyMatter,
  readBucketManifest, writeCapture, writeInbox, autoDiscoverBuckets,
  addAlias, moveLastCapture, promoteFutureMe, writeFutureMe, updateLastActivity,
  appendTriageLog, readTriageLog,
  writeFocus, readFocus,
  writePause, readPause, clearPause,
  addHold, removeHold, listHolds,
  appendDailyNote, readDailyNote,
  scaffoldRuntimeAgentsMd,
  getVaultPath, getWorkspacePath,
  SLUG_PATTERN, BUCKET_DEFAULTS,
} from "./vault.js";

let vault: string;

beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), "clawback-test-"));
});

afterEach(() => {
  rmSync(vault, { recursive: true, force: true });
});

// ============================================================
// validateSlug
// ============================================================

describe("validateSlug", () => {
  // --- positive ---
  it("accepts valid slugs", () => {
    expect(() => validateSlug("architect")).not.toThrow();
    expect(() => validateSlug("yard-work")).not.toThrow();
    expect(() => validateSlug("a1-b2")).not.toThrow();
  });

  it("accepts single character", () => {
    expect(() => validateSlug("a")).not.toThrow();
    expect(() => validateSlug("0")).not.toThrow();
  });

  it("accepts numeric-only slug", () => {
    expect(() => validateSlug("123")).not.toThrow();
    expect(() => validateSlug("42")).not.toThrow();
  });

  it("accepts slug with consecutive hyphens", () => {
    expect(() => validateSlug("a--b")).not.toThrow();
  });

  it("accepts slug with trailing hyphen", () => {
    expect(() => validateSlug("trailing-")).not.toThrow();
  });

  it("accepts exactly 64 chars", () => {
    expect(() => validateSlug("a".repeat(64))).not.toThrow();
  });

  // --- negative ---
  it("rejects empty string", () => {
    expect(() => validateSlug("")).toThrow("Invalid slug");
  });

  it("rejects uppercase", () => {
    expect(() => validateSlug("UPPER")).toThrow();
    expect(() => validateSlug("Mixed")).toThrow();
  });

  it("rejects leading hyphen", () => {
    expect(() => validateSlug("-leading")).toThrow();
  });

  it("rejects spaces", () => {
    expect(() => validateSlug("has spaces")).toThrow();
  });

  it("rejects path traversal characters", () => {
    expect(() => validateSlug("../traversal")).toThrow();
    expect(() => validateSlug("./relative")).toThrow();
  });

  it("rejects underscores", () => {
    expect(() => validateSlug("has_under")).toThrow();
  });

  it("rejects special characters", () => {
    expect(() => validateSlug("has@char")).toThrow();
    expect(() => validateSlug("has!bang")).toThrow();
    expect(() => validateSlug("has.dot")).toThrow();
  });

  it("rejects slugs over 64 chars", () => {
    expect(() => validateSlug("a".repeat(65))).toThrow();
  });

  // --- edge ---
  it("rejects slug that is only hyphens", () => {
    expect(() => validateSlug("-")).toThrow();
    expect(() => validateSlug("---")).toThrow();
  });
});

// ============================================================
// assertWithinBase
// ============================================================

describe("assertWithinBase", () => {
  // --- positive ---
  it("allows paths within base", () => {
    expect(() => assertWithinBase("/base", "/base/child")).not.toThrow();
    expect(() => assertWithinBase("/base", "/base/a/b/c")).not.toThrow();
  });

  it("allows target === base", () => {
    expect(() => assertWithinBase("/base", "/base")).not.toThrow();
    expect(() => assertWithinBase("/base/", "/base")).not.toThrow();
  });

  it("allows deeply nested paths", () => {
    expect(() => assertWithinBase("/base", "/base/a/b/c/d/e/f")).not.toThrow();
  });

  // --- negative ---
  it("blocks path traversal with ..", () => {
    expect(() => assertWithinBase("/base", "/base/../etc/passwd")).toThrow("traversal");
  });

  it("blocks sibling path", () => {
    expect(() => assertWithinBase("/base", "/other")).toThrow("traversal");
  });

  it("blocks absolute path outside base", () => {
    expect(() => assertWithinBase("/base", "/")).toThrow("traversal");
  });

  // --- edge ---
  it("blocks base-prefix that is not a true child (e.g. /base2 vs /base)", () => {
    // /base2 relative to /base is "../base2" — correctly blocked
    expect(() => assertWithinBase("/base", "/base2")).toThrow("traversal");
  });
});

// ============================================================
// getVaultPath / getWorkspacePath
// ============================================================

describe("getVaultPath", () => {
  it("returns default when no config", () => {
    const result = getVaultPath({});
    expect(result).toBe(join(homedir(), "clawback-vault"));
  });

  it("expands tilde", () => {
    const result = getVaultPath({ vaultPath: "~/my-vault" });
    expect(result).toBe(join(homedir(), "my-vault"));
  });

  it("uses custom absolute path", () => {
    const result = getVaultPath({ vaultPath: "/opt/vaults/mine" });
    expect(result).toBe("/opt/vaults/mine");
  });

  it("treats empty string as default", () => {
    const result = getVaultPath({ vaultPath: "" });
    expect(result).toBe(join(homedir(), "clawback-vault"));
  });
});

describe("getWorkspacePath", () => {
  it("returns default when no config", () => {
    const result = getWorkspacePath({});
    expect(result).toBe(join(homedir(), "clawback-vault", "openclaw"));
  });

  it("expands tilde", () => {
    const result = getWorkspacePath({ workspacePath: "~/workspace" });
    expect(result).toBe(join(homedir(), "workspace"));
  });

  it("uses custom absolute path", () => {
    const result = getWorkspacePath({ workspacePath: "/opt/ws" });
    expect(result).toBe("/opt/ws");
  });

  it("treats empty string as default", () => {
    const result = getWorkspacePath({ workspacePath: "" });
    expect(result).toBe(join(homedir(), "clawback-vault", "openclaw"));
  });
});

// ============================================================
// matter / stringifyMatter
// ============================================================

describe("matter", () => {
  // --- positive ---
  it("parses frontmatter and body", () => {
    const input = "---\ncanonical: test\naliases: []\ngit_repo: \"\"\nvault_refs: []\nlast_activity: \"\"\n---\n\n# Test\n";
    const { data, content } = matter(input);
    expect(data.canonical).toBe("test");
    expect(data.aliases).toEqual([]);
    expect(content).toBe("\n\n# Test\n");
  });

  it("returns defaults for no frontmatter", () => {
    const { data, content } = matter("# Just a heading\n");
    expect(data.canonical).toBe("");
    expect(content).toBe("# Just a heading\n");
  });

  it("round-trips through stringifyMatter", () => {
    const original = {
      canonical: "test", aliases: ["foo", "bar"],
      git_repo: "", vault_refs: [], last_activity: "",
    };
    const body = "\n# Test\n\nSome content.\n";
    const serialized = stringifyMatter(original, body);
    const { data, content } = matter(serialized);
    expect(data.canonical).toBe("test");
    expect(data.aliases).toEqual(["foo", "bar"]);
    expect(content).toBe(body);
  });

  // --- edge ---
  it("handles empty frontmatter block", () => {
    const input = "---\n\n---\nBody here";
    const { data, content } = matter(input);
    // Empty YAML parses to null → defaults applied
    expect(data.canonical).toBe("");
    expect(data.aliases).toEqual([]);
    expect(content).toBe("\nBody here");
  });

  it("preserves extra unknown fields through round-trip", () => {
    const input = "---\ncanonical: test\ncustom_field: hello\n---\n\n# Body\n";
    const { data, content } = matter(input);
    expect(data.canonical).toBe("test");
    expect(data.custom_field).toBe("hello");
    const roundTripped = stringifyMatter(data, content);
    const { data: data2 } = matter(roundTripped);
    expect(data2.custom_field).toBe("hello");
  });

  it("handles CRLF line endings", () => {
    const input = "---\r\ncanonical: test\r\n---\r\n\r\n# Body\r\n";
    const { data, content } = matter(input);
    expect(data.canonical).toBe("test");
    expect(content).toContain("# Body");
  });

  it("handles frontmatter with only defaults populated", () => {
    const input = "---\ncanonical: \"\"\naliases: []\n---\n# body\n";
    const { data } = matter(input);
    expect(data.canonical).toBe("");
    expect(data.aliases).toEqual([]);
    expect(data.git_repo).toBe("");
  });

  it("BUCKET_DEFAULTS has correct shape", () => {
    expect(BUCKET_DEFAULTS).toEqual({
      canonical: "",
      aliases: [],
      git_repo: "",
      vault_refs: [],
      last_activity: "",
    });
  });
});

// ============================================================
// writeCapture
// ============================================================

describe("writeCapture", () => {
  // --- positive ---
  it("creates captures.md on first write", () => {
    const bucketsDir = join(vault, "OpenClaw", "buckets", "test");
    mkdirSync(bucketsDir, { recursive: true });
    writeCapture(vault, "test", "hello world", "2026-04-17T00:00:00Z");
    const content = readFileSync(join(bucketsDir, "captures.md"), "utf-8");
    expect(content).toContain("# Captures — test");
    expect(content).toContain("**2026-04-17T00:00:00Z**");
    expect(content).toContain("hello world");
  });

  it("appends to existing captures.md", () => {
    const bucketsDir = join(vault, "OpenClaw", "buckets", "test");
    mkdirSync(bucketsDir, { recursive: true });
    writeCapture(vault, "test", "first", "2026-04-17T00:00:00Z");
    writeCapture(vault, "test", "second", "2026-04-17T01:00:00Z");
    const content = readFileSync(join(bucketsDir, "captures.md"), "utf-8");
    expect(content).toContain("first");
    expect(content).toContain("second");
    const captures = content.split("\n---\n").filter((c) => c.includes("**"));
    expect(captures).toHaveLength(2);
  });

  it("does not write to other buckets", () => {
    const bucketA = join(vault, "OpenClaw", "buckets", "a");
    const bucketB = join(vault, "OpenClaw", "buckets", "b");
    mkdirSync(bucketA, { recursive: true });
    mkdirSync(bucketB, { recursive: true });
    writeFileSync(join(bucketB, "captures.md"), "# Captures — b\n");
    writeCapture(vault, "a", "only for a", "2026-04-17T00:00:00Z");
    const bContent = readFileSync(join(bucketB, "captures.md"), "utf-8");
    expect(bContent).toBe("# Captures — b\n");
  });

  it("auto-creates bucket directory if it doesn't exist", () => {
    mkdirSync(join(vault, "OpenClaw", "buckets"), { recursive: true });
    writeCapture(vault, "fresh", "new capture", "2026-04-17T00:00:00Z");
    expect(existsSync(join(vault, "OpenClaw", "buckets", "fresh", "captures.md"))).toBe(true);
  });

  it("handles multiline text", () => {
    mkdirSync(join(vault, "OpenClaw", "buckets", "test"), { recursive: true });
    writeCapture(vault, "test", "line one\nline two\nline three", "2026-04-17T00:00:00Z");
    const content = readFileSync(join(vault, "OpenClaw", "buckets", "test", "captures.md"), "utf-8");
    expect(content).toContain("line one\nline two\nline three");
  });

  it("handles markdown in text", () => {
    mkdirSync(join(vault, "OpenClaw", "buckets", "test"), { recursive: true });
    writeCapture(vault, "test", "## Heading\n- bullet\n`code`", "2026-04-17T00:00:00Z");
    const content = readFileSync(join(vault, "OpenClaw", "buckets", "test", "captures.md"), "utf-8");
    expect(content).toContain("## Heading");
    expect(content).toContain("- bullet");
    expect(content).toContain("`code`");
  });

  // --- error ---
  it("rejects invalid slug", () => {
    expect(() => writeCapture(vault, "INVALID", "text", "2026-04-17T00:00:00Z")).toThrow("Invalid slug");
    expect(() => writeCapture(vault, "../escape", "text", "2026-04-17T00:00:00Z")).toThrow();
  });
});

// ============================================================
// writeInbox
// ============================================================

describe("writeInbox", () => {
  // --- positive ---
  it("creates _inbox.md on first write", () => {
    writeInbox(vault, "low confidence capture", "2026-04-17T00:00:00Z");
    const content = readFileSync(join(vault, "_inbox.md"), "utf-8");
    expect(content).toContain("# Inbox");
    expect(content).toContain("low confidence capture");
  });

  it("appends to existing _inbox.md", () => {
    writeInbox(vault, "first", "2026-04-17T00:00:00Z");
    writeInbox(vault, "second", "2026-04-17T01:00:00Z");
    const content = readFileSync(join(vault, "_inbox.md"), "utf-8");
    expect(content).toContain("first");
    expect(content).toContain("second");
    const entries = content.split("\n---\n").filter((c) => c.includes("**"));
    expect(entries).toHaveLength(2);
  });

  // --- edge ---
  it("preserves header text on append", () => {
    writeInbox(vault, "entry", "2026-04-17T00:00:00Z");
    writeInbox(vault, "entry2", "2026-04-17T01:00:00Z");
    const content = readFileSync(join(vault, "_inbox.md"), "utf-8");
    expect(content).toContain("Low-confidence captures");
  });
});

// ============================================================
// readBucketManifest
// ============================================================

describe("readBucketManifest", () => {
  // --- positive ---
  it("returns empty for missing buckets dir", () => {
    expect(readBucketManifest(vault)).toEqual([]);
  });

  it("reads bucket metadata", () => {
    const bucketsDir = join(vault, "OpenClaw", "buckets", "test");
    mkdirSync(bucketsDir, { recursive: true });
    const bucketMd = stringifyMatter(
      { canonical: "test", aliases: ["t"], git_repo: "", vault_refs: [], last_activity: "" },
      "\n# test\n",
    );
    writeFileSync(join(bucketsDir, "_bucket.md"), bucketMd);
    const manifest = readBucketManifest(vault);
    expect(manifest).toHaveLength(1);
    expect(manifest[0].canonical).toBe("test");
    expect(manifest[0].aliases).toEqual(["t"]);
  });

  it("reads all schema fields", () => {
    const dir = join(vault, "OpenClaw", "buckets", "full");
    mkdirSync(dir, { recursive: true });
    const md = stringifyMatter(
      {
        canonical: "full",
        aliases: ["f", "complete"],
        git_repo: "https://github.com/user/repo",
        vault_refs: ["notes/ref1.md", "notes/ref2.md"],
        last_activity: "2026-04-17T10:00:00Z",
      },
      "\n# full\n",
    );
    writeFileSync(join(dir, "_bucket.md"), md);
    const manifest = readBucketManifest(vault);
    expect(manifest).toHaveLength(1);
    expect(manifest[0].gitRepo).toBe("https://github.com/user/repo");
    expect(manifest[0].vaultRefs).toEqual(["notes/ref1.md", "notes/ref2.md"]);
    expect(manifest[0].lastActivity).toBe("2026-04-17T10:00:00Z");
  });

  it("returns multiple buckets", () => {
    const bucketsBase = join(vault, "OpenClaw", "buckets");
    for (const name of ["alpha", "beta", "gamma"]) {
      const dir = join(bucketsBase, name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "_bucket.md"),
        stringifyMatter(
          { canonical: name, aliases: [], git_repo: "", vault_refs: [], last_activity: "" },
          `\n# ${name}\n`,
        ),
      );
    }
    const manifest = readBucketManifest(vault);
    expect(manifest).toHaveLength(3);
    const names = manifest.map((e) => e.canonical).sort();
    expect(names).toEqual(["alpha", "beta", "gamma"]);
  });

  it("reads recent captures (last 3)", () => {
    const dir = join(vault, "OpenClaw", "buckets", "test");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "_bucket.md"),
      stringifyMatter(
        { canonical: "test", aliases: [], git_repo: "", vault_refs: [], last_activity: "" },
        "\n# test\n",
      ),
    );
    let captures = "# Captures — test\n";
    for (let i = 1; i <= 5; i++) {
      captures += `\n---\n**2026-04-17T0${i}:00:00Z**\ncapture ${i}\n`;
    }
    writeFileSync(join(dir, "captures.md"), captures);

    const manifest = readBucketManifest(vault);
    expect(manifest[0].recentCaptures).toHaveLength(3);
    expect(manifest[0].recentCaptures[0]).toContain("capture 3");
    expect(manifest[0].recentCaptures[2]).toContain("capture 5");
  });

  // --- negative ---
  it("skips non-directory entries (files)", () => {
    const bucketsDir = join(vault, "OpenClaw", "buckets");
    mkdirSync(bucketsDir, { recursive: true });
    writeFileSync(join(bucketsDir, "not-a-dir.md"), "just a file");
    // Also add a real bucket to verify it's still found
    const dir = join(bucketsDir, "real");
    mkdirSync(dir);
    writeFileSync(
      join(dir, "_bucket.md"),
      stringifyMatter(
        { canonical: "real", aliases: [], git_repo: "", vault_refs: [], last_activity: "" },
        "\n# real\n",
      ),
    );
    const manifest = readBucketManifest(vault);
    expect(manifest).toHaveLength(1);
    expect(manifest[0].canonical).toBe("real");
  });

  it("skips directories without _bucket.md", () => {
    const bucketsDir = join(vault, "OpenClaw", "buckets");
    mkdirSync(join(bucketsDir, "no-bucket"), { recursive: true });
    writeFileSync(join(bucketsDir, "no-bucket", "random.md"), "not a bucket");
    const manifest = readBucketManifest(vault);
    expect(manifest).toHaveLength(0);
  });

  // --- edge ---
  it("returns empty recentCaptures when no captures.md", () => {
    const dir = join(vault, "OpenClaw", "buckets", "test");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "_bucket.md"),
      stringifyMatter(
        { canonical: "test", aliases: [], git_repo: "", vault_refs: [], last_activity: "" },
        "\n# test\n",
      ),
    );
    const manifest = readBucketManifest(vault);
    expect(manifest[0].recentCaptures).toEqual([]);
  });
});

// ============================================================
// autoDiscoverBuckets
// ============================================================

describe("autoDiscoverBuckets", () => {
  // --- positive ---
  it("scaffolds folders missing _bucket.md", () => {
    const bucketsDir = join(vault, "OpenClaw", "buckets");
    mkdirSync(join(bucketsDir, "architect"), { recursive: true });
    mkdirSync(join(bucketsDir, "fitness"), { recursive: true });

    const discovered = autoDiscoverBuckets(vault);
    expect(discovered.toSorted((a, b) => a.localeCompare(b))).toEqual(["architect", "fitness"]);

    for (const canonical of discovered) {
      expect(existsSync(join(bucketsDir, canonical, "_bucket.md"))).toBe(true);
      expect(existsSync(join(bucketsDir, canonical, "captures.md"))).toBe(true);
      expect(existsSync(join(bucketsDir, canonical, "memory.md"))).toBe(true);
    }

    const { data } = matter(readFileSync(join(bucketsDir, "architect", "_bucket.md"), "utf-8"));
    expect(data.canonical).toBe("architect");
  });

  it("skips folders that already have _bucket.md", () => {
    const bucketsDir = join(vault, "OpenClaw", "buckets");
    mkdirSync(join(bucketsDir, "existing"), { recursive: true });
    writeFileSync(join(bucketsDir, "existing", "_bucket.md"), "---\ncanonical: existing\n---\n");

    const discovered = autoDiscoverBuckets(vault);
    expect(discovered).toEqual([]);
  });

  it("skips folders with invalid slug names", () => {
    const bucketsDir = join(vault, "OpenClaw", "buckets");
    mkdirSync(join(bucketsDir, ".obsidian"), { recursive: true });
    mkdirSync(join(bucketsDir, "UPPERCASE"), { recursive: true });

    const discovered = autoDiscoverBuckets(vault);
    expect(discovered).toEqual([]);
  });

  it("is idempotent — second run discovers nothing", () => {
    const bucketsDir = join(vault, "OpenClaw", "buckets");
    mkdirSync(join(bucketsDir, "test"), { recursive: true });

    const first = autoDiscoverBuckets(vault);
    expect(first).toEqual(["test"]);

    const second = autoDiscoverBuckets(vault);
    expect(second).toEqual([]);
  });

  // --- negative ---
  it("returns empty when buckets dir does not exist", () => {
    expect(autoDiscoverBuckets(vault)).toEqual([]);
  });

  // --- edge ---
  it("does not overwrite existing captures.md during scaffold", () => {
    const bucketsDir = join(vault, "OpenClaw", "buckets");
    const dir = join(bucketsDir, "existing");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "captures.md"), "# My existing captures\n");
    // No _bucket.md so it will be scaffolded

    autoDiscoverBuckets(vault);
    const content = readFileSync(join(dir, "captures.md"), "utf-8");
    expect(content).toBe("# My existing captures\n");
  });

  it("scaffolded bucket has correct schema fields", () => {
    const bucketsDir = join(vault, "OpenClaw", "buckets");
    mkdirSync(join(bucketsDir, "proj"), { recursive: true });
    autoDiscoverBuckets(vault);
    const { data } = matter(readFileSync(join(bucketsDir, "proj", "_bucket.md"), "utf-8"));
    expect(data.canonical).toBe("proj");
    expect(data.aliases).toEqual([]);
    expect(data.git_repo).toBe("");
    expect(data.vault_refs).toEqual([]);
    expect(data.last_activity).toBe("");
  });
});

// ============================================================
// always-edit proof
// ============================================================

describe("always-edit memory pattern", () => {
  it("writeFileSync replaces, not appends", () => {
    const bucketsDir = join(vault, "OpenClaw", "buckets", "test");
    mkdirSync(bucketsDir, { recursive: true });
    const memoryFile = join(bucketsDir, "memory.md");

    writeFileSync(memoryFile, "# Memory — test\n\n## Decisions\n- Using workspaces\n");
    writeFileSync(memoryFile, "# Memory — test\n\n## Decisions\n- Using separate state files\n");

    const content = readFileSync(memoryFile, "utf-8");
    expect(content).toContain("separate state files");
    expect(content).not.toContain("workspaces");
  });
});

// ============================================================
// addAlias
// ============================================================

describe("addAlias", () => {
  function makeBucket(canonical: string, existingAliases: string[] = []) {
    const dir = join(vault, "OpenClaw", "buckets", canonical);
    mkdirSync(dir, { recursive: true });
    const md = stringifyMatter(
      { canonical, aliases: existingAliases, git_repo: "https://github.com/x/y", vault_refs: ["ref.md"], last_activity: "2026-04-17T00:00:00Z" },
      `\n# ${canonical}\n`,
    );
    writeFileSync(join(dir, "_bucket.md"), md);
  }

  // --- positive ---
  it("adds a new alias", () => {
    makeBucket("proj");
    const result = addAlias(vault, "proj", "My Project");
    expect(result.added).toBe(true);
    expect(result.normalized).toBe("my project");
    const { data } = matter(readFileSync(join(vault, "OpenClaw", "buckets", "proj", "_bucket.md"), "utf-8"));
    expect(data.aliases).toContain("my project");
  });

  it("accumulates multiple aliases", () => {
    makeBucket("proj");
    addAlias(vault, "proj", "alias-one");
    addAlias(vault, "proj", "alias-two");
    addAlias(vault, "proj", "alias-three");
    const { data } = matter(readFileSync(join(vault, "OpenClaw", "buckets", "proj", "_bucket.md"), "utf-8"));
    expect(data.aliases).toEqual(["alias-one", "alias-two", "alias-three"]);
  });

  it("preserves other frontmatter fields after alias add", () => {
    makeBucket("proj");
    addAlias(vault, "proj", "new-alias");
    const { data } = matter(readFileSync(join(vault, "OpenClaw", "buckets", "proj", "_bucket.md"), "utf-8"));
    expect(data.git_repo).toBe("https://github.com/x/y");
    expect(data.vault_refs).toEqual(["ref.md"]);
    expect(data.last_activity).toBe("2026-04-17T00:00:00Z");
  });

  // --- negative ---
  it("rejects duplicate alias (case-insensitive)", () => {
    makeBucket("proj");
    addAlias(vault, "proj", "duplicate");
    const result = addAlias(vault, "proj", "Duplicate");
    expect(result.added).toBe(false);
  });

  it("throws for nonexistent bucket", () => {
    expect(() => addAlias(vault, "nope", "alias")).toThrow("does not exist");
  });

  it("throws for invalid canonical slug", () => {
    expect(() => addAlias(vault, "INVALID", "alias")).toThrow("Invalid slug");
  });

  // --- edge ---
  it("normalizes whitespace in alias", () => {
    makeBucket("proj");
    const result = addAlias(vault, "proj", "  spaced  ");
    expect(result.normalized).toBe("spaced");
  });

  it("adds to existing aliases from bucket creation", () => {
    makeBucket("proj", ["existing"]);
    addAlias(vault, "proj", "new");
    const { data } = matter(readFileSync(join(vault, "OpenClaw", "buckets", "proj", "_bucket.md"), "utf-8"));
    expect(data.aliases).toEqual(["existing", "new"]);
  });
});

// ============================================================
// moveLastCapture
// ============================================================

describe("moveLastCapture", () => {
  function makeBucketWithCaptures(canonical: string, captures: string[]) {
    const dir = join(vault, "OpenClaw", "buckets", canonical);
    mkdirSync(dir, { recursive: true });
    const md = stringifyMatter(
      { canonical, aliases: [], git_repo: "", vault_refs: [], last_activity: "" },
      `\n# ${canonical}\n`,
    );
    writeFileSync(join(dir, "_bucket.md"), md);
    let content = `# Captures — ${canonical}\n`;
    for (const c of captures) {
      content += `\n---\n**2026-04-17T00:00:00Z**\n${c}\n`;
    }
    writeFileSync(join(dir, "captures.md"), content);
  }

  // --- positive ---
  it("moves last capture between buckets", () => {
    makeBucketWithCaptures("source", ["first", "second", "third"]);
    makeBucketWithCaptures("dest", []);
    const result = moveLastCapture(vault, "source", "dest");
    expect(result.captureText).toBe("third");

    const srcContent = readFileSync(join(vault, "OpenClaw", "buckets", "source", "captures.md"), "utf-8");
    expect(srcContent).not.toContain("third");
    expect(srcContent).toContain("first");
    expect(srcContent).toContain("second");

    const destContent = readFileSync(join(vault, "OpenClaw", "buckets", "dest", "captures.md"), "utf-8");
    expect(destContent).toContain("third");
  });

  it("extracts correct timestamp", () => {
    makeBucketWithCaptures("src", ["content"]);
    const result = moveLastCapture(vault, "src", "dst");
    expect(result.timestamp).toBe("2026-04-17T00:00:00Z");
  });

  // --- negative ---
  it("throws when source has no captures file", () => {
    const dir = join(vault, "OpenClaw", "buckets", "empty");
    mkdirSync(dir, { recursive: true });
    expect(() => moveLastCapture(vault, "empty", "dest")).toThrow("No captures found");
  });

  it("throws when captures file has only header (no entries)", () => {
    const dir = join(vault, "OpenClaw", "buckets", "headeronly");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "captures.md"), "# Captures — headeronly\n");
    expect(() => moveLastCapture(vault, "headeronly", "dest")).toThrow("No captures to move");
  });

  it("throws for invalid from slug", () => {
    expect(() => moveLastCapture(vault, "INVALID", "dest")).toThrow("Invalid slug");
  });

  it("throws for invalid to slug", () => {
    makeBucketWithCaptures("source", ["data"]);
    expect(() => moveLastCapture(vault, "source", "INVALID")).toThrow("Invalid slug");
  });

  // --- edge ---
  it("single capture move leaves only header", () => {
    makeBucketWithCaptures("source", ["only-one"]);
    mkdirSync(join(vault, "OpenClaw", "buckets", "dest"), { recursive: true });
    moveLastCapture(vault, "source", "dest");
    const srcContent = readFileSync(join(vault, "OpenClaw", "buckets", "source", "captures.md"), "utf-8");
    expect(srcContent).not.toContain("only-one");
    expect(srcContent).toContain("# Captures");
  });
});

// ============================================================
// writeFutureMe (flat file at vault root)
// ============================================================

describe("writeFutureMe", () => {
  // --- positive ---
  it("creates future-me.md on first write", () => {
    writeFutureMe(vault, "tangent idea", "architect", "2026-04-17T00:00:00Z");
    const content = readFileSync(join(vault, "future-me.md"), "utf-8");
    expect(content).toContain("# Future Me");
    expect(content).toContain("tangent idea");
    expect(content).toContain("[architect]");
  });

  it("appends to existing future-me.md", () => {
    writeFutureMe(vault, "first tangent", "proj-a", "2026-04-17T00:00:00Z");
    writeFutureMe(vault, "second tangent", "proj-b", "2026-04-17T01:00:00Z");
    const content = readFileSync(join(vault, "future-me.md"), "utf-8");
    expect(content).toContain("first tangent");
    expect(content).toContain("second tangent");
    expect(content).toContain("[proj-a]");
    expect(content).toContain("[proj-b]");
  });

  // --- edge ---
  it("preserves header description on subsequent writes", () => {
    writeFutureMe(vault, "first", "a", "2026-04-17T00:00:00Z");
    writeFutureMe(vault, "second", "b", "2026-04-17T01:00:00Z");
    const content = readFileSync(join(vault, "future-me.md"), "utf-8");
    expect(content).toContain("Tangent captures parked here for later");
  });

  it("handles empty bucket hint", () => {
    writeFutureMe(vault, "unassigned thought", "", "2026-04-17T00:00:00Z");
    const content = readFileSync(join(vault, "future-me.md"), "utf-8");
    expect(content).toContain("[]");
    expect(content).toContain("unassigned thought");
  });
});

// ============================================================
// promoteFutureMe (from vault root)
// ============================================================

describe("promoteFutureMe", () => {
  function setupFutureMe(entries: { text: string; bucket: string }[]) {
    let content = "# Future Me\n\nTangent captures parked here for later.\n";
    for (const e of entries) {
      content += `\n---\n**2026-04-17T00:00:00Z** [${e.bucket}]\n${e.text}\n`;
    }
    writeFileSync(join(vault, "future-me.md"), content);
    mkdirSync(join(vault, "OpenClaw", "buckets"), { recursive: true });
  }

  // --- positive ---
  it("promotes last future-me entry into a new bucket", () => {
    setupFutureMe([
      { text: "tangent idea", bucket: "old-proj" },
      { text: "promote this one", bucket: "new-proj" },
    ]);
    const result = promoteFutureMe(vault, "new-proj");
    expect(result.captureText).toBe("promote this one");

    const newCap = readFileSync(join(vault, "OpenClaw", "buckets", "new-proj", "captures.md"), "utf-8");
    expect(newCap).toContain("promote this one");

    const srcFuture = readFileSync(join(vault, "future-me.md"), "utf-8");
    expect(srcFuture).not.toContain("promote this one");
    expect(srcFuture).toContain("tangent idea");
  });

  it("scaffolds all required files in new bucket", () => {
    setupFutureMe([{ text: "idea", bucket: "proj" }]);
    promoteFutureMe(vault, "proj");
    const bucketDir = join(vault, "OpenClaw", "buckets", "proj");
    expect(existsSync(join(bucketDir, "_bucket.md"))).toBe(true);
    expect(existsSync(join(bucketDir, "memory.md"))).toBe(true);
    expect(existsSync(join(bucketDir, "captures.md"))).toBe(true);

    const { data } = matter(readFileSync(join(bucketDir, "_bucket.md"), "utf-8"));
    expect(data.canonical).toBe("proj");
    expect(data.aliases).toEqual([]);
    expect(data.git_repo).toBe("");
    expect(data.vault_refs).toEqual([]);
  });

  // --- negative ---
  it("rejects promotion into existing bucket", () => {
    setupFutureMe([{ text: "entry", bucket: "existing" }]);
    mkdirSync(join(vault, "OpenClaw", "buckets", "existing"), { recursive: true });
    expect(() => promoteFutureMe(vault, "existing")).toThrow("already exists");
  });

  it("throws when no future-me.md exists", () => {
    mkdirSync(join(vault, "OpenClaw", "buckets"), { recursive: true });
    expect(() => promoteFutureMe(vault, "new")).toThrow("No future-me.md");
  });

  it("throws when no entries to promote", () => {
    writeFileSync(join(vault, "future-me.md"), "# Future Me\n\n");
    mkdirSync(join(vault, "OpenClaw", "buckets"), { recursive: true });
    expect(() => promoteFutureMe(vault, "new")).toThrow("No entries");
  });

  it("throws for invalid slug", () => {
    setupFutureMe([{ text: "entry", bucket: "proj" }]);
    expect(() => promoteFutureMe(vault, "INVALID")).toThrow("Invalid slug");
  });

  // --- edge ---
  it("single entry promotion leaves clean future-me.md", () => {
    setupFutureMe([{ text: "only entry", bucket: "solo" }]);
    promoteFutureMe(vault, "solo");
    const remaining = readFileSync(join(vault, "future-me.md"), "utf-8");
    expect(remaining).not.toContain("only entry");
    expect(remaining).toContain("# Future Me");
  });
});

// ============================================================
// updateLastActivity
// ============================================================

describe("updateLastActivity", () => {
  function makeBucket(canonical: string, extraFields: Record<string, unknown> = {}) {
    const dir = join(vault, "OpenClaw", "buckets", canonical);
    mkdirSync(dir, { recursive: true });
    const md = stringifyMatter(
      { canonical, aliases: ["a1"], git_repo: "https://github.com/x/y", vault_refs: ["ref.md"], last_activity: "2026-04-01T00:00:00Z", ...extraFields },
      `\n# ${canonical}\n`,
    );
    writeFileSync(join(dir, "_bucket.md"), md);
  }

  // --- positive ---
  it("updates last_activity in bucket frontmatter", () => {
    makeBucket("proj");
    updateLastActivity(vault, "proj", "2026-04-20T10:00:00Z");
    const { data } = matter(readFileSync(join(vault, "OpenClaw", "buckets", "proj", "_bucket.md"), "utf-8"));
    expect(data.last_activity).toBe("2026-04-20T10:00:00Z");
  });

  it("overwrites existing timestamp", () => {
    makeBucket("proj");
    updateLastActivity(vault, "proj", "2026-04-15T00:00:00Z");
    updateLastActivity(vault, "proj", "2026-04-20T00:00:00Z");
    const { data } = matter(readFileSync(join(vault, "OpenClaw", "buckets", "proj", "_bucket.md"), "utf-8"));
    expect(data.last_activity).toBe("2026-04-20T00:00:00Z");
  });

  it("preserves other frontmatter fields", () => {
    makeBucket("proj");
    updateLastActivity(vault, "proj", "2026-04-20T10:00:00Z");
    const { data } = matter(readFileSync(join(vault, "OpenClaw", "buckets", "proj", "_bucket.md"), "utf-8"));
    expect(data.canonical).toBe("proj");
    expect(data.aliases).toEqual(["a1"]);
    expect(data.git_repo).toBe("https://github.com/x/y");
    expect(data.vault_refs).toEqual(["ref.md"]);
  });

  // --- negative ---
  it("throws for nonexistent bucket", () => {
    expect(() => updateLastActivity(vault, "nope", "2026-04-20")).toThrow("does not exist");
  });

  it("throws for invalid slug", () => {
    expect(() => updateLastActivity(vault, "INVALID", "2026-04-20")).toThrow("Invalid slug");
  });
});

// ============================================================
// Workspace primitives: Triage log
// ============================================================

describe("appendTriageLog / readTriageLog", () => {
  const makeEntry = (overrides: Partial<TriageLogEntry> = {}): TriageLogEntry => ({
    timestamp: "2026-04-17T00:00:00Z",
    raw: "test message",
    classification: "capture",
    target: "architect",
    action: "wrote",
    ...overrides,
  });

  // --- positive ---
  it("creates triage-log.md on first append", () => {
    const ws = join(vault, "openclaw");
    appendTriageLog(ws, makeEntry());
    const content = readTriageLog(ws);
    expect(content).toContain("# Triage Log");
    expect(content).toContain("test message");
    expect(content).toContain("capture");
  });

  it("creates workspace directory if needed", () => {
    const ws = join(vault, "openclaw", "nested");
    appendTriageLog(ws, makeEntry());
    expect(existsSync(join(ws, "triage-log.md"))).toBe(true);
  });

  it("appends multiple entries sequentially", () => {
    const ws = join(vault, "openclaw");
    appendTriageLog(ws, makeEntry({ raw: "first" }));
    appendTriageLog(ws, makeEntry({ raw: "second" }));
    appendTriageLog(ws, makeEntry({ raw: "third" }));
    const content = readTriageLog(ws);
    expect(content).toContain("first");
    expect(content).toContain("second");
    expect(content).toContain("third");
  });

  // --- negative ---
  it("returns empty string when no log exists", () => {
    expect(readTriageLog(join(vault, "openclaw"))).toBe("");
  });

  // --- edge ---
  it("truncates raw message at 80 chars", () => {
    const ws = join(vault, "openclaw");
    const longMessage = "a".repeat(100);
    appendTriageLog(ws, makeEntry({ raw: longMessage }));
    const content = readTriageLog(ws);
    // The raw field is sliced to 80 chars in the table
    expect(content).toContain("a".repeat(80));
    expect(content).not.toContain("a".repeat(81));
  });

  it("first file has markdown table header", () => {
    const ws = join(vault, "openclaw");
    appendTriageLog(ws, makeEntry());
    const content = readTriageLog(ws);
    expect(content).toContain("| Time | Class | Target | Action | Message |");
    expect(content).toContain("|---|---|---|---|---|");
  });
});

// Need to import the interface for the helper
interface TriageLogEntry {
  timestamp: string;
  raw: string;
  classification: string;
  target: string;
  action: string;
}

// ============================================================
// Workspace primitives: Focus
// ============================================================

describe("writeFocus / readFocus", () => {
  // --- positive ---
  it("writes and reads focus state", () => {
    const ws = join(vault, "openclaw");
    writeFocus(ws, {
      mode: "drafting",
      activeBucket: "architect",
      artifactRef: "blog/post.md",
      startedAt: "2026-04-17T00:00:00Z",
    });
    const focus = readFocus(ws);
    expect(focus).not.toBeNull();
    expect(focus!.mode).toBe("drafting");
    expect(focus!.activeBucket).toBe("architect");
    expect(focus!.artifactRef).toBe("blog/post.md");
    expect(focus!.startedAt).toBe("2026-04-17T00:00:00Z");
  });

  // --- negative ---
  it("returns null when no focus exists", () => {
    expect(readFocus(join(vault, "openclaw"))).toBeNull();
  });

  // --- edge ---
  it("overwrites previous focus (always-edit)", () => {
    const ws = join(vault, "openclaw");
    writeFocus(ws, {
      mode: "drafting",
      activeBucket: "old-bucket",
      artifactRef: "old.md",
      startedAt: "2026-04-17T00:00:00Z",
    });
    writeFocus(ws, {
      mode: "watching",
      activeBucket: "new-bucket",
      artifactRef: "new.md",
      startedAt: "2026-04-17T01:00:00Z",
    });
    const focus = readFocus(ws);
    expect(focus!.mode).toBe("watching");
    expect(focus!.activeBucket).toBe("new-bucket");
    expect(focus!.artifactRef).toBe("new.md");
  });

  it("round-trips all mode values", () => {
    const ws = join(vault, "openclaw");
    for (const mode of ["idle", "drafting", "watching"] as const) {
      writeFocus(ws, { mode, activeBucket: "", artifactRef: "", startedAt: "" });
      expect(readFocus(ws)!.mode).toBe(mode);
    }
  });

  it("handles empty artifact ref", () => {
    const ws = join(vault, "openclaw");
    writeFocus(ws, {
      mode: "idle",
      activeBucket: "test",
      artifactRef: "",
      startedAt: "2026-04-17T00:00:00Z",
    });
    const focus = readFocus(ws);
    expect(focus!.artifactRef).toBe("");
  });

  it("creates workspace directory if needed", () => {
    const ws = join(vault, "openclaw", "deep", "path");
    writeFocus(ws, {
      mode: "idle",
      activeBucket: "",
      artifactRef: "",
      startedAt: "",
    });
    expect(existsSync(join(ws, "focus.md"))).toBe(true);
  });

  it("read returns defaults for missing fields in malformed file", () => {
    const ws = join(vault, "openclaw");
    mkdirSync(ws, { recursive: true });
    writeFileSync(join(ws, "focus.md"), "---\nmode: drafting\n---\n# Focus\n");
    const focus = readFocus(ws);
    expect(focus!.mode).toBe("drafting");
    expect(focus!.activeBucket).toBe("");
    expect(focus!.artifactRef).toBe("");
    expect(focus!.startedAt).toBe("");
  });
});

// ============================================================
// Workspace primitives: Pause
// ============================================================

describe("writePause / readPause / clearPause", () => {
  // --- positive ---
  it("writes and reads pause", () => {
    const ws = join(vault, "openclaw");
    writePause(ws, "2026-04-17T01:00:00Z");
    const expiry = readPause(ws);
    expect(expiry).toBe("2026-04-17T01:00:00Z");
  });

  it("clears pause", () => {
    const ws = join(vault, "openclaw");
    writePause(ws, "2026-04-17T01:00:00Z");
    expect(clearPause(ws)).toBe(true);
    expect(readPause(ws)).toBeNull();
  });

  // --- negative ---
  it("returns null when not paused", () => {
    expect(readPause(join(vault, "openclaw"))).toBeNull();
  });

  it("returns false when clearing non-existent pause", () => {
    expect(clearPause(join(vault, "openclaw"))).toBe(false);
  });

  // --- edge ---
  it("overwrites existing pause with new expiry", () => {
    const ws = join(vault, "openclaw");
    writePause(ws, "2026-04-17T01:00:00Z");
    writePause(ws, "2026-04-17T05:00:00Z");
    expect(readPause(ws)).toBe("2026-04-17T05:00:00Z");
  });

  it("double clear returns false on second call", () => {
    const ws = join(vault, "openclaw");
    writePause(ws, "2026-04-17T01:00:00Z");
    expect(clearPause(ws)).toBe(true);
    expect(clearPause(ws)).toBe(false);
  });

  it("creates workspace directory if needed", () => {
    const ws = join(vault, "openclaw", "nested");
    writePause(ws, "2026-04-17T01:00:00Z");
    expect(existsSync(join(ws, "pause.md"))).toBe(true);
  });

  it("pause file contains expected content", () => {
    const ws = join(vault, "openclaw");
    writePause(ws, "2026-04-17T01:00:00Z");
    const content = readFileSync(join(ws, "pause.md"), "utf-8");
    expect(content).toContain("Agent is paused");
    expect(content).toContain("2026-04-17T01:00:00Z");
  });
});

// ============================================================
// Workspace primitives: Holds
// ============================================================

describe("addHold / listHolds / removeHold", () => {
  // --- positive ---
  it("adds and lists holds", () => {
    const ws = join(vault, "openclaw");
    addHold(ws, "journal.md", false);
    addHold(ws, "private/notes.md", true);
    const holds = listHolds(ws);
    expect(holds).toHaveLength(2);
    expect(holds[0]).toEqual({ path: "journal.md", persistent: false });
    expect(holds[1]).toEqual({ path: "private/notes.md", persistent: true });
  });

  it("removes a hold", () => {
    const ws = join(vault, "openclaw");
    addHold(ws, "journal.md", false);
    expect(removeHold(ws, "journal.md")).toBe(true);
    expect(listHolds(ws)).toHaveLength(0);
  });

  // --- negative ---
  it("returns false when removing non-existent hold", () => {
    const ws = join(vault, "openclaw");
    expect(removeHold(ws, "nope.md")).toBe(false);
  });

  it("returns empty array when no holds file", () => {
    expect(listHolds(join(vault, "openclaw"))).toEqual([]);
  });

  // --- edge ---
  it("same path added twice creates duplicate entries", () => {
    const ws = join(vault, "openclaw");
    addHold(ws, "file.md", false);
    addHold(ws, "file.md", false);
    const holds = listHolds(ws);
    expect(holds).toHaveLength(2);
  });

  it("removing one hold preserves others", () => {
    const ws = join(vault, "openclaw");
    addHold(ws, "a.md", false);
    addHold(ws, "b.md", true);
    addHold(ws, "c.md", false);
    removeHold(ws, "b.md");
    const holds = listHolds(ws);
    expect(holds).toHaveLength(2);
    expect(holds.map((h) => h.path)).toEqual(["a.md", "c.md"]);
  });

  it("holds file with only header returns empty list", () => {
    const ws = join(vault, "openclaw");
    mkdirSync(ws, { recursive: true });
    writeFileSync(join(ws, "holds.md"), "# Holds\n\nPaths the agent must not touch.\n\n");
    expect(listHolds(ws)).toEqual([]);
  });

  it("creates workspace directory if needed", () => {
    const ws = join(vault, "openclaw", "nested");
    addHold(ws, "file.md", false);
    expect(existsSync(join(ws, "holds.md"))).toBe(true);
  });

  it("remove returns false when holds file does not exist", () => {
    const ws = join(vault, "openclaw");
    expect(removeHold(ws, "anything")).toBe(false);
  });
});

// ============================================================
// Workspace primitives: Daily notes
// ============================================================

describe("appendDailyNote / readDailyNote", () => {
  // --- positive ---
  it("creates daily note on first append", () => {
    const ws = join(vault, "openclaw");
    appendDailyNote(ws, "2026-04-17", "Focus changed to architect.");
    const content = readDailyNote(ws, "2026-04-17");
    expect(content).toContain("# 2026-04-17");
    expect(content).toContain("Focus changed to architect.");
  });

  it("appends to existing daily note", () => {
    const ws = join(vault, "openclaw");
    appendDailyNote(ws, "2026-04-17", "First entry.");
    appendDailyNote(ws, "2026-04-17", "Second entry.");
    const content = readDailyNote(ws, "2026-04-17");
    expect(content).toContain("First entry.");
    expect(content).toContain("Second entry.");
  });

  // --- negative ---
  it("returns empty string for missing date", () => {
    expect(readDailyNote(join(vault, "openclaw"), "2026-01-01")).toBe("");
  });

  // --- edge ---
  it("different dates do not interfere", () => {
    const ws = join(vault, "openclaw");
    appendDailyNote(ws, "2026-04-17", "Day 1 entry");
    appendDailyNote(ws, "2026-04-18", "Day 2 entry");
    const day1 = readDailyNote(ws, "2026-04-17");
    const day2 = readDailyNote(ws, "2026-04-18");
    expect(day1).toContain("Day 1 entry");
    expect(day1).not.toContain("Day 2 entry");
    expect(day2).toContain("Day 2 entry");
    expect(day2).not.toContain("Day 1 entry");
  });

  it("creates memory subdirectory if needed", () => {
    const ws = join(vault, "openclaw");
    appendDailyNote(ws, "2026-04-17", "entry");
    expect(existsSync(join(ws, "memory", "2026-04-17.md"))).toBe(true);
  });

  it("multiple appends accumulate in order", () => {
    const ws = join(vault, "openclaw");
    appendDailyNote(ws, "2026-04-17", "A");
    appendDailyNote(ws, "2026-04-17", "B");
    appendDailyNote(ws, "2026-04-17", "C");
    const content = readDailyNote(ws, "2026-04-17");
    const aIdx = content.indexOf("A");
    const bIdx = content.indexOf("B");
    const cIdx = content.indexOf("C");
    expect(aIdx).toBeLessThan(bIdx);
    expect(bIdx).toBeLessThan(cIdx);
  });
});

// ============================================================
// scaffoldRuntimeAgentsMd
// ============================================================

describe("scaffoldRuntimeAgentsMd", () => {
  // --- positive ---
  it("creates AGENTS.md on first call", () => {
    const ws = join(vault, "openclaw");
    expect(scaffoldRuntimeAgentsMd(ws)).toBe(true);
    const content = readFileSync(join(ws, "AGENTS.md"), "utf-8");
    expect(content).toContain("Living Config");
    expect(content).toContain("Decision categories");
  });

  it("creates workspace directory if needed", () => {
    const ws = join(vault, "openclaw", "deep");
    scaffoldRuntimeAgentsMd(ws);
    expect(existsSync(join(ws, "AGENTS.md"))).toBe(true);
  });

  // --- negative ---
  it("does not overwrite existing AGENTS.md", () => {
    const ws = join(vault, "openclaw");
    mkdirSync(ws, { recursive: true });
    writeFileSync(join(ws, "AGENTS.md"), "# Custom content\n");
    expect(scaffoldRuntimeAgentsMd(ws)).toBe(false);
    const content = readFileSync(join(ws, "AGENTS.md"), "utf-8");
    expect(content).toBe("# Custom content\n");
  });

  // --- edge ---
  it("is idempotent — second call returns false", () => {
    const ws = join(vault, "openclaw");
    expect(scaffoldRuntimeAgentsMd(ws)).toBe(true);
    expect(scaffoldRuntimeAgentsMd(ws)).toBe(false);
  });

  it("scaffolded content includes expected sections", () => {
    const ws = join(vault, "openclaw");
    scaffoldRuntimeAgentsMd(ws);
    const content = readFileSync(join(ws, "AGENTS.md"), "utf-8");
    expect(content).toContain("## Decision categories");
    expect(content).toContain("### Routing");
    expect(content).toContain("### Classification");
    expect(content).toContain("### Tone");
    expect(content).toContain("## Default posture");
    expect(content).toContain("## Correction logging");
    expect(content).toContain("## Job cadence");
    expect(content).toContain("## Holds");
    expect(content).toContain("## Dispatcher");
    expect(content).toContain("## Pause");
  });
});

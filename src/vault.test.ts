import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  validateSlug, assertWithinBase, matter, stringifyMatter,
  readBucketManifest, writeCapture, writeInbox, autoDiscoverBuckets,
  addAlias, moveLastCapture, promoteFutureMe,
  writeWatcher, readWatcher, writeDraft, writeConflicts, readConflicts, updateLastCommit,
} from "./vault.js";

let vault: string;

beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), "clawback-test-"));
});

afterEach(() => {
  rmSync(vault, { recursive: true, force: true });
});

// --- validateSlug ---

describe("validateSlug", () => {
  it("accepts valid slugs", () => {
    expect(() => validateSlug("architect")).not.toThrow();
    expect(() => validateSlug("yard-work")).not.toThrow();
    expect(() => validateSlug("a1-b2")).not.toThrow();
  });

  it("rejects invalid slugs", () => {
    expect(() => validateSlug("")).toThrow();
    expect(() => validateSlug("UPPER")).toThrow();
    expect(() => validateSlug("-leading")).toThrow();
    expect(() => validateSlug("has spaces")).toThrow();
    expect(() => validateSlug("../traversal")).toThrow();
  });

  it("rejects slugs over 64 chars", () => {
    expect(() => validateSlug("a".repeat(65))).toThrow();
    expect(() => validateSlug("a".repeat(64))).not.toThrow();
  });
});

// --- assertWithinBase ---

describe("assertWithinBase", () => {
  it("allows paths within base", () => {
    expect(() => assertWithinBase("/base", "/base/child")).not.toThrow();
    expect(() => assertWithinBase("/base", "/base/a/b/c")).not.toThrow();
  });

  it("blocks path traversal", () => {
    expect(() => assertWithinBase("/base", "/base/../etc/passwd")).toThrow("traversal");
    expect(() => assertWithinBase("/base", "/other")).toThrow("traversal");
  });
});

// --- matter / stringifyMatter ---

describe("matter", () => {
  it("parses frontmatter and body", () => {
    const input = "---\nslug: test\ndescription: A test\naliases: []\nstate: active\n---\n\n# Test\n";
    const { data, content } = matter(input);
    expect(data.slug).toBe("test");
    expect(data.description).toBe("A test");
    expect(data.state).toBe("active");
    expect(content).toBe("\n\n# Test\n");
  });

  it("returns defaults for no frontmatter", () => {
    const { data, content } = matter("# Just a heading\n");
    expect(data.slug).toBe("");
    expect(data.state).toBe("active");
    expect(content).toBe("# Just a heading\n");
  });

  it("round-trips through stringifyMatter", () => {
    const original = {
      slug: "test", description: "A test", aliases: ["foo", "bar"],
      state: "active", "last-commit": "", repos: [],
    };
    const body = "\n# Test\n\nSome content.\n";
    const serialized = stringifyMatter(original, body);
    const { data, content } = matter(serialized);
    expect(data.slug).toBe("test");
    expect(data.aliases).toEqual(["foo", "bar"]);
    expect(content).toBe(body);
  });
});

// --- writeCapture ---

describe("writeCapture", () => {
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
});

// --- writeInbox ---

describe("writeInbox", () => {
  it("creates _inbox.md on first write", () => {
    writeInbox(vault, "low confidence capture", "2026-04-17T00:00:00Z");
    const content = readFileSync(join(vault, "_inbox.md"), "utf-8");
    expect(content).toContain("# Inbox");
    expect(content).toContain("low confidence capture");
  });
});

// --- readBucketManifest ---

describe("readBucketManifest", () => {
  it("returns empty for missing buckets dir", () => {
    expect(readBucketManifest(vault)).toEqual([]);
  });

  it("reads bucket metadata", () => {
    const bucketsDir = join(vault, "OpenClaw", "buckets", "test");
    mkdirSync(bucketsDir, { recursive: true });
    const bucketMd = stringifyMatter(
      { slug: "test", description: "Test bucket", aliases: ["t"], state: "active", "last-commit": "", repos: [] },
      "\n# test\n",
    );
    writeFileSync(join(bucketsDir, "_bucket.md"), bucketMd);
    const manifest = readBucketManifest(vault);
    expect(manifest).toHaveLength(1);
    expect(manifest[0].slug).toBe("test");
    expect(manifest[0].description).toBe("Test bucket");
    expect(manifest[0].aliases).toEqual(["t"]);
  });
});

// --- autoDiscoverBuckets ---

describe("autoDiscoverBuckets", () => {
  it("scaffolds folders missing _bucket.md", () => {
    const bucketsDir = join(vault, "OpenClaw", "buckets");
    mkdirSync(join(bucketsDir, "architect"), { recursive: true });
    mkdirSync(join(bucketsDir, "fitness"), { recursive: true });

    const discovered = autoDiscoverBuckets(vault);
    expect(discovered.toSorted((a, b) => a.localeCompare(b))).toEqual(["architect", "fitness"]);

    // Verify files created
    for (const slug of discovered) {
      expect(existsSync(join(bucketsDir, slug, "_bucket.md"))).toBe(true);
      expect(existsSync(join(bucketsDir, slug, "captures.md"))).toBe(true);
      expect(existsSync(join(bucketsDir, slug, "memory.md"))).toBe(true);
      expect(existsSync(join(bucketsDir, slug, "future-me.md"))).toBe(true);
    }

    // Verify frontmatter
    const { data } = matter(readFileSync(join(bucketsDir, "architect", "_bucket.md"), "utf-8"));
    expect(data.slug).toBe("architect");
    expect(data.state).toBe("active");
  });

  it("skips folders that already have _bucket.md", () => {
    const bucketsDir = join(vault, "OpenClaw", "buckets");
    mkdirSync(join(bucketsDir, "existing"), { recursive: true });
    writeFileSync(join(bucketsDir, "existing", "_bucket.md"), "---\nslug: existing\n---\n");

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
});

// --- always-edit proof ---

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

// --- addAlias ---

describe("addAlias", () => {
  function makeBucket(slug: string) {
    const dir = join(vault, "OpenClaw", "buckets", slug);
    mkdirSync(dir, { recursive: true });
    const md = stringifyMatter(
      { slug, description: "Test", aliases: [], state: "active", "last-commit": "", repos: [] },
      `\n# ${slug}\n`,
    );
    writeFileSync(join(dir, "_bucket.md"), md);
  }

  it("adds a new alias", () => {
    makeBucket("proj");
    const result = addAlias(vault, "proj", "My Project");
    expect(result.added).toBe(true);
    expect(result.normalized).toBe("my project");
    const { data } = matter(readFileSync(join(vault, "OpenClaw", "buckets", "proj", "_bucket.md"), "utf-8"));
    expect(data.aliases).toContain("my project");
  });

  it("rejects duplicate alias", () => {
    makeBucket("proj");
    addAlias(vault, "proj", "duplicate");
    const result = addAlias(vault, "proj", "Duplicate");
    expect(result.added).toBe(false);
  });

  it("throws for nonexistent bucket", () => {
    expect(() => addAlias(vault, "nope", "alias")).toThrow("does not exist");
  });
});

// --- moveLastCapture ---

describe("moveLastCapture", () => {
  function makeBucketWithCaptures(slug: string, captures: string[]) {
    const dir = join(vault, "OpenClaw", "buckets", slug);
    mkdirSync(dir, { recursive: true });
    const md = stringifyMatter(
      { slug, description: "Test", aliases: [], state: "active", "last-commit": "", repos: [] },
      `\n# ${slug}\n`,
    );
    writeFileSync(join(dir, "_bucket.md"), md);
    let content = `# Captures — ${slug}\n`;
    for (const c of captures) {
      content += `\n---\n**2026-04-17T00:00:00Z**\n${c}\n`;
    }
    writeFileSync(join(dir, "captures.md"), content);
  }

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

  it("throws when source has no captures file", () => {
    const dir = join(vault, "OpenClaw", "buckets", "empty");
    mkdirSync(dir, { recursive: true });
    expect(() => moveLastCapture(vault, "empty", "dest")).toThrow("No captures found");
  });
});

// --- promoteFutureMe ---

describe("promoteFutureMe", () => {
  function makeBucketWithFutureMe(slug: string, entries: string[]) {
    const dir = join(vault, "OpenClaw", "buckets", slug);
    mkdirSync(dir, { recursive: true });
    const md = stringifyMatter(
      { slug, description: "Test", aliases: [], state: "active", "last-commit": "", repos: [] },
      `\n# ${slug}\n`,
    );
    writeFileSync(join(dir, "_bucket.md"), md);
    let content = `# Future Me — ${slug}\n\nTangent captures parked here for later.\n`;
    for (const e of entries) {
      content += `\n---\n**2026-04-17T00:00:00Z**\n${e}\n`;
    }
    writeFileSync(join(dir, "future-me.md"), content);
  }

  it("promotes last future-me entry into a new bucket", () => {
    makeBucketWithFutureMe("source", ["tangent idea", "promote this one"]);
    const result = promoteFutureMe(vault, "source", "new-proj", "A promoted project");
    expect(result.captureText).toBe("promote this one");

    // New bucket exists with capture
    const newCap = readFileSync(join(vault, "OpenClaw", "buckets", "new-proj", "captures.md"), "utf-8");
    expect(newCap).toContain("promote this one");

    // Source future-me no longer has the promoted entry
    const srcFuture = readFileSync(join(vault, "OpenClaw", "buckets", "source", "future-me.md"), "utf-8");
    expect(srcFuture).not.toContain("promote this one");
    expect(srcFuture).toContain("tangent idea");
  });

  it("rejects promotion into existing bucket", () => {
    makeBucketWithFutureMe("source", ["entry"]);
    makeBucketWithFutureMe("existing", []);
    expect(() => promoteFutureMe(vault, "source", "existing", "desc")).toThrow("already exists");
  });

  it("rejects same-slug promotion", () => {
    makeBucketWithFutureMe("source", ["entry"]);
    expect(() => promoteFutureMe(vault, "source", "source", "desc")).toThrow("same bucket");
  });

  it("throws when no entries to promote", () => {
    const dir = join(vault, "OpenClaw", "buckets", "empty");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "future-me.md"), "# Future Me — empty\n\n");
    expect(() => promoteFutureMe(vault, "empty", "new", "desc")).toThrow("No entries");
  });
});

// --- Day 4: writeWatcher / readWatcher ---

describe("writeWatcher / readWatcher", () => {
  it("creates pr-alerts.md on first write", () => {
    writeWatcher(vault, "pr-alerts.md", "\n---\n**2026-04-20** repo#1 — awaiting review\n");
    const content = readWatcher(vault, "pr-alerts.md");
    expect(content).toContain("# PR Alerts");
    expect(content).toContain("repo#1");
  });

  it("appends to existing watcher file", () => {
    writeWatcher(vault, "dev-comments.md", "\n---\nfirst entry\n");
    writeWatcher(vault, "dev-comments.md", "\n---\nsecond entry\n");
    const content = readWatcher(vault, "dev-comments.md");
    expect(content).toContain("first entry");
    expect(content).toContain("second entry");
  });

  it("rejects invalid filenames", () => {
    expect(() => writeWatcher(vault, "evil.md", "x")).toThrow("Invalid watcher file");
    expect(() => readWatcher(vault, "../etc/passwd")).toThrow("Invalid watcher file");
  });

  it("returns empty string for missing file", () => {
    expect(readWatcher(vault, "pr-alerts.md")).toBe("");
  });
});

// --- writeDraft ---

describe("writeDraft", () => {
  it("creates draft file in bucket's drafts dir", () => {
    const dir = join(vault, "OpenClaw", "buckets", "proj");
    mkdirSync(dir, { recursive: true });
    const filename = writeDraft(vault, "proj", "dev-submission", "# My Draft\n\nContent here.");
    expect(filename).toMatch(/^dev-submission-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.md$/);
    const content = readFileSync(join(dir, "drafts", filename), "utf-8");
    expect(content).toContain("# My Draft");
  });
});

// --- writeConflicts / readConflicts ---

describe("writeConflicts / readConflicts", () => {
  it("writes and reads _conflicts.md", () => {
    writeConflicts(vault, "# Conflicts\n\n- foo vs bar\n");
    const content = readConflicts(vault);
    expect(content).toContain("foo vs bar");
  });

  it("returns empty string when file missing", () => {
    expect(readConflicts(vault)).toBe("");
  });

  it("replaces on subsequent writes (always-edit)", () => {
    writeConflicts(vault, "old");
    writeConflicts(vault, "new");
    expect(readConflicts(vault)).toBe("new");
    expect(readConflicts(vault)).not.toContain("old");
  });
});

// --- updateLastCommit ---

describe("updateLastCommit", () => {
  it("updates last-commit in bucket frontmatter", () => {
    const dir = join(vault, "OpenClaw", "buckets", "proj");
    mkdirSync(dir, { recursive: true });
    const md = stringifyMatter(
      { slug: "proj", description: "Test", aliases: [], state: "active", "last-commit": "", repos: [] },
      "\n# proj\n",
    );
    writeFileSync(join(dir, "_bucket.md"), md);

    updateLastCommit(vault, "proj", "2026-04-20T10:00:00Z");
    const { data } = matter(readFileSync(join(dir, "_bucket.md"), "utf-8"));
    expect(data["last-commit"]).toBe("2026-04-20T10:00:00Z");
  });

  it("throws for nonexistent bucket", () => {
    expect(() => updateLastCommit(vault, "nope", "2026-04-20")).toThrow("does not exist");
  });
});

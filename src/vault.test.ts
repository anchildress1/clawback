import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  validateSlug, assertWithinBase, matter, stringifyMatter,
  readBucketManifest, writeCapture, writeInbox, autoDiscoverBuckets,
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

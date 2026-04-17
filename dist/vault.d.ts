export declare const SLUG_PATTERN: RegExp;
export declare function validateSlug(slug: string): void;
export declare function assertWithinBase(basePath: string, targetPath: string): void;
export declare function getVaultPath(pluginConfig: Record<string, unknown>): string;
export interface BucketFrontmatter {
    [key: string]: unknown;
    slug: string;
    description: string;
    aliases: string[];
    state: string;
    "last-commit": string;
    repos: string[];
}
export declare const BUCKET_DEFAULTS: BucketFrontmatter;
export interface MatterResult {
    data: BucketFrontmatter;
    content: string;
}
export declare function matter(input: string): MatterResult;
export declare function stringifyMatter(data: Record<string, unknown>, content: string): string;
export interface BucketManifestEntry {
    slug: string;
    description: string;
    aliases: string[];
    state: string;
    lastCommit: string;
    repos: string[];
    recentCaptures: string[];
}
export declare function readBucketManifest(vaultPath: string): BucketManifestEntry[];
export declare function writeCapture(vaultPath: string, slug: string, text: string, timestamp: string): void;
export declare function writeInbox(vaultPath: string, text: string, timestamp: string): void;
export declare function autoDiscoverBuckets(vaultPath: string): string[];

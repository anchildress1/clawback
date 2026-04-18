export declare const SLUG_PATTERN: RegExp;
export declare function validateSlug(slug: string): void;
export declare function assertWithinBase(basePath: string, targetPath: string): void;
export declare function getVaultPath(pluginConfig: Record<string, unknown>): string;
export interface BucketFrontmatter {
    [key: string]: unknown;
    canonical: string;
    aliases: string[];
    git_repo: string;
    vault_refs: string[];
    last_activity: string;
}
export declare const BUCKET_DEFAULTS: BucketFrontmatter;
export interface MatterResult {
    data: BucketFrontmatter;
    content: string;
}
export declare function matter(input: string): MatterResult;
export declare function stringifyMatter(data: Record<string, unknown>, content: string): string;
export interface BucketManifestEntry {
    canonical: string;
    aliases: string[];
    gitRepo: string;
    vaultRefs: string[];
    lastActivity: string;
    recentCaptures: string[];
}
export declare function readBucketManifest(vaultPath: string): BucketManifestEntry[];
export declare function writeCapture(vaultPath: string, slug: string, text: string, timestamp: string): void;
export declare function writeInbox(vaultPath: string, text: string, timestamp: string): void;
export declare function autoDiscoverBuckets(vaultPath: string): string[];
export interface AddAliasResult {
    added: boolean;
    normalized: string;
}
export declare function addAlias(vaultPath: string, canonical: string, alias: string): AddAliasResult;
export interface MoveLastCaptureResult {
    captureText: string;
    timestamp: string;
}
export declare function moveLastCapture(vaultPath: string, fromSlug: string, toSlug: string): MoveLastCaptureResult;
export interface PromoteFutureMeResult {
    captureText: string;
    timestamp: string;
}
export declare function promoteFutureMe(vaultPath: string, newCanonical: string): PromoteFutureMeResult;
export declare function writeFutureMe(vaultPath: string, text: string, bucketHint: string, timestamp: string): void;
export declare function getWorkspacePath(pluginConfig: Record<string, unknown>): string;
export interface TriageLogEntry {
    timestamp: string;
    raw: string;
    classification: string;
    target: string;
    action: string;
}
export declare function appendTriageLog(workspacePath: string, entry: TriageLogEntry): void;
export declare function readTriageLog(workspacePath: string): string;
export interface FocusState {
    mode: "idle" | "drafting" | "watching";
    activeBucket: string;
    artifactRef: string;
    startedAt: string;
}
export declare function writeFocus(workspacePath: string, focus: FocusState): void;
export declare function readFocus(workspacePath: string): FocusState | null;
export declare function writePause(workspacePath: string, expiry: string): void;
export declare function readPause(workspacePath: string): string | null;
export declare function clearPause(workspacePath: string): boolean;
export interface Hold {
    path: string;
    persistent: boolean;
}
export declare function addHold(workspacePath: string, holdPath: string, persistent: boolean): void;
export declare function listHolds(workspacePath: string): Hold[];
export declare function removeHold(workspacePath: string, holdPath: string): boolean;
export declare function appendDailyNote(workspacePath: string, date: string, entry: string): void;
export declare function readDailyNote(workspacePath: string, date: string): string;
export declare function scaffoldRuntimeAgentsMd(workspacePath: string): boolean;
export declare function updateLastActivity(vaultPath: string, canonical: string, timestamp: string): void;

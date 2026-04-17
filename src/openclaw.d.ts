declare module "openclaw/plugin-sdk/plugin-entry" {
  import type { TObject } from "@sinclair/typebox";

  interface ToolResult {
    content: Array<{ type: "text"; text: string }>;
    details?: Record<string, unknown>;
  }

  interface ToolRegistration {
    name: string;
    label: string;
    description: string;
    parameters: TObject;
    execute(toolCallId: string, params: Record<string, unknown>): Promise<ToolResult>;
  }

  interface PluginLogger {
    debug(message: string): void;
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  }

  interface PluginApi {
    registerTool(tool: ToolRegistration): void;
    registerHook(event: string, handler: () => Promise<void>): void;
    registerHook(event: string, options: { name: string }, handler: () => Promise<void>): void;
    getConfig(): Record<string, unknown>;
    logger: PluginLogger;
    rootDir: string;
    resolvePath(relativePath: string): string;
  }

  interface PluginEntry {
    id: string;
    name: string;
    description: string;
    register(api: PluginApi): void;
  }

  export function definePluginEntry(entry: PluginEntry): PluginEntry;
}

// Minimal types for the WebMCP producer API as documented for Chrome 150+.
// `navigator.modelContext` was removed in Chrome 150. Tools are unregistered
// by aborting the signal passed to registerTool (`unregisterTool` was removed
// in Chrome 148).

export type WebMcpAnnotations = {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
  consequentialHint?: boolean;
};

export type WebMcpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: WebMcpAnnotations;
  execute: (
    input: unknown,
    options?: { signal?: AbortSignal },
  ) => unknown | Promise<unknown>;
};

export type WebMcpModelContext = {
  registerTool: (
    tool: WebMcpTool,
    options?: { signal?: AbortSignal },
  ) => Promise<void>;
};

declare global {
  interface Document {
    modelContext?: WebMcpModelContext;
  }
}

import {
  addTodo,
  formatTodoList,
  requestClear,
  toggleTodo,
  type AppState,
  type ToolResult,
} from "./todos";
import type { WebMcpAnnotations, WebMcpModelContext } from "./webmcp";

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: WebMcpAnnotations;
};

function emptySchema(): Record<string, unknown> {
  return { type: "object", properties: {} };
}

export const TOOLS: readonly ToolDefinition[] = [
  {
    name: "list_todos",
    description:
      "Read the todos on this page. Returns ids, titles, done flags, and whether a clear is waiting for the person at the keyboard.",
    inputSchema: emptySchema(),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  {
    name: "add_todo",
    description:
      "Add a todo to the list on this page. The new item shows up in the page immediately.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Todo title, 1 to 120 characters.",
          minLength: 1,
          maxLength: 120,
        },
      },
      required: ["title"],
    },
    annotations: { untrustedContentHint: true },
  },
  {
    name: "toggle_todo",
    description:
      "Flip one todo between open and done. Fails if the id is not on the list. Call list_todos to see current ids.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Todo id from list_todos, such as t1.",
        },
      },
      required: ["id"],
    },
    annotations: { untrustedContentHint: true },
  },
  {
    name: "clear_todos",
    description:
      "Ask to delete every todo. This does not delete anything by itself. If the list has items, the page asks the person at the keyboard to confirm or cancel. If the list is empty, nothing changes.",
    inputSchema: emptySchema(),
    annotations: { consequentialHint: true },
  },
];

/**
 * Chrome 154's in-page executeTool still JSON-parses its argument string.
 * Chrome 155 prefers a plain object (the string form is deprecated). The
 * execute callback may therefore see either shape, depending on the caller.
 */
export function readToolInput(input: unknown): Record<string, unknown> {
  if (typeof input === "string") {
    if (!input.trim()) return {};
    try {
      const parsed = JSON.parse(input) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
    return {};
  }

  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}

export function applyTool(
  state: AppState,
  name: string,
  input: unknown,
): ToolResult<unknown> {
  const args = readToolInput(input);
  switch (name) {
    case "list_todos":
      return {
        ok: true,
        state,
        message: formatTodoList(state),
        data: state.todos,
      };
    case "add_todo":
      return addTodo(state, typeof args.title === "string" ? args.title : "");
    case "toggle_todo":
      return toggleTodo(state, typeof args.id === "string" ? args.id : "");
    case "clear_todos":
      return requestClear(state);
    default:
      return { ok: false, state, message: `Unknown tool "${name}".` };
  }
}

export type ToolHost = {
  getState: () => AppState;
  commit: (result: ToolResult<unknown>, toolName: string) => void;
};

export async function registerDemoTools(
  modelContext: WebMcpModelContext,
  host: ToolHost,
  signal?: AbortSignal,
): Promise<void> {
  // Aborting `signal` unregisters every tool. There is no unregisterTool.
  const options = signal ? { signal } : {};
  for (const tool of TOOLS) {
    await modelContext.registerTool(
      {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        ...(tool.annotations ? { annotations: tool.annotations } : {}),
        execute(input) {
          const result = applyTool(host.getState(), tool.name, input);
          host.commit(result, tool.name);
          if (!result.ok) throw new Error(result.message);
          return result.message;
        },
      },
      options,
    );
  }
}

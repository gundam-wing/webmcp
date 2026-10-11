// Shared todo logic. The page buttons and the WebMCP tools both call these
// functions, so an agent and a person always change the same state.

export type Todo = {
  id: string;
  title: string;
  done: boolean;
};

export type AppState = {
  nextId: number;
  todos: Todo[];
  /** True while clear-all is waiting for the person at the keyboard. */
  pendingClear: boolean;
};

export type ToolSuccess<T> = {
  ok: true;
  state: AppState;
  message: string;
  data: T;
};

export type ToolFailure = {
  ok: false;
  state: AppState;
  message: string;
};

export type ToolResult<T> = ToolSuccess<T> | ToolFailure;

const MAX_TITLE = 120;

export function createState(): AppState {
  return { nextId: 1, todos: [], pendingClear: false };
}

export function countNoun(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function addTodo(state: AppState, title: string): ToolResult<{ id: string }> {
  const trimmed = title.trim();
  if (!trimmed) return fail(state, "A title is required.");
  if (trimmed.length > MAX_TITLE) {
    return fail(state, `Title must be ${MAX_TITLE} characters or fewer.`);
  }

  const id = `t${state.nextId}`;
  const todo: Todo = { id, title: trimmed, done: false };
  return ok(
    {
      ...state,
      nextId: state.nextId + 1,
      todos: [...state.todos, todo],
    },
    `Added "${trimmed}" (${id}).`,
    { id },
  );
}

export function toggleTodo(state: AppState, id: string): ToolResult<Todo> {
  if (!id.trim()) return fail(state, "An id is required.");
  const current = state.todos.find((todo) => todo.id === id);
  if (!current) return fail(state, `No todo with id "${id}".`);

  const next: Todo = { ...current, done: !current.done };
  return ok(
    {
      ...state,
      todos: state.todos.map((todo) => (todo.id === id ? next : todo)),
    },
    `Marked "${next.title}" ${next.done ? "done" : "open"}.`,
    next,
  );
}

/**
 * Arms a destructive clear without deleting anything.
 * An empty list is reported as-is. A second request while one is pending
 * does not stack another confirmation.
 */
export function requestClear(state: AppState): ToolResult<{ pending: boolean }> {
  if (state.todos.length === 0) {
    return ok(
      state.pendingClear ? { ...state, pendingClear: false } : state,
      "The list is already empty, so nothing was cleared.",
      { pending: false },
    );
  }

  if (state.pendingClear) {
    return ok(
      state,
      `Already waiting for confirmation to clear ${countNoun(state.todos.length, "todo")}.`,
      { pending: true },
    );
  }

  return ok(
    { ...state, pendingClear: true },
    `Waiting for the person at the keyboard to confirm clearing ${countNoun(state.todos.length, "todo")}. Nothing was deleted.`,
    { pending: true },
  );
}

export function confirmClear(state: AppState): ToolResult<{ removed: number }> {
  if (!state.pendingClear) {
    return fail(state, "No clear is waiting for confirmation.");
  }

  const removed = state.todos.length;
  return ok(
    { ...state, todos: [], pendingClear: false },
    removed === 0
      ? "The list is already empty, so nothing was cleared."
      : `Cleared ${countNoun(removed, "todo")}.`,
    { removed },
  );
}

export function cancelClear(state: AppState): ToolResult<null> {
  if (!state.pendingClear) {
    return fail(state, "No clear is waiting for confirmation.");
  }
  return ok(
    { ...state, pendingClear: false },
    "Clear cancelled. The list was kept.",
    null,
  );
}

export function formatTodoList(state: AppState): string {
  const pending = state.pendingClear ? " A clear is waiting for confirmation." : "";
  if (state.todos.length === 0) return `No todos.${pending}`;

  const open = state.todos.filter((todo) => !todo.done).length;
  const lines = state.todos.map(
    (todo) => `${todo.done ? "[x]" : "[ ]"} ${todo.id}: ${todo.title}`,
  );
  return `${countNoun(state.todos.length, "todo")}, ${open} open.${pending}\n${lines.join("\n")}`;
}

function ok<T>(state: AppState, message: string, data: T): ToolSuccess<T> {
  return { ok: true, state, message, data };
}

function fail(state: AppState, message: string): ToolFailure {
  return { ok: false, state, message };
}

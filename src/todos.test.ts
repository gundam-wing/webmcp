import { describe, expect, it } from "vitest";
import { appendLog } from "./log";
import {
  addTodo,
  cancelClear,
  confirmClear,
  createState,
  formatTodoList,
  requestClear,
  toggleTodo,
} from "./todos";
import { applyTool, readToolInput, TOOLS } from "./tools";

describe("addTodo", () => {
  it("trims a title and assigns the next id", () => {
    const result = addTodo(createState(), "  Buy milk  ");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.id).toBe("t1");
    expect(result.state.todos).toEqual([
      { id: "t1", title: "Buy milk", done: false },
    ]);
    expect(result.state.nextId).toBe(2);
    expect(result.message).toBe('Added "Buy milk" (t1).');
  });

  it("rejects a blank title without changing state", () => {
    const state = createState();
    const result = addTodo(state, "   ");
    expect(result).toEqual({
      ok: false,
      state,
      message: "A title is required.",
    });
  });

  it("rejects a title longer than 120 characters", () => {
    const result = addTodo(createState(), "a".repeat(121));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe("Title must be 120 characters or fewer.");
    expect(result.state.todos).toEqual([]);
  });
});

describe("toggleTodo", () => {
  it("flips done and leaves the previous object untouched", () => {
    const added = addTodo(createState(), "Ship the demo");
    if (!added.ok) throw new Error(added.message);
    const original = added.state.todos[0];
    const marked = toggleTodo(added.state, "t1");
    if (!marked.ok) throw new Error(marked.message);
    expect(original?.done).toBe(false);
    expect(marked.data.done).toBe(true);
    expect(marked.message).toBe('Marked "Ship the demo" done.');

    const reopened = toggleTodo(marked.state, "t1");
    if (!reopened.ok) throw new Error(reopened.message);
    expect(reopened.message).toBe('Marked "Ship the demo" open.');
  });

  it("fails for an unknown id and keeps the list", () => {
    const added = addTodo(createState(), "Ship the demo");
    if (!added.ok) throw new Error(added.message);
    const result = toggleTodo(added.state, "t9");
    expect(result.ok).toBe(false);
    expect(result.state).toBe(added.state);
    expect(result.message).toBe('No todo with id "t9".');
  });
});

describe("clear confirmation", () => {
  it("does not arm a confirmation when the list is empty", () => {
    const result = requestClear(createState());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.pendingClear).toBe(false);
    expect(result.message).toBe(
      "The list is already empty, so nothing was cleared.",
    );
  });

  it("waits for a person and does not delete until they confirm", () => {
    const first = addTodo(createState(), "Buy milk");
    if (!first.ok) throw new Error(first.message);
    const second = addTodo(first.state, "Walk");
    if (!second.ok) throw new Error(second.message);

    const armed = requestClear(second.state);
    expect(armed.ok).toBe(true);
    if (!armed.ok) return;
    expect(armed.state.pendingClear).toBe(true);
    expect(armed.state.todos).toEqual(second.state.todos);
    expect(armed.message).toBe(
      "Waiting for the person at the keyboard to confirm clearing 2 todos. Nothing was deleted.",
    );

    const again = requestClear(armed.state);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.state).toBe(armed.state);
    expect(again.message).toBe(
      "Already waiting for confirmation to clear 2 todos.",
    );

    const confirmed = confirmClear(armed.state);
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    expect(confirmed.state.todos).toEqual([]);
    expect(confirmed.state.pendingClear).toBe(false);
    expect(confirmed.data.removed).toBe(2);
  });

  it("refuses to confirm or cancel when nothing is pending", () => {
    const state = createState();
    expect(confirmClear(state).message).toBe(
      "No clear is waiting for confirmation.",
    );
    expect(cancelClear(state).state).toBe(state);
  });

  it("keeps the list when the person cancels", () => {
    const added = addTodo(createState(), "Buy milk");
    if (!added.ok) throw new Error(added.message);
    const armed = requestClear(added.state);
    if (!armed.ok) throw new Error(armed.message);
    const cancelled = cancelClear(armed.state);
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    expect(cancelled.state.todos).toEqual(added.state.todos);
    expect(cancelled.state.pendingClear).toBe(false);
    expect(cancelled.message).toBe("Clear cancelled. The list was kept.");
  });

  it("drops a stale pending flag if the list is already empty", () => {
    const stale = { ...createState(), pendingClear: true };
    const result = requestClear(stale);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.pendingClear).toBe(false);
  });
});

describe("formatTodoList", () => {
  it("describes an empty list and a mixed list", () => {
    expect(formatTodoList(createState())).toBe("No todos.");
    const added = addTodo(createState(), "Buy milk");
    if (!added.ok) throw new Error(added.message);
    const toggled = toggleTodo(added.state, "t1");
    if (!toggled.ok) throw new Error(toggled.message);
    const second = addTodo(toggled.state, "Walk");
    if (!second.ok) throw new Error(second.message);
    expect(formatTodoList(second.state)).toBe(
      "2 todos, 1 open.\n[x] t1: Buy milk\n[ ] t2: Walk",
    );
  });
});

describe("applyTool", () => {
  it("exposes a read tool, a write tool, and a consequential clear", () => {
    expect(TOOLS.map((tool) => tool.name)).toEqual([
      "list_todos",
      "add_todo",
      "toggle_todo",
      "clear_todos",
    ]);
    expect(TOOLS.find((tool) => tool.name === "list_todos")?.annotations).toMatchObject({
      readOnlyHint: true,
    });
    expect(TOOLS.find((tool) => tool.name === "clear_todos")?.annotations).toMatchObject({
      consequentialHint: true,
    });
  });

  it("accepts object arguments and JSON strings", () => {
    expect(readToolInput({ title: "Milk" })).toEqual({ title: "Milk" });
    expect(readToolInput('{"title":"Milk"}')).toEqual({ title: "Milk" });
    expect(readToolInput("not json")).toEqual({});
    expect(readToolInput(null)).toEqual({});
  });

  it("runs the same functions the page uses", () => {
    const listed = applyTool(createState(), "list_todos", {});
    expect(listed.message).toBe("No todos.");

    const added = applyTool(createState(), "add_todo", { title: "Buy milk" });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.state.todos.map((todo) => todo.title)).toEqual(["Buy milk"]);

    const fromString = applyTool(createState(), "add_todo", '{"title":"From a string"}');
    expect(fromString.ok).toBe(true);

    const missing = applyTool(added.state, "toggle_todo", { id: "missing" });
    expect(missing.ok).toBe(false);
    expect(missing.state.todos).toHaveLength(1);

    const armed = applyTool(added.state, "clear_todos", {});
    expect(armed.ok).toBe(true);
    if (!armed.ok) return;
    expect(armed.state.todos).toHaveLength(1);
    expect(armed.state.pendingClear).toBe(true);

    const unknown = applyTool(createState(), "nope", {});
    expect(unknown.ok).toBe(false);
  });
});

describe("appendLog", () => {
  it("numbers entries without mutating the previous list", () => {
    const first = appendLog([], {
      at: "12:00:00",
      source: "tool",
      label: "add_todo",
      detail: 'Added "Buy milk" (t1).',
      ok: true,
    });
    const second = appendLog(first, {
      at: "12:00:01",
      source: "page",
      label: "confirm clear",
      detail: "Cleared 1 todo.",
      ok: true,
    });
    expect(first).toHaveLength(1);
    expect(second.map((entry) => entry.id)).toEqual([1, 2]);
    expect(second[1]?.source).toBe("page");
  });
});

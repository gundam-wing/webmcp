import { appendLog, type LogEntry, type LogSource } from "./log";
import {
  addTodo,
  cancelClear,
  confirmClear,
  countNoun,
  createState,
  requestClear,
  toggleTodo,
  type AppState,
  type ToolResult,
} from "./todos";
import { registerDemoTools, TOOLS } from "./tools";

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Demo markup is missing ${selector}.`);
  return element;
}

const statusEl = required<HTMLElement>("#webmcp-status");
const summaryEl = required<HTMLElement>("#summary");
const form = required<HTMLFormElement>("#add-form");
const titleInput = required<HTMLInputElement>("#title");
const formError = required<HTMLElement>("#form-error");
const listEl = required<HTMLElement>("#list");
const emptyEl = required<HTMLElement>("#empty");
const clearButton = required<HTMLButtonElement>("#clear-all");
const confirmEl = required<HTMLElement>("#confirm");
const confirmText = required<HTMLElement>("#confirm-text");
const confirmButton = required<HTMLButtonElement>("#confirm-clear");
const cancelButton = required<HTMLButtonElement>("#cancel-clear");
const logEmpty = required<HTMLElement>("#log-empty");
const logEl = required<HTMLOListElement>("#log");

let state: AppState = createState();
let log: LogEntry[] = [];

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-GB", { hour12: false });
}

function commit(
  result: ToolResult<unknown>,
  source: LogSource,
  label: string,
): void {
  state = result.state;
  log = appendLog(log, {
    at: formatTime(new Date()),
    source,
    label,
    detail: result.message,
    ok: result.ok,
  });
  if (source === "page") formError.textContent = result.ok ? "" : result.message;
  render();
}

function render(): void {
  const open = state.todos.filter((todo) => !todo.done).length;
  const done = state.todos.length - open;
  summaryEl.textContent =
    state.todos.length === 0 ? "No todos yet." : `${open} open · ${done} done`;

  listEl.replaceChildren(
    ...state.todos.map((todo) => {
      const item = document.createElement("li");
      item.dataset.id = todo.id;
      item.dataset.done = String(todo.done);
      const label = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = todo.done;
      const title = document.createElement("span");
      title.textContent = todo.title;
      label.append(box, title);
      const id = document.createElement("code");
      id.textContent = todo.id;
      item.append(label, id);
      return item;
    }),
  );
  emptyEl.hidden = state.todos.length > 0;

  confirmEl.hidden = !state.pendingClear;
  confirmText.textContent = state.pendingClear
    ? `Clear ${countNoun(state.todos.length, "todo")}? Nothing is deleted until you confirm.`
    : "";

  logEmpty.hidden = log.length > 0;
  logEl.replaceChildren(
    ...log.map((entry) => {
      const item = document.createElement("li");
      item.dataset.source = entry.source;
      item.dataset.ok = String(entry.ok);
      const time = document.createElement("time");
      time.textContent = entry.at;
      time.dateTime = entry.at;
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = entry.source;
      const name = document.createElement("strong");
      name.textContent = entry.label;
      const detail = document.createElement("span");
      detail.className = "detail";
      detail.textContent = entry.detail;
      item.append(time, tag, name, detail);
      return item;
    }),
  );
  logEl.scrollTop = logEl.scrollHeight;
}

function showMissing(message: string, extra?: string): void {
  document.documentElement.dataset.webmcp = "missing";
  statusEl.className = "status status-missing";
  statusEl.replaceChildren();

  const title = document.createElement("strong");
  title.textContent = message;
  const intro = document.createElement("p");
  intro.textContent =
    "This page registers tools on document.modelContext. That producer API needs Chrome 150 or newer. The navigator.modelContext alias was removed in Chrome 150, and unregisterTool was removed in Chrome 148.";
  const steps = document.createElement("ol");
  for (const step of [
    "Open chrome://flags/#enable-webmcp-testing",
    "Set the flag to Enabled.",
    "Relaunch Chrome, then reload this page.",
  ]) {
    const item = document.createElement("li");
    item.textContent = step;
    steps.append(item);
  }
  const note = document.createElement("p");
  note.append(
    document.createTextNode("Starting Chrome with "),
    code("--enable-features=WebMCP"),
    document.createTextNode(
      " enables the same feature. A site can also join the WebMCP origin trial instead of asking visitors to flip the flag. The page must be a secure context (https or localhost).",
    ),
  );
  statusEl.append(title, intro, steps, note);
  if (extra) {
    const failure = document.createElement("p");
    failure.textContent = extra;
    statusEl.append(failure);
    statusEl.className = "status status-error";
    document.documentElement.dataset.webmcp = "error";
  }
}

function code(value: string): HTMLElement {
  const el = document.createElement("code");
  el.textContent = value;
  return el;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const result = addTodo(state, titleInput!.value);
  commit(result, "page", "add");
  if (result.ok) titleInput.value = "";
  titleInput.focus();
});

listEl.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const item = target.closest<HTMLElement>("[data-id]");
  if (!item?.dataset.id) return;
  commit(toggleTodo(state, item.dataset.id), "page", "toggle");
});

clearButton.addEventListener("click", () => {
  commit(requestClear(state), "page", "clear");
});

confirmButton.addEventListener("click", () => {
  commit(confirmClear(state), "page", "confirm clear");
});

cancelButton.addEventListener("click", () => {
  commit(cancelClear(state), "page", "cancel clear");
});

render();

const modelContext = document.modelContext;
if (!modelContext || typeof modelContext.registerTool !== "function") {
  showMissing("WebMCP is not available in this browser.");
} else {
  const registration = new AbortController();
  registerDemoTools(
    modelContext,
    {
      getState: () => state,
      commit: (result, toolName) => commit(result, "tool", toolName),
    },
    registration.signal,
  )
    .then(() => {
      document.documentElement.dataset.webmcp = "ready";
      statusEl.className = "status status-ready";
      statusEl.textContent = `WebMCP is on. Registered on document.modelContext: ${TOOLS.map((tool) => tool.name).join(", ")}.`;
    })
    .catch((error: unknown) => {
      showMissing(
        "WebMCP is present, but tool registration failed.",
        error instanceof Error ? error.message : String(error),
      );
    });
}

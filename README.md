# WebMCP todo demo

A small static page that registers [WebMCP](https://github.com/webmachinelearning/webmcp) tools on `document.modelContext`. The todo list is the whole app: the buttons and the tools call the same functions in `src/todos.ts`, and an on-page log shows each tool call.

WebMCP is an experimental browser API (W3C draft). This demo targets the producer surface shipping in Chrome 150 and later:

- Register with `document.modelContext.registerTool({ name, description, inputSchema, execute })`.
- `navigator.modelContext` was removed in Chrome 150. This page does not fall back to it.
- `unregisterTool` was removed in Chrome 148. Pass an `AbortSignal` to `registerTool` and abort it to unregister.
- `inputSchema` is a JSON Schema object. These tools return plain strings, which is what the current Chrome imperative-API examples return.

| Tool | What it does |
| --- | --- |
| `list_todos` | Reads the list. `readOnlyHint` is set. |
| `add_todo` | Adds an item (`title`). |
| `toggle_todo` | Flips one item. Fails if the id is not on the list. |
| `clear_todos` | Destructive, and `consequentialHint` is set. It does not delete anything. If the list has items, the page asks the person at the keyboard to confirm or cancel. An empty list reports that and stays empty. |

## Enable WebMCP in Chrome

Chrome 150 or newer, in a secure context (`https` or `localhost`):

1. Open `chrome://flags/#enable-webmcp-testing`.
2. Set the flag to **Enabled**.
3. Relaunch Chrome and reload this page.

The same switch from the command line is `--enable-features=WebMCP`.

An [origin trial](https://developer.chrome.com/blog/ai-webmcp-origin-trial) is the alternative when you cannot ask visitors to change flags. If `document.modelContext` is missing, the page says so and repeats these steps.

## Run it

```bash
npm install
npm run dev
```

Open the URL Vite prints (http://localhost:5173). Add a todo with the form, or call a tool from DevTools. `npm test` runs the unit tests for the shared list logic. `npm run e2e` builds the page and drives it with Puppeteer.

The end-to-end script launches Chrome with and without `--enable-features=WebMCP`. It expects a Chrome **151+** binary (Puppeteer's WebMCP client uses the `WebMCP` CDP domain) at `CHROME_PATH`, or `/opt/google/chrome/chrome` if that variable is unset. Use the real `chrome` binary. Some environment wrappers inject their own `--user-data-dir` and debugging port and then fail to start.

## Inspect and call tools from DevTools

With the flag on and this page open:

1. Open DevTools.
2. Select the **Application** tab.
3. In the sidebar, select **WebMCP**.
4. **Available tools** lists `list_todos`, `add_todo`, `toggle_todo`, and `clear_todos`, with the descriptions the agent sees.
5. Click a tool. The manual test area opens with empty parameters.
6. Fill in the input (for example `title` on `add_todo`, or `id` from `list_todos` on `toggle_todo`) and click **Run tool**.
7. **Invoked tools** records status, input, and output. The page's activity log updates at the same time, and the list changes in place.

`clear_todos` only arms the confirmation banner. Click **Confirm clear** or **Cancel** on the page to finish it. That step is deliberately not a tool, so an agent cannot skip the person at the keyboard.

DevTools for agents can also list and execute these tools (`list_webmcp_tools`, `execute_webmcp_tool`). Current Chrome docs mention both `--categoryExperimentalWebmcp` and `--categoryWebMCP` for that agent category; the Application panel above does not need either one. The category is documented for Chrome 149+ with WebMCP enabled.

## Layout

```
src/todos.ts    list operations (the shared logic)
src/tools.ts    tool schemas, applyTool, registerDemoTools
src/main.ts     DOM, feature detection, activity log
src/webmcp.ts   the small producer-API type this page uses
```

To add a tool, add a function in `src/todos.ts`, a `TOOLS` entry in `src/tools.ts`, and a button in the page if a person should be able to do the same thing.

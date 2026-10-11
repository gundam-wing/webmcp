import { createServer } from "node:http";
import { mkdir, readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const chromePath = process.env.CHROME_PATH || "/opt/google/chrome/chrome";
const artifactDir = process.env.ARTIFACT_DIR || "/opt/cursor/artifacts";
const screenshotPath = join(artifactDir, "screenshot_after_agent_clear_request.png");

const MIME = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".json", "application/json"],
  [".woff2", "font/woff2"],
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function chromeMajor(version) {
  const match = String(version).match(/Chrome\/(\d+)/);
  return match ? Number(match[1]) : 0;
}

// A thrown execute() is status Error. Chrome reports the Error text on
// exception.description; errorText is often empty.
function asText(result) {
  const parts = [];
  if (typeof result?.output === "string") parts.push(result.output);
  else if (result?.output != null) parts.push(JSON.stringify(result.output));
  if (typeof result?.errorText === "string" && result.errorText) parts.push(result.errorText);
  const description = result?.exception?.description;
  if (typeof description === "string" && description) parts.push(description);
  return parts.join("\n");
}

// Chrome 154 reports Completed. Earlier WebMCP builds reported Success.
function isCompleted(result) {
  return result?.status === "Completed" || result?.status === "Success";
}

async function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
      const filePath = normalize(join(dist, relative));
      if (filePath !== dist && !filePath.startsWith(dist + sep)) {
        response.writeHead(403).end("forbidden");
        return;
      }
      const body = await readFile(filePath);
      const type = MIME.get(extname(filePath)) ?? "application/octet-stream";
      response.writeHead(200, { "content-type": type }).end(body);
    } catch {
      response.writeHead(404).end("not found");
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Server did not bind.");
  return {
    server,
    url: `http://127.0.0.1:${address.port}/`,
  };
}

function launchOptions(enableWebMcp) {
  const args = [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--disable-background-networking",
    "--disable-gpu",
  ];
  if (enableWebMcp) args.push("--enable-features=WebMCP");
  return {
    executablePath: chromePath,
    headless: true,
    defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 1 },
    args,
  };
}

async function openPage(browser, url) {
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);
  const logs = [];
  page.on("console", (message) => logs.push(`[${message.type()}] ${message.text()}`));
  page.on("pageerror", (error) => logs.push(`[pageerror] ${error.message}`));
  await page.goto(url, { waitUntil: "networkidle0" });
  return { page, logs };
}

async function waitForRegisteredTools(page) {
  const wanted = ["list_todos", "add_todo", "toggle_todo", "clear_todos"];
  const deadline = Date.now() + 8000;
  let last = [];
  while (Date.now() < deadline) {
    last = page.webmcp.tools().map((tool) => tool.name).sort();
    if (wanted.every((name) => last.includes(name))) return last;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for WebMCP tools. Last seen: ${last.join(", ") || "(none)"}`);
}

async function callTool(page, name, input = {}) {
  const tool = page.webmcp.tools().find((entry) => entry.name === name);
  assert(tool, `Puppeteer did not list ${name}.`);
  try {
    return await tool.execute(input);
  } catch (error) {
    return { status: "Error", errorText: error instanceof Error ? error.message : String(error) };
  }
}

async function verifyMissingApi(url) {
  const browser = await puppeteer.launch(launchOptions(false));
  try {
    const { page, logs } = await openPage(browser, url);
    await page.waitForSelector('html[data-webmcp="missing"]');
    const surface = await page.evaluate(() => ({
      documentModelContext: Boolean(document.modelContext),
      navigatorModelContext: Boolean(navigator.modelContext),
      status: document.querySelector("#webmcp-status")?.textContent ?? "",
    }));
    assert(surface.documentModelContext === false, "document.modelContext was present without the WebMCP feature.");
    assert(surface.navigatorModelContext === false, "navigator.modelContext was present; Chrome 150 removed that alias.");
    assert(
      surface.status.includes("chrome://flags/#enable-webmcp-testing"),
      `Missing-flag banner did not name the flag.\n${surface.status}\n${logs.join("\n")}`,
    );
    assert(
      surface.status.includes("--enable-features=WebMCP"),
      "Missing-flag banner did not mention the command-line feature.",
    );
    console.log("without --enable-features=WebMCP: document.modelContext is absent and the banner explains the flag");
  } finally {
    await browser.close();
  }
}

async function verifyAgentPath(url) {
  const browser = await puppeteer.launch(launchOptions(true));
  try {
    const version = await browser.version();
    console.log(`browser ${version}`);
    assert(chromeMajor(version) >= 150, `Expected Chrome 150 or newer, got ${version}`);

    const { page, logs } = await openPage(browser, url);
    assert(page.webmcp && typeof page.webmcp.tools === "function", "This Puppeteer build has no page.webmcp.tools(). Upgrade puppeteer-core.");

    await page.waitForSelector('html[data-webmcp="ready"]');
    let listed;
    try {
      listed = await waitForRegisteredTools(page);
    } catch (firstError) {
      await page.reload({ waitUntil: "networkidle0" });
      await page.waitForSelector('html[data-webmcp="ready"]');
      try {
        listed = await waitForRegisteredTools(page);
      } catch {
        throw firstError;
      }
    }
    console.log(`page.webmcp.tools(): ${listed.join(", ")}`);

    const inPage = await page.evaluate(async () => {
      const modelContext = document.modelContext;
      if (!modelContext || typeof modelContext.getTools !== "function") {
        return { error: "document.modelContext.getTools is missing" };
      }
      const tools = await modelContext.getTools();
      return {
        navigatorModelContext: Boolean(navigator.modelContext),
        names: tools.map((tool) => tool.name).sort(),
      };
    });
    assert(!inPage.error, inPage.error ?? "");
    assert(inPage.navigatorModelContext === false, "navigator.modelContext should stay removed when the feature is on.");
    assert(
      ["add_todo", "clear_todos", "list_todos", "toggle_todo"].every((name) => inPage.names.includes(name)),
      `document.modelContext.getTools() returned ${inPage.names.join(", ")}`,
    );

    const added = await callTool(page, "add_todo", { title: "Buy oat milk" });
    assert(isCompleted(added), `add_todo failed: ${added.status} ${asText(added)}\n${logs.join("\n")}`);
    assert(asText(added).includes('Added "Buy oat milk" (t1).'), asText(added));
    await page.waitForSelector('#list li[data-id="t1"]');

    const listedTodos = await callTool(page, "list_todos", {});
    assert(isCompleted(listedTodos), `list_todos failed: ${listedTodos.status} ${asText(listedTodos)}`);
    assert(asText(listedTodos).includes("[ ] t1: Buy oat milk"), asText(listedTodos));

    const toggled = await callTool(page, "toggle_todo", { id: "t1" });
    assert(isCompleted(toggled), `toggle_todo failed: ${toggled.status} ${asText(toggled)}`);
    assert(asText(toggled).includes('Marked "Buy oat milk" done.'), asText(toggled));
    await page.waitForSelector('#list li[data-id="t1"][data-done="true"]');

    const missing = await callTool(page, "toggle_todo", { id: "missing" });
    assert(missing.status === "Error", `Unknown id should fail the tool call, got ${missing.status} ${asText(missing)}`);
    assert(
      asText(missing).includes('No todo with id "missing".'),
      `error payload: ${asText(missing) || JSON.stringify(missing)}`,
    );
    const stillThere = await page.$('#list li[data-id="t1"][data-done="true"]');
    assert(stillThere, "A failed toggle changed the list.");

    const cleared = await callTool(page, "clear_todos", {});
    assert(isCompleted(cleared), `clear_todos failed: ${cleared.status} ${asText(cleared)}`);
    assert(asText(cleared).includes("Nothing was deleted."), asText(cleared));
    await page.waitForSelector("#confirm:not([hidden])");
    const beforeConfirm = await page.$("#list li[data-id='t1']");
    assert(beforeConfirm, "clear_todos deleted the todo before the person confirmed.");

    const activity = await page.$$eval("#log li[data-source='tool']", (items) =>
      items.map((item) => item.querySelector("strong")?.textContent ?? ""),
    );
    assert(
      ["add_todo", "list_todos", "toggle_todo", "toggle_todo", "clear_todos"].every((name, index) => activity[index] === name),
      `Activity log was ${activity.join(", ")}`,
    );

    await mkdir(artifactDir, { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`screenshot ${screenshotPath}`);

    await page.click("#confirm-clear");
    await page.waitForSelector("#confirm[hidden]");
    const remaining = await page.$$("#list li[data-id]");
    assert(remaining.length === 0, "Confirming the clear left todos on the page.");

    const emptyClear = await callTool(page, "clear_todos", {});
    assert(isCompleted(emptyClear), `${emptyClear.status} ${asText(emptyClear)}`);
    assert(asText(emptyClear).includes("already empty"), asText(emptyClear));
    const confirmHidden = await page.$eval("#confirm", (element) => element.hidden);
    assert(confirmHidden, "An empty clear armed another confirmation.");
    console.log("agent path: list, add, toggle, rejected toggle, clear-with-confirmation, human confirm");
  } finally {
    await browser.close();
  }
}

const chromeStat = await stat(chromePath).catch(() => null);
assert(chromeStat?.isFile(), `Chrome was not found at ${chromePath}. Set CHROME_PATH to a Chrome 151+ binary.`);
const distStat = await stat(join(dist, "index.html")).catch(() => null);
assert(distStat?.isFile(), "dist/index.html is missing. Run npm run build first.");

const { server, url } = await startServer();
try {
  console.log(`serving ${url}`);
  await verifyMissingApi(url);
  await verifyAgentPath(url);
} finally {
  await new Promise((resolve) => server.close(resolve));
}

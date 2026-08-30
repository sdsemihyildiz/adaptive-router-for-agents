import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { successResult } from "../mcp/server.mjs";
import { buildWorkerArgs, runWorker, validateWorkingDirectory } from "../mcp/worker-runtime.mjs";

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const fixture = join(pluginRoot, "test", "fixtures", "fake-claude.mjs");

test("MCP server registers run_routed_task under the public identity", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(pluginRoot, "mcp", "server.mjs")],
    cwd: pluginRoot,
  });
  const client = new Client({ name: "adaptive-router-for-claude-test", version: "0.1.0" });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const routeTool = tools.tools.find((tool) => tool.name === "run_routed_task");
    assert.ok(routeTool);
    assert.match(routeTool.description, /root task/);
    assert.match(routeTool.description, /never invoke it from a subagent/);
  } finally {
    await client.close();
  }
});

test("structured success output includes exact model and effort", () => {
  const result = successResult({ text: "ok", model: "claude-sonnet-5", effort: "high" });
  assert.deepEqual(result.structuredContent, { model: "claude-sonnet-5", reasoning_effort: "high" });
});

test("worker arguments pin model, effort, permission mode, and exclude Task/Agent tools", () => {
  const workingDirectory = validateWorkingDirectory(pluginRoot);
  const args = buildWorkerArgs(
    { target: { model: "claude-opus-5", effort: "max" }, sandbox: "workspace-write", workingDirectory, task: "do the thing" },
    { prefixArgs: [] },
  );
  assert.equal(args.includes("claude-opus-5"), true);
  assert.equal(args.includes("max"), true);
  assert.equal(args.includes("acceptEdits"), true);
  assert.equal(args.at(-1), "do the thing");
  const allowedToolsIndex = args.indexOf("--allowedTools");
  assert.ok(allowedToolsIndex >= 0);
  assert.doesNotMatch(args[allowedToolsIndex + 1], /\bTask\b|\bAgent\b/);
  assert.equal(args.includes("--bare"), true);
});

test("working directory must exist and be a directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "adaptive-router-cwd-"));
  const file = join(directory, "file.txt");
  await writeFile(file, "x", "utf8");
  try {
    assert.equal(validateWorkingDirectory(directory), directory);
    assert.throws(() => validateWorkingDirectory(file), /not a directory/);
    assert.throws(() => validateWorkingDirectory(join(directory, "missing")), /does not exist/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("worker success uses shell false, recursion env, and structured runtime metadata", async () => {
  const oldMode = process.env.ADAPTIVE_ROUTER_FAKE_MODE;
  process.env.ADAPTIVE_ROUTER_FAKE_MODE = "success";
  let capturedOptions;
  try {
    const result = await runWorker(
      { route: "adaptive_sonnet_high", task: "safe task", cwd: pluginRoot, sandbox: "read-only", timeout_seconds: 30 },
      {
        claudeLaunchImpl: () => ({ command: process.execPath, prefixArgs: [fixture] }),
        spawnImpl: (command, args, options) => {
          capturedOptions = options;
          return spawn(command, args, options);
        },
      },
    );
    assert.deepEqual(result, { text: "fake worker ok", model: "claude-sonnet-5", effort: "high" });
    assert.equal(capturedOptions.shell, false);
    assert.equal(capturedOptions.env.ADAPTIVE_MODEL_ROUTER_WORKER, "1");
  } finally {
    if (oldMode === undefined) delete process.env.ADAPTIVE_ROUTER_FAKE_MODE;
    else process.env.ADAPTIVE_ROUTER_FAKE_MODE = oldMode;
  }
});

test("worker retries once without --effort when the flag is unsupported", async () => {
  const oldMode = process.env.ADAPTIVE_ROUTER_FAKE_MODE;
  process.env.ADAPTIVE_ROUTER_FAKE_MODE = "unsupported-effort";
  try {
    const result = await runWorker(
      { route: "adaptive_haiku", task: "safe task", cwd: pluginRoot, sandbox: "read-only", timeout_seconds: 30 },
      { claudeLaunchImpl: () => ({ command: process.execPath, prefixArgs: [fixture] }) },
    );
    assert.deepEqual(result, { text: "fake worker ok without effort", model: "claude-haiku-4-5-20251001", effort: "low" });
  } finally {
    if (oldMode === undefined) delete process.env.ADAPTIVE_ROUTER_FAKE_MODE;
    else process.env.ADAPTIVE_ROUTER_FAKE_MODE = oldMode;
  }
});

test("worker surfaces the stdout JSON error message even on nonzero exit with empty stderr", async () => {
  const oldMode = process.env.ADAPTIVE_ROUTER_FAKE_MODE;
  process.env.ADAPTIVE_ROUTER_FAKE_MODE = "json-error-result";
  try {
    await assert.rejects(
      runWorker(
        { route: "adaptive_haiku", task: "fail", cwd: pluginRoot, sandbox: "read-only", timeout_seconds: 30 },
        { claudeLaunchImpl: () => ({ command: process.execPath, prefixArgs: [fixture] }) },
      ),
      /Not logged in/,
    );
  } finally {
    if (oldMode === undefined) delete process.env.ADAPTIVE_ROUTER_FAKE_MODE;
    else process.env.ADAPTIVE_ROUTER_FAKE_MODE = oldMode;
  }
});

test("worker failures and timeouts return bounded errors", async () => {
  const oldMode = process.env.ADAPTIVE_ROUTER_FAKE_MODE;
  try {
    process.env.ADAPTIVE_ROUTER_FAKE_MODE = "failure";
    await assert.rejects(
      runWorker(
        { route: "adaptive_haiku", task: "fail", cwd: pluginRoot, sandbox: "read-only", timeout_seconds: 30 },
        { claudeLaunchImpl: () => ({ command: process.execPath, prefixArgs: [fixture] }) },
      ),
      /fake worker failure/,
    );

    process.env.ADAPTIVE_ROUTER_FAKE_MODE = "timeout";
    await assert.rejects(
      runWorker(
        { route: "adaptive_haiku", task: "timeout", cwd: pluginRoot, sandbox: "read-only", timeout_seconds: 1800 },
        { claudeLaunchImpl: () => ({ command: process.execPath, prefixArgs: [fixture] }), timeoutMsOverride: 75 },
      ),
      /timed out after 1800 seconds/,
    );
  } finally {
    if (oldMode === undefined) delete process.env.ADAPTIVE_ROUTER_FAKE_MODE;
    else process.env.ADAPTIVE_ROUTER_FAKE_MODE = oldMode;
  }
});

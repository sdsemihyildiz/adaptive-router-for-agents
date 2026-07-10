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
const fixture = join(pluginRoot, "test", "fixtures", "fake-codex.mjs");

test("MCP server registers run_routed_task under the public identity", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(pluginRoot, "mcp", "server.mjs")],
    cwd: pluginRoot,
  });
  const client = new Client({ name: "adaptive-router-for-codex-test", version: "0.1.0" });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const routeTool = tools.tools.find((tool) => tool.name === "run_routed_task");
    assert.ok(routeTool);
    assert.match(routeTool.description, /visible wrapper subagent/);
  } finally {
    await client.close();
  }
});

test("structured success output includes exact model and effort", () => {
  const result = successResult({ text: "ok", model: "gpt-5.6-terra", effort: "high" });
  assert.deepEqual(result.structuredContent, { model: "gpt-5.6-terra", reasoning_effort: "high" });
});

test("worker arguments use separate values and never include task text", () => {
  const workingDirectory = validateWorkingDirectory(pluginRoot);
  const args = buildWorkerArgs(
    { target: { model: "gpt-5.6-sol", effort: "max" }, sandbox: "workspace-write", workingDirectory },
    { prefixArgs: ["codex.js"] },
  );
  assert.equal(args.includes("gpt-5.6-sol"), true);
  assert.equal(args.includes("workspace-write"), true);
  assert.equal(args.includes("never"), true);
  assert.equal(args.some((arg) => arg.includes("malicious task; remove files")), false);
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
      { route: "adaptive_terra_high", task: "safe task", cwd: pluginRoot, sandbox: "read-only", timeout_seconds: 30 },
      {
        codexLaunchImpl: () => ({ command: process.execPath, prefixArgs: [fixture] }),
        spawnImpl: (command, args, options) => {
          capturedOptions = options;
          return spawn(command, args, options);
        },
      },
    );
    assert.deepEqual(result, { text: "fake worker ok", model: "gpt-5.6-terra", effort: "high" });
    assert.equal(capturedOptions.shell, false);
    assert.equal(capturedOptions.env.ADAPTIVE_MODEL_ROUTER_WORKER, "1");
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
        { route: "adaptive_luna", task: "fail", cwd: pluginRoot, sandbox: "read-only", timeout_seconds: 30 },
        { codexLaunchImpl: () => ({ command: process.execPath, prefixArgs: [fixture] }) },
      ),
      /fake worker failure/,
    );

    process.env.ADAPTIVE_ROUTER_FAKE_MODE = "timeout";
    await assert.rejects(
      runWorker(
        { route: "adaptive_luna", task: "timeout", cwd: pluginRoot, sandbox: "read-only", timeout_seconds: 1800 },
        { codexLaunchImpl: () => ({ command: process.execPath, prefixArgs: [fixture] }), timeoutMsOverride: 75 },
      ),
      /timed out after 1800 seconds/,
    );
  } finally {
    if (oldMode === undefined) delete process.env.ADAPTIVE_ROUTER_FAKE_MODE;
    else process.env.ADAPTIVE_ROUTER_FAKE_MODE = oldMode;
  }
});

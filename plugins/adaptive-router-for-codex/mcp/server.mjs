import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { routeConfig } from "../lib/routing.mjs";
import { runWorker } from "./worker-runtime.mjs";

export function successResult(result) {
  return {
    content: [{ type: "text", text: result.text }],
    structuredContent: {
      model: result.model,
      reasoning_effort: result.effort,
    },
  };
}

export function createServer(runWorkerImpl = runWorker) {
  const server = new McpServer({ name: "adaptive-router-for-codex", version: "0.1.0" });
  server.registerTool(
    "run_routed_task",
    {
      title: "Run task with selected GPT-5.6 tier",
      description: "Run a complete task through the model and reasoning tier selected by Adaptive Router for Codex. Invoke it exactly once from the visible wrapper subagent for normal non-direct routes.",
      inputSchema: {
        route: z.enum(Object.keys(routeConfig)),
        task: z.string().min(1).describe("Complete task brief with conversation context, constraints, and required output."),
        cwd: z.string().optional().describe("Absolute working directory. Defaults to the current Codex working directory."),
        sandbox: z.enum(["read-only", "workspace-write"]).default("workspace-write"),
        timeout_seconds: z.number().int().min(30).max(1800).default(1800),
      },
    },
    async (input) => {
      try {
        return successResult(await runWorkerImpl(input));
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
        };
      }
    },
  );
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await createServer().connect(new StdioServerTransport());
}

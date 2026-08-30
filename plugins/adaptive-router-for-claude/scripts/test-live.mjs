import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(pluginRoot, "mcp", "server.mjs")],
  cwd: pluginRoot,
});
const client = new Client({ name: "adaptive-router-for-claude-live-test", version: "0.1.0" });

try {
  await client.connect(transport);
  const checks = [
    { route: "adaptive_haiku", model: "claude-haiku-4-5-20251001", effort: "low" },
    { route: "adaptive_sonnet", model: "claude-sonnet-5", effort: "medium" },
    { route: "adaptive_opus", model: "claude-opus-5", effort: "high" },
  ];

  for (const check of checks) {
    const marker = `adaptive-router-live-${check.route}-${Date.now()}`;
    const result = await client.callTool({
      name: "run_routed_task",
      arguments: {
        route: check.route,
        task: `Return exactly this text and do nothing else: ${marker}`,
        cwd: pluginRoot,
        sandbox: "read-only",
        timeout_seconds: 300,
      },
    });
    const text = result.content?.find((item) => item.type === "text")?.text ?? "";
    if (result.isError || !text.includes(marker)) throw new Error(`${check.route} live worker failed: ${text}`);
    if (result.structuredContent?.model !== check.model || result.structuredContent?.reasoning_effort !== check.effort) {
      throw new Error(`${check.route} returned unexpected structured model metadata.`);
    }
    console.log(`PASS: ${check.model} (${check.effort}) returned the expected result and metadata`);
  }
} finally {
  await client.close();
}

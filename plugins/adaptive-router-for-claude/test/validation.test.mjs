import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(dirname(pluginRoot));

function json(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

test("manifest, marketplace, package, MCP, hook, and skill identities agree", () => {
  const manifest = json(join(pluginRoot, ".claude-plugin", "plugin.json"));
  const marketplace = json(join(repoRoot, ".claude-plugin", "marketplace.json"));
  const packageJson = json(join(pluginRoot, "package.json"));
  const mcp = json(join(pluginRoot, ".mcp.json"));
  const hooks = json(join(pluginRoot, "hooks", "hooks.json"));
  const skill = readFileSync(join(pluginRoot, "skills", "adaptive-router-for-claude", "SKILL.md"), "utf8");

  assert.equal(manifest.name, "adaptive-router-for-claude");
  assert.equal(manifest.version, "0.1.0");
  assert.equal(manifest.author.name, "sdsemihyildiz");
  assert.equal(packageJson.name, manifest.name);
  assert.equal(packageJson.version, manifest.version);
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.engines.node, ">=22");
  assert.ok(mcp.mcpServers["adaptive-router-for-claude"]);
  assert.match(JSON.stringify(hooks), /router\.mjs/i);
  assert.match(skill, /^name: adaptive-router-for-claude$/m);
  assert.equal(marketplace.name, "adaptive-router-for-claude");
  const entry = marketplace.plugins.find((item) => item.name === manifest.name);
  assert.equal(entry.source, "./plugins/adaptive-router-for-claude");
  assert.ok(entry.category);
});

test("plugin root directories referenced by convention are present", () => {
  assert.equal(existsSync(join(pluginRoot, "skills", "adaptive-router-for-claude", "SKILL.md")), true);
  assert.equal(existsSync(join(pluginRoot, ".mcp.json")), true);
  assert.equal(existsSync(join(pluginRoot, "hooks", "hooks.json")), true);
});

test("worker instructions forbid delegation and reference the structural tool restriction", () => {
  const instructions = readFileSync(join(pluginRoot, "mcp", "worker-instructions.md"), "utf8");
  assert.match(instructions, /--bare/);
  assert.match(instructions, /Task\/Agent/);
  assert.match(instructions, /ADAPTIVE_MODEL_ROUTER_WORKER=1/);
});

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(dirname(pluginRoot));
const strict = process.argv.includes("--strict");
const checks = [];

function check(name, condition, detail) {
  checks.push({ name, passed: Boolean(condition), detail });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const manifestPath = join(pluginRoot, ".claude-plugin", "plugin.json");
const packagePath = join(pluginRoot, "package.json");
const hooksPath = join(pluginRoot, "hooks", "hooks.json");
const mcpPath = join(pluginRoot, ".mcp.json");
const marketplacePath = join(repoRoot, ".claude-plugin", "marketplace.json");
const skillPath = join(pluginRoot, "skills", "adaptive-router-for-claude", "SKILL.md");

let manifest;
let packageJson;
let hooks;
let mcp;
let marketplace;
for (const [name, path, assign] of [
  ["Plugin manifest JSON", manifestPath, (value) => (manifest = value)],
  ["Package JSON", packagePath, (value) => (packageJson = value)],
  ["Hook manifest JSON", hooksPath, (value) => (hooks = value)],
  ["MCP manifest JSON", mcpPath, (value) => (mcp = value)],
  ["Marketplace JSON", marketplacePath, (value) => (marketplace = value)],
]) {
  try {
    assign(readJson(path));
    check(name, true, path);
  } catch (error) {
    check(name, false, error.message);
  }
}

check("Node >=22", Number(process.versions.node.split(".")[0]) >= 22, process.version);
check("Manifest identity", manifest?.name === "adaptive-router-for-claude", manifest?.name);
check("Manifest version", manifest?.version === "0.1.0" && packageJson?.version === "0.1.0", manifest?.version);
check("Manifest publisher", manifest?.author?.name === "sdsemihyildiz", manifest?.author?.name);
check("MCP identity", Boolean(mcp?.mcpServers?.["adaptive-router-for-claude"]), Object.keys(mcp?.mcpServers ?? {}).join(","));
check("Node hook commands", JSON.stringify(hooks ?? {}).includes("router.mjs"), hooksPath);
check("Skill exists", existsSync(skillPath), skillPath);
if (existsSync(skillPath)) {
  check("Skill identity", /^---\s*[\s\S]*?^name:\s*adaptive-router-for-claude\s*$/m.test(readFileSync(skillPath, "utf8")), skillPath);
}
check("Marketplace identity", marketplace?.name === "adaptive-router-for-claude", marketplace?.name);
const entry = marketplace?.plugins?.find((item) => item.name === "adaptive-router-for-claude");
check("Marketplace local source", entry?.source === "./plugins/adaptive-router-for-claude", entry?.source);
check("Marketplace category", Boolean(entry?.category), entry?.category);

if (strict) {
  const probe = spawnSync("claude", ["--version"], { shell: false, encoding: "utf8" });
  check("claude CLI is resolvable on PATH", probe.error === undefined && probe.status === 0, probe.error?.message ?? probe.stdout?.trim());
}

for (const item of checks) {
  console.log(`${item.passed ? "PASS" : "FAIL"}: ${item.name} - ${item.detail ?? ""}`);
}
const failures = checks.filter((item) => !item.passed);
if (failures.length) process.exitCode = 1;

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

const manifestPath = join(pluginRoot, ".codex-plugin", "plugin.json");
const packagePath = join(pluginRoot, "package.json");
const hooksPath = join(pluginRoot, "hooks", "hooks.json");
const mcpPath = join(pluginRoot, ".mcp.json");
const marketplacePath = join(repoRoot, ".agents", "plugins", "marketplace.json");
const skillPath = join(pluginRoot, "skills", "adaptive-router-for-codex", "SKILL.md");

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
check("Manifest identity", manifest?.name === "adaptive-router-for-codex", manifest?.name);
check("Manifest version", manifest?.version === "0.1.0" && packageJson?.version === "0.1.0", manifest?.version);
check("Manifest publisher", manifest?.author?.name === "sdsemihyildiz" && manifest?.interface?.developerName === "sdsemihyildiz", manifest?.author?.name);
check("Relative skill path", manifest?.skills === "./skills/", manifest?.skills);
check("Relative MCP path", manifest?.mcpServers === "./.mcp.json", manifest?.mcpServers);
check("MCP identity", Boolean(mcp?.mcpServers?.["adaptive-router-for-codex"]), Object.keys(mcp?.mcpServers ?? {}).join(","));
check("Node hook commands", JSON.stringify(hooks ?? {}).includes("router.mjs") && !JSON.stringify(hooks ?? {}).includes("router.ps1"), hooksPath);
check("Skill exists", existsSync(skillPath), skillPath);
if (existsSync(skillPath)) {
  check("Skill identity", /^---\s*[\s\S]*?^name:\s*adaptive-router-for-codex\s*$/m.test(readFileSync(skillPath, "utf8")), skillPath);
}
check("Marketplace identity", marketplace?.name === "adaptive-router-for-codex", marketplace?.name);
const entry = marketplace?.plugins?.find((item) => item.name === "adaptive-router-for-codex");
check("Marketplace local source", entry?.source?.source === "local" && entry?.source?.path === "./plugins/adaptive-router-for-codex", entry?.source?.path);
check("Marketplace policy", entry?.policy?.installation === "AVAILABLE" && entry?.policy?.authentication === "ON_INSTALL" && Boolean(entry?.category), JSON.stringify(entry?.policy));

const codexEntry = join(pluginRoot, "node_modules", "@openai", "codex", "bin", "codex.js");
if (strict) check("Plugin-local Codex worker", existsSync(codexEntry), codexEntry);

for (const item of checks) {
  console.log(`${item.passed ? "PASS" : "FAIL"}: ${item.name} - ${item.detail ?? ""}`);
}
const failures = checks.filter((item) => !item.passed);
if (failures.length) process.exitCode = 1;

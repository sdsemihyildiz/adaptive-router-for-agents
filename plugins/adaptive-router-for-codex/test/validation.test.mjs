import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(dirname(pluginRoot));

function json(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function walk(directory) {
  const output = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (["node_modules", ".git", ".npm-cache", "tasks"].includes(entry.name) || entry.name === "BRAIN.md") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...walk(path));
    else output.push(path);
  }
  return output;
}

test("manifest, marketplace, package, MCP, hook, and skill identities agree", () => {
  const manifest = json(join(pluginRoot, ".codex-plugin", "plugin.json"));
  const marketplace = json(join(repoRoot, ".agents", "plugins", "marketplace.json"));
  const packageJson = json(join(pluginRoot, "package.json"));
  const mcp = json(join(pluginRoot, ".mcp.json"));
  const hooks = json(join(pluginRoot, "hooks", "hooks.json"));
  const skill = readFileSync(join(pluginRoot, "skills", "adaptive-router-for-codex", "SKILL.md"), "utf8");

  assert.equal(manifest.name, "adaptive-router-for-codex");
  assert.equal(manifest.version, "0.1.0");
  assert.equal(manifest.author.name, "sdsemihyildiz");
  assert.equal(packageJson.name, manifest.name);
  assert.equal(packageJson.version, manifest.version);
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.engines.node, ">=22");
  assert.ok(mcp.mcpServers["adaptive-router-for-codex"]);
  assert.match(JSON.stringify(hooks), /node .*router\.mjs/i);
  assert.doesNotMatch(JSON.stringify(hooks), /router\.ps1/i);
  assert.match(skill, /^name: adaptive-router-for-codex$/m);
  assert.equal(marketplace.name, "adaptive-router-for-codex");
  const entry = marketplace.plugins.find((item) => item.name === manifest.name);
  assert.equal(entry.source.path, "./plugins/adaptive-router-for-codex");
  assert.deepEqual(entry.policy, { installation: "AVAILABLE", authentication: "ON_INSTALL" });
  assert.ok(entry.category);
});

test("all manifest component paths are relative and present", () => {
  const manifest = json(join(pluginRoot, ".codex-plugin", "plugin.json"));
  for (const key of ["skills", "mcpServers"]) {
    assert.match(manifest[key], /^\.\//);
    assert.equal(existsSync(resolve(pluginRoot, manifest[key])), true);
  }
});

test("public files exclude personal identifiers, absolute homes, placeholders, secrets, and U+2014", () => {
  const personalName = ["Syr", "exi"].join("");
  const personalPluginId = ["adaptive-model-router", "personal"].join("@");
  const placeholderPattern = new RegExp(`\\b(?:${["TO", "DO"].join("")}|${["TB", "D"].join("")}|${["FIX", "ME"].join("")})\\b|\\[${["TO", "DO"].join("")}:`, "i");
  const textExtensions = new Set([".md", ".json", ".mjs", ".yaml", ".yml", ".ps1", ".sh", ".txt", ".toml", ""]);
  for (const file of walk(repoRoot)) {
    if (!textExtensions.has(extname(file).toLowerCase())) continue;
    const content = readFileSync(file, "utf8");
    assert.equal(content.toLowerCase().includes(personalName.toLowerCase()), false, file);
    assert.equal(content.includes(personalPluginId), false, file);
    assert.doesNotMatch(content, /(?:[A-Za-z]:\\Users\\[^\\\s]+|\/Users\/[^/\s]+|\/home\/[^/\s]+)/, file);
    assert.doesNotMatch(content, /\u2014/, file);
    assert.doesNotMatch(content, placeholderPattern, file);
    assert.doesNotMatch(content, /(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})/, file);
  }
});

test("public documentation contains the unofficial disclaimer and required operations", () => {
  const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
  assert.match(readme, /Unofficial community plugin/);
  assert.match(readme, /not affiliated with or endorsed by OpenAI/);
  for (const heading of ["Architecture and Data Flow", "Install", "Update", "Uninstall", "Privacy", "Troubleshooting", "Compatibility", "License"]) {
    assert.match(readme, new RegExp(`## ${heading}`));
  }
  assert.match(readme, /approximately 425 MB/i);
  assert.match(readme, /\/hooks/);
});

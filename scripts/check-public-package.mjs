import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const plugins = [
  { root: join(repoRoot, "plugins", "adaptive-router-for-codex"), manifest: ".codex-plugin/plugin.json" },
  { root: join(repoRoot, "plugins", "adaptive-router-for-claude"), manifest: ".claude-plugin/plugin.json" },
];
const ignoredDirectories = new Set([".git", ".npm-cache", "node_modules", "tasks", ".plugin-data", "coverage"]);
const ignoredFiles = new Set(["BRAIN.md"]);
const textExtensions = new Set([".md", ".json", ".mjs", ".js", ".yaml", ".yml", ".ps1", ".sh", ".txt", ".toml", ""]);
const failures = [];
const personalNamePattern = new RegExp(["syr", "exi"].join(""), "i");
const personalPluginPattern = new RegExp(["adaptive-model-router", "personal"].join("@"), "i");
const placeholderPattern = new RegExp(`\\b(?:${["TO", "DO"].join("")}|${["TB", "D"].join("")}|${["FIX", "ME"].join("")})\\b|\\[${["TO", "DO"].join("")}:`, "i");
const promptHashPattern = new RegExp(`${["prompt", "sha256"].join("_")}|createHash\\s*\\(\\s*[\"']sha256`, "i");

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    if (entry.isFile() && ignoredFiles.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

for (const file of walk(repoRoot)) {
  if (!textExtensions.has(extname(file).toLowerCase())) continue;
  const name = relative(repoRoot, file).replaceAll("\\", "/");
  const text = readFileSync(file, "utf8");
  const checks = [
    [personalNamePattern, "personal author identifier"],
    [personalPluginPattern, "personal marketplace plugin ID"],
    [/(?:[A-Za-z]:\\Users\\[^\\\s]+|\/Users\/[^/\s]+|\/home\/[^/\s]+)/, "absolute personal home path"],
    [/\u2014/, "U+2014 em dash"],
    [placeholderPattern, "placeholder text"],
    [promptHashPattern, "prompt hash persistence"],
    [/(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})/, "possible secret"],
  ];
  for (const [pattern, label] of checks) {
    if (pattern.test(text)) failures.push(`${name}: ${label}`);
  }
}

const license = readFileSync(join(repoRoot, "LICENSE"), "utf8");
if (!license.startsWith("MIT License") || !license.includes("sdsemihyildiz")) failures.push("LICENSE: missing MIT identity");

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run this check through npm so npm_execpath is available.");
for (const { root, manifest } of plugins) {
  const packed = spawnSync(process.execPath, [npmCli, "pack", "--dry-run", "--json"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, npm_config_cache: join(repoRoot, ".npm-cache") },
    shell: false,
  });
  const pluginName = relative(repoRoot, root).replaceAll("\\", "/");
  if (packed.status !== 0) {
    failures.push(`${pluginName}: npm pack dry run failed: ${packed.error?.message || packed.stderr?.trim() || `exit ${packed.status}`}`);
    continue;
  }
  const report = JSON.parse(packed.stdout);
  const packageReport = Array.isArray(report) ? report[0] : Object.values(report)[0];
  const names = packageReport?.files?.map((item) => item.path) ?? [];
  if (!names.includes(manifest)) failures.push(`${pluginName}: npm package: plugin manifest missing`);
  if (names.some((name) => name.includes("node_modules") || name.startsWith("test/") || name.includes("BRAIN.md") || name.startsWith("tasks/"))) {
    failures.push(`${pluginName}: npm package: local or dependency files are included`);
  }
  console.log(`PASS: ${pluginName} npm package contains ${names.length} public plugin files and excludes node_modules`);
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exitCode = 1;
} else {
  console.log("PASS: public identifier, path, placeholder, privacy, secret, license, and U+2014 scans");
}

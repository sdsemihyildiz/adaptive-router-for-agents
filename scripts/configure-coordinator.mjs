import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const configPath = resolve(process.argv[2] || "");
if (!process.argv[2]) throw new Error("A Codex config.toml path is required.");

await mkdir(dirname(configPath), { recursive: true });
let content = "";
let backupPath = null;
try {
  content = await readFile(configPath, "utf8");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  backupPath = `${configPath}.adaptive-router-${stamp}.bak`;
  await copyFile(configPath, backupPath);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const newline = content.includes("\r\n") ? "\r\n" : "\n";
const lines = content ? content.split(/\r?\n/) : [];

function setTopLevel(key, value) {
  const firstSection = lines.findIndex((line) => /^\s*\[/.test(line));
  const limit = firstSection < 0 ? lines.length : firstSection;
  const pattern = new RegExp(`^\\s*${key}\\s*=`);
  const matches = [];
  for (let index = 0; index < limit; index += 1) {
    if (pattern.test(lines[index])) matches.push(index);
  }
  if (matches.length > 1) throw new Error(`Refusing to edit duplicate top-level ${key} settings.`);
  const replacement = `${key} = ${JSON.stringify(value)}`;
  if (matches.length === 1) lines[matches[0]] = replacement;
  else lines.splice(limit, 0, replacement);
}

function setSectionKey(section, key, value) {
  const headerPattern = new RegExp(`^\\s*\\[${section.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\]\\s*(?:#.*)?$`);
  const headers = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (headerPattern.test(lines[index])) headers.push(index);
  }
  if (headers.length > 1) throw new Error(`Refusing to edit duplicate [${section}] sections.`);

  if (headers.length === 0) {
    if (lines.length && lines.at(-1).trim()) lines.push("");
    lines.push(`[${section}]`, `${key} = ${JSON.stringify(value)}`);
    return;
  }

  const header = headers[0];
  let end = lines.findIndex((line, index) => index > header && /^\\s*\[/.test(line));
  if (end < 0) end = lines.length;
  const pattern = new RegExp(`^\\s*${key}\\s*=`);
  const matches = [];
  for (let index = header + 1; index < end; index += 1) {
    if (pattern.test(lines[index])) matches.push(index);
  }
  if (matches.length > 1) throw new Error(`Refusing to edit duplicate ${key} settings in [${section}].`);
  const replacement = `${key} = ${JSON.stringify(value)}`;
  if (matches.length === 1) lines[matches[0]] = replacement;
  else lines.splice(end, 0, replacement);
}

setTopLevel("model", "gpt-5.6-luna");
setTopLevel("model_reasoning_effort", "low");
setSectionKey("agents", "max_depth", 1);
const output = `${lines.join(newline).replace(/(?:\r?\n)*$/, "")}${newline}`;
await writeFile(configPath, output, "utf8");
console.log(backupPath ? `Backed up Codex config to ${backupPath}` : `Created Codex config at ${configPath}`);
console.log("Configured gpt-5.6-luna with low reasoning effort and agents.max_depth=1 for new root tasks.");

import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createStateRecord,
  decideRoute,
  renderDecisionContext,
  renderSessionContext,
} from "../lib/routing.mjs";

const scriptPluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const pluginRoot = resolve(process.env.PLUGIN_ROOT || scriptPluginRoot);

function hookOutput(eventName, additionalContext) {
  return {
    hookSpecificOutput: {
      hookEventName: eventName,
      additionalContext,
    },
  };
}

function safeSessionFileName(sessionId) {
  return String(sessionId).replace(/[^A-Za-z0-9_.-]/g, "_");
}

async function readStdin() {
  let value = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) value += chunk;
  return value;
}

function parsePayload(raw) {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Hook payload does not contain a JSON object.");
  return JSON.parse(raw.slice(start, end + 1));
}

function statePaths(sessionId) {
  const dataRoot = process.env.PLUGIN_DATA?.trim();
  if (!dataRoot || !sessionId) return null;
  const directory = join(resolve(dataRoot), "router-state");
  return {
    directory,
    state: join(directory, `${safeSessionFileName(sessionId)}.json`),
    log: join(resolve(dataRoot), "routing-decisions.jsonl"),
  };
}

async function readPreviousState(paths) {
  if (!paths || !existsSync(paths.state)) return null;
  try {
    return JSON.parse(await readFile(paths.state, "utf8"));
  } catch {
    return null;
  }
}

async function persistDecision(paths, record) {
  if (!paths) return;
  try {
    await mkdir(paths.directory, { recursive: true });
    await writeFile(paths.state, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    await appendFile(paths.log, `${JSON.stringify(record)}\n`, "utf8");
  } catch {
    // State is optional. Routing must remain available on read-only installations.
  }
}

export async function runHook(mode, rawInput = "") {
  if (process.env.ADAPTIVE_MODEL_ROUTER_WORKER === "1") return {};
  if (!existsSync(pluginRoot)) {
    return hookOutput(mode, "ADAPTIVE_ROUTER_FOR_CODEX: PLUGIN_ROOT is unavailable. Continue with the current model.");
  }
  if (mode === "SessionStart") return hookOutput("SessionStart", renderSessionContext());
  if (!rawInput.trim()) {
    return hookOutput("UserPromptSubmit", "ADAPTIVE_ROUTER_FOR_CODEX: No prompt payload was available. Continue with the current model.");
  }

  let payload;
  try {
    payload = parsePayload(rawInput);
  } catch {
    return hookOutput("UserPromptSubmit", "ADAPTIVE_ROUTER_FOR_CODEX: The hook payload could not be parsed. Continue with the current model.");
  }

  const prompt = String(payload.prompt ?? "");
  const sessionId = String(payload.session_id ?? "");
  const paths = statePaths(sessionId);
  const previousState = await readPreviousState(paths);
  const decision = decideRoute({
    prompt,
    activeModel: String(payload.model ?? ""),
    previousState,
  });
  await persistDecision(paths, createStateRecord(sessionId, decision));
  return hookOutput("UserPromptSubmit", renderDecisionContext(decision));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] === "SessionStart" ? "SessionStart" : "UserPromptSubmit";
  const input = mode === "SessionStart" ? "" : await readStdin();
  process.stdout.write(JSON.stringify(await runHook(mode, input)));
}

import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { routeConfig } from "../lib/routing.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = dirname(here);
const workerInstructions = join(here, "worker-instructions.md");

export function codexLaunch() {
  const entry = join(pluginRoot, "node_modules", "@openai", "codex", "bin", "codex.js");
  if (!existsSync(entry)) {
    throw new Error("Bundled Codex worker is missing. Reinstall the adaptive-router-for-codex plugin.");
  }
  return { command: process.execPath, prefixArgs: [entry] };
}

export function validateWorkingDirectory(cwd) {
  const workingDirectory = resolve(cwd?.trim() || process.cwd());
  let stats;
  try {
    stats = statSync(workingDirectory);
  } catch {
    throw new Error(`Working directory does not exist: ${workingDirectory}`);
  }
  if (!stats.isDirectory()) throw new Error(`Working directory is not a directory: ${workingDirectory}`);
  return workingDirectory;
}

export function parseAgentEvent(line) {
  try {
    const event = JSON.parse(line);
    if (event?.type === "item.completed" && event?.item?.type === "agent_message") {
      return { message: event.item.text ?? "" };
    }
    if (event?.type === "turn.failed") {
      return { error: event.error?.message ?? "Worker turn failed." };
    }
  } catch {
    return null;
  }
  return null;
}

export function buildWorkerArgs({ target, sandbox, workingDirectory }, launch) {
  return [
    ...launch.prefixArgs,
    "-m",
    target.model,
    "-c",
    `model_reasoning_effort=${JSON.stringify(target.effort)}`,
    "-c",
    `model_instructions_file=${JSON.stringify(workerInstructions)}`,
    "-s",
    sandbox,
    "-a",
    "never",
    "exec",
    "--json",
    "--skip-git-repo-check",
    "-C",
    workingDirectory,
    "-",
  ];
}

export async function runWorker(input, options = {}) {
  const target = routeConfig[input.route];
  if (!target) throw new Error(`Unknown route: ${input.route}`);
  if (!input.task?.trim()) throw new Error("Task context cannot be empty.");
  const sandbox = input.sandbox ?? "workspace-write";
  if (!new Set(["read-only", "workspace-write"]).has(sandbox)) throw new Error(`Unsupported sandbox: ${sandbox}`);

  const workingDirectory = validateWorkingDirectory(input.cwd);
  const timeoutSeconds = Math.max(30, Math.min(input.timeout_seconds ?? 1800, 1800));
  const timeoutMs = options.timeoutMsOverride ?? timeoutSeconds * 1000;
  const launch = (options.codexLaunchImpl ?? codexLaunch)();
  const spawnImpl = options.spawnImpl ?? spawn;
  const args = buildWorkerArgs({ target, sandbox, workingDirectory }, launch);

  return await new Promise((resolvePromise, reject) => {
    const child = spawnImpl(launch.command, args, {
      cwd: workingDirectory,
      env: { ...process.env, ADAPTIVE_MODEL_ROUTER_WORKER: "1" },
      windowsHide: true,
      shell: false,
    });

    let stdoutBuffer = "";
    let stderr = "";
    let lastMessage = "";
    let workerError = "";
    let settled = false;

    const finishError = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      child.kill();
      finishError(new Error(`Worker timed out after ${Math.round(timeoutSeconds)} seconds.`));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = parseAgentEvent(line);
        if (event?.message) lastMessage = event.message;
        if (event?.error) workerError = event.error;
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", finishError);
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (stdoutBuffer.trim()) {
        const event = parseAgentEvent(stdoutBuffer.trim());
        if (event?.message) lastMessage = event.message;
        if (event?.error) workerError = event.error;
      }
      if (code !== 0 || workerError) {
        const detail = workerError || stderr.trim().split(/\r?\n/).slice(-8).join("\n") || `exit code ${code}`;
        reject(new Error(`Routed worker failed: ${detail}`));
        return;
      }
      if (!lastMessage) {
        reject(new Error("Routed worker completed without a final assistant message."));
        return;
      }
      resolvePromise({ text: lastMessage, model: target.model, effort: target.effort });
    });

    child.stdin.end(input.task, "utf8");
  });
}

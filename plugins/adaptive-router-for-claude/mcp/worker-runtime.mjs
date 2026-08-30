import { spawn } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { routeConfig } from "../lib/routing.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const workerInstructions = readFileSync(join(here, "worker-instructions.md"), "utf8");

const allowedToolsBySandbox = Object.freeze({
  "read-only": "Read,Grep,Glob",
  "workspace-write": "Read,Grep,Glob,Write,Edit,Bash",
});

export function claudeLaunch() {
  return { command: "claude", prefixArgs: [] };
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

export function buildWorkerArgs({ target, sandbox, workingDirectory, task, includeEffort = true }, launch) {
  const args = [
    ...launch.prefixArgs,
    "-p",
    "--model",
    target.model,
    ...(includeEffort ? ["--effort", target.effort] : []),
    "--permission-mode",
    sandbox === "read-only" ? "plan" : "acceptEdits",
    "--allowedTools",
    allowedToolsBySandbox[sandbox],
    "--add-dir",
    workingDirectory,
    "--append-system-prompt",
    workerInstructions,
    "--bare",
    "--output-format",
    "json",
    task,
  ];
  return args;
}

function looksLikeUnsupportedEffort(stderr) {
  return /unknown option|unrecognized|unexpected argument|--effort/i.test(stderr);
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
  const launch = (options.claudeLaunchImpl ?? claudeLaunch)();
  const spawnImpl = options.spawnImpl ?? spawn;

  async function attempt(includeEffort) {
    const args = buildWorkerArgs({ target, sandbox, workingDirectory, task: input.task, includeEffort }, launch);

    return await new Promise((resolvePromise, reject) => {
      const child = spawnImpl(launch.command, args, {
        cwd: workingDirectory,
        env: { ...process.env, ADAPTIVE_MODEL_ROUTER_WORKER: "1" },
        windowsHide: true,
        shell: false,
      });

      let stdout = "";
      let stderr = "";
      let settled = false;

      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error?.code === "ENOENT") {
          reject(new Error("claude CLI not found on PATH. Install Claude Code and ensure the 'claude' binary is available before using this plugin."));
          return;
        }
        reject(error);
      };

      const timer = setTimeout(() => {
        if (settled) return;
        child.kill();
        finish(new Error(`Worker timed out after ${Math.round(timeoutSeconds)} seconds.`));
      }, timeoutMs);

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", finish);
      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        let parsed;
        try {
          parsed = JSON.parse(stdout.trim());
        } catch {
          parsed = null;
        }

        // --output-format json still writes one JSON object to stdout on failure
        // (e.g. {"is_error":true,"result":"Not logged in · Please run /login",...}),
        // so prefer that message over raw stderr/exit-code text when it is present.
        const failureDetail = parsed?.is_error || parsed?.error
          ? (parsed.error?.message ?? parsed.error ?? parsed.result ?? `exit code ${code}`)
          : null;

        if (code !== 0 || failureDetail) {
          const combinedText = `${stderr}\n${failureDetail ?? ""}`;
          if (includeEffort && looksLikeUnsupportedEffort(combinedText)) {
            resolvePromise({ retryWithoutEffort: true });
            return;
          }
          const detail = failureDetail ?? stderr.trim().split(/\r?\n/).slice(-8).join("\n") ?? `exit code ${code}`;
          reject(new Error(`Routed worker failed: ${detail || `exit code ${code}`}`));
          return;
        }

        if (!parsed) {
          reject(new Error("Routed worker returned output that could not be parsed as JSON."));
          return;
        }
        if (!parsed.result) {
          reject(new Error("Routed worker completed without a final assistant message."));
          return;
        }
        resolvePromise({ text: parsed.result, model: target.model, effort: target.effort });
      });
    });
  }

  const firstAttempt = await attempt(true);
  if (firstAttempt.retryWithoutEffort) return await attempt(false);
  return firstAttempt;
}

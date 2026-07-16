# Adaptive Router for Codex

> **Unofficial community plugin. This project is not affiliated with or endorsed by OpenAI.**

Adaptive Router for Codex chooses a GPT-5.6 worker tier for each Codex turn using deterministic local scoring, explicit slash controls, and conversation continuity. The displayed root model does not hot-swap. For substantive routes, the root task calls a local MCP worker that starts a model-pinned Codex execution and returns its result.

## Features

- Deterministic Luna, Terra, Terra High, Sol, Sol Max, and explicit-only Sol Ultra routes.
- `/luna`, `/terra`, `/terra-high`, `/sol`, `/sol-max`, `/sol-ultra`, and `/auto` controls.
- Turkish-aware normalization and conservative continuation inheritance.
- Root-only routing with no wrapper or nested subagent layer.
- Cross-platform Node ESM hook for Windows, macOS, and Linux.
- Local worker spawning with fixed model/effort mappings, no shell interpolation, approval `never`, and bounded sandbox choices.
- Privacy-limited state and decision logs with no prompt content and no prompt-derived hashes.

## Prerequisites

- Codex app or CLI with ChatGPT/Codex authentication and access to the configured GPT-5.6 models.
- Node.js 22 or newer and npm.
- Approximately 425 MB of free space for the platform-specific Codex worker downloaded by npm.
- Windows PowerShell 5.1+ on Windows, or Bash on macOS/Linux.

The exact model names must be available to your account. If a selected worker is unavailable, the coordinator continues with the current root model and reports a material fallback.

## Architecture and Data Flow

```text
User prompt
  -> UserPromptSubmit hook
  -> deterministic score + explicit override + session continuity
  -> developer routing context
  -> direct Luna response OR root task calls run_routed_task exactly once
  -> plugin-local Codex CLI with pinned model and effort
  -> worker result returned directly to the root task
```

The `SessionStart` hook installs the operating contract. The `UserPromptSubmit` hook reads one JSON payload, normalizes the prompt in memory, calculates the route, optionally reads/writes minimal session state under `PLUGIN_DATA`, and emits routing context. `ADAPTIVE_MODEL_ROUTER_WORKER=1` bypasses both hooks inside workers to prevent recursion.

## Install

Clone or download the repository, then run one installer from the repository root.

### Windows

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

### macOS or Linux

```bash
bash ./scripts/install.sh
```

The installer:

1. Checks Node.js 22+ and npm.
2. Runs `npm ci --omit=dev` in the plugin directory.
3. Uses that plugin-local `@openai/codex` CLI.
4. Adds the repository as the `adaptive-router-for-codex` local marketplace, or confirms the configured root matches.
5. Installs/enables `adaptive-router-for-codex@adaptive-router-for-codex`.
6. Runs structural diagnostics.

The default install does not modify global Codex model configuration.

After installation, restart the Codex app or start a new task. The first time the app reports an untrusted hook, open `/hooks`, inspect the Node command, and trust it once.

## Optional Installer Flags

| PowerShell | Bash | Effect |
|---|---|---|
| `-DryRun` | `--dry-run` | Validate and print intended actions without installing or changing configuration. |
| `-ConfigureCoordinator` | `--configure-coordinator` | Back up `~/.codex/config.toml`, set the root coordinator to `gpt-5.6-luna` with low effort, and enforce `agents.max_depth = 1`. |
| `-LiveTest` | `--live-test` | Run authenticated Luna, Terra, and Sol worker smoke tests after installation. |

Examples:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -ConfigureCoordinator
```

```bash
bash ./scripts/install.sh --dry-run
bash ./scripts/install.sh --configure-coordinator --live-test
```

## Update

Update the local repository files, then rerun the same installer. It verifies that an existing marketplace with this name points to this exact repository root, refreshes the plugin installation, and fails rather than silently replacing a conflicting marketplace root.

## Uninstall

From the plugin directory, use its local Codex CLI:

```powershell
node .\node_modules\@openai\codex\bin\codex.js plugin remove adaptive-router-for-codex@adaptive-router-for-codex
node .\node_modules\@openai\codex\bin\codex.js plugin marketplace remove adaptive-router-for-codex
```

```bash
node ./node_modules/@openai/codex/bin/codex.js plugin remove adaptive-router-for-codex@adaptive-router-for-codex
node ./node_modules/@openai/codex/bin/codex.js plugin marketplace remove adaptive-router-for-codex
```

If coordinator configuration was enabled, restore the timestamped backup printed by the installer. Uninstall does not remove the repository or restore config automatically.

## Route Controls

| Control | Model | Effort |
|---|---|---|
| `/luna` | `gpt-5.6-luna` | low |
| `/terra` | `gpt-5.6-terra` | medium |
| `/terra-high` | `gpt-5.6-terra` | high |
| `/sol` | `gpt-5.6-sol` | high |
| `/sol-max` | `gpt-5.6-sol` | max |
| `/sol-ultra` or `/ultra` | `gpt-5.6-sol` | ultra |
| `/auto` | Deterministic scoring | route-dependent |

Sol Ultra is never selected automatically. Short dependent prompts such as "continue" can inherit the prior route. Greetings and status-only prompts do not inherit it.

## Root-only Routed Execution

Every non-direct route requires the root task to call `run_routed_task` exactly once. The router never creates a generic or visible wrapper subagent, so a subagent cannot become an intermediate coordinator for another agent process.

The routed Codex worker starts with `features.multi_agent=false`, which removes collaboration tools from that worker. Its instruction file also forbids routing, delegation, and additional agent processes. If the worker fails, the root continues locally without weakening verification or permission boundaries.

When `--configure-coordinator` or `-ConfigureCoordinator` is used, the installer also writes `agents.max_depth = 1`. This lets the root Codex task create direct children for unrelated workflows while preventing those children from spawning deeper descendants.

## Privacy

Routing happens locally. The hook processes prompt text only in memory. Persisted state and optional JSONL logs contain only:

- session ID
- route
- model
- reasoning effort
- numeric score
- reason categories
- timestamp

They contain no prompt text and no prompt-derived hash. State uses `PLUGIN_DATA`; it is never written into the plugin installation directory. Routed task content is still provided to the authenticated Codex worker because that worker performs the requested task.

## Security and Permission Boundaries

- Routing never authorizes Git mutations, destructive actions, purchases, credential changes, or remote account actions.
- Workers use approval policy `never` and only `read-only` or `workspace-write` sandbox modes.
- Workers start with Codex multi-agent tools disabled.
- The MCP server validates the working directory and caps execution time at 30 minutes.
- The worker is spawned with `shell: false` and an argument array.
- The default installer does not modify global config.
- The coordinator flag creates a timestamped backup before changing top-level model settings and enforcing `agents.max_depth = 1`.
- No installer pipes remote scripts into a shell.

Review the source and hook command before trusting it. See [SECURITY.md](SECURITY.md) for reporting guidance.

## Compatibility

CI targets Windows, Ubuntu, and macOS with Node.js 22 and 24. The implementation uses Node ESM and npm. Exact GPT-5.6 model availability depends on the installed Codex version and account entitlements.

## Troubleshooting

### The hook is not running

Start a new task or restart the app, run `/hooks`, and trust the plugin hook. Confirm `node --version` reports 22 or newer.

### Marketplace name conflict

The installer refuses to overwrite an existing `adaptive-router-for-codex` marketplace that points elsewhere. Inspect:

```text
node plugins/adaptive-router-for-codex/node_modules/@openai/codex/bin/codex.js plugin marketplace list --json
```

Remove or rename the conflicting marketplace only after verifying it is not needed.

### Worker missing

Rerun the installer or run `npm ci --omit=dev` in `plugins/adaptive-router-for-codex`. Do not copy `node_modules` between operating systems.

### Model unavailable or authentication fails

Confirm Codex authentication and model access, then run `npm run test:live` from the plugin directory. Live tests are intentionally excluded from CI.

### Diagnose structure

```text
node plugins/adaptive-router-for-codex/scripts/diagnose.mjs
```

## Development

From `plugins/adaptive-router-for-codex`:

```text
npm ci
npm test
npm run syntax
npm run validate
npm run package:check
npm audit --audit-level=high
```

## License

MIT. See [LICENSE](LICENSE).

OpenAI, ChatGPT, Codex, and GPT model names are trademarks of their respective owner. Their use describes compatibility only and does not imply affiliation or endorsement.

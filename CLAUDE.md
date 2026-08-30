# CLAUDE.md - Adaptive Router for Agents (Claude Code plugin)

This file covers the Claude Code plugin, `plugins/adaptive-router-for-claude/`. Shared repo-wide rules (English-only public docs, no unsolicited Git mutations, the root-only routed-worker contract) live in `AGENTS.md` and apply equally here; read both if you are touching cross-plugin content like `scripts/check-public-package.mjs` or the root `README.md`.

## Scope

- Keep public code and documentation English-only.
- Preserve the route names, model mappings, deterministic thresholds, recursion guard, and root-only routed-worker contract.
- Never route through a generic or visible subagent. The root task calls the MCP worker directly, and routed workers are launched with `--bare` and an `--allowedTools` list that excludes the Task/Agent tools.
- Treat `tasks/`, dependency folders, state, logs, and credentials as local-only.
- Do not add Anthropic affiliation or endorsement claims. This is an unofficial community plugin.
- Do not run Git state-changing commands or remote mutations without exact, current user permission.

## Architecture

- Repo marketplace: `.claude-plugin/marketplace.json`
- Plugin root: `plugins/adaptive-router-for-claude/`
- Cross-platform hook: `plugins/adaptive-router-for-claude/hooks/router.mjs`
- Routing core: `plugins/adaptive-router-for-claude/lib/routing.mjs`
- MCP worker: `plugins/adaptive-router-for-claude/mcp/server.mjs` (spawns the system `claude` CLI in headless mode via `mcp/worker-runtime.mjs`)
- Tests: `plugins/adaptive-router-for-claude/test/`
- Installers: `scripts/install-claude.ps1` and `scripts/install-claude.sh`
- The Codex plugin (`plugins/adaptive-router-for-codex/`) mirrors this same structure; see `AGENTS.md` for its specifics. Keep both `lib/routing.mjs` files structurally aligned when changing shared scoring signals.

## Open verification items

A few Claude Code CLI/plugin behaviors were confirmed against live docs and a real `claude` invocation during initial implementation, but deserve re-checking if the CLI changes: the exact `--output-format json` failure shape (`{is_error, result}` on stdout even with empty stderr, confirmed live), and whether `--effort` stays accepted in `-p` mode across CLI versions (the worker retries once without `--effort` if it looks unsupported). See `mcp/worker-runtime.mjs`.

## Commands

Run these from `plugins/adaptive-router-for-claude`:

```text
npm ci
npm test
npm run syntax
npm run validate
npm run package:check
npm audit --audit-level=high
```

POSIX installer dry run from the repository root:

```bash
bash ./scripts/install-claude.sh --dry-run
```

Windows installer dry run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-claude.ps1 -DryRun
```

## Verification

- Use Node 22 or 24.
- Keep live model tests opt-in with `npm run test:live` and out of CI; it requires an authenticated `claude` CLI.
- Run `npm pack --dry-run --json` and confirm `node_modules` is absent.
- Scan public files for personal identifiers, absolute personal paths, secrets, placeholders, and U+2014.

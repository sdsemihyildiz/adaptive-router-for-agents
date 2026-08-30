# AGENTS.md - Adaptive Router for Agents (Codex plugin)

Claude Code reads `CLAUDE.md`, not this file, for its own project memory. This file covers the Codex plugin; shared repo-wide rules (English-only docs, no unsolicited Git mutations, the root-only routed-worker contract) apply to both plugins in this repository.

## Scope

- Keep public code and documentation English-only.
- Preserve the route names, model mappings, deterministic thresholds, recursion guard, and root-only routed-worker contract.
- Never route through a generic or visible subagent. The root task calls the MCP worker directly, and routed workers must have multi-agent tools disabled.
- Treat `BRAIN.md`, `tasks/`, dependency folders, state, logs, and credentials as local-only.
- Do not add OpenAI affiliation or endorsement claims. This is an unofficial community plugin.
- Do not run Git state-changing commands or remote mutations without exact, current user permission.

## Architecture

- Repo marketplace (Codex): `.agents/plugins/marketplace.json`
- Repo marketplace (Claude Code): `.claude-plugin/marketplace.json`
- Plugin root: `plugins/adaptive-router-for-codex/`
- Cross-platform hook: `plugins/adaptive-router-for-codex/hooks/router.mjs`
- Routing core: `plugins/adaptive-router-for-codex/lib/routing.mjs`
- MCP worker: `plugins/adaptive-router-for-codex/mcp/server.mjs`
- Tests: `plugins/adaptive-router-for-codex/test/`
- Installers: `scripts/install.ps1` and `scripts/install.sh`
- The Claude Code plugin (`plugins/adaptive-router-for-claude/`) mirrors this same structure; see `CLAUDE.md` for its specifics.

## Commands

Run these from `plugins/adaptive-router-for-codex`:

```text
npm ci
npm test
npm run syntax
npm run validate
npm run package:check
npm audit --audit-level=high
```

Windows installer dry run from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -DryRun
```

POSIX installer dry run:

```bash
bash ./scripts/install.sh --dry-run
```

## Verification

- Use Node 22 or 24.
- Keep live model tests opt-in with `npm run test:live` and out of CI.
- Run `npm pack --dry-run --json` and confirm `node_modules` is absent.
- Scan public files for personal identifiers, absolute personal paths, secrets, placeholders, and U+2014.
- Validate plugin and skill manifests with the bundled validators when Python is available.

## Brain Protocol

- Read local `BRAIN.md` after this file for durable project context.
- Update `BRAIN.md` after meaningful architecture, command, compatibility, risk, or open-thread changes.
- Keep `BRAIN.md` compact and free of secrets, raw logs, dependencies, and generated output.

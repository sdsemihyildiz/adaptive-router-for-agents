# Changelog

All notable changes follow Keep a Changelog and Semantic Versioning.

## [Unreleased]

### Added

- New `adaptive_astra_xhigh` (Codex) and `adaptive_opus_xhigh` (Claude Code) routes at the `xhigh` reasoning effort, now supported by both CLIs. Score band 9-10 selects them, so `max` is reserved for score 11 and above.
- New Codex controls `/astra`, `/astra-xhigh`, `/astra-max`, and `/astra-ultra`, plus the Claude Code control `/opus-xhigh`.
- New, fully independent Claude Code plugin (`plugins/adaptive-router-for-claude`) with the same deterministic local routing design, ported to Claude's Haiku, Sonnet, Opus, and Fable model tiers. See the Claude Code section of the README.
- Root `.claude-plugin/marketplace.json` for installing the Claude Code plugin.

### Changed

- Codex top tier moved from `gpt-5.6-sol` to `gpt-6-astra`. The `adaptive_sol`, `adaptive_sol_max`, and `adaptive_sol_ultra` routes are replaced by `adaptive_astra`, `adaptive_astra_max`, and `adaptive_astra_ultra`. The `/sol`, `/sol-max`, `/sol-ultra`, and `/ultra` controls keep working as deprecated aliases of the matching Astra route.
- Claude Code `adaptive_fable` now targets `claude-fable-5-1` instead of `claude-fable-5`.
- Claude Code `adaptive_haiku` now uses the canonical `claude-haiku-4-5` model id instead of the dated `claude-haiku-4-5-20251001` snapshot id.
- Claude Code routed-worker failures now append a diagnostic hint when the underlying error is an auth failure, explaining that `--bare` mode requires `ANTHROPIC_API_KEY` (or an `apiKeyHelper`) and does not read the root session's interactive OAuth/subscription/keychain state.
- Repository renamed to `adaptive-router-for-agents` to reflect that it now hosts plugins for more than one coding agent. The Codex plugin keeps its own name, `adaptive-router-for-codex`, unchanged.
- Removed the visible wrapper-subagent layer; non-direct routes now call the MCP worker directly from the root task.
- Disabled Codex multi-agent tools inside routed workers and configured the optional coordinator for `agents.max_depth = 1`.

## [0.1.0] - 2026-07-10

### Added

- Deterministic cross-platform routing for GPT-5.6 Luna, Terra, and Sol workers.
- Explicit slash controls, per-session continuity, and visible wrapper subagents.
- Local MCP worker with safe argument spawning and structured model metadata.
- Privacy-limited state, cross-platform installers, diagnostics, tests, and CI.

[Unreleased]: https://github.com/sdsemihyildiz/adaptive-router-for-agents/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/sdsemihyildiz/adaptive-router-for-agents/releases/tag/v0.1.0

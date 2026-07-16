# Changelog

All notable changes follow Keep a Changelog and Semantic Versioning.

## [Unreleased]

### Changed

- Removed the visible wrapper-subagent layer; non-direct routes now call the MCP worker directly from the root task.
- Disabled Codex multi-agent tools inside routed workers and configured the optional coordinator for `agents.max_depth = 1`.

## [0.1.0] - 2026-07-10

### Added

- Deterministic cross-platform routing for GPT-5.6 Luna, Terra, and Sol workers.
- Explicit slash controls, per-session continuity, and visible wrapper subagents.
- Local MCP worker with safe argument spawning and structured model metadata.
- Privacy-limited state, cross-platform installers, diagnostics, tests, and CI.

[Unreleased]: https://github.com/sdsemihyildiz/adaptive-router-for-codex/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/sdsemihyildiz/adaptive-router-for-codex/releases/tag/v0.1.0

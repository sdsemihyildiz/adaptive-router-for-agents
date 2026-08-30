# Contributing

Thank you for contributing to Adaptive Router for Agents. This repository hosts two independent plugins that share the same deterministic routing design: `plugins/adaptive-router-for-codex` (for Codex) and `plugins/adaptive-router-for-claude` (for Claude Code).

## Development

1. Use Node.js 22 or 24 and npm.
2. Run `npm ci` from the plugin directory you are changing: `plugins/adaptive-router-for-codex` or `plugins/adaptive-router-for-claude`.
3. Make focused changes that preserve route names and model mappings unless the change explicitly updates the routing contract. Keep the two plugins' `lib/routing.mjs` files structurally aligned; they intentionally share the same scoring signals.
4. Run `npm test`, `npm run syntax`, `npm run validate`, `npm run package:check`, and `npm audit --audit-level=high` in the plugin directory you changed.
5. Keep live model tests opt-in with `npm run test:live`.
6. If a change affects both plugins (for example, a shared scoring signal), update both `lib/routing.mjs` files and both test suites together.

Public files must be English-only and must not contain credentials, personal machine paths, prompt content, prompt-derived hashes, dependency folders, or generated router state. Add focused regression tests for behavior changes.

By contributing, you agree that your contribution is licensed under the MIT License.

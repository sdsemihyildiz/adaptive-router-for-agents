# Contributing

Thank you for contributing to Adaptive Router for Codex.

## Development

1. Use Node.js 22 or 24 and npm.
2. Run `npm ci` from `plugins/adaptive-router-for-codex`.
3. Make focused changes that preserve route names and model mappings unless the change explicitly updates the routing contract.
4. Run `npm test`, `npm run syntax`, `npm run validate`, `npm run package:check`, and `npm audit --audit-level=high`.
5. Keep live model tests opt-in with `npm run test:live`.

Public files must be English-only and must not contain credentials, personal machine paths, prompt content, prompt-derived hashes, dependency folders, or generated router state. Add focused regression tests for behavior changes.

By contributing, you agree that your contribution is licensed under the MIT License.

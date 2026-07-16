# Security Policy

## Supported Versions

Security fixes are provided for the latest released version.

## Reporting a Vulnerability

Use GitHub's private vulnerability reporting for `sdsemihyildiz/adaptive-router-for-codex`. Do not open a public issue containing exploit details, credentials, prompt content, local paths, or logs with sensitive data.

Include the affected version, platform, reproduction steps, and impact. Remove secrets and personal data before sharing diagnostics.

## Security Boundaries

- The hook makes a local deterministic decision and does not send prompt content to a separate routing service.
- Routed tasks are passed to the plugin-local Codex CLI and remain subject to Codex authentication, sandbox, approval, and workspace boundaries.
- Worker processes always use approval policy `never` and either `read-only` or `workspace-write` sandboxing.
- Routed workers start with `features.multi_agent=false`; routing is invoked directly by the root task without a wrapper subagent.
- Commands are spawned with argument arrays and `shell: false`.
- Global coordinator configuration is opt-in, backed up before modification, and enforces `agents.max_depth = 1`.

This project is an unofficial community plugin and is not affiliated with or endorsed by OpenAI.

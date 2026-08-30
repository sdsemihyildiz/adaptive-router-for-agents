# Security Policy

## Supported Versions

Security fixes are provided for the latest released version of each plugin.

## Reporting a Vulnerability

Use GitHub's private vulnerability reporting for `sdsemihyildiz/adaptive-router-for-agents`. Do not open a public issue containing exploit details, credentials, prompt content, local paths, or logs with sensitive data.

Include the affected plugin (Codex or Claude Code), version, platform, reproduction steps, and impact. Remove secrets and personal data before sharing diagnostics.

## Security Boundaries

### Both plugins

- The hook makes a local deterministic decision and does not send prompt content to a separate routing service.
- Commands are spawned with argument arrays and `shell: false`.
- Routing is invoked directly by the root task without a wrapper subagent; a routed worker cannot itself call the routing tool or coordinate another agent.

### Codex plugin

- Routed tasks are passed to the plugin-local Codex CLI and remain subject to Codex authentication, sandbox, approval, and workspace boundaries.
- Worker processes always use approval policy `never` and either `read-only` or `workspace-write` sandboxing, which Codex enforces with OS-level sandboxing (seatbelt on macOS, landlock on Linux).
- Routed workers start with `features.multi_agent=false`.
- Global coordinator configuration is opt-in, backed up before modification, and enforces `agents.max_depth = 1`.

### Claude Code plugin

- Routed tasks are passed to the system `claude` CLI in headless mode and remain subject to Claude Code authentication and permission boundaries.
- Worker processes run with `--permission-mode plan` (read-only) or `--permission-mode acceptEdits` (workspace-write), a scoped `--allowedTools` list, and `--add-dir` confined to the working directory. **This is policy-level enforcement, not OS-level sandboxing:** Claude Code does not expose a kernel-level sandbox equivalent to Codex's seatbelt/landlock modes. Do not treat it as an equivalent security boundary.
- Worker processes always run with `--bare`, so they never load this plugin's own hooks, skills, or MCP servers, and the `--allowedTools` list always excludes the Task/Agent tools, so a worker cannot spawn another agent process.
- There is no persistent global coordinator configuration for the Claude Code plugin; the root model is selected per session.

This project is an unofficial community plugin set and is not affiliated with or endorsed by OpenAI or Anthropic.

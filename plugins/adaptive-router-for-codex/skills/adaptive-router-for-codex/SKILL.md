---
name: adaptive-router-for-codex
description: Route every Codex turn to the appropriate GPT-5.6 worker tier using the hook-provided ADAPTIVE_ROUTER_FOR_CODEX decision and conversation continuity. Use implicitly when this plugin is enabled, especially for choosing between Luna, Terra, and Sol workers; use explicitly for /luna, /terra, /terra-high, /sol, /sol-max, /sol-ultra, /auto, route explanations, and routing behavior changes.
---

# Adaptive Router for Codex

Use the hook decision by default. Do not ask the user to choose a model unless availability forces a fallback that materially changes the result.

## Execute the route

1. Read the latest developer context block beginning with `ADAPTIVE_ROUTER_FOR_CODEX`.
2. Respect an explicit override over heuristic scoring.
3. If `DIRECT=true`, handle the turn in the root thread.
4. If `DIRECT=false`, create one visible Codex subagent whose name starts with the provided `SUBAGENT_PREFIX`.
5. Tell that wrapper to post a short start update, call the `adaptive-router-for-codex` MCP tool `run_routed_task` exactly once, and return its result.
6. Pass the selected route, complete task context, constraints, current working directory, and safe sandbox level. Tell the wrapper not to spawn another subagent or redo the worker task.
7. Wait for the wrapper and return its user-ready result with minimal rewriting.
8. If visible subagent creation is unavailable, call the MCP tool directly as a compatibility fallback.
9. If the worker fails, continue with the current root model without asking the user. Preserve all verification and permission boundaries.

Generic subagents inherit the parent model. The visible subagent is a tracking wrapper; the MCP worker supplies the pinned model.

## Route ladder

- Use `adaptive_luna` for greetings, status checks, short answers, simple transformations, and routine lookups.
- Use `adaptive_terra` for normal coding, debugging, document work, analysis, and implementation.
- Use `adaptive_terra_high` for multi-file work, difficult debugging, detailed comparisons, or edge-case-heavy reasoning.
- Use `adaptive_sol` for architecture, security, migration, ambiguous root-cause, high-stakes, and broad research work.
- Use `adaptive_sol_max` only when exceptionally difficult correctness-sensitive work benefits from maximum reasoning.
- Use `adaptive_sol_ultra` only for explicit `/sol-ultra` or `/ultra`. Never select it automatically.

## Continuity and controls

- Inherit the previous route for short dependent follow-ups such as "continue" or "fix it".
- Do not inherit for greetings, status-only turns, or explicit controls.
- Recognize leading `/luna`, `/terra`, `/terra-high`, `/sol`, `/sol-max`, `/sol-ultra`, `/ultra`, and `/auto` controls.
- Treat `/auto` as deterministic scoring for the current turn.
- Explain the tier only when asked or when a material fallback occurs.

Read [references/routing-policy.md](references/routing-policy.md) before changing thresholds, diagnosing surprising choices, or explaining the detailed policy.

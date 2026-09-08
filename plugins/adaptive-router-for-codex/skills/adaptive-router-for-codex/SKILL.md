---
name: adaptive-router-for-codex
description: Route every Codex turn to the appropriate worker tier using the hook-provided ADAPTIVE_ROUTER_FOR_CODEX decision and conversation continuity. Use implicitly when this plugin is enabled, especially for choosing between Luna, Terra, and Astra workers; use explicitly for /luna, /terra, /terra-high, /astra, /astra-xhigh, /astra-max, /astra-ultra, /auto, route explanations, and routing behavior changes.
---

# Adaptive Router for Codex

Use the hook decision by default. Do not ask the user to choose a model unless availability forces a fallback that materially changes the result.

## Execute the route

1. Read the latest developer context block beginning with `ADAPTIVE_ROUTER_FOR_CODEX`.
2. Respect an explicit override over heuristic scoring.
3. If `DIRECT=true`, handle the turn in the root thread.
4. If `DIRECT=false`, call the `adaptive-router-for-codex` MCP tool `run_routed_task` exactly once from the root task.
5. Pass the selected route, complete task context, constraints, current working directory, and safe sandbox level.
6. Never create a generic or visible subagent for routing. A subagent must not call `run_routed_task` or coordinate another agent.
7. Return the worker result with minimal rewriting.
8. If the worker fails, continue with the current root model without asking the user. Preserve all verification and permission boundaries.

The MCP worker supplies the pinned model and starts with Codex multi-agent tools disabled.

## Route ladder

- Use `adaptive_luna` for greetings, status checks, short answers, simple transformations, and routine lookups.
- Use `adaptive_terra` for normal coding, debugging, document work, analysis, and implementation.
- Use `adaptive_terra_high` for multi-file work, difficult debugging, detailed comparisons, or edge-case-heavy reasoning.
- Use `adaptive_astra` for architecture, security, migration, ambiguous root-cause, high-stakes, and broad research work.
- Use `adaptive_astra_xhigh` for sustained agentic work that spans many files or tool calls.
- Use `adaptive_astra_max` only when exceptionally difficult correctness-sensitive work benefits from maximum reasoning.
- Use `adaptive_astra_ultra` only for explicit `/astra-ultra`. Never select it automatically.

## Continuity and controls

- Inherit the previous route for short dependent follow-ups such as "continue" or "fix it".
- Do not inherit for greetings, status-only turns, or explicit controls.
- Recognize leading `/luna`, `/terra`, `/terra-high`, `/astra`, `/astra-xhigh`, `/astra-max`, `/astra-ultra`, and `/auto` controls.
- Accept the deprecated `/sol`, `/sol-max`, `/sol-ultra`, and `/ultra` controls as aliases of the matching Astra route.
- Treat `/auto` as deterministic scoring for the current turn.
- Explain the tier only when asked or when a material fallback occurs.

Read [references/routing-policy.md](references/routing-policy.md) before changing thresholds, diagnosing surprising choices, or explaining the detailed policy.

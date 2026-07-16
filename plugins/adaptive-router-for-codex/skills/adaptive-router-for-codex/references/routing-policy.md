# Routing Policy

## Route ladder

| Score or control | Route | Model | Effort | Typical work |
|---|---|---|---|---|
| Explicit `/luna`, or score <= 1 | `adaptive_luna` | `gpt-5.6-luna` | low | Short, routine, latency-sensitive work |
| Explicit `/terra`, or score 2-4 | `adaptive_terra` | `gpt-5.6-terra` | medium | Normal professional and coding work |
| Explicit `/terra-high`, or score 5-6 | `adaptive_terra_high` | `gpt-5.6-terra` | high | Complex implementation and debugging |
| Explicit `/sol`, or score 7-9 | `adaptive_sol` | `gpt-5.6-sol` | high | Ambiguous, high-risk, long-horizon work |
| Explicit `/sol-max`, or score >= 10 | `adaptive_sol_max` | `gpt-5.6-sol` | max | The hardest correctness-sensitive work |
| Explicit `/sol-ultra` or `/ultra` only | `adaptive_sol_ultra` | `gpt-5.6-sol` | ultra | User-requested maximum agentic reasoning |

`/auto` ignores manual selection for the current turn and returns to scoring.

## Scoring signals

The hook counts each category once rather than counting repeated keywords.

- Simple transformation: -2.
- Status-only prompt: -3.
- Moderate or long prompt: +1 or +2.
- Ordinary implementation, testing, debugging, or data work: +2.
- Architecture, deep investigation, broad research, or difficult optimization: +3.
- Security, authentication, irreversible migration, concurrency, or high-stakes domain: +4.
- Explicit maximum-quality language: +3.
- Three or more listed deliverables: +1.

## Continuity

Short dependent follow-ups inherit the prior route and score. Status-only prompts never inherit. Explicit controls always win. Session state is stored only when `PLUGIN_DATA` and a session ID are available.

## Persistence and recursion

State and logs contain only session ID, route, model, effort, score, reason categories, and timestamp. Prompt text and prompt-derived hashes are not persisted. A worker sets `ADAPTIVE_MODEL_ROUTER_WORKER=1`; hooks return immediately when that value is present.

## Fallbacks

If the selected worker fails or is unavailable, continue in the current root task while preserving the original safety and verification requirements. Report the fallback only when it materially affects quality, latency, or cost. Never modify account access or silently install a model.

## Root-only execution contract

The root model does not hot-swap. Every non-direct route calls the MCP worker exactly once from the root task without creating a wrapper subagent. The MCP worker starts a separate Codex execution with the route's exact model and effort, disables multi-agent tools, and returns the result directly to the root task.

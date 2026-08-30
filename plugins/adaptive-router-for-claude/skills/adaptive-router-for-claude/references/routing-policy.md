# Routing Policy

## Route ladder

| Score or control | Route | Model | Effort | Typical work |
|---|---|---|---|---|
| Explicit `/haiku`, or score <= 1 | `adaptive_haiku` | `claude-haiku-4-5-20251001` | low | Short, routine, latency-sensitive work |
| Explicit `/sonnet`, or score 2-4 | `adaptive_sonnet` | `claude-sonnet-5` | medium | Normal professional and coding work |
| Explicit `/sonnet-high`, or score 5-6 | `adaptive_sonnet_high` | `claude-sonnet-5` | high | Complex implementation and debugging |
| Explicit `/opus`, or score 7-9 | `adaptive_opus` | `claude-opus-5` | high | Ambiguous, high-risk, long-horizon work |
| Explicit `/opus-max`, or score >= 10 | `adaptive_opus_max` | `claude-opus-5` | max | The hardest correctness-sensitive work |
| Explicit `/fable` only | `adaptive_fable` | `claude-fable-5` | max | User-requested maximum-capability reasoning |

`/auto` ignores manual selection for the current turn and returns to scoring.

Unlike the Codex-side Sol Ultra tier, which differentiates itself from Sol Max by a higher reasoning-effort value on the same model, `adaptive_fable` differentiates itself from `adaptive_opus_max` by using a different, more capable model at the same top effort level, since Claude's effort scale tops out at `max`.

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

Short dependent follow-ups inherit the prior route and score. Status-only prompts never inherit. Explicit controls always win. Session state is stored only when `CLAUDE_PLUGIN_DATA` and a session ID are available.

## Persistence and recursion

State and logs contain only session ID, route, model, effort, score, reason categories, and timestamp. Prompt text and prompt-derived hashes are not persisted. A worker sets `ADAPTIVE_MODEL_ROUTER_WORKER=1`; hooks return immediately when that value is present. The worker also runs with `--bare`, so it never loads this plugin's own hooks in the first place.

## Fallbacks

If the selected worker fails or is unavailable, continue in the current root task while preserving the original safety and verification requirements. Report the fallback only when it materially affects quality, latency, or cost. Never modify account access or silently install a model.

## Root-only execution contract

The root model does not hot-swap. Every non-direct route calls the MCP worker exactly once from the root task without creating a wrapper subagent. The MCP worker starts a separate, `--bare` headless Claude Code execution with the route's exact model and effort, excludes the Task/Agent tools, and returns the result directly to the root task.

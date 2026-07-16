import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createStateRecord,
  decideRoute,
  normalizeRoutingText,
  renderDecisionContext,
  routeForScore,
} from "../lib/routing.mjs";
import { runHook } from "../hooks/router.mjs";

test("routing thresholds map to the approved ladder", () => {
  assert.equal(routeForScore(1), "adaptive_luna");
  assert.equal(routeForScore(2), "adaptive_terra");
  assert.equal(routeForScore(4), "adaptive_terra");
  assert.equal(routeForScore(5), "adaptive_terra_high");
  assert.equal(routeForScore(6), "adaptive_terra_high");
  assert.equal(routeForScore(7), "adaptive_sol");
  assert.equal(routeForScore(9), "adaptive_sol");
  assert.equal(routeForScore(10), "adaptive_sol_max");
});

test("Turkish normalization preserves routing keywords", () => {
  assert.equal(normalizeRoutingText("İŞIĞI DÜZELT, ÇÖZÜMÜ ARAŞTIR"), "isigi duzelt, cozumu arastir");
  assert.equal(decideRoute({ prompt: "Bu kodu düzelt ve testini yaz." }).route, "adaptive_terra");
});

test("leading explicit overrides map to exact model and effort", () => {
  const cases = [
    ["/luna hello", "adaptive_luna", "gpt-5.6-luna", "low"],
    ["/terra implement it", "adaptive_terra", "gpt-5.6-terra", "medium"],
    ["/terra-high investigate", "adaptive_terra_high", "gpt-5.6-terra", "high"],
    ["/sol analyze", "adaptive_sol", "gpt-5.6-sol", "high"],
    ["/sol-max analyze", "adaptive_sol_max", "gpt-5.6-sol", "max"],
    ["/sol-ultra analyze", "adaptive_sol_ultra", "gpt-5.6-sol", "ultra"],
    ["/ultra analyze", "adaptive_sol_ultra", "gpt-5.6-sol", "ultra"],
  ];
  for (const [prompt, route, model, effort] of cases) {
    const decision = decideRoute({ prompt });
    assert.equal(decision.route, route);
    assert.equal(decision.model, model);
    assert.equal(decision.effort, effort);
  }
});

test("automatic mode scores instead of inheriting", () => {
  const previousState = createStateRecord("session", decideRoute({ prompt: "/sol-max hard task" }));
  assert.equal(decideRoute({ prompt: "/auto continue", previousState }).route, "adaptive_luna");
});

test("dependent continuation inherits but status does not", () => {
  const previousState = createStateRecord("session", decideRoute({ prompt: "/sol-max hard task" }));
  assert.equal(decideRoute({ prompt: "devam et", previousState }).route, "adaptive_sol_max");
  assert.equal(decideRoute({ prompt: "Ne durumdayız?", previousState }).route, "adaptive_luna");
});

test("non-direct routes require root-only MCP execution without wrapper fields", () => {
  const decision = decideRoute({ prompt: "Implement this API and test it." });
  const context = renderDecisionContext(decision);
  assert.equal("visibleSubagent" in decision, false);
  assert.equal("subagentPrefix" in decision, false);
  assert.match(context, /run_routed_task exactly once/);
  assert.match(context, /adaptive-router-for-codex MCP tool/);
  assert.match(context, /from the root task/);
  assert.match(context, /Never create a generic or visible subagent/);
  assert.doesNotMatch(context, /VISIBLE_SUBAGENT|SUBAGENT_PREFIX/);
});

test("Luna is direct only when the active root is Luna", () => {
  assert.equal(decideRoute({ prompt: "hello", activeModel: "gpt-5.6-luna" }).direct, true);
  assert.equal(decideRoute({ prompt: "hello", activeModel: "gpt-5.6-terra" }).direct, false);
});

test("worker recursion guard emits no routing context or state", async () => {
  const data = await mkdtemp(join(tmpdir(), "adaptive-router-recursion-"));
  const oldData = process.env.PLUGIN_DATA;
  const oldWorker = process.env.ADAPTIVE_MODEL_ROUTER_WORKER;
  process.env.PLUGIN_DATA = data;
  process.env.ADAPTIVE_MODEL_ROUTER_WORKER = "1";
  try {
    const output = await runHook("UserPromptSubmit", JSON.stringify({ prompt: "secret", session_id: "recursion" }));
    assert.deepEqual(output, {});
    await assert.rejects(readFile(join(data, "routing-decisions.jsonl"), "utf8"), /ENOENT/);
  } finally {
    if (oldData === undefined) delete process.env.PLUGIN_DATA;
    else process.env.PLUGIN_DATA = oldData;
    if (oldWorker === undefined) delete process.env.ADAPTIVE_MODEL_ROUTER_WORKER;
    else process.env.ADAPTIVE_MODEL_ROUTER_WORKER = oldWorker;
    await rm(data, { recursive: true, force: true });
  }
});

test("persisted state and logs contain only approved metadata", async () => {
  const data = await mkdtemp(join(tmpdir(), "adaptive-router-privacy-"));
  const oldData = process.env.PLUGIN_DATA;
  const oldWorker = process.env.ADAPTIVE_MODEL_ROUTER_WORKER;
  process.env.PLUGIN_DATA = data;
  delete process.env.ADAPTIVE_MODEL_ROUTER_WORKER;
  const privatePrompt = "Implement the confidential example with unique phrase cobalt-orchid.";
  try {
    await runHook("UserPromptSubmit", JSON.stringify({ prompt: privatePrompt, session_id: "privacy-session", model: "gpt-5.6-luna" }));
    const state = JSON.parse(await readFile(join(data, "router-state", "privacy-session.json"), "utf8"));
    const log = await readFile(join(data, "routing-decisions.jsonl"), "utf8");
    assert.deepEqual(Object.keys(state).sort(), ["effort", "model", "reasons", "route", "score", "session_id", "updated_at"]);
    assert.equal(JSON.stringify(state).includes(privatePrompt), false);
    assert.equal(log.includes(privatePrompt), false);
    assert.equal(/hash|sha256/i.test(log), false);
  } finally {
    if (oldData === undefined) delete process.env.PLUGIN_DATA;
    else process.env.PLUGIN_DATA = oldData;
    if (oldWorker === undefined) delete process.env.ADAPTIVE_MODEL_ROUTER_WORKER;
    else process.env.ADAPTIVE_MODEL_ROUTER_WORKER = oldWorker;
    await rm(data, { recursive: true, force: true });
  }
});

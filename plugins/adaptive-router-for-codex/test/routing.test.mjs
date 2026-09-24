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
  assert.equal(routeForScore(2), "adaptive_sol");
  assert.equal(routeForScore(4), "adaptive_sol");
  assert.equal(routeForScore(5), "adaptive_sol_high");
  assert.equal(routeForScore(6), "adaptive_sol_high");
  assert.equal(routeForScore(7), "adaptive_astra");
  assert.equal(routeForScore(8), "adaptive_astra");
  assert.equal(routeForScore(9), "adaptive_astra_xhigh");
  assert.equal(routeForScore(10), "adaptive_astra_xhigh");
  assert.equal(routeForScore(11), "adaptive_astra_max");
});

test("Turkish normalization preserves routing keywords", () => {
  assert.equal(normalizeRoutingText("İŞIĞI DÜZELT, ÇÖZÜMÜ ARAŞTIR"), "isigi duzelt, cozumu arastir");
  assert.equal(decideRoute({ prompt: "Bu kodu düzelt ve testini yaz." }).route, "adaptive_sol");
});

test("leading explicit overrides map to exact model and effort", () => {
  const cases = [
    ["/luna hello", "adaptive_luna", "gpt-6-luna", "low"],
    ["/sol implement it", "adaptive_sol", "gpt-6-sol", "medium"],
    ["/sol-high investigate", "adaptive_sol_high", "gpt-6-sol", "high"],
    ["/astra analyze", "adaptive_astra", "gpt-6-astra", "high"],
    ["/astra-xhigh analyze", "adaptive_astra_xhigh", "gpt-6-astra", "xhigh"],
    ["/astra-max analyze", "adaptive_astra_max", "gpt-6-astra", "max"],
    ["/astra-ultra analyze", "adaptive_astra_ultra", "gpt-6-astra", "ultra"],
  ];
  for (const [prompt, route, model, effort] of cases) {
    const decision = decideRoute({ prompt });
    assert.equal(decision.route, route);
    assert.equal(decision.model, model);
    assert.equal(decision.effort, effort);
  }
});

test("deprecated controls resolve to the matching Sol or Astra route", () => {
  const cases = [
    ["/terra implement it", "adaptive_sol", "gpt-6-sol", "medium"],
    ["/terra-high investigate", "adaptive_sol_high", "gpt-6-sol", "high"],
    ["/sol-max analyze", "adaptive_astra_max", "gpt-6-astra", "max"],
    ["/sol-ultra analyze", "adaptive_astra_ultra", "gpt-6-astra", "ultra"],
    ["/ultra analyze", "adaptive_astra_ultra", "gpt-6-astra", "ultra"],
  ];
  for (const [prompt, route, model, effort] of cases) {
    const decision = decideRoute({ prompt });
    assert.equal(decision.route, route);
    assert.equal(decision.model, model);
    assert.equal(decision.effort, effort);
  }
});

test("automatic mode scores instead of inheriting", () => {
  const previousState = createStateRecord("session", decideRoute({ prompt: "/astra-max hard task" }));
  assert.equal(decideRoute({ prompt: "/auto continue", previousState }).route, "adaptive_luna");
});

test("dependent continuation inherits but status does not", () => {
  const previousState = createStateRecord("session", decideRoute({ prompt: "/astra-max hard task" }));
  assert.equal(decideRoute({ prompt: "devam et", previousState }).route, "adaptive_astra_max");
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
  assert.equal(decideRoute({ prompt: "hello", activeModel: "gpt-6-luna" }).direct, true);
  assert.equal(decideRoute({ prompt: "hello", activeModel: "gpt-6-sol" }).direct, false);
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
    await runHook("UserPromptSubmit", JSON.stringify({ prompt: privatePrompt, session_id: "privacy-session", model: "gpt-6-luna" }));
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

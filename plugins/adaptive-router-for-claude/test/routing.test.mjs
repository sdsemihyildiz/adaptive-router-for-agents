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
  assert.equal(routeForScore(1), "adaptive_haiku");
  assert.equal(routeForScore(2), "adaptive_sonnet");
  assert.equal(routeForScore(4), "adaptive_sonnet");
  assert.equal(routeForScore(5), "adaptive_sonnet_high");
  assert.equal(routeForScore(6), "adaptive_sonnet_high");
  assert.equal(routeForScore(7), "adaptive_opus");
  assert.equal(routeForScore(9), "adaptive_opus");
  assert.equal(routeForScore(10), "adaptive_opus_max");
});

test("Turkish normalization preserves routing keywords", () => {
  assert.equal(normalizeRoutingText("İŞIĞI DÜZELT, ÇÖZÜMÜ ARAŞTIR"), "isigi duzelt, cozumu arastir");
  assert.equal(decideRoute({ prompt: "Bu kodu düzelt ve testini yaz." }).route, "adaptive_sonnet");
});

test("leading explicit overrides map to exact model and effort", () => {
  const cases = [
    ["/haiku hello", "adaptive_haiku", "claude-haiku-4-5-20251001", "low"],
    ["/sonnet implement it", "adaptive_sonnet", "claude-sonnet-5", "medium"],
    ["/sonnet-high investigate", "adaptive_sonnet_high", "claude-sonnet-5", "high"],
    ["/opus analyze", "adaptive_opus", "claude-opus-5", "high"],
    ["/opus-max analyze", "adaptive_opus_max", "claude-opus-5", "max"],
    ["/fable analyze", "adaptive_fable", "claude-fable-5", "max"],
  ];
  for (const [prompt, route, model, effort] of cases) {
    const decision = decideRoute({ prompt });
    assert.equal(decision.route, route);
    assert.equal(decision.model, model);
    assert.equal(decision.effort, effort);
  }
});

test("automatic mode scores instead of inheriting", () => {
  const previousState = createStateRecord("session", decideRoute({ prompt: "/opus-max hard task" }));
  assert.equal(decideRoute({ prompt: "/auto continue", previousState }).route, "adaptive_haiku");
});

test("dependent continuation inherits but status does not", () => {
  const previousState = createStateRecord("session", decideRoute({ prompt: "/opus-max hard task" }));
  assert.equal(decideRoute({ prompt: "devam et", previousState }).route, "adaptive_opus_max");
  assert.equal(decideRoute({ prompt: "Ne durumdayız?", previousState }).route, "adaptive_haiku");
});

test("non-direct routes require root-only MCP execution without wrapper fields", () => {
  const decision = decideRoute({ prompt: "Implement this API and test it." });
  const context = renderDecisionContext(decision);
  assert.equal("visibleSubagent" in decision, false);
  assert.equal("subagentPrefix" in decision, false);
  assert.match(context, /run_routed_task exactly once/);
  assert.match(context, /adaptive-router-for-claude MCP tool/);
  assert.match(context, /from the root task/);
  assert.match(context, /Never create a generic or visible subagent/);
  assert.doesNotMatch(context, /VISIBLE_SUBAGENT|SUBAGENT_PREFIX/);
});

test("Haiku is direct only when the active root is Haiku", () => {
  assert.equal(decideRoute({ prompt: "hello", activeModel: "claude-haiku-4-5-20251001" }).direct, true);
  assert.equal(decideRoute({ prompt: "hello", activeModel: "claude-sonnet-5" }).direct, false);
});

test("worker recursion guard emits no routing context or state", async () => {
  const data = await mkdtemp(join(tmpdir(), "adaptive-router-recursion-"));
  const oldData = process.env.CLAUDE_PLUGIN_DATA;
  const oldWorker = process.env.ADAPTIVE_MODEL_ROUTER_WORKER;
  process.env.CLAUDE_PLUGIN_DATA = data;
  process.env.ADAPTIVE_MODEL_ROUTER_WORKER = "1";
  try {
    const output = await runHook("UserPromptSubmit", JSON.stringify({ prompt: "secret", session_id: "recursion" }));
    assert.deepEqual(output, {});
    await assert.rejects(readFile(join(data, "routing-decisions.jsonl"), "utf8"), /ENOENT/);
  } finally {
    if (oldData === undefined) delete process.env.CLAUDE_PLUGIN_DATA;
    else process.env.CLAUDE_PLUGIN_DATA = oldData;
    if (oldWorker === undefined) delete process.env.ADAPTIVE_MODEL_ROUTER_WORKER;
    else process.env.ADAPTIVE_MODEL_ROUTER_WORKER = oldWorker;
    await rm(data, { recursive: true, force: true });
  }
});

test("persisted state and logs contain only approved metadata", async () => {
  const data = await mkdtemp(join(tmpdir(), "adaptive-router-privacy-"));
  const oldData = process.env.CLAUDE_PLUGIN_DATA;
  const oldWorker = process.env.ADAPTIVE_MODEL_ROUTER_WORKER;
  process.env.CLAUDE_PLUGIN_DATA = data;
  delete process.env.ADAPTIVE_MODEL_ROUTER_WORKER;
  const privatePrompt = "Implement the confidential example with unique phrase cobalt-orchid.";
  try {
    await runHook("UserPromptSubmit", JSON.stringify({ prompt: privatePrompt, session_id: "privacy-session", model: "claude-haiku-4-5-20251001" }));
    const state = JSON.parse(await readFile(join(data, "router-state", "privacy-session.json"), "utf8"));
    const log = await readFile(join(data, "routing-decisions.jsonl"), "utf8");
    assert.deepEqual(Object.keys(state).sort(), ["effort", "model", "reasons", "route", "score", "session_id", "updated_at"]);
    assert.equal(JSON.stringify(state).includes(privatePrompt), false);
    assert.equal(log.includes(privatePrompt), false);
    assert.equal(/hash|sha256/i.test(log), false);
  } finally {
    if (oldData === undefined) delete process.env.CLAUDE_PLUGIN_DATA;
    else process.env.CLAUDE_PLUGIN_DATA = oldData;
    if (oldWorker === undefined) delete process.env.ADAPTIVE_MODEL_ROUTER_WORKER;
    else process.env.ADAPTIVE_MODEL_ROUTER_WORKER = oldWorker;
    await rm(data, { recursive: true, force: true });
  }
});

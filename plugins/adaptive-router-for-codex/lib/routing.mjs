export const routeConfig = Object.freeze({
  adaptive_luna: Object.freeze({ model: "gpt-5.6-luna", effort: "low" }),
  adaptive_terra: Object.freeze({ model: "gpt-5.6-terra", effort: "medium" }),
  adaptive_terra_high: Object.freeze({ model: "gpt-5.6-terra", effort: "high" }),
  adaptive_sol: Object.freeze({ model: "gpt-5.6-sol", effort: "high" }),
  adaptive_sol_max: Object.freeze({ model: "gpt-5.6-sol", effort: "max" }),
  adaptive_sol_ultra: Object.freeze({ model: "gpt-5.6-sol", effort: "ultra" }),
});

const routeNames = new Set(Object.keys(routeConfig));

export function normalizeRoutingText(value = "") {
  return String(value)
    .toLocaleLowerCase("en-US")
    .normalize("NFD")
    .replace(/\p{Mark}/gu, "")
    .replace(/[ıİ]/g, "i")
    .normalize("NFC");
}

function addReason(reasons, value) {
  if (!reasons.includes(value)) reasons.push(value);
}

export function leadingControl(prompt = "") {
  const match = String(prompt).match(/^\s*[/@](sol-ultra|ultra|sol-max|terra-high|luna|terra|sol|auto)(?=\s|$)/i);
  if (!match) return null;
  const value = match[1].toLowerCase();
  if (value === "auto") return "auto";
  if (value === "ultra") return "adaptive_sol_ultra";
  return `adaptive_${value.replaceAll("-", "_")}`;
}

export function isStatusOnly(prompt = "") {
  const normalized = normalizeRoutingText(prompt);
  return /^\s*(status|progress|update|where are we|what remains|ne durum|durum ne|ne kaldi|bitti mi|hazir mi|devam ediyor mu)[\s?!.]*$/i.test(normalized);
}

export function isContinuation(prompt = "") {
  const normalized = normalizeRoutingText(prompt);
  return /^\s*(continue|proceed|go on|do it|do that|fix it|same|devam|devam et|yap|bunu yap|onu yap|duzelt|aynen|tamam devam)[\s?!.]*$/i.test(normalized);
}

export function routeForScore(score) {
  if (score <= 1) return "adaptive_luna";
  if (score <= 4) return "adaptive_terra";
  if (score <= 6) return "adaptive_terra_high";
  if (score <= 9) return "adaptive_sol";
  return "adaptive_sol_max";
}

export function decideRoute({ prompt = "", activeModel = "", previousState = null } = {}) {
  const input = String(prompt);
  const normalized = normalizeRoutingText(input);
  const reasons = [];
  let score = 0;
  const control = leadingControl(input);
  const autoRequested = control === "auto";
  const explicitRoute = control && control !== "auto" ? control : null;
  const statusOnly = isStatusOnly(input);

  if (explicitRoute) addReason(reasons, "explicit override");
  if (autoRequested) addReason(reasons, "automatic mode requested");

  if (input.length > 1200) {
    score += 2;
    addReason(reasons, "long prompt");
  } else if (input.length > 400) {
    score += 1;
    addReason(reasons, "moderate prompt length");
  }

  if (/\b(translate|cevir\w*|rewrite|yeniden yaz|spell|imla|formatla\w*|summarize briefly|kisaca ozet|hello|merhaba|tesekkur\w*)\b/i.test(normalized)) {
    score -= 2;
    addReason(reasons, "simple transformation");
  }
  if (statusOnly) {
    score -= 3;
    addReason(reasons, "status-only turn");
  }
  if (/\b(implement\w*|build\w*|create\w*|fix\w*|debug\w*|refactor\w*|test\w*|analy[sz]e\w*|code|coding|script|component|api|database|spreadsheet|document|presentation|uygula\w*|olustur\w*|duzelt\w*|hata ayikla\w*|analiz\w*|kod\w*|veritabani)\b/i.test(normalized)) {
    score += 2;
    addReason(reasons, "substantive work");
  }
  if (/\b(architecture|architectural|root cause|investigate\w*|multi-file|monorepo|migration|benchmark|performance|optimi[sz]e\w*|distributed|state machine|race condition|deep research|comprehensive|exhaustive|mimari|kok neden|arastir\w*|kapsamli|detayli|en kapsamli|performans|optimizasyon)\b/i.test(normalized)) {
    score += 3;
    addReason(reasons, "complex or broad reasoning");
  }
  if (/\b(security|vulnerability|exploit|authentication|authorization|encryption|production incident|data loss|irreversible|concurrency|deadlock|financial|medical|legal|compliance|guvenlik|acik|kimlik dogrulama|sifreleme|veri kaybi|geri dondurulemez|hukuki|tibbi|finansal)\b/i.test(normalized)) {
    score += 4;
    addReason(reasons, "high-risk domain");
  }
  if (/\b(maximum quality|think deeply|think hard|do not stop|production-ready|release-ready|olabilecek en kapsamli|derin dusun|maksimum kalite|eksiksiz|kusursuz)\b/i.test(normalized)) {
    score += 3;
    addReason(reasons, "maximum-quality request");
  }
  if ((input.match(/^\s*(?:[-*]|\d+[.)])\s+/gm) ?? []).length >= 3) {
    score += 1;
    addReason(reasons, "multiple deliverables");
  }

  let route;
  if (!explicitRoute && !autoRequested && !statusOnly && isContinuation(input) && routeNames.has(previousState?.route)) {
    route = previousState.route;
    score = Number.isInteger(previousState.score) ? previousState.score : score;
    reasons.length = 0;
    reasons.push("continued previous task");
  } else if (explicitRoute) {
    route = explicitRoute;
  } else {
    route = routeForScore(score);
  }

  const target = routeConfig[route];
  const direct = route === "adaptive_luna" && activeModel === target.model;
  return {
    route,
    model: target.model,
    effort: target.effort,
    score,
    reasons: reasons.length ? reasons : ["default lightweight route"],
    direct,
  };
}

export function createStateRecord(sessionId, decision, timestamp = new Date().toISOString()) {
  return {
    session_id: String(sessionId),
    route: decision.route,
    model: decision.model,
    effort: decision.effort,
    score: decision.score,
    reasons: [...decision.reasons],
    updated_at: timestamp,
  };
}

export function renderSessionContext() {
  return `ADAPTIVE_ROUTER_FOR_CODEX is enabled for every turn.
Use the latest routing decision injected by UserPromptSubmit. The root task is the only routing coordinator and invokes model-pinned MCP workers directly.
Available routes: adaptive_luna, adaptive_terra, adaptive_terra_high, adaptive_sol, adaptive_sol_max, adaptive_sol_ultra.
For a non-direct route, call the adaptive-router-for-codex MCP tool \`run_routed_task\` exactly once from the root task. Never create a generic or visible subagent for routing.
Explicit controls: /luna, /terra, /terra-high, /sol, /sol-max, /sol-ultra, and /auto.
Do not claim that the displayed root model hot-switched. The selected worker model performs the substantive task and returns its result to this conversation.`;
}

export function renderDecisionContext(decision) {
  const reasons = decision.reasons.join(", ");
  return `ADAPTIVE_ROUTER_FOR_CODEX
ROUTE=${decision.route}
AGENT=${decision.route}
TARGET_MODEL=${decision.model}
REASONING_EFFORT=${decision.effort}
SCORE=${decision.score}
DIRECT=${decision.direct}
REASONS=${reasons}

Required behavior for this turn:
- Treat an explicit override as authoritative. Otherwise accept this deterministic route without asking the user.
- If DIRECT=true, handle the request in the root thread.
- If DIRECT=false, call the adaptive-router-for-codex MCP tool run_routed_task exactly once from the root task with route ${decision.route}, a complete task brief, the current working directory, and the current safe sandbox level.
- Never create a generic or visible subagent for adaptive routing. A subagent must not invoke run_routed_task or coordinate another agent.
- Return the worker's user-ready result with minimal rewriting. Do not redo the worker's full task in the root thread.
- Do not expose the score or routing metadata unless the user asks.
- If the routed worker fails, continue with the current root model without asking the user and preserve verification and safety requirements.
- Routing does not authorize Git mutations, destructive actions, purchases, credential changes, or external account actions.`;
}

import fs from "node:fs";
import assert from "node:assert/strict";

const route = fs.readFileSync(
  new URL("../app/api/cron/run-automations/route.js", import.meta.url),
  "utf8"
);

assert.match(route, /buildStoreMapCandidateDecisionDiagnostics/);
assert.match(route, /summarizeStoreMapCandidateDecisions/);
assert.match(route, /campaign_candidate_decisions/);
assert.match(route, /campaign_candidate_decision_summary/);
assert.match(route, /ai_campaign_fit_fast_score/);
assert.match(route, /ai_campaign_fit_senior_score/);
assert.match(route, /campaign_fit_evaluations/);
assert.match(route, /Store Map campaign candidate decisions saved/);
assert.match(route, /rejection_reasons/);
assert.match(route, /product_engine_diagnostics/);

const applyEvaluationIndex = route.indexOf("function applyCampaignFitEvaluations");
const historyIndex = route.indexOf("campaign_fit_evaluations", applyEvaluationIndex);
assert.ok(applyEvaluationIndex > 0 && historyIndex > applyEvaluationIndex);

const earlyExitIndex = route.indexOf("async function finalizeCarouselFromStoreMapEarlyExit");
const decisionIndex = route.indexOf("buildStoreMapCandidateDecisionDiagnostics", earlyExitIndex);
const earlyReturnIndex = route.indexOf(
  "if (rankedStoreMapProducts.length < CAROUSEL_PRODUCT_SLIDE_TARGET)",
  earlyExitIndex
);
assert.ok(decisionIndex > earlyExitIndex);
assert.ok(
  earlyReturnIndex > decisionIndex,
  "Candidate decisions must be saved before Store Map falls through to legacy fallbacks"
);

console.log("Candidate decision diagnostics invariants passed.");

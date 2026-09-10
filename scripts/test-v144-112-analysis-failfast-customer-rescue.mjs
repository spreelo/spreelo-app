import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const worker = read("app/api/cron/run-brand-analysis-jobs/route.js");
const onboarding = read("app/onboarding/page.jsx");
const brand = read("app/brand/page.jsx");
const labels = read("lib/i18n/defaultLabels.js");
const staticEmail = read("lib/i18n/staticEmailText.js");
const lifecycle = read("lib/lifecycleEmails.js");
const globals = read("app/globals.css");

// Confirmed security blocks must go directly to manual rescue, not paid web research.
assert.match(worker, /isWebsiteSecurityBlocked/);
assert.match(worker, /handoffToManualRescue/);
assert.match(worker, /analysis_manual_rescue_pending/);
assert.match(worker, /website_security_manual_rescue/);
assert.doesNotMatch(worker, /submitBlockedWebsiteResearch/);
assert.doesNotMatch(worker, /retrieveBlockedWebsiteResearch/);
assert.doesNotMatch(worker, /switching to web research/);

// A direct fetch timeout gets one short retry, then the same manual-rescue handoff.
assert.match(worker, /MAX_DIRECT_TIMEOUT_ATTEMPTS = 2/);
assert.match(worker, /DIRECT_TIMEOUT_RETRY_SECONDS = 15/);
assert.match(worker, /website_timeout_retry/);
assert.match(worker, /website_timeout_manual_rescue/);
assert.match(worker, /convertLegacyWebResearchJobToRescue/);

// Onboarding and Brand Profile both treat rescue as a customer handoff, not a generic error.
for (const source of [onboarding, brand]) {
  assert.match(source, /analysis_manual_rescue_/);
  assert.match(source, /isManualAnalysisRescueCode/);
  assert.match(source, /analysisRescuePending/);
}
assert.match(onboarding, /onboarding\.rescue\.title/);
assert.match(onboarding, /onboarding\.rescue\.calendar/);
assert.match(onboarding, /window\.location\.href = "\/"/);
assert.match(brand, /brand\.rescuePending\.title/);
assert.match(brand, /brand-analysis-rescue-pending-state/);
assert.match(brand, /analysisResultStep === "rescue"/);
assert.match(brand, /analysis_rescue_required/);

// Customer-facing copy explicitly promises both analysis and the personal calendar plus email notification.
assert.match(labels, /brand\.rescuePending\.calendar/);
assert.match(labels, /onboarding\.rescue\.email/);
assert.match(labels, /Your brand analysis and campaign calendar are ready/);
assert.match(staticEmail, /getDefaultNamespaceLabels\("emails"\)/);
assert.doesNotMatch(staticEmail, /Din varumärkesanalys och kampanjkalender är klara/);
assert.match(lifecycle, /emails\.analysisCompleted\.intro", \{ brand: safeBrandName \}/);

// New modal/pending-state styling is loaded last.
assert.match(globals, /103-v144-112-analysis-rescue-handoff\.css/);

console.log("v144.112 analysis fail-fast + customer rescue handoff checks passed");

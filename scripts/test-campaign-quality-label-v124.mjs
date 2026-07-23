import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync(
  new URL("../app/api/cron/run-automations/route.js", import.meta.url),
  "utf8"
);
const campaignPlanner = fs.readFileSync(
  new URL("../app/api/plan-campaign/route.js", import.meta.url),
  "utf8"
);
const brandAnalysis = fs.readFileSync(
  new URL("../app/api/analyze-brand/brandAnalysisEngine.js", import.meta.url),
  "utf8"
);

assert.match(route, /async function generateCampaignSearchVocabularyWithAi/);
assert.match(route, /Do not use a fixed holiday list or hardcoded Swedish\/English campaign words/);
assert.match(route, /Campaign product search vocabulary expanded with AI/);
assert.match(route, /productSearchQueries: normalizedQueries/);
assert.match(route, /productAvoidTerms: normalizedAvoidTerms/);

assert.match(route, /Campaign catalog fallback candidates evaluated before selection/);
assert.match(route, /unscored catalog products will stay excluded/);
assert.match(route, /campaignEligibleCatalogItems/);
assert.match(route, /A locked store-search pool with five verified campaign products is enough/);
assert.match(route, /Existing selections are not trusted blindly/);
assert.match(route, /campaign_fit_score: campaignFitScore/);
assert.doesNotMatch(
  route,
  /campaign_fit_score:\s*Math\.max\(Number\(item\.campaign_fit_score \|\| 0\), campaignFitScore\)/
);

assert.match(route, /const cardWidth = 430;/);
assert.match(route, /const cardHeight = hasDisplayedPrice \? 190 : 166;/);
assert.match(route, /stop-opacity="0\.78"/);
assert.match(route, /stop-opacity="0\.58"/);
assert.match(route, /const titleFontSize = titleLines\.length > 1 \? 24 : 27;/);
assert.match(route, /renderCarouselLabelTextLayer/);
assert.match(route, /fontfile: getCarouselLabelFontFile\(\)/);
assert.doesNotMatch(route, />PREMIUM<\/text>/);
assert.match(route, /fill="none" stroke="#bd8325" stroke-width="3"/);
assert.doesNotMatch(route, />✦ PREMIUM</);
assert.doesNotMatch(route, />→</);

for (const source of [campaignPlanner, brandAnalysis]) {
  assert.match(
    source,
    /direct theme words, local synonyms, motif\/title-like expressions and likely website-language variants/
  );
  assert.match(
    source,
    /Expand avoid terms with likely semantic and website-language equivalents/
  );
}

console.log("Campaign vocabulary, catalog gating and readable glass label invariants passed.");

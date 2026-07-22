import fs from "node:fs";
import assert from "node:assert/strict";

const route = fs.readFileSync(new URL("../app/api/cron/run-automations/route.js", import.meta.url), "utf8");
const storeMap = fs.readFileSync(new URL("../lib/storeMapProductAgent.js", import.meta.url), "utf8");

assert.match(route, /WEBSITE_FETCH_MIN_INTERVAL_MS/);
assert.match(route, /acquire_website_fetch_slot/);
assert.match(route, /record_website_fetch_result/);
assert.match(route, /class WebsiteRateLimitError/);
assert.match(route, /const STRICT_PRODUCT_NO_REUSE/);
assert.doesNotMatch(route, /allowReuseWhenExhausted:\s*true/);
assert.doesNotMatch(route, /allowUsedAfterExhausted:\s*true/);
assert.match(route, /website_product_candidate_queue/);
assert.match(route, /trusted_category_product_card/);
assert.match(storeMap, /ord\|order\|sort\|dir\|direction\|limit\|page\|p/);

console.log("Polite retrieval and strict no-reuse invariants passed.");

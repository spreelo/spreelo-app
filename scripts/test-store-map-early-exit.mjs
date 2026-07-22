import fs from "node:fs";
import assert from "node:assert/strict";

const route = fs.readFileSync(
  new URL("../app/api/cron/run-automations/route.js", import.meta.url),
  "utf8"
);

assert.match(route, /CAROUSEL_PREPARATION_SOFT_DEADLINE_MS/);
assert.match(route, /finalizeCarouselFromStoreMapEarlyExit/);
assert.match(route, /Store Map early exit locked carousel products/);
assert.match(route, /legacy_fallbacks_skipped:\s*true/);
assert.match(route, /rankFocusedCategoryCandidatesForVerification/);
assert.match(route, /hasProductPreparationBudget\(70_000\)/);
assert.match(route, /controlled_incomplete_exit/);
assert.match(route, /normalizedProductHostname === normalizedBaseHostname/);

const earlyExitCall = route.indexOf(
  "const storeMapEarlyExitResult = await finalizeCarouselFromStoreMapEarlyExit"
);
const brandWideCatalogLoad = route.indexOf(
  "const brandWideCatalogItems = filterWebsiteCatalogItemsForRule"
);
assert.ok(earlyExitCall > 0, "Store Map early-exit call is missing");
assert.ok(
  brandWideCatalogLoad > earlyExitCall,
  "Store Map early exit must happen before brand-wide catalogs and legacy fallbacks"
);

const focusedPriority = route.indexOf(
  "rankFocusedCategoryCandidatesForVerification("
);
const focusedVerification = route.indexOf(
  "const verified = await verifyDiscoveredWebsiteProductCandidates({",
  focusedPriority
);
assert.ok(focusedPriority > 0 && focusedVerification > focusedPriority);

console.log("Store Map early exit and deadline guard invariants passed.");

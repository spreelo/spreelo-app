import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync("app/api/cron/run-automations/route.js", "utf8");
const start = route.indexOf("function hasHardSemanticVariantConflict");
const end = route.indexOf("function isCompatibleObservedBrandFamily", start);
assert.ok(start >= 0 && end > start, "variant-conflict helper not found");
const helperSource = route.slice(start, end);
const hasHardSemanticVariantConflict = new Function(`${helperSource}\nreturn hasHardSemanticVariantConflict;`)();

assert.equal(
  hasHardSemanticVariantConflict({
    variant_conflict: false,
    reason: "The image shows a snowboard matching the expected product type. The visible design style and branding elements are consistent with the expected brand Multi-managed Vendor without conflict. No conflicting brand or product variant is visible.",
  }),
  false,
  "explicit no-conflict wording must not be promoted to a hard variant conflict"
);
assert.equal(
  hasHardSemanticVariantConflict({ variant_conflict: true, reason: "The colour is clearly different from the locked variant." }),
  true,
  "a concrete colour/variant mismatch must still fail closed"
);
assert.equal(
  hasHardSemanticVariantConflict({ variant_conflict: true, reason: "The image shows 591 ml whereas the locked product is 473 ml." }),
  true,
  "a concrete volume mismatch must still fail closed"
);
assert.equal(
  hasHardSemanticVariantConflict({ variant_conflict: false, reason: "No visible variant mismatch is present; the snowboard matches the locked product." }),
  false,
  "a direct no-mismatch statement must remain non-blocking"
);

assert.match(route, /reason is explanatory text only/);
console.log("v144.283 semantic variant negation regression passed.");

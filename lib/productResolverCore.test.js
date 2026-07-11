import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCampaignFingerprint,
  chooseQualityCutoffAndRank,
} from "./productResolverCore.js";

function candidate(id, relevanceTier, usageCount, campaignFitScore = 90) {
  return {
    id,
    stableKey: id,
    selection: {
      relevanceTier,
      usageCount,
      campaignFitScore,
      directMatches: relevanceTier === 0 ? 1 : 0,
      lastUsedAtTs: 0,
      selectionPriority: 0,
    },
  };
}

test("campaign fingerprint is stable across term order and rule ids", () => {
  const first = buildCampaignFingerprint({
    theme: ["halloween", "31 oktober"],
    match: ["clown", "halloween t-shirt"],
    avoid: ["jul"],
    intent: "fest",
    need: "halloweenfest",
    fallback: "halloween",
    ruleId: "one",
  });
  const second = buildCampaignFingerprint({
    theme: ["31 oktober", "halloween"],
    match: ["halloween t-shirt", "clown"],
    avoid: ["jul"],
    intent: "fest",
    need: "halloweenfest",
    fallback: "halloween",
    ruleId: "two",
  });
  assert.equal(first, second);
});

test("53 exact products rotate before any exact product is reused", () => {
  const products = Array.from({ length: 53 }, (_, index) => candidate(`exact-${index}`, 0, 0, 100));
  const seen = new Set();

  for (let run = 0; run < 11; run += 1) {
    const selected = chooseQualityCutoffAndRank(products, 5);
    for (const item of selected) {
      if (seen.size < 53) assert.equal(seen.has(item.id), false);
      seen.add(item.id);
      item.selection.usageCount += 1;
    }
  }

  assert.equal(seen.size, 53);
  const counts = products.map((item) => item.selection.usageCount);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
});

test("three exact products expand to fresh strong products instead of duplicates", () => {
  const products = [
    ...Array.from({ length: 3 }, (_, index) => candidate(`exact-${index}`, 0, 1, 100)),
    ...Array.from({ length: 8 }, (_, index) => candidate(`strong-${index}`, 1, 0, 80)),
  ];
  const selected = chooseQualityCutoffAndRank(products, 5);
  assert.equal(new Set(selected.map((item) => item.id)).size, 5);
  assert.ok(selected.every((item) => item.id.startsWith("strong-")));
});

test("generic discovery context cannot make a candidate exact", () => {
  const genericFromHalloweenSearch = candidate("generic-product", 3, 0, 0);
  genericFromHalloweenSearch.sourcePageUrl = "/search?q=halloween";
  const realProducts = Array.from({ length: 5 }, (_, index) => candidate(`halloween-${index}`, 0, 0, 100));
  const selected = chooseQualityCutoffAndRank([genericFromHalloweenSearch, ...realProducts], 5);
  assert.deepEqual(selected.map((item) => item.id).sort(), realProducts.map((item) => item.id).sort());
});

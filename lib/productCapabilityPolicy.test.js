import test from "node:test";
import assert from "node:assert/strict";
import { decideWebsiteProductCapability } from "./productCapabilityPolicy.js";

test("one strongly verified product enables a real store while discovery continues", () => {
  const decision = decideWebsiteProductCapability({
    verifiedCount: 1,
    completedProbeCount: 2,
    checkedUrlCount: 20,
    webSearchCompleted: true,
  });

  assert.equal(decision.available, true);
  assert.equal(decision.productCarouselAvailable, true);
  assert.equal(decision.status, "confirmed");
  assert.equal(decision.needsMoreDiscovery, true);
});

test("partial failed probing without product evidence stays inconclusive", () => {
  const decision = decideWebsiteProductCapability({
    verifiedCount: 0,
    completedProbeCount: 2,
    checkedUrlCount: 20,
    webSearchCompleted: true,
  });

  assert.equal(decision.available, false);
  assert.equal(decision.status, "inconclusive");
});

test("completed probing plus Web Search can reject a non-store", () => {
  const decision = decideWebsiteProductCapability({
    verifiedCount: 0,
    completedProbeCount: 12,
    checkedUrlCount: 12,
    webSearchCompleted: true,
  });

  assert.equal(decision.available, false);
  assert.equal(decision.status, "not_found");
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  PRODUCT_RESOLVER_VERSION,
  canTrustExhaustedProductDiscoveryState,
} from "./productDiscoveryPolicy.js";

const nowMs = Date.parse("2026-07-11T20:00:00.000Z");

test("legacy exhausted state never suppresses v10 discovery", () => {
  assert.equal(
    canTrustExhaustedProductDiscoveryState({
      discoveryState: {
        exhausted: true,
        last_attempt_at: "2026-07-11T19:00:00.000Z",
        metadata: { resolver_version: "v9" },
      },
      usableCandidateCount: 100,
      nowMs,
    }),
    false
  );
});



test("broken v10 exhausted state is ignored by stabilized resolver", () => {
  assert.equal(
    canTrustExhaustedProductDiscoveryState({
      discoveryState: {
        exhausted: true,
        last_attempt_at: "2026-07-11T19:00:00.000Z",
        metadata: { resolver_version: "v10" },
      },
      usableCandidateCount: 20,
      nowMs,
    }),
    false
  );
});

test("v10.1 exhausted state is invalidated by the evidence-preserving resolver", () => {
  assert.equal(
    canTrustExhaustedProductDiscoveryState({
      discoveryState: {
        exhausted: true,
        last_attempt_at: "2026-07-11T19:00:00.000Z",
        metadata: { resolver_version: "v10.1-stable" },
      },
      usableCandidateCount: 20,
      nowMs,
    }),
    false
  );
});

test("v10.5 exhausted state is invalidated after restoring stable delivery", () => {
  assert.equal(
    canTrustExhaustedProductDiscoveryState({
      discoveryState: {
        exhausted: true,
        last_attempt_at: "2026-07-11T19:00:00.000Z",
        metadata: { resolver_version: "v10.5-evidence-preserving" },
      },
      usableCandidateCount: 20,
      nowMs,
    }),
    false
  );
});

test("empty cache never trusts exhausted state", () => {
  assert.equal(
    canTrustExhaustedProductDiscoveryState({
      discoveryState: {
        exhausted: true,
        last_attempt_at: "2026-07-11T19:00:00.000Z",
        metadata: { resolver_version: PRODUCT_RESOLVER_VERSION },
      },
      usableCandidateCount: 0,
      nowMs,
    }),
    false
  );
});

test("current recent state is trusted only with a complete verified pool", () => {
  const discoveryState = {
    exhausted: true,
    last_attempt_at: "2026-07-11T19:00:00.000Z",
    metadata: { resolver_version: PRODUCT_RESOLVER_VERSION },
  };

  assert.equal(
    canTrustExhaustedProductDiscoveryState({
      discoveryState,
      usableCandidateCount: 4,
      nowMs,
    }),
    false
  );
  assert.equal(
    canTrustExhaustedProductDiscoveryState({
      discoveryState,
      usableCandidateCount: 5,
      nowMs,
    }),
    true
  );
});

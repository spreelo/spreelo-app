export const PRODUCT_RESOLVER_VERSION = "v10.5-evidence-preserving";
export const PRODUCT_DISCOVERY_EXHAUSTED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * An exhausted marker is only a cost-saving hint, never proof that a store has
 * no products. Trust it only when this resolver version already has a complete
 * verified carousel pool. Legacy/empty states must trigger live discovery.
 */
export function canTrustExhaustedProductDiscoveryState({
  discoveryState,
  usableCandidateCount,
  minimumCandidateCount = 5,
  nowMs = Date.now(),
  ttlMs = PRODUCT_DISCOVERY_EXHAUSTED_TTL_MS,
}) {
  const lastAttemptMs = Date.parse(discoveryState?.last_attempt_at || "");
  const ageMs = nowMs - lastAttemptMs;

  return Boolean(
    discoveryState?.exhausted &&
    discoveryState?.metadata?.resolver_version === PRODUCT_RESOLVER_VERSION &&
    Number(usableCandidateCount || 0) >= Number(minimumCandidateCount || 5) &&
    Number.isFinite(lastAttemptMs) &&
    ageMs >= 0 &&
    ageMs < ttlMs
  );
}

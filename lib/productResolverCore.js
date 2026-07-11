import crypto from "crypto";

export function buildCampaignFingerprint(payload) {
  const normalizedPayload = {
    v: 1,
    theme: [...new Set((payload?.theme || []).filter(Boolean))].sort(),
    match: [...new Set((payload?.match || []).filter(Boolean))].sort(),
    avoid: [...new Set((payload?.avoid || []).filter(Boolean))].sort(),
    intent: String(payload?.intent || ""),
    need: String(payload?.need || ""),
    fallback: String(payload?.fallback || ""),
  };

  return `v1_${crypto
    .createHash("sha256")
    .update(JSON.stringify(normalizedPayload))
    .digest("hex")
    .slice(0, 32)}`;
}

export function chooseQualityCutoffAndRank(candidates, limit = 5) {
  const items = Array.isArray(candidates) ? [...candidates] : [];
  let acceptedTier = 3;

  for (let tier = 0; tier <= 3; tier += 1) {
    if (items.filter((item) => Number(item?.selection?.relevanceTier ?? 3) <= tier).length >= limit) {
      acceptedTier = tier;
      break;
    }
  }

  return items
    .filter((item) => Number(item?.selection?.relevanceTier ?? 3) <= acceptedTier)
    .sort((a, b) => {
      const aSort = a.selection || {};
      const bSort = b.selection || {};
      if (aSort.usageCount !== bSort.usageCount) return Number(aSort.usageCount || 0) - Number(bSort.usageCount || 0);
      if (aSort.relevanceTier !== bSort.relevanceTier) return Number(aSort.relevanceTier || 0) - Number(bSort.relevanceTier || 0);
      if (aSort.campaignFitScore !== bSort.campaignFitScore) return Number(bSort.campaignFitScore || 0) - Number(aSort.campaignFitScore || 0);
      if (aSort.directMatches !== bSort.directMatches) return Number(bSort.directMatches || 0) - Number(aSort.directMatches || 0);
      if (aSort.lastUsedAtTs !== bSort.lastUsedAtTs) return Number(aSort.lastUsedAtTs || 0) - Number(bSort.lastUsedAtTs || 0);
      if (aSort.selectionPriority !== bSort.selectionPriority) return Number(bSort.selectionPriority || 0) - Number(aSort.selectionPriority || 0);
      return String(a.stableKey || "").localeCompare(String(b.stableKey || ""));
    })
    .slice(0, limit);
}

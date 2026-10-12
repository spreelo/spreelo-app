// v144.336: Prevent explicit creative instructions from contradicting the
// verified-view and single-product locks before a paid Kling submission.
// This intentionally does not ban ordinary walking, wearing or straight-line
// stroller use: those are valid when the original view remains unchanged.
export function validateKlingCreativeDirection(direction) {
  const text = String(direction || "").replace(/\s+/g, " ").trim();
  const reasons = [];
  if (!text || !/[.!?]$/.test(text)) reasons.push("incomplete_creative_direction");
  const unsafe = [
    ["camera_orbit", /\b(?:orbit|circle|arc|swing|rotate|spin)\b.{0,80}\b(?:around|behind|to (?:show|reveal)|opposite|rear|backside|back side)\b/i],
    ["camera_orbit", /\b(?:camera|viewpoint|lens)\b.{0,48}\b(?:orbit|circle|rotate around|swing around|travel around|move around|pan around)\b/i],
    ["unverified_surface_reveal", /\b(?:reveal|expose|show|display|uncover)\b.{0,70}\b(?:the )?(?:hidden|opposite|unseen|underside|backside|back side|rear|reverse|other side|interior|back of (?:the|a))\b/i],
    ["product_flip", /\b(?:flip|turn over|rotate|spin)\b.{0,48}\b(?:the |a )?(?:phone|device|product|stroller|garment|t-shirt|shirt|shoe|bottle|watch|laptop|object|item)\b/i],
    ["product_flip", /\b(?:phone|device|product|stroller|garment|t-shirt|shirt|shoe|bottle|watch|laptop|object|item)\b.{0,35}\b(?:flips|turns over|rotates|spins around)\b/i],
    ["invented_second_product", /\b(?:add|introduce|bring in|duplicate|produce|create)\b.{0,35}\b(?:another|second|extra|additional|copy of)\b.{0,25}\b(?:product|phone|device|item)\b/i],
  ];
  for (const [reason, pattern] of unsafe) if (pattern.test(text) && !reasons.includes(reason)) reasons.push(reason);
  return { ok: reasons.length === 0, reasons };
}

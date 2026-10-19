// v144.336: Prevent explicit creative instructions from contradicting the
// verified-view and single-product locks before a paid Kling submission.
// This intentionally does not ban ordinary walking, wearing or straight-line
// stroller use: those are valid when the original view remains unchanged.
export function validateKlingCreativeDirection(direction) {
  const text = String(direction || "").replace(/\s+/g, " ").trim();
  const reasons = [];
  if (!text || !/[.!?]$/.test(text)) reasons.push("incomplete_creative_direction");
  // Match affirmative clauses only. A lock such as "Never show the back"
  // must not be interpreted as a request to show it. Evaluate clauses apart
  // so subjects/verbs on opposite sides of a sentence cannot form a match.
  const clauses = text.split(/(?<=[.!?;:])\s+|,\s*|\b(?:while|but|then|however)\b/i)
    .map(part => part.replace(/\b(?:do not|must not|should not|cannot|can't|never|without|avoid|no)\b.*$/i, "").trim())
    .filter(Boolean);
  for (const positive of clauses) {
  if (/\b(?:cut to|cut back|return to (?:a|the) (?:shot|view)|switch (?:the )?(?:shot|view|angle)|montage|whip pan)\b/i.test(positive)) reasons.push("multi_shot_or_view_change");
  if (/\b(?:camera|viewpoint|lens)\b.{0,55}\b(?:lateral|sideways|left to right|right to left|arc|orbit|circl|tilt|roll|swing|pan)\b/i.test(positive) || /\b(?:pan|panning)\b.{0,45}\b(?:over|across|around)\b/i.test(positive)) reasons.push("camera_view_change");
  if (/\b(?:box|packaging|product|object|item|device)\b.{0,35}\b(?:pivot|turn|rotate|spin|flip)(?:s|ed|ing)?\b/i.test(positive) || /\b(?:reveal|show|expose)(?:s|ed|ing)?\b.{0,35}\b(?:right side|left side|other side|sides)\b/i.test(positive)) reasons.push("unverified_surface_reveal");
  const unsafe = [
    ["camera_orbit", /\b(?:orbit|circle|arc|swing|rotate|spin)\b.{0,80}\b(?:around|behind|to (?:show|reveal)|opposite|rear|backside|back side)\b/i],
    ["camera_orbit", /\b(?:camera|viewpoint|lens)\b.{0,48}\b(?:orbit|circle|rotate around|swing around|travel around|move around|pan around)\b/i],
    ["unverified_surface_reveal", /\b(?:reveal|expose|show|display|uncover)\b.{0,70}\b(?:the )?(?:hidden|opposite|unseen|underside|backside|back side|rear|reverse|other side|interior|back of (?:the|a))\b/i],
    ["product_flip", /\b(?:flip|turn over|rotate|spin)\b.{0,48}\b(?:the |a )?(?:phone|device|product|stroller|garment|t-shirt|shirt|shoe|bottle|watch|laptop|object|item)\b/i],
    ["product_flip", /\b(?:phone|device|product|stroller|garment|t-shirt|shirt|shoe|bottle|watch|laptop|object|item)\b.{0,35}\b(?:flips|turns over|rotates|spins around)\b/i],
    ["invented_second_product", /\b(?:add|introduce|bring in|duplicate|produce|create)\b.{0,35}\b(?:another|second|extra|additional|copy of)\b.{0,25}\b(?:product|phone|device|item)\b/i],
  ];
  for (const [reason, pattern] of unsafe) if (pattern.test(positive) && !reasons.includes(reason)) reasons.push(reason);
  }
  return { ok: reasons.length === 0, reasons };
}

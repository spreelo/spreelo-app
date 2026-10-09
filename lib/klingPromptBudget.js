// v144.329: Keep Kling prompts within its API limit without slicing an instruction in half.
export const KLING_SAFE_PROMPT_LIMIT = 2450;

export function completeKlingSentences(value, budget, fallback = "Keep the verified product unchanged and use subtle movement in the surrounding scene.") {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= budget) return normalized;
  // Never send a cut-off instruction. Discard only complete trailing sentences/clauses.
  const sentences = normalized.match(/[^.!?;]+[.!?;]+(?=\s|$)/g) || [];
  let selected = "";
  for (const sentence of sentences) {
    const next = [selected, sentence.trim()].filter(Boolean).join(" ");
    if (next.length > budget) break;
    selected = next;
  }
  if (selected) return selected;
  if (fallback.length <= budget) return fallback;
  throw new Error("Kling creative prompt budget is too small for a complete safe instruction");
}

export function assembleKlingPrompt({ safety, direction, closing = "", maxCreative = 850, fallbackCreative } = {}) {
  const fixed = [String(safety || "").replace(/\s+/g, " ").trim(), String(closing || "").replace(/\s+/g, " ").trim(), "CREATIVE DIRECTION:"].filter(Boolean).join(" ");
  const remaining = KLING_SAFE_PROMPT_LIMIT - fixed.length - 1;
  // All fixed PRODUCT locks are retained. Only the creative direction is shortened.
  // Normal product locks reserve ample room for a complete scene instruction.
  if (remaining < 160) throw new Error(`Kling fixed safety prompt exceeds reserved creative budget (${fixed.length} chars)`);
  const creative = completeKlingSentences(direction, Math.min(maxCreative, remaining), fallbackCreative);
  if (!creative) throw new Error("Kling creative direction must not be empty");
  const prompt = `${fixed} ${creative}`;
  if (prompt.length > KLING_SAFE_PROMPT_LIMIT) throw new Error("Kling prompt exceeded safety budget");
  return prompt;
}

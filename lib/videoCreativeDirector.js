// v144.347. A shared, category-agnostic creative brief. This is injected into
// the EXISTING scene-aware AI planning calls, not a second paid planning agent.
// Creative freedom is delegated to the AI; verified product facts remain fixed.
export const CREATIVE_DIRECTOR_VERSION = 348;
export const CREATIVE_DIRECTOR_BRIEF = `Act as the creative director of a bespoke, premium social-media commercial.
Analyze THIS product, verified reference, context, scene composition and brand before selecting a visual direction. Do not choose from preset product-category templates. For each post make concrete choices about viewer hook, message hierarchy, color relationship, typography character, negative space and final CTA. Explain those choices through the returned design_direction.
Preflight legibility BEFORE image generation: choose the exact safe scene area, typography scale and treatment so the words remain readable over all supplied frames. Decide whether the selected background needs a restrained contrast aid (for example a subtle backing glow localized to the letters). Never default to a thick outline, tiny fixed-size label or generic black/white overlay. Keep clear of the verified product, visible print, faces, hands and platform UI.
The image generation model remains the original graphic designer. No templated fonts, no automatic repainting of its gradients or accent colors after creation. The final composited image, not a per-pixel contrast heuristic, determines whether design succeeds. Typography is always checked for exact wording and strong mobile readability.
Only verified product facts may enter the advertising claim. Preserve the exact visible product identity, original reference surfaces and brand logo. Never invent product features, text on a product, hidden surfaces, logos, discounts or prices. Choose striking cinematic expression within these factual limits.
Design both the active scene and the end card as one coherent creative concept. The end card should have strong centered CTA hierarchy, no stray marks, and continuation of the design language of the moving scene.`;

export function creativeCorrectionInstruction(error) {
  const review = error?.review;
  const issue = String(review?.issue || error?.code || 'visual_quality').slice(0,80);
  const reason = String(review?.reason || error?.message || 'Improve readability and visual coherence')
    .replace(/[\r\n]+/g, ' ').slice(0,280);
  return `Second and FINAL design correction. Reviewer reported ${issue}: ${reason}. Redesign the art direction as necessary while preserving ALL exact visible words, authentic logo separation, transparent lettering and product identity. Make the result visually legible, well aligned, premium and free of stray marks. Never add a flat generic replacement text layer.`;
}

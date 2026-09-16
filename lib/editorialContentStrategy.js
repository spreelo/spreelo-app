export const EDITORIAL_CONTENT_TYPE_IDS = Object.freeze([
  "problem_solution",
  "tips",
  "faq",
  "guide_choice",
  "service_focus",
  "engagement_humor",
]);

export const LEGACY_EDITORIAL_TYPE_ALIASES = Object.freeze({
  mistakes: "tips",
  myth_fact: "tips",
  seasonal: "tips",
  checklist: "guide_choice",
  mini_guide: "guide_choice",
  behind_scenes: "tips",
  case_example: "guide_choice",
  local: "tips",
  comparison: "guide_choice",
});

export const RETIRED_EDITORIAL_CONTENT_TYPE_IDS = new Set(
  Object.keys(LEGACY_EDITORIAL_TYPE_ALIASES)
);

const VERIFIED_SERVICE_SOURCE_TYPES = new Set([
  "service_catalog",
  "booking",
  "course_event",
]);

export function parseWebsiteSourceType(reason) {
  const match = String(reason || "").match(/\[source_type=([a-z_]+)\]/i);
  return String(match?.[1] || "").trim().toLowerCase();
}

export function hasVerifiedServiceEvidence(profile) {
  if (profile?.website_service_mode_available === true) return true;

  // Compatibility for brands analysed before v144.181. New analyses store
  // service verification independently so mixed product+service companies
  // are not misclassified.
  if (!profile?.website_product_mode_available) return false;
  const sourceType = parseWebsiteSourceType(profile?.website_product_mode_reason);
  return VERIFIED_SERVICE_SOURCE_TYPES.has(sourceType);
}

export function normalizeEditorialContentTypeId(contentTypeId) {
  const normalized = String(contentTypeId || "").trim().toLowerCase();
  return LEGACY_EDITORIAL_TYPE_ALIASES[normalized] || normalized;
}

export function isEditorialContentType(contentTypeId) {
  return EDITORIAL_CONTENT_TYPE_IDS.includes(
    normalizeEditorialContentTypeId(contentTypeId)
  );
}

export function buildEditorialQualityInstruction({
  contentTypeId,
  hasVerifiedWebsiteItem = false,
  hasVerifiedService = false,
} = {}) {
  const normalized = normalizeEditorialContentTypeId(contentTypeId);
  if (!EDITORIAL_CONTENT_TYPE_IDS.includes(normalized)) return "";

  const common = `Editorial quality gate (strict):
- Build the post around one clear idea that is genuinely useful, interesting or engaging for this brand's real audience.
- Reject generic filler that could be published by an unrelated business with only the company name changed.
- Never invent company-specific facts, prices, terms, product features, service inclusions, guarantees, availability, reviews or results.
- Prefer concrete, specific language over broad advice.
- Seasonal or timely context is optional. Use it only when it naturally makes this exact idea more relevant; otherwise ignore seasonality completely.
- Do not force a product, service, trend, holiday, humour angle or content structure when it weakens the idea.
- Keep the idea clearly different from repetitive recent-style social posts whenever the supplied strategy/history gives enough context to do so.`;

  const byType = {
    problem_solution: `Problem & solution rules:
- Start with a real, recognisable audience problem, friction, need or desired outcome before choosing the solution.
- Prefer a verified product or service from the business as the solution when it genuinely fits the problem.
- If a verified website item is supplied, use it only when its verified facts make it a credible solution. Do not invent a connection.
- If no verified business solution can be supported, create a useful non-forced solution instead of fabricating a product or service claim.`,
    tips: `Tips & knowledge rules:
- Choose the strongest useful angle for the topic rather than repeating one template.
- Suitable structures include a practical tip, common mistake, myth vs fact, did-you-know insight, a few things to consider, or a better way to do something.
- The structure is a creative angle, not a label that must be mentioned in the post.
- Prioritise value and credibility over selling.`,
    faq: `Question & answer rules:
- Choose a question a real potential customer could reasonably ask.
- Prefer questions and answers supported by verified website, brand or source-page information.
- If the exact answer is not supported, do not invent company-specific policy or details. Use only safe general knowledge and clearly avoid implying it is a company policy.
- The answer should reduce uncertainty and be directly useful.`,
    guide_choice: `Guide & decision-help rules:
- Help the audience make a better decision or do something correctly.
- Choose the structure that best fits the idea: buying/selection guide, checklist, step-by-step, "which option fits you?", things to consider before choosing/buying/booking, or another concise decision aid.
- Use verified products or services as examples only when they improve the guidance and are factually supported.
- Do not turn the guide into a generic sales list.`,
    service_focus: `Service in focus rules:
- This type may only be used when a real service has been verified for the brand.
- Focus on one verified service and a strong customer-relevant angle: the problem it solves, what the customer receives, who it suits, when it is useful, how the process works, a common misunderstanding, or what to know before booking/choosing.
- Do not write generic "we offer professional service" copy.
- Never invent what is included in the service.`,
    engagement_humor: `Engagement & humour rules:
- Optimise the idea for a natural reaction, comment, share or conversation without promising virality or using cheap engagement bait.
- Choose the best fitting approach for this brand and audience: relatable humour, light industry humour, A/B choice, pick one, opinion question, guess, true/false, unexpected verified fact, "what would you do?", or a relatable situation.
- Humour is optional. Use it only when it fits the brand tone and topic.
- The central idea should be understandable in about 1-2 seconds.
- If an overlay hook is useful, keep it short and self-contained (normally 3-8 words). Do not bake long text into an AI-generated scene.
- A verified product may be used when it naturally strengthens the concept, but never force a product into the joke or interaction.`,
  };

  const evidence = normalized === "problem_solution"
    ? `\nVerified business solution context: ${hasVerifiedWebsiteItem ? "a verified website item is available" : "no verified website item is currently supplied"}.`
    : normalized === "service_focus"
      ? `\nVerified service context: ${hasVerifiedService ? "verified service evidence is available" : "verified service evidence is not available; do not fabricate a service"}.`
      : "";

  return [common, byType[normalized] || "", evidence].filter(Boolean).join("\n\n");
}

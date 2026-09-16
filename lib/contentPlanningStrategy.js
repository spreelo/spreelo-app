export const STRATEGIC_PRODUCT_CONTENT_TYPES = Object.freeze([
  "website_item",
  "website_item_text_ad",
  "animated_website_item",
  "ai_product_video",
  "carousel_website_item",
]);

export const STRATEGIC_EDITORIAL_CONTENT_TYPES = Object.freeze([
  "problem_solution",
  "tips",
  "faq",
  "guide_choice",
  "service_focus",
  "engagement_humor",
]);

export const STRATEGIC_CONTENT_TYPES = Object.freeze([
  ...STRATEGIC_PRODUCT_CONTENT_TYPES,
  ...STRATEGIC_EDITORIAL_CONTENT_TYPES,
]);

// One shared strategy table for AI Content Studio and recurring week-to-week
// selection. Values are relative fit scores, not promises about performance.
export const CONTENT_GOAL_WEIGHTS = Object.freeze({
  sell_more: Object.freeze({
    website_item: 96,
    website_item_text_ad: 100,
    animated_website_item: 90,
    ai_product_video: 86,
    carousel_website_item: 94,
    problem_solution: 92,
    faq: 78,
    guide_choice: 76,
    service_focus: 92,
    tips: 58,
    engagement_humor: 48,
  }),
  get_followers: Object.freeze({
    engagement_humor: 100,
    tips: 98,
    guide_choice: 94,
    problem_solution: 84,
    carousel_website_item: 74,
    animated_website_item: 72,
    ai_product_video: 66,
    faq: 70,
    website_item: 46,
    website_item_text_ad: 38,
    service_focus: 55,
  }),
  build_trust: Object.freeze({
    faq: 100,
    tips: 97,
    guide_choice: 96,
    problem_solution: 90,
    service_focus: 92,
    engagement_humor: 68,
    website_item: 58,
    website_item_text_ad: 42,
    animated_website_item: 45,
    ai_product_video: 40,
    carousel_website_item: 56,
  }),
  educate_customers: Object.freeze({
    tips: 100,
    guide_choice: 98,
    faq: 92,
    problem_solution: 88,
    service_focus: 80,
    carousel_website_item: 72,
    engagement_humor: 62,
    website_item: 60,
    animated_website_item: 52,
    ai_product_video: 45,
    website_item_text_ad: 38,
  }),
  stay_visible: Object.freeze({
    engagement_humor: 94,
    tips: 92,
    guide_choice: 86,
    faq: 84,
    problem_solution: 82,
    carousel_website_item: 78,
    service_focus: 76,
    website_item: 72,
    animated_website_item: 68,
    website_item_text_ad: 64,
    ai_product_video: 58,
  }),
});

export const CONTENT_TYPE_TIMING = Object.freeze({
  website_item: Object.freeze({
    dayBonus: Object.freeze({ Thursday: 10, Friday: 12, Saturday: 9, Sunday: 4 }),
    preferredTimes: Object.freeze(["11:30", "12:15", "16:30", "18:30"]),
  }),
  website_item_text_ad: Object.freeze({
    dayBonus: Object.freeze({ Thursday: 10, Friday: 13, Saturday: 9, Sunday: 4 }),
    preferredTimes: Object.freeze(["12:15", "16:30", "18:30", "11:30"]),
  }),
  animated_website_item: Object.freeze({
    dayBonus: Object.freeze({ Wednesday: 6, Thursday: 9, Friday: 11, Saturday: 10, Sunday: 6 }),
    preferredTimes: Object.freeze(["16:30", "18:30", "19:00", "12:15"]),
  }),
  ai_product_video: Object.freeze({
    dayBonus: Object.freeze({ Wednesday: 7, Thursday: 10, Friday: 12, Saturday: 11, Sunday: 7 }),
    preferredTimes: Object.freeze(["16:30", "18:30", "19:00", "12:15"]),
  }),
  carousel_website_item: Object.freeze({
    dayBonus: Object.freeze({ Wednesday: 8, Thursday: 10, Friday: 9, Saturday: 7, Sunday: 5 }),
    preferredTimes: Object.freeze(["12:15", "16:30", "18:30", "19:00"]),
  }),
  problem_solution: Object.freeze({
    dayBonus: Object.freeze({ Monday: 7, Tuesday: 8, Wednesday: 7, Thursday: 5, Sunday: 4 }),
    preferredTimes: Object.freeze(["08:30", "12:15", "16:30", "18:30"]),
  }),
  tips: Object.freeze({
    dayBonus: Object.freeze({ Tuesday: 8, Wednesday: 9, Thursday: 6, Sunday: 7, Saturday: 3 }),
    preferredTimes: Object.freeze(["10:30", "12:15", "18:30", "19:30"]),
  }),
  faq: Object.freeze({
    dayBonus: Object.freeze({ Tuesday: 6, Wednesday: 7, Thursday: 8, Sunday: 5 }),
    preferredTimes: Object.freeze(["12:15", "16:30", "18:30", "10:30"]),
  }),
  guide_choice: Object.freeze({
    dayBonus: Object.freeze({ Tuesday: 8, Wednesday: 9, Sunday: 8, Monday: 4, Thursday: 4 }),
    preferredTimes: Object.freeze(["12:15", "18:30", "19:30", "10:30"]),
  }),
  service_focus: Object.freeze({
    dayBonus: Object.freeze({ Tuesday: 7, Wednesday: 7, Thursday: 8, Friday: 5 }),
    preferredTimes: Object.freeze(["10:30", "12:15", "16:30", "18:30"]),
  }),
  engagement_humor: Object.freeze({
    dayBonus: Object.freeze({ Wednesday: 9, Thursday: 8, Friday: 8, Saturday: 8, Sunday: 7 }),
    preferredTimes: Object.freeze(["12:15", "16:30", "18:30", "19:30"]),
  }),
  manual_prompt: Object.freeze({
    dayBonus: Object.freeze({ Tuesday: 6, Wednesday: 6, Thursday: 6, Friday: 5 }),
    preferredTimes: Object.freeze(["10:30", "12:15", "16:30"]),
  }),
});

const LEGACY_TIMING_ALIASES = Object.freeze({
  kling_ai_video: "ai_product_video",
  mistakes: "tips",
  myth_fact: "tips",
  seasonal: "tips",
  behind_scenes: "tips",
  local: "tips",
  checklist: "guide_choice",
  mini_guide: "guide_choice",
  comparison: "guide_choice",
  case_example: "guide_choice",
});

export function getContentGoalWeight(goalId, contentTypeId, fallback = 40) {
  const normalizedGoal = String(goalId || "").trim();
  const normalizedType = String(contentTypeId || "").trim();
  return Number(CONTENT_GOAL_WEIGHTS[normalizedGoal]?.[normalizedType] ?? fallback);
}

export function getContentTypeTiming(contentTypeId) {
  const normalized = String(contentTypeId || "").trim();
  const canonical = LEGACY_TIMING_ALIASES[normalized] || normalized;
  return CONTENT_TYPE_TIMING[canonical] || CONTENT_TYPE_TIMING.manual_prompt;
}

export function getContentTypePreferredTimes(contentTypeId) {
  return [...getContentTypeTiming(contentTypeId).preferredTimes];
}

export function isStrategicProductContentType(contentTypeId) {
  return STRATEGIC_PRODUCT_CONTENT_TYPES.includes(String(contentTypeId || "").trim());
}

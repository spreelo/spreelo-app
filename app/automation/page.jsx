"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "../../components/AppLayout";
import { supabase } from "../../lib/supabaseClient";
import { useUiText } from "../../lib/i18n/useUiText";

const DEFAULT_TIME_ZONE = "Europe/Stockholm";
const AUTO_PLAN_IMAGE_COUNT = 2;
const DEFAULT_AUTO_PLAN_POST_COUNT = 5;
const CAMPAIGN_HANDOFF_STORAGE_KEY = "spreelo_calendar_campaign_handoff";
const autoPlanPostCountOptions = [3, 5, 7];

const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const dayOrder = weekdays;

const fallbackRecommendedTimesByWeekday = {
  Monday: "10:30",
  Tuesday: "10:30",
  Wednesday: "11:30",
  Thursday: "13:30",
  Friday: "11:30",
  Saturday: "10:30",
  Sunday: "18:30",
};

const smartPostingSlotsByWeekday = {
  Monday: ["08:30", "10:30", "13:30", "18:30"],
  Tuesday: ["09:30", "10:30", "12:15", "18:30"],
  Wednesday: ["09:30", "11:30", "13:30", "19:00"],
  Thursday: ["10:30", "12:15", "16:30", "18:30"],
  Friday: ["09:30", "11:30", "16:30", "18:30"],
  Saturday: ["10:30", "14:30", "16:30", "19:00"],
  Sunday: ["10:30", "16:30", "18:30", "19:30"],
};

const smartPostingDayGoalBonus = {
  sell_more: { Thursday: 9, Friday: 12, Saturday: 10, Sunday: 4 },
  get_followers: { Tuesday: 7, Wednesday: 8, Thursday: 6, Sunday: 7, Saturday: 4 },
  build_trust: { Tuesday: 8, Wednesday: 8, Thursday: 6, Sunday: 5, Monday: 4 },
  educate_customers: { Tuesday: 8, Wednesday: 9, Sunday: 7, Monday: 4, Thursday: 4 },
  stay_visible: { Monday: 6, Tuesday: 6, Wednesday: 6, Thursday: 6, Friday: 6, Sunday: 5 },
};

const smartPostingTypePreferences = {
  website_item: {
    dayBonus: { Thursday: 10, Friday: 12, Saturday: 9, Sunday: 4 },
    preferredTimes: ["11:30", "12:15", "16:30", "18:30"],
  },
  carousel_website_item: {
    dayBonus: { Wednesday: 8, Thursday: 10, Friday: 9, Saturday: 7, Sunday: 5 },
    preferredTimes: ["12:15", "16:30", "18:30", "19:00"],
  },
  problem_solution: {
    dayBonus: { Monday: 7, Tuesday: 8, Wednesday: 7, Thursday: 5, Sunday: 4 },
    preferredTimes: ["08:30", "12:15", "16:30", "18:30"],
  },
  tips: {
    dayBonus: { Tuesday: 8, Wednesday: 9, Thursday: 6, Sunday: 7, Saturday: 3 },
    preferredTimes: ["10:30", "12:15", "18:30", "19:30"],
  },
  mistakes: {
    dayBonus: { Tuesday: 7, Wednesday: 8, Thursday: 5, Sunday: 5 },
    preferredTimes: ["10:30", "12:15", "18:30", "19:30"],
  },
  faq: {
    dayBonus: { Tuesday: 6, Wednesday: 7, Thursday: 8, Sunday: 5 },
    preferredTimes: ["12:15", "16:30", "18:30", "10:30"],
  },
  behind_scenes: {
    dayBonus: { Wednesday: 6, Thursday: 7, Friday: 8, Saturday: 5 },
    preferredTimes: ["13:30", "16:30", "18:30"],
  },
  checklist: {
    dayBonus: { Monday: 7, Tuesday: 7, Wednesday: 8, Sunday: 8, Thursday: 4 },
    preferredTimes: ["08:30", "12:15", "18:30", "19:30"],
  },
  service_focus: {
    dayBonus: { Tuesday: 7, Wednesday: 7, Thursday: 8, Friday: 5 },
    preferredTimes: ["10:30", "12:15", "16:30"],
  },
  case_example: {
    dayBonus: { Tuesday: 7, Wednesday: 8, Thursday: 8, Sunday: 4 },
    preferredTimes: ["11:30", "13:30", "18:30"],
  },
  myth_fact: {
    dayBonus: { Tuesday: 8, Wednesday: 8, Thursday: 6, Sunday: 5 },
    preferredTimes: ["10:30", "11:30", "18:30"],
  },
  local: {
    dayBonus: { Monday: 6, Thursday: 7, Friday: 8, Saturday: 6 },
    preferredTimes: ["08:30", "10:30", "11:30", "16:30"],
  },
  seasonal: {
    dayBonus: { Thursday: 7, Friday: 8, Saturday: 7, Sunday: 6 },
    preferredTimes: ["10:30", "12:15", "16:30", "18:30"],
  },
  comparison: {
    dayBonus: { Tuesday: 7, Wednesday: 8, Thursday: 7, Sunday: 5 },
    preferredTimes: ["10:30", "11:30", "18:30"],
  },
  mini_guide: {
    dayBonus: { Tuesday: 8, Wednesday: 9, Sunday: 8, Monday: 4, Thursday: 4 },
    preferredTimes: ["12:15", "18:30", "19:30", "10:30"],
  },
  manual_prompt: {
    dayBonus: { Tuesday: 6, Wednesday: 6, Thursday: 6, Friday: 5 },
    preferredTimes: ["10:30", "12:15", "16:30"],
  },
};

const recommendedWeeklySchedule = weekdays.map((weekday) => ({
  weekday,
  publishTime: fallbackRecommendedTimesByWeekday[weekday],
}));

const recommendedTimesByWeekday = fallbackRecommendedTimesByWeekday;

function createTimeOptions() {
  const options = [];

  for (let hour = 0; hour < 24; hour += 1) {
    for (const minute of [0, 15, 30, 45]) {
      const hourLabel = String(hour).padStart(2, "0");
      const minuteLabel = String(minute).padStart(2, "0");

      options.push(`${hourLabel}:${minuteLabel}`);
    }
  }

  return options;
}

const timeOptions = createTimeOptions();

const commonTimeZones = [
  "Europe/Stockholm",
  "Europe/Copenhagen",
  "Europe/Oslo",
  "Europe/Helsinki",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Brussels",
  "Europe/Warsaw",
  "Europe/Vienna",
  "Europe/Zurich",
  "Europe/Prague",
  "Europe/Athens",
  "Europe/Istanbul",
  "Europe/Moscow",
  "America/New_York",
  "America/Toronto",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Vancouver",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "America/Bogota",
  "America/Argentina/Buenos_Aires",
  "Asia/Bangkok",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Kuala_Lumpur",
  "Asia/Jakarta",
  "Asia/Manila",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Kolkata",
  "Asia/Riyadh",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Australia/Sydney",
  "Pacific/Auckland",
];

const contentTypes = [
  {
    id: "website_item",
    label: "Sell something from my website",
    shortLabel: "Website item",
    description:
      "Pick a product, service, listing or offer from your website and turn it into a post.",
    prompt:
      "Use the website URL from the brand profile. Identify one concrete product, service, listing, offer or other sellable item from the website. Create a social media post that promotes that specific item in a helpful, trustworthy and sales-focused way. Use only information that clearly appears on the website. Do not invent prices, discounts, guarantees, opening hours, features or availability.",
    imagePrompt:
      "Use a relevant image connected to the selected website item if one can be found. Avoid logos, banners, hero images, decorative icons and unrelated images. If no clearly relevant product, service, listing or offer image can be found, create a professional AI image based on the selected item instead.",
    usesWebsiteContent: true,
  },
  {
    id: "carousel_website_item",
    label: "Website carousel",
    shortLabel: "Carousel",
    description:
      "Turn several relevant website products into a swipeable product collection, guide or campaign draft.",
    prompt:
      "Use the website URL from the brand profile. Identify several concrete products, services, listings, offers or other sellable items from the website and create a swipeable carousel draft around them. The carousel should feel like a curated collection, guide, comparison or campaign post with one clear shared theme. Use only information that clearly appears on the website. Do not invent prices, discounts, guarantees, opening hours, features or availability.",
    imagePrompt:
      "Use relevant images connected to the selected website items if they can be found. Avoid logos, banners, hero images, decorative icons and unrelated images. If enough verified item images cannot be found, stop instead of inventing products.",
    usesWebsiteContent: true,
    contentFormat: "carousel",
  },
    {
    id: "problem_solution",
    label: "Problem → Solution",
    shortLabel: "Problem solved",
    description: "Highlight a customer problem and show how your business solves it.",
    prompt:
      "Create a social media post that starts from a real customer problem, frustration, need or question related to this business. Then explain how the business, service or offer helps solve that problem. Make it useful, trustworthy and specific. Do not exaggerate, scare the audience or invent guarantees.",
    imagePrompt:
      "Create a professional image that visualizes a customer problem being solved in a natural and trustworthy way. Make it relevant to the business, polished and believable. Do not include readable text.",
    usesWebsiteContent: false,
  },
  {
    id: "tips",
    label: "Tips & advice",
    shortLabel: "Tips",
    description: "Teach the audience something useful.",
    prompt:
      "Create a useful social media post that teaches the audience one practical tip related to this business. Make it specific, helpful and easy to understand. Avoid sounding like an advertisement.",
    imagePrompt:
      "Create a professional image that visually supports a helpful tip. Make it relevant to the business, clear, polished and not generic.",
    usesWebsiteContent: false,
  },
  {
    id: "mistakes",
    label: "Common mistakes",
    shortLabel: "Mistakes",
    description: "Show expertise and help customers avoid problems.",
    prompt:
      "Create a social media post about common mistakes customers often make related to this business, product or service. Explain them in a helpful and non-judgmental way, and position the business as knowledgeable and trustworthy.",
    imagePrompt:
      "Create a professional image that suggests common mistakes or things to avoid in a tasteful, helpful and non-negative way.",
    usesWebsiteContent: false,
  },
  {
    id: "faq",
    label: "FAQ / Questions",
    shortLabel: "FAQ",
    description: "Answer a common customer question.",
    prompt:
      "Create a social media post that answers a common customer question related to this business. Make the answer clear, trustworthy and useful. The post should reduce uncertainty and make it easier for the customer to take the next step.",
    imagePrompt:
      "Create a professional image that supports a question-and-answer or guidance theme, without adding readable text.",
    usesWebsiteContent: false,
  },
  {
    id: "behind_scenes",
    label: "Behind the scenes",
    shortLabel: "Behind scenes",
    description: "Build trust by showing the process.",
    prompt:
      "Create a behind-the-scenes social media post for this business. Show what happens in the process, preparation, workday or service delivery. Make it feel authentic, trustworthy and interesting.",
    imagePrompt:
      "Create an authentic behind-the-scenes style image connected to the business or service. Make it natural, professional and trustworthy.",
    usesWebsiteContent: false,
  },
  {
    id: "checklist",
    label: "Checklist",
    shortLabel: "Checklist",
    description: "Create a save-worthy post.",
    prompt:
      "Create a practical checklist-style social media post related to this business. Make it easy to save, useful and specific. Keep the structure clear and helpful.",
    imagePrompt:
      "Create a professional image that visually supports a checklist or preparation theme, without adding readable text.",
    usesWebsiteContent: false,
  },
  {
    id: "service_focus",
    label: "Service in focus",
    shortLabel: "Service",
    description: "Explain one service without hard selling.",
    prompt:
      "Create a social media post that explains one service or offer from this business in a clear and helpful way. Focus on the value for the customer, not hard selling.",
    imagePrompt:
      "Create a professional image that visualizes the service or customer benefit in a believable and polished way.",
    usesWebsiteContent: false,
  },
  {
    id: "case_example",
    label: "Customer case / example",
    shortLabel: "Case",
    description: "Use examples to build trust.",
    prompt:
      "Create a social media post based on a realistic customer case or example for this business. Do not invent sensitive personal details. Make it feel credible, useful and trust-building.",
    imagePrompt:
      "Create a professional image that supports a customer example or real-life scenario, without showing private or sensitive details.",
    usesWebsiteContent: false,
  },
  {
    id: "myth_fact",
    label: "Myth vs fact",
    shortLabel: "Myth vs fact",
    description: "Correct misunderstandings.",
    prompt:
      "Create a myth-vs-fact style social media post related to this business or industry. Correct a common misunderstanding and explain the truth in a simple, trustworthy way.",
    imagePrompt:
      "Create a professional image that suggests clarity, understanding or comparison, without adding readable text.",
    usesWebsiteContent: false,
  },
  {
    id: "local",
    label: "Local connection",
    shortLabel: "Local",
    description: "Make the post feel locally relevant.",
    prompt:
      "Create a social media post with a local angle for this business. Make it feel relevant to the local community, season, area or everyday customer situation. Keep it natural and not forced.",
    imagePrompt:
      "Create a professional image with a local or community feeling that fits the business, without using specific landmarks unless clearly provided.",
    usesWebsiteContent: false,
  },
  {
    id: "seasonal",
    label: "Seasonal post",
    shortLabel: "Seasonal",
    description: "Connect content to current timing.",
    prompt:
      "Create a seasonal or timely social media post for this business. Connect the message to the current season, common customer needs or relevant timing in a natural way.",
    imagePrompt:
      "Create a professional seasonal image that fits the business and timing, avoiding clichés and readable text.",
    usesWebsiteContent: false,
  },
  {
    id: "comparison",
    label: "Comparison",
    shortLabel: "Comparison",
    description: "Explain differences clearly.",
    prompt:
      "Create a social media post that compares two options, approaches or choices related to this business. Help the customer understand the difference and make a better decision.",
    imagePrompt:
      "Create a professional image that suggests comparison or decision-making in a clean and tasteful way, without split-screen text.",
    usesWebsiteContent: false,
  },
   {
    id: "mini_guide",
    label: "Mini-guide",
    shortLabel: "Mini-guide",
    description: "Give deeper value in one post.",
    prompt:
      "Create a mini-guide social media post related to this business. Teach the audience something useful in a structured way with clear steps or sections.",
    imagePrompt:
      "Create a professional image that supports a guide or learning theme, clean and easy to understand without readable text.",
    usesWebsiteContent: false,
  },
  {
    id: "manual_prompt",
    label: "Manual prompt",
    shortLabel: "Manual",
    description: "Write your own instructions for this post.",
    prompt: "",
    imagePrompt: "",
    usesWebsiteContent: false,
    isManualPrompt: true,
  },
];


const slotTypeIcons = {
  website_item: "🛍️",
  carousel_website_item: "▦",
  problem_solution: "🧩",
  tips: "💡",
  mistakes: "⚠️",
  faq: "❓",
  behind_scenes: "🎬",
  checklist: "✅",
  service_focus: "🛠️",
  case_example: "🏆",
  myth_fact: "✨",
  local: "📍",
  seasonal: "📅",
  comparison: "⚖️",
  mini_guide: "📘",
  manual_prompt: "✍️",
  custom: "✍️",
};

function getSlotTypeIcon(slot) {
  if (!slot) return slotTypeIcons.custom;
  return slotTypeIcons[slot.contentTypeId] || slotTypeIcons.custom;
}

const recommendedContentTypeIds = [
  "website_item",
  "carousel_website_item",
  "tips",
  "mistakes",
  "behind_scenes",
  "faq",
];

const autoPlanGoals = [
  {
    id: "sell_more",
    icon: "💰",
    label: "Sell more",
    description:
      "More product, service and offer focused posts that help people take action.",
  },
  {
    id: "get_followers",
    icon: "📈",
    label: "Reach more customers",
    description:
      "Shareable, useful and visible posts that help more potential customers discover the business.",
  },
  {
    id: "build_trust",
    icon: "🤝",
    label: "Build trust",
    description:
      "Posts that show expertise, process, examples and answers to common questions.",
  },
  {
    id: "educate_customers",
    icon: "🎓",
    label: "Give tips & advice",
    description:
      "Helpful posts that guide customers, answer questions and make it easier to choose.",
  },
  {
    id: "stay_visible",
    icon: "📅",
    label: "Keep the account active",
    description:
      "A balanced weekly mix that keeps the business visible, useful and consistent.",
  },
];

const autoPlanStrategies = {
  sell_more: {
    label: "Sell more",
    contentTypeIds: [
      "problem_solution",
      "carousel_website_item",
      "website_item",
      "comparison",
      "website_item",
      "carousel_website_item",
      "website_item",
    ],
    imageCount: 5,
  },
  get_followers: {
    label: "Reach more customers",
    contentTypeIds: [
      "seasonal",
      "tips",
      "carousel_website_item",
      "local",
      "problem_solution",
      "behind_scenes",
      "website_item",
    ],
    imageCount: 4,
  },
  build_trust: {
    label: "Build trust",
    contentTypeIds: [
      "tips",
      "problem_solution",
      "carousel_website_item",
      "faq",
      "case_example",
      "service_focus",
      "website_item",
    ],
    imageCount: 4,
  },
  educate_customers: {
    label: "Give tips & advice",
    contentTypeIds: [
      "tips",
      "mistakes",
      "carousel_website_item",
      "comparison",
      "website_item",
      "checklist",
      "myth_fact",
    ],
    imageCount: 4,
  },
  stay_visible: {
    label: "Keep the account active",
    contentTypeIds: [
      "seasonal",
      "tips",
      "website_item",
      "carousel_website_item",
      "faq",
      "case_example",
      "local",
    ],
    imageCount: 4,
  },
};

const goalMarketingSequences = {
  sell_more: [
    { contentTypeId: "problem_solution", label: "Need hook", description: "Create buying interest by showing a clear need, problem or desirable outcome before selling.", marketingAngle: "awareness", customerStage: "cold", ctaStrength: "soft" },
    { contentTypeId: "carousel_website_item", label: "Product guide", description: "Show a curated set of relevant products with one shared buying theme.", marketingAngle: "product_discovery", customerStage: "warm", ctaStrength: "medium" },
    { contentTypeId: "website_item", label: "Strong product push", description: "Recommend one concrete product and explain why it is a good choice now.", marketingAngle: "product_push", customerStage: "warm", ctaStrength: "medium" },
    { contentTypeId: "comparison", label: "Help them choose", description: "Reduce doubt with a buying guide, comparison or decision-help angle.", marketingAngle: "trust", customerStage: "warm", ctaStrength: "medium" },
    { contentTypeId: "website_item", label: "Clear sales CTA", description: "End the sequence with a concrete product-led reason to visit the website or buy.", marketingAngle: "conversion", customerStage: "ready_to_buy", ctaStrength: "strong" },
    { contentTypeId: "carousel_website_item", label: "More top picks", description: "Give ready-to-buy customers more relevant options from the same commercial theme.", marketingAngle: "product_discovery", customerStage: "ready_to_buy", ctaStrength: "strong" },
    { contentTypeId: "website_item", label: "Final recommendation", description: "Highlight one final product or offer with a direct next step.", marketingAngle: "urgency", customerStage: "ready_to_buy", ctaStrength: "strong" },
  ],
  get_followers: [
    { contentTypeId: "seasonal", label: "Broad hook", description: "Start with a relatable visual idea that can reach people beyond existing customers.", marketingAngle: "awareness", customerStage: "cold", ctaStrength: "soft" },
    { contentTypeId: "tips", label: "Useful quick tip", description: "Give easy value that people can like, save or share.", marketingAngle: "engagement", customerStage: "cold", ctaStrength: "soft" },
    { contentTypeId: "carousel_website_item", label: "Inspiration carousel", description: "Use several products or ideas as broad inspiration, not hard selling.", marketingAngle: "inspiration", customerStage: "warm", ctaStrength: "soft" },
    { contentTypeId: "local", label: "Brand relevance", description: "Connect the business to the audience, season, place or everyday situation.", marketingAngle: "brand", customerStage: "warm", ctaStrength: "soft" },
    { contentTypeId: "problem_solution", label: "Problem people recognize", description: "Use a recognizable need to make new audiences understand why the brand matters.", marketingAngle: "awareness", customerStage: "cold", ctaStrength: "soft" },
    { contentTypeId: "behind_scenes", label: "Human brand post", description: "Build familiarity and personality so new people remember the business.", marketingAngle: "trust", customerStage: "warm", ctaStrength: "soft" },
    { contentTypeId: "website_item", label: "Soft product link", description: "Connect attention to one relevant product or service without making the whole plan too sales-heavy.", marketingAngle: "conversion", customerStage: "warm", ctaStrength: "medium" },
  ],
  build_trust: [
    { contentTypeId: "tips", label: "Expert tip", description: "Open with useful expertise that makes the brand feel competent.", marketingAngle: "trust", customerStage: "warm", ctaStrength: "soft" },
    { contentTypeId: "problem_solution", label: "Problem and solution", description: "Explain a customer problem and how the business helps solve it.", marketingAngle: "education", customerStage: "warm", ctaStrength: "soft" },
    { contentTypeId: "carousel_website_item", label: "Choose-right guide", description: "Use a carousel as a helpful guide or curated set of options, not a random product list.", marketingAngle: "product_discovery", customerStage: "warm", ctaStrength: "medium" },
    { contentTypeId: "faq", label: "Answer doubts", description: "Remove common hesitation with a clear answer or reassurance.", marketingAngle: "trust", customerStage: "warm", ctaStrength: "medium" },
    { contentTypeId: "case_example", label: "Customer value example", description: "Show concrete value, use-case or result without inventing reviews or claims.", marketingAngle: "proof", customerStage: "warm", ctaStrength: "medium" },
    { contentTypeId: "service_focus", label: "How it works", description: "Explain one service or offer clearly so the next step feels safe.", marketingAngle: "education", customerStage: "warm", ctaStrength: "medium" },
    { contentTypeId: "website_item", label: "Trusted recommendation", description: "Recommend one relevant product or service as an example of the promise.", marketingAngle: "conversion", customerStage: "ready_to_buy", ctaStrength: "medium" },
  ],
  educate_customers: [
    { contentTypeId: "tips", label: "Quick practical tip", description: "Start with one helpful tip that is easy to understand and save.", marketingAngle: "education", customerStage: "cold", ctaStrength: "soft" },
    { contentTypeId: "mistakes", label: "Common mistake", description: "Help customers avoid a mistake or misunderstanding connected to the business.", marketingAngle: "education", customerStage: "warm", ctaStrength: "soft" },
    { contentTypeId: "carousel_website_item", label: "Step-by-step guide", description: "Use carousel when several options, steps or examples make the advice easier to act on.", marketingAngle: "guide", customerStage: "warm", ctaStrength: "medium" },
    { contentTypeId: "comparison", label: "Compare options", description: "Help customers understand differences and choose more confidently.", marketingAngle: "trust", customerStage: "warm", ctaStrength: "medium" },
    { contentTypeId: "website_item", label: "Recommended solution", description: "Connect the advice to one relevant product or service from the website.", marketingAngle: "conversion", customerStage: "ready_to_buy", ctaStrength: "medium" },
    { contentTypeId: "checklist", label: "Checklist", description: "Turn the advice into a simple checklist or action list.", marketingAngle: "education", customerStage: "warm", ctaStrength: "soft" },
    { contentTypeId: "myth_fact", label: "Myth vs fact", description: "Correct a misconception and build authority.", marketingAngle: "trust", customerStage: "warm", ctaStrength: "soft" },
  ],
  stay_visible: [
    { contentTypeId: "seasonal", label: "Timely inspiration", description: "Keep the brand present with a relevant seasonal or everyday angle.", marketingAngle: "awareness", customerStage: "cold", ctaStrength: "soft" },
    { contentTypeId: "tips", label: "Useful value post", description: "Give value so the account does not only sell.", marketingAngle: "education", customerStage: "warm", ctaStrength: "soft" },
    { contentTypeId: "website_item", label: "Product reminder", description: "Keep a concrete product or service visible in the weekly mix.", marketingAngle: "product_push", customerStage: "warm", ctaStrength: "medium" },
    { contentTypeId: "carousel_website_item", label: "Mini collection", description: "Use carousel occasionally to show a small collection, guide or range.", marketingAngle: "product_discovery", customerStage: "warm", ctaStrength: "medium" },
    { contentTypeId: "faq", label: "Helpful answer", description: "Answer a common question and reduce friction.", marketingAngle: "trust", customerStage: "warm", ctaStrength: "soft" },
    { contentTypeId: "case_example", label: "Example or use case", description: "Show how the business helps in a real-life situation without inventing claims.", marketingAngle: "proof", customerStage: "warm", ctaStrength: "medium" },
    { contentTypeId: "local", label: "Local or audience relevance", description: "Make the account feel active, present and connected to its audience.", marketingAngle: "engagement", customerStage: "cold", ctaStrength: "soft" },
  ],
};

function makeSlotId() {
  return `slot-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getContentTypeById(typeId) {
  return contentTypes.find((type) => type.id === typeId) || null;
}
function getBrandSafeContentTypeId(typeId, websiteProductModeAvailable) {
  if (!websiteProductModeAvailable) {
    if (typeId === "website_item") return "problem_solution";
    if (typeId === "carousel_website_item") return "mini_guide";
  }

  return typeId;
}

function getBrandSafeContentTypeIds(typeIds, websiteProductModeAvailable) {
  return typeIds.map((typeId) =>
    getBrandSafeContentTypeId(typeId, websiteProductModeAvailable)
  );
}

function getGoalMarketingSequence(goalId) {
  return goalMarketingSequences[goalId] || goalMarketingSequences.stay_visible;
}

function getGoalPlanningStep({
  goalId,
  index = 0,
  websiteProductModeAvailable = true,
}) {
  const sequence = getGoalMarketingSequence(goalId);
  const rawStep = sequence[index % sequence.length] || sequence[0];
  const safeContentTypeId = getBrandSafeContentTypeId(
    rawStep.contentTypeId,
    websiteProductModeAvailable
  );

  if (safeContentTypeId === rawStep.contentTypeId) {
    return rawStep;
  }

  const fallbackContentType = getContentTypeById(safeContentTypeId);

  return {
    ...rawStep,
    contentTypeId: safeContentTypeId,
    label: rawStep.label || fallbackContentType?.label || "Planned post",
    description:
      rawStep.description ||
      fallbackContentType?.description ||
      "Create a useful post that supports the selected goal.",
  };
}

function buildGoalSlotPrompt(type, step, goalId) {
  const goalLabel = getAutoPlanGoalLabel(goalId);
  const strategyLines = [
    `This post is part of a strategic content sequence for the goal: ${goalLabel}.`,
    step?.label ? `Post role: ${step.label}.` : "",
    step?.description ? `Strategic purpose: ${step.description}` : "",
    step?.marketingAngle ? `Marketing angle: ${step.marketingAngle}.` : "",
    step?.customerStage ? `Customer stage: ${step.customerStage}.` : "",
    step?.ctaStrength ? `CTA strength: ${step.ctaStrength}.` : "",
    "Make this post clearly different from the other posts in the plan. Do not just create a generic mixed post.",
    "If website products are used, choose products that fit this exact role and audience need, not random products from the website.",
  ]
    .filter(Boolean)
    .join("\n");

  return [strategyLines, type?.prompt || "Create a useful social media post."]
    .filter(Boolean)
    .join("\n\n");
}
function getGoalContentTypeIds({
  goalId,
  postCount,
  websiteProductModeAvailable,
}) {
  if (!goalId) return [];

  const count = Number(postCount) || DEFAULT_AUTO_PLAN_POST_COUNT;

  return Array.from({ length: count }).map((_, index) =>
    getGoalPlanningStep({
      goalId,
      index,
      websiteProductModeAvailable,
    }).contentTypeId
  );
}
function getVisibleContentTypes(websiteProductModeAvailable) {
  return contentTypes.filter((type) => {
    if (["website_item", "carousel_website_item"].includes(type.id)) {
      return Boolean(websiteProductModeAvailable);
    }

    return true;
  });
}
function getAutoPlanStrategy(goalId) {
  return autoPlanStrategies[goalId] || autoPlanStrategies.stay_visible;
}

function getAutoPlanGoalLabel(goalId) {
  if (!goalId) return "Choose a goal";
  return getAutoPlanStrategy(goalId).label;
}

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function getDateInputValueInTimeZone(
  date = new Date(),
  timeZone = DEFAULT_TIME_ZONE
) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(date);

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return `${values.year}-${values.month}-${values.day}`;
}

function addDaysToDateString(dateString, daysToAdd) {
  const [yearValue, monthValue, dayValue] = String(dateString || "").split("-");
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);

  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return "";
  }

  const date = new Date(Date.UTC(year, month - 1, day + daysToAdd));

  return `${date.getUTCFullYear()}-${padNumber(
    date.getUTCMonth() + 1
  )}-${padNumber(date.getUTCDate())}`;
}

function getLaterDateString(dateStringA, dateStringB) {
  const firstDate = String(dateStringA || "").trim();
  const secondDate = String(dateStringB || "").trim();

  if (!firstDate) return secondDate;
  if (!secondDate) return firstDate;

  return firstDate >= secondDate ? firstDate : secondDate;
}

function getSafeCampaignStartDate(campaign, timeZone = DEFAULT_TIME_ZONE) {
  const todayDateString = getDateInputValueInTimeZone(new Date(), timeZone);

  const campaignStartDate =
    campaign?.event_date ||
    campaign?.start_date ||
    todayDateString;

  return getLaterDateString(campaignStartDate, todayDateString);
}

function getDatePartsFromDateString(dateString) {
  const [yearValue, monthValue, dayValue] = String(dateString || "").split("-");
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);

  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return null;
  }

  return { year, month, day };
}

function getMonthStartDateString(dateString) {
  const parts = getDatePartsFromDateString(dateString);

  if (!parts) {
    return getDateInputValueInTimeZone(new Date(), DEFAULT_TIME_ZONE).slice(
      0,
      8
    ) + "01";
  }

  return `${parts.year}-${padNumber(parts.month)}-01`;
}


function getIntlLocaleFromUiLocale(locale) {
  const normalizedLocale = String(locale || "en").trim().toLowerCase();

  const localeMap = {
    en: "en-US",
    sv: "sv-SE",
    da: "da-DK",
    no: "nb-NO",
    fi: "fi-FI",
    de: "de-DE",
    fr: "fr-FR",
    es: "es-ES",
    it: "it-IT",
    pt: "pt-PT",
    nl: "nl-NL",
    pl: "pl-PL",
    tr: "tr-TR",
    ar: "ar",
    hi: "hi-IN",
    id: "id-ID",
    ja: "ja-JP",
    ko: "ko-KR",
    zh: "zh-CN",
    th: "th-TH",
    uk: "uk-UA",
    ru: "ru-RU",
    bg: "bg-BG",
  };

  return localeMap[normalizedLocale] || normalizedLocale || "en-US";
}

function getMonthLabel(dateString, locale = "en") {
  const parts = getDatePartsFromDateString(dateString);

  if (!parts) {
    return "";
  }

  const date = new Date(Date.UTC(parts.year, parts.month - 1, 1));

  return new Intl.DateTimeFormat(getIntlLocaleFromUiLocale(locale), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function moveMonth(dateString, amount) {
  const parts = getDatePartsFromDateString(dateString);

  if (!parts) {
    return dateString;
  }

  const date = new Date(Date.UTC(parts.year, parts.month - 1 + amount, 1));

  return `${date.getUTCFullYear()}-${padNumber(
    date.getUTCMonth() + 1
  )}-01`;
}

function buildCalendarDays(monthStartDateString) {
  const parts = getDatePartsFromDateString(monthStartDateString);

  if (!parts) {
    return [];
  }

  const firstDay = new Date(Date.UTC(parts.year, parts.month - 1, 1));
  const firstDayIndex = firstDay.getUTCDay();
  const mondayBasedOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
  const calendarStart = new Date(
    Date.UTC(parts.year, parts.month - 1, 1 - mondayBasedOffset)
  );

  return Array.from({ length: 42 }).map((_, index) => {
    const date = new Date(calendarStart);
    date.setUTCDate(calendarStart.getUTCDate() + index);

    return {
      dateString: `${date.getUTCFullYear()}-${padNumber(
        date.getUTCMonth() + 1
      )}-${padNumber(date.getUTCDate())}`,
      dayNumber: date.getUTCDate(),
      isCurrentMonth: date.getUTCMonth() === parts.month - 1,
    };
  });
}

function getWeekdayInTimeZone(date = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone,
  }).format(date);
}

function getTimeZoneOffsetMs(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).formatToParts(date);

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );

  return asUtc - date.getTime();
}

function zonedLocalToUtcDate({
  year,
  month,
  day,
  hour = 0,
  minute = 0,
  second = 0,
  timeZone = DEFAULT_TIME_ZONE,
}) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);

  let offset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  let utcTime = utcGuess - offset;

  const correctedOffset = getTimeZoneOffsetMs(new Date(utcTime), timeZone);

  if (correctedOffset !== offset) {
    utcTime = utcGuess - correctedOffset;
  }

  return new Date(utcTime);
}

function getWeekdayFromDateString(dateString, timeZone = DEFAULT_TIME_ZONE) {
  if (!dateString) {
    return "Monday";
  }

  const parts = getDatePartsFromDateString(dateString);

  if (!parts) {
    return "Monday";
  }

  const date = zonedLocalToUtcDate({
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: 12,
    minute: 0,
    second: 0,
    timeZone,
  });

  return getWeekdayInTimeZone(date, timeZone);
}

function formatStartDateLabel(dateString, timeZone = DEFAULT_TIME_ZONE, locale = "en") {
  if (!dateString) {
    return "No start date";
  }

  const parts = getDatePartsFromDateString(dateString);

  if (!parts) {
    return "No start date";
  }

  const date = zonedLocalToUtcDate({
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: 12,
    minute: 0,
    second: 0,
    timeZone,
  });

  return new Intl.DateTimeFormat(getIntlLocaleFromUiLocale(locale), {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(date);
}

function getRecommendedTimeForWeekday(weekday) {
  return recommendedTimesByWeekday[weekday] || "10:30";
}

function getRecommendedTimeForDate(dateString, timeZone = DEFAULT_TIME_ZONE) {
  const weekday = getWeekdayFromDateString(dateString, timeZone);

  return getRecommendedTimeForWeekday(weekday);
}

function getTimePreferenceScore(preferredTimes = [], publishTime) {
  const exactIndex = preferredTimes.indexOf(publishTime);

  if (exactIndex >= 0) {
    return 16 - exactIndex * 2;
  }

  const [hourValue, minuteValue] = String(publishTime || "10:30").split(":");
  const publishMinutes = Number(hourValue) * 60 + Number(minuteValue || 0);

  const closestDistance = preferredTimes.reduce((bestDistance, timeValue) => {
    const [preferredHour, preferredMinute] = String(timeValue).split(":");
    const preferredMinutes = Number(preferredHour) * 60 + Number(preferredMinute || 0);

    if (Number.isNaN(preferredMinutes) || Number.isNaN(publishMinutes)) {
      return bestDistance;
    }

    return Math.min(bestDistance, Math.abs(preferredMinutes - publishMinutes));
  }, 9999);

  if (closestDistance <= 60) return 7;
  if (closestDistance <= 120) return 3;

  return 0;
}

function getPublishTimeMinutes(publishTime = "10:30") {
  const [hourValue, minuteValue] = String(publishTime).split(":");
  const hour = Number(hourValue);
  const minute = Number(minuteValue || 0);

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return 10 * 60 + 30;
  }

  return hour * 60 + minute;
}

function getPostingDaypart(publishTime = "10:30") {
  const minutes = getPublishTimeMinutes(publishTime);

  if (minutes < 11 * 60) return "morning";
  if (minutes < 14 * 60) return "midday";
  if (minutes < 18 * 60) return "afternoon";

  return "evening";
}

function getDayNumberFromDateString(dateString) {
  const parsedDate = new Date(`${dateString}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return 0;
  }

  return Math.floor(parsedDate.getTime() / 86400000);
}

function getDynamicPostingScore({
  candidate,
  usedWeekdays,
  usedDayparts,
  usedTimes,
  usedDayNumbers,
  count,
}) {
  let score = candidate.score || 0;
  const daypart = getPostingDaypart(candidate.publishTime);
  const daypartUseCount = usedDayparts[daypart] || 0;
  const dayNumber = getDayNumberFromDateString(candidate.startDate);

  // Keep a professional rhythm: avoid every post looking like a 10:30 office slot.
  score -= daypartUseCount * (count >= 5 ? 7 : 10);

  if (usedTimes.has(candidate.publishTime)) {
    score -= 9;
  }

  if (usedWeekdays.has(candidate.weekday)) {
    score -= 12;
  }

  const tooCloseToAnotherPost = usedDayNumbers.some(
    (usedDayNumber) => Math.abs(usedDayNumber - dayNumber) <= 1
  );

  if (tooCloseToAnotherPost && count <= 5) {
    score -= 8;
  }

  // For larger plans, intentionally include one stronger evening/weekend moment.
  if (count >= 5 && ["evening", "afternoon"].includes(daypart)) {
    score += 4;
  }

  if (count >= 7 && ["Saturday", "Sunday"].includes(candidate.weekday)) {
    score += 4;
  }

  return score;
}

function getSmartPostingScore({
  weekday,
  publishTime,
  contentTypeId,
  goalId,
  dayOffset = 0,
}) {
  const typePreference =
    smartPostingTypePreferences[contentTypeId] ||
    smartPostingTypePreferences.manual_prompt;
  const goalDayBonus = smartPostingDayGoalBonus[goalId] || {};

  let score = 50;

  score += typePreference.dayBonus?.[weekday] || 0;
  score += goalDayBonus[weekday] || 0;
  score += getTimePreferenceScore(typePreference.preferredTimes, publishTime);

  if (weekday === "Saturday" || weekday === "Sunday") {
    score += ["website_item", "carousel_website_item", "seasonal", "checklist", "mini_guide"].includes(
      contentTypeId
    )
      ? 4
      : -3;
  }

  // Prefer good slots within the first upcoming week, without forcing the first date.
  score -= Math.max(0, dayOffset - 6) * 2;

  return score;
}

function buildSmartPostingCandidates({
  startDate,
  timeZone = DEFAULT_TIME_ZONE,
  contentTypeId,
  goalId,
  horizonDays = 14,
}) {
  if (!startDate) return [];

  const candidates = [];

  for (let dayOffset = 0; dayOffset < horizonDays; dayOffset += 1) {
    const candidateDate = addDaysToDateString(startDate, dayOffset);
    const weekday = getWeekdayFromDateString(candidateDate, timeZone);
    const publishTimes = smartPostingSlotsByWeekday[weekday] || [
      getRecommendedTimeForWeekday(weekday),
    ];

    for (const publishTime of publishTimes) {
      const candidateIso = getOneTimeRunAtIso(candidateDate, publishTime, timeZone);

      if (candidateIso && new Date(candidateIso).getTime() <= Date.now()) {
        continue;
      }

      candidates.push({
        startDate: candidateDate,
        weekday,
        publishTime,
        score: getSmartPostingScore({
          weekday,
          publishTime,
          contentTypeId,
          goalId,
          dayOffset,
        }),
      });
    }
  }

  return candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return `${a.startDate} ${a.publishTime}`.localeCompare(
      `${b.startDate} ${b.publishTime}`
    );
  });
}

function getFirstFuturePostingCandidate({
  startDate,
  publishTime,
  timeZone = DEFAULT_TIME_ZONE,
  maxDays = 30,
}) {
  const safeStartDate = startDate || getDateInputValueInTimeZone(new Date(), timeZone);
  const safePublishTime = normalizeTime(publishTime || "10:30");

  for (let dayOffset = 0; dayOffset <= maxDays; dayOffset += 1) {
    const candidateDate = addDaysToDateString(safeStartDate, dayOffset);
    const candidateIso = getOneTimeRunAtIso(candidateDate, safePublishTime, timeZone);

    if (candidateIso && new Date(candidateIso).getTime() > Date.now()) {
      return {
        startDate: candidateDate,
        weekday: getWeekdayFromDateString(candidateDate, timeZone),
        publishTime: safePublishTime,
      };
    }
  }

  const fallbackDate = addDaysToDateString(safeStartDate, 1);
  return {
    startDate: fallbackDate,
    weekday: getWeekdayFromDateString(fallbackDate, timeZone),
    publishTime: safePublishTime,
  };
}

function buildSmartSlotSchedule({
  startDate,
  count,
  timeZone = DEFAULT_TIME_ZONE,
  contentTypeIds = [],
  goalId = "",
}) {
  if (!startDate || count <= 0) {
    return [];
  }

  const result = [];
  const usedSlotKeys = new Set();
  const usedDateCounts = {};
  const usedWeekdays = new Set();
  const usedTimes = new Set();
  const usedDayparts = {};
  const usedDayNumbers = [];
  const normalizedGoalId = goalId || "stay_visible";
  const allowTwoSameDay = normalizedGoalId === "sell_more" && count >= 5;
  const maxPerDay = allowTwoSameDay ? 2 : 1;

  for (let index = 0; index < count; index += 1) {
    const contentTypeId = contentTypeIds[index] || "manual_prompt";
    const candidates = buildSmartPostingCandidates({
      startDate,
      timeZone,
      contentTypeId,
      goalId: normalizedGoalId,
      horizonDays: count >= 7 ? 14 : 10,
    });

    const availableCandidates = candidates
      .filter((candidate) => {
        const slotKey = `${candidate.startDate}-${candidate.publishTime}`;
        const dateCount = usedDateCounts[candidate.startDate] || 0;

        return !usedSlotKeys.has(slotKey) && dateCount < maxPerDay;
      })
      .sort((a, b) => {
        const scoreA = getDynamicPostingScore({
          candidate: a,
          usedWeekdays,
          usedDayparts,
          usedTimes,
          usedDayNumbers,
          count,
        });
        const scoreB = getDynamicPostingScore({
          candidate: b,
          usedWeekdays,
          usedDayparts,
          usedTimes,
          usedDayNumbers,
          count,
        });

        if (scoreB !== scoreA) return scoreB - scoreA;

        return `${a.startDate} ${a.publishTime}`.localeCompare(
          `${b.startDate} ${b.publishTime}`
        );
      });

    let selectedCandidate = availableCandidates[0];

    if (!selectedCandidate) {
      selectedCandidate = candidates.find((candidate) => {
        const slotKey = `${candidate.startDate}-${candidate.publishTime}`;
        return !usedSlotKeys.has(slotKey);
      });
    }

    if (!selectedCandidate) {
      const fallbackDate = addDaysToDateString(startDate, index);
      const fallbackWeekday = getWeekdayFromDateString(fallbackDate, timeZone);

      selectedCandidate = getFirstFuturePostingCandidate({
        startDate: fallbackDate,
        publishTime: getRecommendedTimeForWeekday(fallbackWeekday),
        timeZone,
      });
    }

    const selectedSlotKey = `${selectedCandidate.startDate}-${selectedCandidate.publishTime}`;
    usedSlotKeys.add(selectedSlotKey);
    usedDateCounts[selectedCandidate.startDate] =
      (usedDateCounts[selectedCandidate.startDate] || 0) + 1;
    usedWeekdays.add(selectedCandidate.weekday);
    usedTimes.add(selectedCandidate.publishTime);
    usedDayparts[getPostingDaypart(selectedCandidate.publishTime)] =
      (usedDayparts[getPostingDaypart(selectedCandidate.publishTime)] || 0) + 1;
    usedDayNumbers.push(getDayNumberFromDateString(selectedCandidate.startDate));

    result.push({
      startDate: selectedCandidate.startDate,
      weekday: selectedCandidate.weekday,
      publishTime: selectedCandidate.publishTime,
    });
  }

  return result.sort((a, b) =>
    `${a.startDate} ${a.publishTime}`.localeCompare(
      `${b.startDate} ${b.publishTime}`
    )
  );
}

function applySmartScheduleToSlots(
  currentSlots,
  startDate,
  timeZone = DEFAULT_TIME_ZONE,
  _firstPublishTime = null,
  goalId = ""
) {
  const contentTypeIds = currentSlots.map((slot) => slot.contentTypeId).filter(Boolean);
  const smartSchedule = buildSmartSlotSchedule({
    startDate,
    count: currentSlots.length,
    timeZone,
    contentTypeIds,
    goalId,
  });

  return currentSlots.map((slot, index) => {
    const schedule = smartSchedule[index];

    if (!schedule || slot.dateLocked) {
      return slot;
    }

    return {
      ...slot,
      startDate: schedule.startDate,
      weekday: schedule.weekday,
      publishTime: schedule.publishTime,
    };
  });
}

function createSlot(overrides = {}) {
  const timeZone = overrides.timeZone || DEFAULT_TIME_ZONE;
  const startDate =
    overrides.startDate || getDateInputValueInTimeZone(new Date(), timeZone);
  const weekday =
    overrides.weekday || getWeekdayFromDateString(startDate, timeZone);
  const publishTime =
    overrides.publishTime || getRecommendedTimeForWeekday(weekday);

  return {
    id: makeSlotId(),
    weekday,
    startDate,
    publishTime,
    prompt: overrides.prompt || "",
    generateImage: Boolean(overrides.generateImage),
    imagePrompt: overrides.imagePrompt || "",
    includeEmojis:
      typeof overrides.includeEmojis === "boolean"
        ? overrides.includeEmojis
        : true,
    includeHashtags:
      typeof overrides.includeHashtags === "boolean"
        ? overrides.includeHashtags
        : true,
    includeLogo:
      typeof overrides.includeLogo === "boolean"
        ? overrides.includeLogo
        : null,
contentTypeId: overrides.contentTypeId || null,
contentTypeLabel: overrides.contentTypeLabel || null,
usesWebsiteContent: Boolean(overrides.usesWebsiteContent),
contentFormat: overrides.contentFormat || "single_image",
isCampaignSlot: Boolean(overrides.isCampaignSlot),
campaignRole: overrides.campaignRole || "",
campaignSummary: overrides.campaignSummary || "",
campaignPhase: overrides.campaignPhase || "",
marketingAngle: overrides.marketingAngle || "",
customerStage: overrides.customerStage || "",
ctaStrength: overrides.ctaStrength || "",
campaignPostIndex: overrides.campaignPostIndex || null,
campaignPostCount: overrides.campaignPostCount || null,
campaignGoal: overrides.campaignGoal || "",
targetCustomerNeed: overrides.targetCustomerNeed || "",
strategyNotes: overrides.strategyNotes || "",
dateLocked: Boolean(overrides.dateLocked),
  };
}

function createSlotFromContentType(type, index = 0, options = {}) {
  const timeZone = options.timeZone || DEFAULT_TIME_ZONE;
  const startDate =
    options.startDate || getDateInputValueInTimeZone(new Date(), timeZone);

  const smartSchedule = buildSmartSlotSchedule({
    startDate,
    count: index + 1,
    timeZone,
    contentTypeIds:
      options.contentTypeIds ||
      Array.from({ length: index + 1 }).map((_, itemIndex) =>
        itemIndex === index ? type.id : null
      ),
    goalId: options.goalId || "",
  });

  const schedule = smartSchedule[index] || {
    startDate,
    weekday: getWeekdayFromDateString(startDate, timeZone),
    publishTime: getRecommendedTimeForDate(startDate, timeZone),
  };

  const shouldGenerateImage =
    typeof options.generateImage === "boolean"
      ? options.generateImage
      : type.id === "manual_prompt"
      ? false
      : true;

  return createSlot({
    weekday: schedule.weekday,
    startDate: schedule.startDate,
    publishTime: schedule.publishTime,
    prompt: type.prompt,
    imagePrompt: type.imagePrompt,
    generateImage: shouldGenerateImage,
    contentTypeId: type.id,
    contentTypeLabel: type.label,
    usesWebsiteContent: Boolean(type.usesWebsiteContent),
    contentFormat: type.contentFormat || "single_image",
    timeZone,
  });
}

function shouldAutoPlanGenerateImage() {
  return true;
}

function createRecommendedSlots(options = {}) {
  const timeZone = options.timeZone || DEFAULT_TIME_ZONE;
  const startDate =
    options.startDate || getDateInputValueInTimeZone(new Date(), timeZone);
  const strategy = getAutoPlanStrategy(options.autoPlanGoal);
  const postCount = options.postCount || DEFAULT_AUTO_PLAN_POST_COUNT;
  const websiteProductModeAvailable = options.websiteProductModeAvailable !== false;

  const planningSteps = Array.from({ length: postCount }).map((_, index) =>
    getGoalPlanningStep({
      goalId: options.autoPlanGoal,
      index,
      websiteProductModeAvailable,
    })
  );

  const repeatedTypeIds = planningSteps.map((step) => step.contentTypeId);
  const types = repeatedTypeIds.map(getContentTypeById).filter(Boolean);

  const smartSchedule = buildSmartSlotSchedule({
    startDate,
    count: types.length,
    timeZone,
    contentTypeIds: repeatedTypeIds,
    goalId: options.autoPlanGoal || "",
  });

  return types.map((type, index) => {
    const schedule = smartSchedule[index] || {
      startDate,
      weekday: getWeekdayFromDateString(startDate, timeZone),
      publishTime: getRecommendedTimeForDate(startDate, timeZone),
    };
    const planningStep = planningSteps[index] || {};

    return createSlot({
      weekday: schedule.weekday,
      startDate: schedule.startDate,
      publishTime: schedule.publishTime,
      prompt: buildGoalSlotPrompt(type, planningStep, options.autoPlanGoal),
      imagePrompt: type.imagePrompt,
      generateImage:
        type.id === "website_item"
          ? true
          : shouldAutoPlanGenerateImage(index, strategy.imageCount),
      contentTypeId: type.id,
      contentTypeLabel: planningStep.label || type.label,
      usesWebsiteContent: Boolean(type.usesWebsiteContent),
      contentFormat: type.contentFormat || "single_image",
      marketingAngle: planningStep.marketingAngle || "",
      customerStage: planningStep.customerStage || "",
      ctaStrength: planningStep.ctaStrength || "",
      strategyNotes: planningStep.description || "",
      timeZone,
    });
  });
}

function normalizeTime(value) {
  return String(value || "").slice(0, 5);
}

function getBrowserTimeZone() {
  try {
    return (
      Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE
    );
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

function getLocaleDefaultTimeZone(locale = "en") {
  const language = String(locale || "en").toLowerCase().split("-")[0];
  const map = {
    sv: "Europe/Stockholm",
    da: "Europe/Copenhagen",
    no: "Europe/Oslo",
    fi: "Europe/Helsinki",
    en: "Europe/London",
    de: "Europe/Berlin",
    fr: "Europe/Paris",
    es: "Europe/Madrid",
    it: "Europe/Rome",
    nl: "Europe/Amsterdam",
    pl: "Europe/Warsaw",
    tr: "Europe/Istanbul",
    ru: "Europe/Moscow",
    uk: "Europe/Kyiv",
    ar: "Asia/Riyadh",
    hi: "Asia/Kolkata",
    id: "Asia/Jakarta",
    ja: "Asia/Tokyo",
    ko: "Asia/Seoul",
    zh: "Asia/Shanghai",
    th: "Asia/Bangkok",
    pt: "Europe/Lisbon",
  };

  return map[language] || DEFAULT_TIME_ZONE;
}

function getOneTimeRunAtIso(
  runDate,
  publishTime,
  timeZone = DEFAULT_TIME_ZONE
) {
  const normalizedPublishTime = normalizeTime(publishTime);

  if (!runDate || !normalizedPublishTime) {
    return null;
  }

  const [yearValue, monthValue, dayValue] = runDate.split("-");
  const [hourValue, minuteValue] = normalizedPublishTime.split(":");

  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const hour = Number(hourValue);
  const minute = Number(minuteValue);

  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    Number.isNaN(hour) ||
    Number.isNaN(minute)
  ) {
    return null;
  }

  const runUtcDate = zonedLocalToUtcDate({
    year,
    month,
    day,
    hour,
    minute,
    second: 0,
    timeZone,
  });

  return runUtcDate.toISOString();
}

function getInitialWeeklyRunAtIsoFromStartDate(
  startDate,
  publishTime,
  timeZone = DEFAULT_TIME_ZONE,
  now = new Date()
) {
  let candidateDate = startDate;

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const candidateIso = getOneTimeRunAtIso(
      candidateDate,
      publishTime,
      timeZone
    );

    if (!candidateIso) {
      return null;
    }

    if (new Date(candidateIso) > now) {
      return candidateIso;
    }

    candidateDate = addDaysToDateString(candidateDate, 7);
  }

  return null;
}

function getInitialNextRunAtIso({
  scheduleType,
  publishTime,
  startDate,
  timeZone,
}) {
  if (scheduleType === "once") {
    return getOneTimeRunAtIso(startDate, publishTime, timeZone);
  }

  if (scheduleType === "weekly") {
    return getInitialWeeklyRunAtIsoFromStartDate(
      startDate,
      publishTime,
      timeZone
    );
  }

  return null;
}

function formatDateTime(value, timeZone = DEFAULT_TIME_ZONE) {
  if (!value) return "Not set";

  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

function formatLanguage(value) {
  if (!value || value === "Auto") return "Auto-detect from prompt";
  return value;
}

function formatSubscriptionPlan(value) {
  if (!value) return "Starter";

  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function formatRenewDate(value, timeZone = DEFAULT_TIME_ZONE) {
  if (!value) return "Not set yet";

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(new Date(value));
}

function getSubscriptionStatusLabel(value) {
  if (value === "trialing") return "Trial period";
  if (value === "active") return "Active subscription";
  if (value === "past_due") return "Payment issue";
  if (value === "canceled") return "Canceled";
  if (value === "expired") return "Expired";
  if (value === "incomplete") return "Payment required";
  if (value === "paused") return "Paused";

  return formatSubscriptionPlan(value || "trialing");
}

function getPlanBadgeLabel(balance) {
  const planLabel = formatSubscriptionPlan(
    balance?.subscription_plan || balance?.plan_name || "starter"
  );

  if (balance?.subscription_status === "trialing") {
    return `${planLabel} trial`;
  }

  return planLabel;
}

function getSubscriptionDateLabel(balance) {
  if (!balance) return "Renews";

  if (balance.subscription_status === "trialing") return "Trial ends";

  if (balance.cancel_at_period_end) {
    return "Access until";
  }

  if (balance.subscription_status === "active") return "Renews";
  if (balance.subscription_status === "past_due") return "Payment due";
  if (balance.subscription_status === "canceled") return "Ended";
  if (balance.subscription_status === "expired") return "Expired";

  return "Renews";
}

function getSubscriptionDateValue(balance, timeZone = DEFAULT_TIME_ZONE) {
  if (!balance) return "Not set yet";

  if (balance.subscription_status === "trialing") {
    return formatRenewDate(
      balance.trial_end || balance.current_period_end,
      timeZone
    );
  }

  return formatRenewDate(
    balance.current_period_end || balance.trial_end,
    timeZone
  );
}

function getSubscriptionNextStepText(balance) {
  if (!balance) return "Not set yet";

  const amount = balance.subscription_price_amount;
  const currency = balance.subscription_currency || "SEK";

  if (balance.cancel_at_period_end) {
    return "Will not renew";
  }

  if (balance.subscription_status === "trialing") {
    if (amount) {
      return `Then ${amount} ${currency}/month`;
    }

    return "Then monthly subscription";
  }

  if (balance.subscription_status === "active") return "Renews monthly";
  if (balance.subscription_status === "past_due") return "Update payment method";
  if (balance.subscription_status === "canceled") return "Subscription canceled";
  if (balance.subscription_status === "expired") return "Trial expired";

  return "Subscription";
}

function formatPlanMode(value) {
  if (value === "campaign") return "Campaign plan";
  if (value === "auto") return "Auto-plan";
  if (value === "select") return "Choose content types";
  return "Manual prompt";
}

function getWizardStepOneLabel(value) {
  if (value === "auto") return "Choose goal";
  if (value === "select") return "Choose content types";
  if (value === "manual") return "Write prompt";
  return "Choose strategy";
}

function getWizardStepOneDescription(value) {
  if (value === "auto") {
    return "Choose a goal and let Spreelo build the strategy.";
  }

  if (value === "select") {
    return "Choose the content types you want in the plan.";
  }

  if (value === "manual") {
    return "Write your own instructions for the planned post.";
  }

  return "Choose how Spreelo should build the plan.";
}

function getSlotDisplayLabel(slot) {
  if (slot.contentTypeLabel) return slot.contentTypeLabel;

  const contentType = getContentTypeById(slot.contentTypeId);
  if (contentType?.label) return contentType.label;

  return "Custom post";
}

function getSlotDisplayDescription(slot) {
  if (slot.isCampaignSlot && slot.campaignSummary) {
  return slot.campaignSummary;
}
  if (slot.strategyNotes) {
    return slot.strategyNotes;
  }
  const contentType = getContentTypeById(slot.contentTypeId);

  if (contentType?.description) {
    return contentType.description;
  }

  if (slot.prompt?.trim()) {
    return slot.prompt.trim().slice(0, 120);
  }

  return "Write your own instructions for this post.";
}

function getSlotImageLabel(slot) {
  if (slot.usesWebsiteContent) {
    return "Website image / AI fallback";
  }

  return "AI image";
}

function getSlotCreditLabel(slot) {
  if (slot.generateImage) {
    return "3 credits";
  }

  return "1 credit";
}

function getContentTypeIcon(typeId) {
  const icons = {
    website_item: "🛒",
    carousel_website_item: "▦",
    problem_solution: "⚡",
    tips: "💡",
    mistakes: "!",
    faq: "?",
    behind_scenes: "🎥",
    checklist: "✓",
    service_focus: "✦",
    case_example: "👥",
    myth_fact: "↔",
    local: "⌖",
    seasonal: "☀",
    comparison: "⇄",
    mini_guide: "▤",
    manual_prompt: "✎",
  };

  return icons[typeId] || "✦";
}

function getContentPreviewCardId(typeId) {
  const map = {
    website_item: "product_focus",
    carousel_website_item: "website_carousel",
    problem_solution: "problem_solution",
    tips: "tips_advice",
    mistakes: "common_mistakes",
    faq: "faq",
    behind_scenes: "customer_inspiration",
    checklist: "checklist",
    service_focus: "product_focus",
    case_example: "customer_inspiration",
    myth_fact: "tips_advice",
    local: "local_relevance",
    seasonal: "seasonal",
    comparison: "mini_guide",
    mini_guide: "mini_guide",
    manual_prompt: "custom_prompt",
  };

  return map[typeId] || "content_mix";
}

function getContentPreviewCardIcon(cardId) {
  const icons = {
    product_focus: "🛍️",
    offers: "💝",
    tips_advice: "💡",
    customer_inspiration: "💬",
    faq: "❓",
    reminders: "🔔",
    common_mistakes: "⚠️",
    mini_guide: "📘",
    checklist: "✅",
    seasonal: "☀️",
    local_relevance: "📍",
    problem_solution: "⚡",
    custom_prompt: "✎",
    content_mix: "✦",
  };

  return icons[cardId] || "✦";
}

function getGoalBonusPreviewCardIds(goalId) {
  if (goalId === "sell_more") return ["offers", "reminders"];
  if (goalId === "get_followers") return ["customer_inspiration", "local_relevance"];
  if (goalId === "build_trust") return ["customer_inspiration", "faq"];
  if (goalId === "educate_customers") return ["tips_advice", "mini_guide"];
  if (goalId === "stay_visible") return ["seasonal", "reminders"];

  return [];
}

function getPlanPreviewCardsFromTypes(types = [], goalId = "") {
  const ids = [];

  for (const type of types) {
    const cardId = getContentPreviewCardId(type?.id);
    if (cardId && !ids.includes(cardId)) ids.push(cardId);
  }

  for (const cardId of getGoalBonusPreviewCardIds(goalId)) {
    if (!ids.includes(cardId)) ids.push(cardId);
  }

  return ids.slice(0, 6).map((id) => ({ id, icon: getContentPreviewCardIcon(id) }));
}

function getSlotFormatLabel(slot) {
  if (slot.contentFormat === "carousel") {
    return slot.generateImage ? "Carousel + website image" : "Carousel draft";
  }

  if (slot.usesWebsiteContent && slot.generateImage) {
    return "Text + website image";
  }

  if (slot.generateImage) {
    return "Text + image";
  }

  return "Text only";
}
function sortAutomationRules(rulesToSort = []) {
  return (rulesToSort || []).slice().sort((a, b) => {
    if (a.next_run_at && b.next_run_at) {
      return new Date(a.next_run_at) - new Date(b.next_run_at);
    }

    if (a.next_run_at && !b.next_run_at) return -1;
    if (!a.next_run_at && b.next_run_at) return 1;

    const dayDiff =
      dayOrder.indexOf(a.weekday) - dayOrder.indexOf(b.weekday);

    if (dayDiff !== 0) return dayDiff;

    return String(a.publish_time).localeCompare(String(b.publish_time));
  });
}
function getPlanIncludedContentTypes({
  planCreationMode,
  autoPlanGoal,
  autoPlanPostCount,
  selectedContentTypeIds,
  websiteProductModeAvailable,
}) {
  if (planCreationMode === "campaign") {
    return [getContentTypeById("manual_prompt")].filter(Boolean);
  }

  if (planCreationMode === "manual") {
    return [getContentTypeById("manual_prompt")].filter(Boolean);
  }

  if (planCreationMode === "select") {
    return selectedContentTypeIds.map(getContentTypeById).filter(Boolean);
  }

  if (!autoPlanGoal) {
    return [];
  }

  return getGoalContentTypeIds({
    goalId: autoPlanGoal,
    postCount: autoPlanPostCount,
    websiteProductModeAvailable,
  })
    .map(getContentTypeById)
    .filter(Boolean);
}
function getSlotScheduleSummary(slot, scheduleType, timeZone) {
  const startLabel = formatStartDateLabel(slot.startDate, timeZone);
  const weekday = getWeekdayFromDateString(slot.startDate, timeZone);
  const time = normalizeTime(slot.publishTime);

  if (scheduleType === "once") {
    return `Runs once on ${startLabel} at ${time}`;
  }

  return `Starts ${startLabel} · Repeats every ${weekday} at ${time}`;
}

function DatePickerField({
  label,
  value,
  onChange,
  pickerId,
  openPickerId,
  setOpenPickerId,
  timeZone,
  compact = false,
  weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  locale = "en",
}) {
  const [visibleMonth, setVisibleMonth] = useState(() =>
    getMonthStartDateString(value)
  );

  useEffect(() => {
    setVisibleMonth(getMonthStartDateString(value));
  }, [value]);

  const isOpen = openPickerId === pickerId;
  const calendarDays = buildCalendarDays(visibleMonth);
  const todayDateString = getDateInputValueInTimeZone(new Date(), timeZone);

  return (
    <div className={`custom-picker-field ${compact ? "compact" : ""}`}>
      {label && <label>{label}</label>}

      <div className="custom-picker-anchor">
        <button
          type="button"
          className="custom-picker-button"
          onClick={() => setOpenPickerId(isOpen ? null : pickerId)}
        >
          <span>{formatStartDateLabel(value, timeZone, locale)}</span>
          <strong>📅</strong>
        </button>

        {isOpen && (
          <div className="custom-calendar-popover">
            <div className="custom-calendar-header">
              <button
                type="button"
                onClick={() => setVisibleMonth(moveMonth(visibleMonth, -1))}
              >
                ‹
              </button>

              <strong>{getMonthLabel(visibleMonth, locale)}</strong>

              <button
                type="button"
                onClick={() => setVisibleMonth(moveMonth(visibleMonth, 1))}
              >
                ›
              </button>
            </div>

            <div className="custom-calendar-weekdays">
              {weekdayLabels.map((weekdayLabel) => (
                <span key={weekdayLabel}>{weekdayLabel}</span>
              ))}
            </div>

            <div className="custom-calendar-grid">
              {calendarDays.map((day) => {
                const isSelected = day.dateString === value;
                const isToday = day.dateString === todayDateString;

                return (
                  <button
                    type="button"
                    key={day.dateString}
                    className={[
                      "custom-calendar-day",
                      day.isCurrentMonth ? "" : "muted",
                      isSelected ? "selected" : "",
                      isToday ? "today" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => {
                      onChange(day.dateString);
                      setOpenPickerId(null);
                    }}
                  >
                    {day.dayNumber}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TimePickerField({
  label,
  value,
  onChange,
  pickerId,
  openPickerId,
  setOpenPickerId,
  compact = false,
}) {
  const isOpen = openPickerId === pickerId;

  return (
    <div className={`custom-picker-field ${compact ? "compact" : ""}`}>
      {label && <label>{label}</label>}

      <div className="custom-picker-anchor">
        <button
          type="button"
          className="custom-picker-button time"
          onClick={() => setOpenPickerId(isOpen ? null : pickerId)}
        >
          <span>{normalizeTime(value)}</span>
          <strong>⌄</strong>
        </button>

        {isOpen && (
          <div className="custom-time-popover">
            {timeOptions.map((timeOption) => (
              <button
                type="button"
                key={timeOption}
                className={timeOption === value ? "selected" : ""}
                onClick={() => {
                  onChange(timeOption);
                  setOpenPickerId(null);
                }}
              >
                {timeOption}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
function getBrandStorageKey(userId) {
  return `spreelo_current_brand_id_${userId}`;
}

function getCampaignAngleLabel(value) {
  const labels = {
    main: "Main campaign post",
    awareness: "Inspiration",
    engagement: "Engagement",
    product_discovery: "Product idea",
    product_push: "Product push",
    trust: "Trust",
    offer: "Offer",
    urgency: "Last chance",
  };

  return labels[value] || "Campaign post";
}

function getCustomerStageLabel(value) {
  if (value === "cold") return "Build interest";
  if (value === "warm") return "Create confidence";
  if (value === "ready_to_buy") return "Drive action";

  return "Campaign strategy";
}

function getCustomerStageDotClass(value) {
  if (value === "cold") return "cold";
  if (value === "warm") return "warm";
  if (value === "ready_to_buy") return "ready";

  return "neutral";
}


function getCtaStrengthLabel(value) {
  if (value === "soft") return "Soft CTA";
  if (value === "medium") return "Medium CTA";
  if (value === "strong") return "Strong CTA";

  return "CTA";
}

function normalizeStrategyValue(value) {
  return String(value || "").toLowerCase().trim();
}

function getStrategicCampaignSequence(count) {
  const safeCount = Math.min(Math.max(Math.round(Number(count) || 1), 1), 7);

  const sequences = {
    1: [
      {
        campaign_phase: "main",
        marketing_angle: "main",
        customer_stage: "warm",
        cta_strength: "medium",
      },
    ],
    2: [
      {
        campaign_phase: "early",
        marketing_angle: "awareness",
        customer_stage: "cold",
        cta_strength: "soft",
      },
      {
        campaign_phase: "late",
        marketing_angle: "urgency",
        customer_stage: "ready_to_buy",
        cta_strength: "strong",
      },
    ],
    3: [
      {
        campaign_phase: "early",
        marketing_angle: "awareness",
        customer_stage: "cold",
        cta_strength: "soft",
      },
      {
        campaign_phase: "middle",
        marketing_angle: "product_push",
        customer_stage: "warm",
        cta_strength: "medium",
      },
      {
        campaign_phase: "late",
        marketing_angle: "urgency",
        customer_stage: "ready_to_buy",
        cta_strength: "strong",
      },
    ],
    4: [
      {
        campaign_phase: "early",
        marketing_angle: "awareness",
        customer_stage: "cold",
        cta_strength: "soft",
      },
      {
        campaign_phase: "middle",
        marketing_angle: "product_discovery",
        customer_stage: "warm",
        cta_strength: "medium",
      },
      {
        campaign_phase: "middle_late",
        marketing_angle: "trust",
        customer_stage: "warm",
        cta_strength: "medium",
      },
      {
        campaign_phase: "late",
        marketing_angle: "urgency",
        customer_stage: "ready_to_buy",
        cta_strength: "strong",
      },
    ],
    5: [
      {
        campaign_phase: "early",
        marketing_angle: "awareness",
        customer_stage: "cold",
        cta_strength: "soft",
      },
      {
        campaign_phase: "early_middle",
        marketing_angle: "engagement",
        customer_stage: "cold",
        cta_strength: "soft",
      },
      {
        campaign_phase: "middle",
        marketing_angle: "product_push",
        customer_stage: "warm",
        cta_strength: "medium",
      },
      {
        campaign_phase: "middle_late",
        marketing_angle: "trust",
        customer_stage: "warm",
        cta_strength: "medium",
      },
      {
        campaign_phase: "late",
        marketing_angle: "urgency",
        customer_stage: "ready_to_buy",
        cta_strength: "strong",
      },
    ],
    6: [
      {
        campaign_phase: "early",
        marketing_angle: "awareness",
        customer_stage: "cold",
        cta_strength: "soft",
      },
      {
        campaign_phase: "early_middle",
        marketing_angle: "engagement",
        customer_stage: "cold",
        cta_strength: "soft",
      },
      {
        campaign_phase: "middle",
        marketing_angle: "product_discovery",
        customer_stage: "warm",
        cta_strength: "medium",
      },
      {
        campaign_phase: "middle_late",
        marketing_angle: "product_push",
        customer_stage: "warm",
        cta_strength: "medium",
      },
      {
        campaign_phase: "late",
        marketing_angle: "trust",
        customer_stage: "warm",
        cta_strength: "medium",
      },
      {
        campaign_phase: "last_chance",
        marketing_angle: "urgency",
        customer_stage: "ready_to_buy",
        cta_strength: "strong",
      },
    ],
    7: [
      {
        campaign_phase: "early",
        marketing_angle: "awareness",
        customer_stage: "cold",
        cta_strength: "soft",
      },
      {
        campaign_phase: "early_middle",
        marketing_angle: "engagement",
        customer_stage: "cold",
        cta_strength: "soft",
      },
      {
        campaign_phase: "middle",
        marketing_angle: "product_discovery",
        customer_stage: "warm",
        cta_strength: "medium",
      },
      {
        campaign_phase: "middle_late",
        marketing_angle: "product_push",
        customer_stage: "warm",
        cta_strength: "medium",
      },
      {
        campaign_phase: "late",
        marketing_angle: "trust",
        customer_stage: "warm",
        cta_strength: "medium",
      },
      {
        campaign_phase: "offer",
        marketing_angle: "offer",
        customer_stage: "ready_to_buy",
        cta_strength: "strong",
      },
      {
        campaign_phase: "last_chance",
        marketing_angle: "urgency",
        customer_stage: "ready_to_buy",
        cta_strength: "strong",
      },
    ],
  };

  return sequences[safeCount] || sequences[3];
}

function getStrategicCampaignStep(count, index, postPlanItem = {}) {
  const sequence = getStrategicCampaignSequence(count);
  const fallbackStep = sequence[index] || sequence[sequence.length - 1];

  return {
    campaign_phase:
      normalizeStrategyValue(postPlanItem?.campaign_phase) ||
      fallbackStep.campaign_phase,
    marketing_angle:
      normalizeStrategyValue(postPlanItem?.marketing_angle) ||
      fallbackStep.marketing_angle,
    customer_stage:
      normalizeStrategyValue(postPlanItem?.customer_stage) ||
      fallbackStep.customer_stage,
    cta_strength:
      normalizeStrategyValue(postPlanItem?.cta_strength) ||
      fallbackStep.cta_strength,
  };
}

function getCampaignStrategyPurpose(marketingAngle) {
  const purposes = {
    main:
      "Combine campaign relevance, audience need and a clear next step in one strong post.",
    awareness:
      "Introduce the campaign and make the audience understand why it matters.",
    engagement:
      "Encourage the audience to react, comment, choose or recognize themselves in the campaign.",
    product_discovery:
      "Help the audience discover relevant products, services, ideas or options connected to the campaign.",
    product_push:
      "Recommend or highlight a relevant product, service or offer connected to the campaign.",
    trust:
      "Build confidence with reassurance, useful explanation, proof, examples or quality signals.",
    offer:
      "Give the audience a clear buying reason connected to the campaign.",
    urgency:
      "Create a timely reason to act now because the campaign date or opportunity is close.",
  };

  return (
    purposes[marketingAngle] ||
    "Create a useful campaign-related social media post."
  );
}

function getCampaignStrategyInstruction(postPlanItem) {
  const marketingAngle = postPlanItem?.marketing_angle || "main";
  const ctaStrength = postPlanItem?.cta_strength || "medium";

  const angleInstructions = {
    main:
      "This is the only post in the campaign. Combine inspiration, relevance, product/service value and a natural call to action.",
    awareness:
      "Do not sell too hard. Focus on recognition, timing, need, emotion or inspiration.",
    engagement:
      "Make the post easy to react to. Use a simple question, choice, comparison or relatable situation.",
    product_discovery:
      "Help the audience explore suitable options connected to the campaign.",
    product_push:
      "Make the product, service or offer more concrete and explain why it fits the campaign context.",
    trust:
      "Reduce doubt and build confidence. Do not invent reviews or claims.",
    offer:
      "Connect the offer to the audience need and campaign timing. Do not invent discounts.",
    urgency:
      "Make the timing matter and give the audience a clear reason to act now.",
  };

  const ctaInstructions = {
    soft: "Use a soft CTA that invites interest, comments or exploration.",
    medium: "Use a clear but natural CTA.",
    strong: "Use a stronger CTA that encourages action now.",
  };

  return [
    angleInstructions[marketingAngle] || angleInstructions.main,
    ctaInstructions[ctaStrength] || ctaInstructions.medium,
  ]
    .filter(Boolean)
    .join(" ");
}

function getCampaignDateLabel(campaign) {
  if (campaign?.event_date) {
    return campaign.event_date;
  }

  if (campaign?.start_date && campaign?.end_date) {
    return `${campaign.start_date} – ${campaign.end_date}`;
  }

  if (campaign?.start_date) {
    return campaign.start_date;
  }

  return "Flexible date";
}

function buildFallbackCampaignPlan(count) {
  const safeCount = Math.min(Math.max(Math.round(Number(count) || 1), 1), 7);

  return Array.from({ length: safeCount }).map((_, index) => {
    const strategy = getStrategicCampaignStep(safeCount, index);

    return {
      role: getCampaignAngleLabel(strategy.marketing_angle),
      purpose: getCampaignStrategyPurpose(strategy.marketing_angle),
      days_before_event:
        getDefaultCampaignDaysBeforeEvent(safeCount)[index] ?? 0,
      ...strategy,
    };
  });
}

function getCampaignRecommendedPostCount(campaign, fallbackCount = 3) {
  const rawRecommendedCount = Number(campaign?.recommended_post_count);

  const count = Number.isFinite(rawRecommendedCount)
    ? rawRecommendedCount
    : fallbackCount;

  return Math.min(Math.max(Math.round(count), 1), 7);
}


function normalizeCampaignOpportunityForPlanner(campaign) {
  if (!campaign) return campaign;

  const rawSingleDate =
    campaign.event_date ||
    campaign.campaign_date ||
    campaign.date ||
    campaign.main_date ||
    campaign.target_date ||
    (campaign.start_date && !campaign.end_date ? campaign.start_date : "") ||
    (campaign.start_date && campaign.end_date && campaign.start_date === campaign.end_date
      ? campaign.start_date
      : "");

  const singleDate = String(rawSingleDate || "").slice(0, 10);
  const startDate = String(campaign.start_date || singleDate || "").slice(0, 10);
  const endDate = String(campaign.end_date || singleDate || startDate || "").slice(0, 10);
  const normalizedPostPlan = Array.isArray(campaign.post_plan) ? campaign.post_plan : [];

  return {
    ...campaign,
    event_date: campaign.event_date || (singleDate && startDate === endDate ? singleDate : null),
    start_date: startDate || campaign.start_date || null,
    end_date: endDate || campaign.end_date || null,
    recommended_post_count: getCampaignRecommendedPostCount(campaign),
    post_plan: normalizedPostPlan,
    _normalized_for_planner: true,
  };
}

function mergeCampaignOpportunitySources(databaseCampaign, handoffCampaign) {
  if (!databaseCampaign && !handoffCampaign) return null;

  const merged = {
    ...(handoffCampaign || {}),
    ...(databaseCampaign || {}),
  };

  const explicitSingleDate =
    merged.event_date ||
    merged.campaign_date ||
    merged.date ||
    merged.main_date ||
    merged.target_date ||
    handoffCampaign?.event_date ||
    databaseCampaign?.event_date ||
    "";

  const mergedStartDate = String(merged.start_date || handoffCampaign?.start_date || databaseCampaign?.start_date || "").slice(0, 10);
  const mergedEndDate = String(merged.end_date || handoffCampaign?.end_date || databaseCampaign?.end_date || "").slice(0, 10);

  // Do not turn a broad date range such as 2026-01-01 – 2026-12-31 into
  // a fixed event on January 1. That made calendar campaigns look loaded but
  // caused the campaign planner to schedule against the wrong date.
  if (!merged.event_date && explicitSingleDate) {
    merged.event_date = String(explicitSingleDate).slice(0, 10);
  }

  if (!merged.event_date && mergedStartDate && mergedEndDate && mergedStartDate === mergedEndDate) {
    merged.event_date = mergedStartDate;
  }

  if (!merged.start_date && mergedStartDate) {
    merged.start_date = mergedStartDate;
  }

  if (!merged.end_date && mergedEndDate) {
    merged.end_date = mergedEndDate;
  }

  if (!merged.start_date && merged.event_date) {
    merged.start_date = merged.event_date;
  }

  if (!merged.end_date && merged.event_date) {
    merged.end_date = merged.event_date;
  }

  if (!Array.isArray(merged.post_plan) && Array.isArray(handoffCampaign?.post_plan)) {
    merged.post_plan = handoffCampaign.post_plan;
  }

  return normalizeCampaignOpportunityForPlanner(merged);
}

function buildCampaignPostPlan(campaign, recommendedCount) {
  const rawPostPlan = Array.isArray(campaign?.post_plan)
    ? campaign.post_plan
    : [];

  const sortedRawPostPlan = [...rawPostPlan].sort((a, b) => {
    const aDays =
      typeof a?.days_before_event === "number" ? a.days_before_event : 0;
    const bDays =
      typeof b?.days_before_event === "number" ? b.days_before_event : 0;

    return bDays - aDays;
  });

  const fallbackPostPlan = buildFallbackCampaignPlan(recommendedCount);

  const mergedPlan = Array.from({ length: recommendedCount }).map((_, index) => {
    const fallbackPost = fallbackPostPlan[index] || {};
    const aiPost = sortedRawPostPlan[index] || {};

    const role =
      aiPost.role && !/^campaign post/i.test(aiPost.role)
        ? aiPost.role
        : fallbackPost.role;

    return {
      ...fallbackPost,
      ...aiPost,
      role,
      purpose: aiPost.purpose || fallbackPost.purpose,
      days_before_event:
        typeof aiPost.days_before_event === "number"
          ? aiPost.days_before_event
          : fallbackPost.days_before_event,
    };
  });

  return mergedPlan.sort((a, b) => {
    const aDays =
      typeof a?.days_before_event === "number" ? a.days_before_event : 0;
    const bDays =
      typeof b?.days_before_event === "number" ? b.days_before_event : 0;

    return bDays - aDays;
  });
}

function getDefaultCampaignDaysBeforeEvent(count) {
  const postCount = Math.max(Math.round(Number(count) || 0), 0);

  if (postCount <= 0) return [];
  if (postCount === 1) return [0];

  const maxLeadDays = Math.max(7, postCount * 5);

  return Array.from({ length: postCount }).map((_, index) => {
    if (index === postCount - 1) return 0;

    const progress = index / Math.max(postCount - 1, 1);
    return Math.max(Math.round(maxLeadDays * (1 - progress)), 1);
  });
}

function getFutureCampaignDaysBeforeEvent(count, daysUntilEvent) {
  const postCount = Math.max(Math.round(Number(count) || 0), 0);

  if (postCount <= 0) {
    return [];
  }

  const safeDaysUntilEvent = Math.max(
    Math.floor(Number(daysUntilEvent) || 0),
    0
  );

  if (postCount === 1) {
    return [Math.min(safeDaysUntilEvent, 0)];
  }

  const maxUsableLead = Math.max(safeDaysUntilEvent, 0);

  if (maxUsableLead === 0) {
    return Array.from({ length: postCount }, () => 0);
  }

  const generatedDays = Array.from({ length: postCount }).map((_, index) => {
    if (index === postCount - 1) return 0;

    const progress = index / Math.max(postCount - 1, 1);
    return Math.max(Math.round(maxUsableLead * (1 - progress)), 1);
  });

  const uniqueDays = [];

  for (const daysBeforeEvent of generatedDays) {
    let candidate = Math.min(daysBeforeEvent, maxUsableLead);

    while (candidate > 0 && uniqueDays.includes(candidate)) {
      candidate -= 1;
    }

    uniqueDays.push(candidate);
  }

  return uniqueDays;
}

function getCampaignPlanTimingAnchor(postPlanItem, index = 0, total = 1) {
  const explicitAnchor = String(
    postPlanItem?.timing_anchor ||
      postPlanItem?.schedule_anchor ||
      postPlanItem?.anchor ||
      ""
  )
    .trim()
    .toLowerCase();

  if (/relationship|soft|community|gratitude|event|day|huvuddatum|relations/.test(explicitAnchor)) {
    return "relationship_event";
  }

  if (/end|last|final|deadline|slut|sista/.test(explicitAnchor)) {
    return "deadline";
  }

  if (/middle|during|mid|under|mitt/.test(explicitAnchor)) {
    return "middle";
  }

  if (/before|pre|start|begin|launch|början|innan/.test(explicitAnchor)) {
    return "start";
  }

  const intent = getCampaignPostIntent(postPlanItem, index, total);

  if (intent === "event") return "relationship_event";
  if (intent === "deadline") return "deadline";
  if (intent === "conversion") return "conversion";
  if (intent === "trust") return "trust";
  if (intent === "engagement") return "engagement";

  return "start";
}

function getClampedFutureDateString(dateString, timeZone = DEFAULT_TIME_ZONE) {
  const todayDateString = getDateInputValueInTimeZone(new Date(), timeZone);

  if (!dateString) {
    return todayDateString;
  }

  return dateString < todayDateString ? todayDateString : dateString;
}

function getUniqueDateNearTarget({
  targetDate,
  usedDates,
  minDate,
  maxDate,
  preferBackward = false,
}) {
  const safeTarget = targetDate || minDate || maxDate;

  if (!safeTarget) {
    return "";
  }

  const lowerBound = minDate || safeTarget;
  const upperBound = maxDate || safeTarget;

  const clamp = (dateString) => {
    if (lowerBound && dateString < lowerBound) return lowerBound;
    if (upperBound && dateString > upperBound) return upperBound;
    return dateString;
  };

  const first = clamp(safeTarget);

  if (!usedDates.has(first)) {
    return first;
  }

  for (let offset = 1; offset <= 45; offset += 1) {
    const candidates = preferBackward
      ? [addDaysToDateString(first, -offset), addDaysToDateString(first, offset)]
      : [addDaysToDateString(first, offset), addDaysToDateString(first, -offset)];

    for (const candidate of candidates) {
      if (!candidate) continue;

      const clampedCandidate = clamp(candidate);

      if (!usedDates.has(clampedCandidate)) {
        return clampedCandidate;
      }
    }
  }

  return first;
}

function getEventCampaignDaysBeforeEvent({
  campaign,
  postPlan,
  timeZone = DEFAULT_TIME_ZONE,
}) {
  const todayDateString = getDateInputValueInTimeZone(new Date(), timeZone);
  const daysUntilEvent = getDaysBetweenDateStrings(
    todayDateString,
    campaign?.event_date
  );

  const maxFutureDaysBeforeEvent = Math.max(
    Math.floor(Number(daysUntilEvent) || 0),
    0
  );

  const defaultDays = getFutureCampaignDaysBeforeEvent(
    postPlan.length,
    maxFutureDaysBeforeEvent
  );

  return postPlan.map((postPlanItem, index) => {
    const rawDays = Number(postPlanItem?.days_before_event);
    const preferredDays = Number.isFinite(rawDays)
      ? Math.max(Math.round(rawDays), 0)
      : defaultDays[index] ?? 0;

    return Math.min(preferredDays, maxFutureDaysBeforeEvent);
  });
}

function clampNumberValue(value, min, max) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return min;
  }

  return Math.min(Math.max(numericValue, min), max);
}

function getCampaignStrategicText(campaign, postPlanItem = null) {
  return [
    campaign?.title,
    campaign?.description,
    campaign?.prompt_context,
    campaign?.campaign_category,
    campaign?.event_type,
    campaign?.campaign_goal,
    campaign?.target_customer_need,
    campaign?.product_selection_guidance,
    campaign?.website_product_selection_hint,
    campaign?.website_content_strategy,
    postPlanItem?.role,
    postPlanItem?.purpose,
    postPlanItem?.marketing_angle,
    postPlanItem?.campaign_phase,
    postPlanItem?.timing_anchor,
    postPlanItem?.schedule_reason,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getCampaignLeadTimeProfile(campaign) {
  const text = getCampaignStrategicText(campaign);
  const hasLongLeadTimeSignals = /custom|personal|personalized|personalised|made[\s-]?to[\s-]?order|bespoke|tailor|tailored|print|printed|portrait|engraved|engraving|production|produce|delivery|deliver|shipping|ship|order in time|pre[\s-]?order|lead time|appointment|booking|bookable|reservation|limited seats|limited availability|limited capacity|consultation|quote|install|installation|service area|gift|gifts|present|presents|kurs|bokning|beställ|leverans|personlig|personliga|anpassad|skräddarsydd|tryck|porträtt|gravyr|produktion|leveranstid|beställningstid|gåva|gåvor|presenter/.test(text);
  const hasFastActionSignals = /instant|digital download|same[\s-]?day|pickup|pick[\s-]?up|walk[\s-]?in|in stock|ready[\s-]?made|available now|retail|restaurant|cafe|menu|drop[\s-]?in|flash sale|limited[\s-]?time|today only/.test(text);

  if (hasLongLeadTimeSignals && !hasFastActionSignals) {
    return {
      isLeadTimeSensitive: true,
      deadlineLeadDays: 10,
      conversionLeadDays: 16,
      trustLeadDays: 23,
      engagementLeadDays: 30,
      inspirationLeadDays: 38,
    };
  }

  if (hasLongLeadTimeSignals) {
    return {
      isLeadTimeSensitive: true,
      deadlineLeadDays: 5,
      conversionLeadDays: 10,
      trustLeadDays: 16,
      engagementLeadDays: 22,
      inspirationLeadDays: 28,
    };
  }

  return {
    isLeadTimeSensitive: false,
    deadlineLeadDays: 1,
    conversionLeadDays: 3,
    trustLeadDays: 6,
    engagementLeadDays: 9,
    inspirationLeadDays: 14,
  };
}

function getCampaignPostIntent(postPlanItem, index, total) {
  const explicitAnchor = String(
    postPlanItem?.timing_anchor || postPlanItem?.schedule_anchor || ""
  ).toLowerCase();
  const text = getCampaignStrategicText(null, postPlanItem);
  const combinedText = `${explicitAnchor} ${text}`;

  if (/relationship|soft|community|gratitude|event|main day|day of|celebrate|thank|hälsning|fira|relations/.test(combinedText)) {
    return "event";
  }

  if (/last[_\s-]?chance|last call|final|deadline|urgent|urgency|sista|slutlig|act now|deadline_before_event/.test(combinedText)) {
    return "deadline";
  }

  if (/offer|sale|discount|deal|buy|order|shop|book|product[_\s-]?push|product push|ready[_\s-]?to[_\s-]?buy|conversion|köp|beställ|boka|köptryck/.test(combinedText)) {
    return "conversion";
  }

  if (/trust|proof|review|testimonial|process|quality|faq|guide|confidence|trygg|förtroende|reassurance/.test(combinedText)) {
    return "trust";
  }

  if (/engagement|question|comment|share|save|poll|react|conversation|kommentera|fråga|reflektera|publiken/.test(combinedText)) {
    return "engagement";
  }

  if (/product[_\s-]?discovery|product[_\s-]?idea|discover|inspiration|awareness|idea|tips|guide|inspir/.test(combinedText)) {
    return "inspiration";
  }

  if (index === 0) return "inspiration";
  if (index === total - 1) return "deadline";

  return "middle";
}

function shouldUseEventGreetingPost(campaign, count) {
  const safeCount = Math.max(Math.round(Number(count) || 1), 1);
  return Boolean(campaign?.event_date) && safeCount >= 4;
}

function getTimingAnchorForIntent(intent) {
  if (intent === "event") return "relationship_event";
  if (intent === "deadline") return "deadline_before_event";
  if (intent === "conversion") return "conversion_before_deadline";
  return intent || "start";
}

function getMarketingAngleForIntent(intent, fallback = "main") {
  if (intent === "event") return "main";
  if (intent === "deadline") return "urgency";
  if (intent === "conversion") return "product_push";
  if (intent === "trust") return "trust";
  if (intent === "engagement") return "engagement";
  if (intent === "inspiration") return "awareness";
  return fallback;
}

function normalizeCampaignPlanForTiming(campaign, postPlan) {
  const items = Array.isArray(postPlan) ? postPlan : [];
  const total = items.length;

  return items.map((item, index) => {
    const intent = getCampaignPostIntent(item, index, total);
    const strategy = getStrategicCampaignStep(total, index, item || {});

    return {
      ...(item || {}),
      intended_intent: intent,
      timing_anchor:
        item?.timing_anchor || getTimingAnchorForIntent(intent),
      marketing_angle:
        normalizeStrategyValue(item?.marketing_angle) ||
        getMarketingAngleForIntent(intent, strategy.marketing_angle),
      campaign_phase:
        normalizeStrategyValue(item?.campaign_phase) ||
        (intent === "event"
          ? "relationship_event"
          : intent === "deadline"
          ? "last_chance"
          : strategy.campaign_phase),
      customer_stage:
        normalizeStrategyValue(item?.customer_stage) || strategy.customer_stage,
      cta_strength:
        normalizeStrategyValue(item?.cta_strength) || strategy.cta_strength,
    };
  });
}

function getFallbackDaysBeforeEventForIntent(campaign, intent, index, total) {
  const leadTimeProfile = getCampaignLeadTimeProfile(campaign);

  if (intent === "event" && shouldUseEventGreetingPost(campaign, total)) {
    return 0;
  }

  if (intent === "deadline") return leadTimeProfile.deadlineLeadDays;
  if (intent === "conversion") return leadTimeProfile.conversionLeadDays;
  if (intent === "trust") return leadTimeProfile.trustLeadDays;
  if (intent === "engagement") return leadTimeProfile.engagementLeadDays;
  if (intent === "inspiration") return leadTimeProfile.inspirationLeadDays;

  const progress = total <= 1 ? 0.5 : index / Math.max(total - 1, 1);
  const maxLeadDays = leadTimeProfile.isLeadTimeSensitive
    ? leadTimeProfile.inspirationLeadDays
    : Math.max(leadTimeProfile.inspirationLeadDays, total * 2);

  return Math.max(
    leadTimeProfile.deadlineLeadDays,
    Math.round(maxLeadDays * (1 - progress))
  );
}

function getPostPlanDaysBeforeEvent(campaign, postPlanItem, index, total) {
  const explicitDays = Number(postPlanItem?.days_before_event);

  if (Number.isFinite(explicitDays) && explicitDays >= 0) {
    return Math.min(Math.round(explicitDays), 365);
  }

  return getFallbackDaysBeforeEventForIntent(
    campaign,
    postPlanItem?.intended_intent || getCampaignPostIntent(postPlanItem, index, total),
    index,
    total
  );
}

function isValidCampaignTimeString(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
}

function getPostPlanPublishTime(postPlanItem, intent, timingAnchor) {
  const candidates = [
    postPlanItem?.publish_time,
    postPlanItem?.recommended_publish_time,
    postPlanItem?.preferred_publish_time,
  ];

  const validTime = candidates.find(isValidCampaignTimeString);

  if (validTime) {
    return validTime;
  }

  return getRecommendedCampaignPublishTime(intent, timingAnchor);
}

function getCampaignTargetDateForIntent({
  intent,
  safePeriodStartDate,
  safePeriodEndDate,
  purchaseDeadlineDate,
  leadTimeProfile,
  periodLengthDays,
  index,
  total,
  postPlanItem,
}) {
  const explicitDate =
    postPlanItem?.scheduled_date ||
    postPlanItem?.publish_date ||
    postPlanItem?.recommended_date;

  if (explicitDate && getDatePartsFromDateString(explicitDate)) {
    return explicitDate;
  }

  const explicitDays = Number(postPlanItem?.days_before_event);

  if (Number.isFinite(explicitDays) && explicitDays >= 0) {
    return addDaysToDateString(
      safePeriodEndDate,
      -Math.min(Math.round(explicitDays), Math.max(periodLengthDays, 0))
    );
  }

  const daysBeforeEnd = (days) =>
    addDaysToDateString(
      safePeriodEndDate,
      -Math.min(days, Math.max(periodLengthDays, 0))
    );
  const daysAfterStart = (ratio) =>
    addDaysToDateString(
      safePeriodStartDate,
      Math.max(0, Math.round(periodLengthDays * ratio))
    );

  if (intent === "event") return safePeriodEndDate;
  if (intent === "deadline") return purchaseDeadlineDate;
  if (intent === "conversion") return daysBeforeEnd(leadTimeProfile.conversionLeadDays);
  if (intent === "trust") return leadTimeProfile.isLeadTimeSensitive ? daysBeforeEnd(leadTimeProfile.trustLeadDays) : daysAfterStart(0.45);
  if (intent === "engagement") return leadTimeProfile.isLeadTimeSensitive ? daysBeforeEnd(leadTimeProfile.engagementLeadDays) : daysAfterStart(0.28);
  if (intent === "inspiration") return leadTimeProfile.isLeadTimeSensitive ? daysBeforeEnd(leadTimeProfile.inspirationLeadDays) : safePeriodStartDate;

  return daysAfterStart(total <= 1 ? 0 : index / Math.max(total - 1, 1));
}

function buildFixedEventCampaignSchedule({
  campaign,
  postPlan,
  timeZone = DEFAULT_TIME_ZONE,
}) {
  const normalizedPostPlan = normalizeCampaignPlanForTiming(campaign, postPlan);
  const total = normalizedPostPlan.length;
  const todayDateString = getDateInputValueInTimeZone(new Date(), timeZone);
  const eventDate = campaign?.event_date || todayDateString;
  const safeMinDate = getLaterDateString(
    todayDateString,
    addDaysToDateString(eventDate, -365)
  );
  const leadTimeProfile = getCampaignLeadTimeProfile(campaign);
  const purchaseDeadlineDate = leadTimeProfile.isLeadTimeSensitive
    ? getLaterDateString(
        safeMinDate,
        addDaysToDateString(eventDate, -leadTimeProfile.deadlineLeadDays)
      )
    : eventDate;
  const usedDates = new Set();

  const scheduledItems = normalizedPostPlan.map((postPlanItem, index) => {
    const intent = postPlanItem.intended_intent || getCampaignPostIntent(postPlanItem, index, total);
    const timingAnchor = postPlanItem.timing_anchor || getTimingAnchorForIntent(intent);
    const daysBeforeEvent = getPostPlanDaysBeforeEvent(campaign, postPlanItem, index, total);
    const targetDate = addDaysToDateString(eventDate, -daysBeforeEvent);
    const isFinalRelationshipPost = intent === "event" || timingAnchor === "relationship_event";
    const maxDate =
      !isFinalRelationshipPost && leadTimeProfile.isLeadTimeSensitive
        ? purchaseDeadlineDate
        : eventDate;
    const scheduledDate = getUniqueDateNearTarget({
      targetDate,
      usedDates,
      minDate: safeMinDate,
      maxDate: getLaterDateString(maxDate, safeMinDate),
      preferBackward: intent === "deadline" || isFinalRelationshipPost,
    });
    const actualDaysBeforeEvent = Math.max(
      getDaysBetweenDateStrings(scheduledDate, eventDate) || 0,
      0
    );

    usedDates.add(scheduledDate);

    return {
      startDate: scheduledDate,
      weekday: getWeekdayFromDateString(scheduledDate, timeZone),
      publishTime: getPostPlanPublishTime(postPlanItem, intent, timingAnchor),
      daysBeforeEvent: actualDaysBeforeEvent,
      timingAnchor,
      originalIndex: index,
      postPlanItem: {
        ...postPlanItem,
        days_before_event: actualDaysBeforeEvent,
        timing_anchor: timingAnchor,
      },
      intent,
    };
  });

  return scheduledItems.sort((a, b) => {
    if (a.startDate === b.startDate) return a.originalIndex - b.originalIndex;
    return a.startDate < b.startDate ? -1 : 1;
  });
}

function buildDateRangeCampaignSchedule({
  campaign,
  postPlan,
  timeZone = DEFAULT_TIME_ZONE,
}) {
  const todayDateString = getDateInputValueInTimeZone(new Date(), timeZone);
  const periodStartDate = campaign?.start_date || campaign?.event_date || todayDateString;
  const periodEndDate = campaign?.end_date || campaign?.event_date || periodStartDate;
  const safePeriodStartDate = getClampedFutureDateString(periodStartDate, timeZone);
  const safePeriodEndDate = getLaterDateString(periodEndDate, safePeriodStartDate);
  const periodLengthDays = Math.max(
    getDaysBetweenDateStrings(safePeriodStartDate, safePeriodEndDate) || 0,
    0
  );

  const leadTimeProfile = getCampaignLeadTimeProfile(campaign);
  const deadlineOffset = Math.min(
    leadTimeProfile.deadlineLeadDays,
    Math.max(periodLengthDays - 1, 0)
  );
  const purchaseDeadlineDate = getLaterDateString(
    safePeriodStartDate,
    addDaysToDateString(safePeriodEndDate, -deadlineOffset)
  );
  const normalizedPostPlan = normalizeCampaignPlanForTiming(campaign, postPlan);
  const usedDates = new Set();
  const total = normalizedPostPlan.length;

  const scheduledItems = normalizedPostPlan.map((postPlanItem, index) => {
    const intent = postPlanItem.intended_intent || getCampaignPostIntent(postPlanItem, index, total);
    const timingAnchor = postPlanItem.timing_anchor || getTimingAnchorForIntent(intent);
    const isFinalRelationshipPost = intent === "event" || timingAnchor === "relationship_event" || timingAnchor === "end";
    const maxDate = isFinalRelationshipPost ? safePeriodEndDate : purchaseDeadlineDate;
    const minDate = safePeriodStartDate;
    const targetDate = getCampaignTargetDateForIntent({
      intent,
      safePeriodStartDate,
      safePeriodEndDate,
      purchaseDeadlineDate,
      leadTimeProfile,
      periodLengthDays,
      index,
      total,
      postPlanItem,
    });

    const scheduledDate = getUniqueDateNearTarget({
      targetDate,
      usedDates,
      minDate,
      maxDate: getLaterDateString(maxDate, minDate),
      preferBackward: intent === "deadline" || isFinalRelationshipPost,
    });

    usedDates.add(scheduledDate);

    const daysBeforeCampaignEnd = Math.max(
      getDaysBetweenDateStrings(scheduledDate, safePeriodEndDate) || 0,
      0
    );

    return {
      startDate: scheduledDate,
      weekday: getWeekdayFromDateString(scheduledDate, timeZone),
      publishTime: getPostPlanPublishTime(postPlanItem, intent, timingAnchor),
      daysBeforeEvent: daysBeforeCampaignEnd,
      timingAnchor,
      originalIndex: index,
      postPlanItem: {
        ...postPlanItem,
        days_before_event: daysBeforeCampaignEnd,
        timing_anchor: timingAnchor,
      },
      intent,
    };
  });

  return scheduledItems.sort((a, b) => {
    if (a.startDate === b.startDate) return a.originalIndex - b.originalIndex;
    return a.startDate < b.startDate ? -1 : 1;
  });
}
function getCampaignSearchText(campaign) {
  return [
    campaign?.title,
    campaign?.description,
    campaign?.prompt_context,
    campaign?.website_product_selection_hint,
    campaign?.industry,
    campaign?.event_type,
    campaign?.market,
    Array.isArray(campaign?.campaign_angles)
      ? campaign.campaign_angles.join(" ")
      : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
function getCampaignProductSelectionHint(campaign) {
  return String(campaign?.website_product_selection_hint || "").trim();
}

function getCampaignFormatDecisionText(campaign, postPlanItem = null) {
  return [
    getCampaignStrategicText(campaign, postPlanItem),
    campaign?.website_content_strategy,
    campaign?.website_content_fit,
    campaign?.title,
    campaign?.description,
    campaign?.campaign_goal,
    campaign?.target_customer_need,
    campaign?.product_selection_guidance,
    campaign?.website_product_selection_hint,
    postPlanItem?.role,
    postPlanItem?.purpose,
    postPlanItem?.marketing_angle,
    postPlanItem?.campaign_phase,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function campaignHasProductWebsiteFit(campaign) {
  const fit = String(campaign?.website_content_fit || "").toLowerCase();
  const strategy = String(campaign?.website_content_strategy || "").toLowerCase();

  return fit !== "weak" && ["product", "support"].includes(strategy);
}

function shouldUseCarouselForCampaignPost(campaign, postPlanItem = {}, index = 0, total = 1) {
  if (!campaignHasProductWebsiteFit(campaign)) {
    return false;
  }

  const intent = postPlanItem?.intended_intent || getCampaignPostIntent(postPlanItem, index, total);
  const timingAnchor = String(postPlanItem?.timing_anchor || "").toLowerCase();
  const text = getCampaignFormatDecisionText(campaign, postPlanItem);

  if (intent === "event" || timingAnchor === "relationship_event") {
    return false;
  }

  if (/last[_\s-]?chance|deadline|final|urgent|urgency|sista|slutlig/.test(text)) {
    return false;
  }

  const strongCarouselSignals = /gift|gifts|present|presents|guide|ideas|idea|collection|favorites|favourites|top|best|compare|comparison|choose|choosing|selection|curated|bundle|range|assortment|theme|holiday|black friday|cyber monday|christmas|xmas|mother|father|halloween|back to school|sommar|summer|jul|mors dag|fars dag|presenter|gåvor|favoriter|utbud|kollektion|jämför|välj|guide/.test(text);

  const marketingAngle = normalizeStrategyValue(postPlanItem?.marketing_angle);
  const campaignPhase = normalizeStrategyValue(postPlanItem?.campaign_phase);
  const carouselFriendlyRole = [
    "product_discovery",
    "guide",
    "comparison",
    "engagement",
    "inspiration",
    "middle",
  ].includes(marketingAngle) || ["middle", "early_middle", "middle_late"].includes(campaignPhase);

  if (strongCarouselSignals && (carouselFriendlyRole || ["inspiration", "conversion", "middle", "engagement"].includes(intent))) {
    return true;
  }

  if (total >= 3 && carouselFriendlyRole && index === Math.max(1, Math.floor(total / 2))) {
    return true;
  }

  if (total >= 4 && index === Math.max(1, Math.floor(total / 2)) && ["inspiration", "middle", "conversion"].includes(intent)) {
    return true;
  }

  return false;
}

function getCampaignSlotContentTypeId(sourceMode) {
  if (sourceMode === "website_carousel") return "carousel_website_item";
  return "manual_prompt";
}

function getCampaignSlotContentFormat(sourceMode) {
  if (sourceMode === "website_carousel") return "carousel";
  return "single_image";
}

function getCampaignSlotContentTypeLabel(campaign, sourceMode) {
  if (sourceMode === "website_carousel") return "Website carousel";
  return campaign?.title || "Campaign post";
}
function getDaysBetweenDateStrings(startDateString, endDateString) {
  const startParts = getDatePartsFromDateString(startDateString);
  const endParts = getDatePartsFromDateString(endDateString);

  if (!startParts || !endParts) return null;

  const startDate = Date.UTC(
    startParts.year,
    startParts.month - 1,
    startParts.day
  );
  const endDate = Date.UTC(endParts.year, endParts.month - 1, endParts.day);

  return Math.round((endDate - startDate) / (1000 * 60 * 60 * 24));
}

function getCampaignMainDateString(campaign) {
  return campaign?.event_date || campaign?.end_date || campaign?.start_date || "";
}

function getVerifiedDaysBeforeCampaignMainDate(campaign, scheduledDate) {
  const mainDate = getCampaignMainDateString(campaign);

  if (!scheduledDate || !mainDate) return null;

  const days = getDaysBetweenDateStrings(scheduledDate, mainDate);

  if (typeof days !== "number" || Number.isNaN(days)) return null;

  return Math.max(days, 0);
}

function getCampaignScheduleFacts(campaign, postPlanItem = {}) {
  const scheduledDate =
    postPlanItem?.scheduled_date ||
    postPlanItem?.publish_date ||
    postPlanItem?.recommended_date ||
    "";
  const mainDate = getCampaignMainDateString(campaign);
  const verifiedDaysBefore = getVerifiedDaysBeforeCampaignMainDate(
    campaign,
    scheduledDate
  );

  return {
    scheduledDate,
    mainDate,
    verifiedDaysBefore,
  };
}

function getCampaignScheduleFactText(campaign, postPlanItem = {}) {
  const { scheduledDate, mainDate, verifiedDaysBefore } =
    getCampaignScheduleFacts(campaign, postPlanItem);

  if (!scheduledDate || !mainDate) return "";

  return [
    `Scheduled post date: ${scheduledDate}.`,
    `Main campaign date: ${mainDate}.`,
    typeof verifiedDaysBefore === "number"
      ? `Exact calendar distance to main campaign date: ${verifiedDaysBefore} days.`
      : "",
    "If the post or image mentions a countdown, days left or days remaining, it must use the exact calendar distance above. Do not use campaign sequence distance or distance to another post.",
    "If there is any uncertainty about the exact countdown, do not include a day-countdown number in the post or image.",
  ]
    .filter(Boolean)
    .join("\n");
}

function getCampaignContentSourceMode(campaign, postPlanItem, index, total) {
  const websiteContentFit = String(
    campaign?.website_content_fit || ""
  ).toLowerCase();

  const websiteContentStrategy = String(
    campaign?.website_content_strategy || ""
  ).toLowerCase();

  const roleText = `${postPlanItem?.role || ""} ${
    postPlanItem?.purpose || ""
  }`.toLowerCase();

  const isLaterCampaignPost =
    index >= Math.max(1, Math.floor(total / 2)) ||
    /reminder|final|push|spotlight|highlight|cta|offer|gift|book|buy|order|shop/.test(
      roleText
    );

  if (websiteContentFit === "weak" || websiteContentStrategy === "none") {
    return "generic_campaign";
  }

  if (shouldUseCarouselForCampaignPost(campaign, postPlanItem, index, total)) {
    return "website_carousel";
  }

  if (websiteContentFit === "strong") {
    if (websiteContentStrategy === "product") {
      return isLaterCampaignPost
        ? "website_product"
        : "mixed_campaign_and_website";
    }

    if (websiteContentStrategy === "service") {
      return isLaterCampaignPost
        ? "website_service"
        : "mixed_campaign_and_website";
    }

    if (websiteContentStrategy === "support") {
      return "mixed_campaign_and_website";
    }
  }

  if (websiteContentFit === "medium") {
    if (websiteContentStrategy === "product" && isLaterCampaignPost) {
      return "mixed_campaign_and_website";
    }

    if (websiteContentStrategy === "service" && isLaterCampaignPost) {
      return "mixed_campaign_and_website";
    }

    if (websiteContentStrategy === "support") {
      return "mixed_campaign_and_website";
    }

    return "generic_campaign";
  }

  const campaignText = getCampaignSearchText(campaign);

  const hasProductIntent =
    /shop|store|ecommerce|e-commerce|product|products|gift|gifts|present|sale|discount|offer|commercial|shopping|seasonal|collection|launch|buy|order/.test(
      campaignText
    );

  const hasServiceIntent =
    /service|services|book|booking|appointment|treatment|consultation|cleaning|clearing|repair|quote|visit|call|contact/.test(
      campaignText
    );

  if (hasProductIntent && isLaterCampaignPost) {
    return "website_product";
  }

  if (hasProductIntent) {
    return "mixed_campaign_and_website";
  }

  if (hasServiceIntent && isLaterCampaignPost) {
    return "website_service";
  }

  if (hasServiceIntent) {
    return "mixed_campaign_and_website";
  }

  return "generic_campaign";
}

function shouldUseWebsiteContentForCampaign(sourceMode, campaign = null) {
  const websiteContentFit = String(
    campaign?.website_content_fit || ""
  ).toLowerCase();

  const websiteContentStrategy = String(
    campaign?.website_content_strategy || ""
  ).toLowerCase();

  if (websiteContentFit === "weak" || websiteContentStrategy === "none") {
    return false;
  }

  return ["website_product", "website_service", "website_carousel"].includes(sourceMode);
}

function getCampaignSourceInstruction(sourceMode, campaign = null) {
  const websiteContentFit = String(
    campaign?.website_content_fit || ""
  ).toLowerCase();

  const websiteContentStrategy = String(
    campaign?.website_content_strategy || ""
  ).toLowerCase();

  const productSelectionHint = getCampaignProductSelectionHint(campaign);

  const productSelectionInstruction = productSelectionHint
    ? ` Product selection hint: ${productSelectionHint}. Use this hint when choosing website content. Do not pick a random product or service just because it exists on the website.`
    : "";

  if (websiteContentFit === "weak" || websiteContentStrategy === "none") {
    return "Do not use website products or services for this post. The website content match is weak, so keep the post focused on the campaign theme and audience value.";
  }

  if (sourceMode === "website_carousel") {
    return `Create this as a website product carousel. Select several relevant products from the brand website that share one clear campaign theme. The product selection must follow the campaign context and product selection hint, such as gift recipient, holiday, seasonal need, customer stage or buying intent. Do not choose random unrelated products just because they exist. Use only product details that clearly exist on the website. Do not invent products, prices, discounts, stock, delivery promises or features. If at least five verified matching products with images cannot be found, the automation should stop with an error instead of silently creating a generic fallback.${productSelectionInstruction}`;
  }

  if (sourceMode === "website_product") {
    return `Use a relevant product from the brand website. Connect the product naturally to the campaign. Use only product details that clearly exist on the website. Do not invent product details, prices, stock, delivery promises or discounts. If no verified matching product can be found, the automation should stop with an error instead of silently creating a generic AI fallback.${productSelectionInstruction}`;
  }

  if (sourceMode === "website_service") {
    return `Use a relevant service or offer from the brand website. Connect the service naturally to the campaign. Use only details that clearly exist on the website. If no verified matching website item can be found, the automation should stop with an error instead of silently creating a generic AI fallback.${productSelectionInstruction}`;
  }

  if (sourceMode === "mixed_campaign_and_website") {
    return `If relevant website content is available, use it as supporting context, but keep the main focus on the campaign theme. Do not force a product or service if the match is not natural.${productSelectionInstruction}`;
  }

  return "Do not force a product or service into this post. Keep the focus on the campaign theme and the audience value.";
}

function getCampaignTimingInstruction(campaign, postPlanItemOrDaysBeforeEvent) {
  const campaignTitle = campaign?.title || "the campaign";
  const hasDateRange = Boolean(campaign?.start_date && campaign?.end_date);
  const daysBeforeEvent =
    typeof postPlanItemOrDaysBeforeEvent === "number"
      ? postPlanItemOrDaysBeforeEvent
      : typeof postPlanItemOrDaysBeforeEvent?.days_before_event === "number"
      ? postPlanItemOrDaysBeforeEvent.days_before_event
      : null;
  const timingAnchor =
    typeof postPlanItemOrDaysBeforeEvent === "object"
      ? postPlanItemOrDaysBeforeEvent?.timing_anchor
      : null;

  if (campaign?.event_date && typeof daysBeforeEvent === "number") {
    if (timingAnchor === "relationship_event" || daysBeforeEvent === 0) {
      return `This post is for the main campaign date itself. If buying, booking or delivery may now be too late, make it a warm greeting, thank-you, celebration or relationship-building post rather than a hard sales push.`;
    }

    if (timingAnchor === "deadline_before_event") {
      return `This post is the final realistic action reminder before ${campaignTitle}. Make the deadline clear without pretending customers can wait until the main date if ordering, booking or delivery needs lead time.`;
    }

    if (timingAnchor === "conversion_before_deadline") {
      return `This post is placed while customers still have time to act before ${campaignTitle}. Make the product, service or next step concrete.`;
    }

    if (daysBeforeEvent === 1) {
      return `This post is for the day before ${campaignTitle}. Mention that it is tomorrow only if same-day action is realistic; otherwise keep it softer.`;
    }

    return `This post is ${daysBeforeEvent} days before ${campaignTitle}. Mention the timing naturally and keep the message aligned with whether customers still have time to act.`;
  }

  if (hasDateRange) {
    if (timingAnchor === "deadline_before_event") {
      return `This post is placed before the final campaign date because the audience may need time to order, book, decide, receive delivery or prepare. Make it a clear final reminder without pretending it is still possible later if timing would be unrealistic.`;
    }

    if (timingAnchor === "conversion_before_deadline") {
      return `This post is placed in the active decision window before the final campaign date. Make the product, service or next step feel concrete while the audience still has time to act.`;
    }

    if (timingAnchor === "relationship_event") {
      return `This post is placed on or near the final campaign date. Because buying or booking may be too late, make it a softer relationship-building post rather than a hard sales push.`;
    }

    if (timingAnchor === "trust") {
      return `This post is placed before the buying decision window. Build trust, reduce doubt and make the audience feel safe taking the next step later.`;
    }

    if (timingAnchor === "engagement") {
      return `This post is placed early or mid campaign. Encourage recognition, comments, saves or reflection so the audience becomes warmer before sales-focused posts.`;
    }

    if (timingAnchor === "end") {
      return `This post is placed near the end of the campaign period. Use it only as a final reminder when the audience still has a realistic chance to act.`;
    }

    if (timingAnchor === "middle") {
      return `This post is placed during the campaign period. Build interest, trust or product/service consideration connected to the campaign.`;
    }

    if (typeof daysBeforeEvent === "number" && daysBeforeEvent > 0) {
      return `This post is ${daysBeforeEvent} days before the final campaign date. Use the timing naturally and keep the message aligned with whether the audience still has time to act.`;
    }

    return `This post is placed at the start of the campaign period. Introduce the campaign clearly and make the timing feel relevant.`;
  }

  return `This campaign has a flexible date. Do not mention days left. Instead, give this post a clear campaign role and make it different from the other posts.`;
}

function buildCampaignPostPlanItem({
  campaign,
  postPlanItem,
  index,
  total,
  daysBeforeEvent = null,
  timingAnchor = null,
}) {
  const campaignTitle = campaign?.title || "Campaign";
  const hasFixedDate = Boolean(campaign?.event_date);
  const hasDateRange = Boolean(campaign?.start_date && campaign?.end_date);
  const resolvedTimingAnchor =
    timingAnchor || getCampaignPlanTimingAnchor(postPlanItem, index, total);
  const strategy = getStrategicCampaignStep(total, index, postPlanItem);

  const aiRoleIsUseful =
    postPlanItem?.role && !/^campaign post/i.test(postPlanItem.role);

  const role = aiRoleIsUseful
    ? postPlanItem.role
    : getCampaignAngleLabel(strategy.marketing_angle);

  const purpose =
    postPlanItem?.purpose || getCampaignStrategyPurpose(strategy.marketing_angle);

  let timingNote =
    "This campaign has a flexible date. Focus on the post role and make it different from the other campaign posts.";

  if (hasFixedDate) {
    if (daysBeforeEvent === 0) {
      timingNote = `This post is scheduled for ${campaignTitle} itself. Make it feel timely and relevant today.`;
    } else if (daysBeforeEvent === 1) {
      timingNote = `This post is scheduled the day before ${campaignTitle}. It can work as a final reminder.`;
    } else if (daysBeforeEvent <= 3) {
      timingNote = `This post is scheduled close to ${campaignTitle}. Make the timing feel important without exaggerating.`;
    } else if (daysBeforeEvent <= 7) {
      timingNote = `This post is scheduled about a week before ${campaignTitle}. Connect the campaign to a useful idea, product, service or action.`;
    } else {
      timingNote = `This post is scheduled early in the campaign. Build interest before the campaign date gets close.`;
    }
  } else if (hasDateRange) {
    if (resolvedTimingAnchor === "relationship_event") {
      timingNote = `This post is scheduled for the main/final campaign date for ${campaignTitle}. Make it softer, emotional and relationship-building rather than a hard sales push.`;
    } else if (resolvedTimingAnchor === "deadline_before_event") {
      timingNote = `This post is scheduled before the final campaign date because the audience may need time to order, book, decide, receive delivery or prepare. Make it a clear final reminder.`;
    } else if (resolvedTimingAnchor === "conversion_before_deadline") {
      timingNote = `This post is scheduled while the audience still has time to act. Make the product, service or next step concrete.`;
    } else if (resolvedTimingAnchor === "trust") {
      timingNote = `This post is scheduled before the active buying window. Build reassurance, proof and confidence.`;
    } else if (resolvedTimingAnchor === "engagement") {
      timingNote = `This post is scheduled early or mid campaign. Warm up the audience through recognition, comments or reflection.`;
    } else {
      timingNote = `This post is scheduled early in the campaign period for ${campaignTitle}. Introduce the need, idea or opportunity clearly.`;
    }
  }

  return {
    ...postPlanItem,
    role,
    purpose,
    campaign_phase: strategy.campaign_phase,
    marketing_angle: strategy.marketing_angle,
    customer_stage: strategy.customer_stage,
    cta_strength: strategy.cta_strength,
    campaign_post_index: index + 1,
    campaign_post_count: total,
    campaign_goal: campaign?.campaign_goal || "",
    target_customer_need: campaign?.target_customer_need || "",
    strategy_notes: getCampaignStrategyInstruction(strategy),
    timing_note: timingNote,
    days_before_event: hasFixedDate || hasDateRange ? daysBeforeEvent : null,
    timing_anchor: resolvedTimingAnchor,
  };
}

function buildCampaignPrompt(campaign, postPlanItem, index) {
  const campaignTitle = campaign?.title || "Campaign";
  const campaignDate = getCampaignDateLabel(campaign);
  const campaignContext =
    campaign?.prompt_context ||
    campaign?.description ||
    "Create a campaign-related social media post.";

  const postRole = postPlanItem?.role || `Campaign post ${index + 1}`;
  const postPurpose =
    postPlanItem?.purpose || "Create a useful campaign-related post.";

  const relevanceReason = campaign?.relevance_reason || "";
  const daysBeforeEvent =
    typeof postPlanItem?.days_before_event === "number"
      ? postPlanItem.days_before_event
      : null;

  const sourceMode =
    postPlanItem?.content_source_mode ||
    getCampaignContentSourceMode(campaign, postPlanItem, index, 5);

  const languageInstruction = campaign?.language
    ? `Write the post in ${campaign.language}.`
    : "Use the best language for the brand.";

  const timingInstruction = getCampaignTimingInstruction(
    campaign,
    postPlanItem
  );
  const scheduleFactText = getCampaignScheduleFactText(
    campaign,
    postPlanItem
  );
  const scheduleFacts = getCampaignScheduleFacts(campaign, postPlanItem);
  const verifiedDaysBeforeEvent =
    typeof scheduleFacts.verifiedDaysBefore === "number"
      ? scheduleFacts.verifiedDaysBefore
      : daysBeforeEvent;

  const visibleOpening = campaign?.event_date
    ? verifiedDaysBeforeEvent === 0
      ? `This is the campaign-day post for ${campaignTitle}. Clearly highlight that today is ${campaignTitle}. Do not say it is before ${campaignTitle}.`
      : postPlanItem?.timing_anchor === "relationship_event"
      ? `This is the main-date relationship post for ${campaignTitle}. Make it a warm greeting, thank-you or brand-building post rather than hard selling.`
      : postPlanItem?.timing_anchor === "deadline_before_event"
      ? `This is the final realistic action reminder before ${campaignTitle}. Do not place the buying pressure on the main date if customers need lead time.`
      : postPlanItem?.timing_anchor === "conversion_before_deadline"
      ? `This post is placed while customers still have time to act before ${campaignTitle}. Make the product or next step concrete without inventing offers.`
      : verifiedDaysBeforeEvent === 1
      ? `This is the day before ${campaignTitle}. Mention that ${campaignTitle} is tomorrow only if that is useful and realistic.`
      : typeof verifiedDaysBeforeEvent === "number"
      ? `This post is ${verifiedDaysBeforeEvent} days before ${campaignTitle}. Use that exact timing as the main angle.`
      : `This is a campaign post before ${campaignTitle}. Do not mention an exact day-countdown unless the exact dates are provided.`
    : campaign?.start_date && campaign?.end_date
    ? postPlanItem?.timing_anchor === "relationship_event"
      ? `This is the soft main/final date post for ${campaignTitle}. Focus on emotion, relationship and brand warmth rather than hard selling.`
      : postPlanItem?.timing_anchor === "deadline_before_event"
      ? `This is the final realistic action reminder before the main/final campaign date for ${campaignTitle}.`
      : postPlanItem?.timing_anchor === "conversion_before_deadline"
      ? `This is a product/service decision post while the audience still has time to act.`
      : postPlanItem?.timing_anchor === "trust"
      ? `This is a trust-building post before the buying decision window.`
      : postPlanItem?.timing_anchor === "engagement"
      ? `This is an engagement post early or mid campaign to warm up the audience.`
      : `This is an early campaign post for ${campaignTitle}. Introduce the idea clearly.`
    : `This is a flexible-date campaign post. Do not mention days left. Focus on this specific role: ${postRole}.`;

  return [
    visibleOpening,
    `This is post ${postPlanItem?.campaign_post_index || index + 1} of ${
      postPlanItem?.campaign_post_count || "the campaign sequence"
    }.`,
    `Campaign phase: ${postPlanItem?.campaign_phase || "campaign_post"}.`,
    `Marketing angle: ${postPlanItem?.marketing_angle || "main"}.`,
    `Customer stage: ${postPlanItem?.customer_stage || "warm"}.`,
    `CTA strength: ${postPlanItem?.cta_strength || "medium"}.`,
    postPlanItem?.campaign_goal
      ? `Campaign goal: ${postPlanItem.campaign_goal}.`
      : "",
    postPlanItem?.target_customer_need
      ? `Target customer need: ${postPlanItem.target_customer_need}.`
      : "",
    postPlanItem?.strategy_notes
      ? `Strategic instruction: ${postPlanItem.strategy_notes}`
      : "",
    postPlanItem?.timing_note ? `Timing note: ${postPlanItem.timing_note}` : "",
    `Post role: ${postRole}.`,
    `Post purpose: ${postPurpose}.`,
    `Campaign: ${campaignTitle}.`,
    `Campaign timing: ${campaignDate}.`,
    scheduleFactText,
    timingInstruction,
    `Campaign context: ${campaignContext}`,
    getCampaignSourceInstruction(sourceMode, campaign),
    relevanceReason ? `Why this fits the brand: ${relevanceReason}` : "",
    languageInstruction,
    "This post must clearly lift up the campaign theme, day or celebration.",
    "Make this post different from the other campaign posts. Do not repeat the same angle.",
    "Do not invent discounts, prices, events, guarantees, delivery promises, opening hours, locations or product claims that are not known.",
    "Make it useful, trustworthy, natural and suitable for social media.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildCampaignSummary(campaign, postPlanItem, index) {
  const campaignTitle = campaign?.title || "campaign";
  const marketingAngle = postPlanItem?.marketing_angle || "main";
  const angleLabel = getCampaignAngleLabel(marketingAngle);
  const stageLabel = getCustomerStageLabel(postPlanItem?.customer_stage);
  const ctaStrength = postPlanItem?.cta_strength || "medium";

  const purpose =
    postPlanItem?.purpose || getCampaignStrategyPurpose(marketingAngle);

  const daysBeforeEvent =
    typeof postPlanItem?.days_before_event === "number"
      ? postPlanItem.days_before_event
      : null;

  let timingText = "";

  if (campaign?.event_date && typeof daysBeforeEvent === "number") {
    if (daysBeforeEvent === 0) {
      timingText = ` Scheduled for ${campaignTitle} itself.`;
    } else if (daysBeforeEvent === 1) {
      timingText = ` Scheduled as a final reminder the day before ${campaignTitle}.`;
    } else {
      timingText = ` Scheduled ${daysBeforeEvent} days before ${campaignTitle}.`;
    }
  } else if (campaign?.start_date && campaign?.end_date) {
    if (postPlanItem?.timing_anchor === "relationship_event") {
      timingText = " Scheduled as a soft main/final date post.";
    } else if (postPlanItem?.timing_anchor === "deadline_before_event") {
      timingText = " Scheduled before the final date while action is still realistic.";
    } else if (postPlanItem?.timing_anchor === "conversion_before_deadline") {
      timingText = " Scheduled in the active decision window.";
    } else if (postPlanItem?.timing_anchor === "trust") {
      timingText = " Scheduled before the buying decision window.";
    } else if (postPlanItem?.timing_anchor === "engagement") {
      timingText = " Scheduled early or mid campaign to warm up the audience.";
    } else {
      timingText = " Scheduled early in the campaign period.";
    }
  }

  return `${angleLabel}: ${purpose} ${stageLabel}. CTA: ${ctaStrength}.${timingText}`;
}

function buildCampaignImagePrompt(campaign, postPlanItem, index) {
  const campaignTitle = campaign?.title || "campaign";
  const postRole = postPlanItem?.role || `Campaign post ${index + 1}`;
  const postPurpose =
    postPlanItem?.purpose || getCampaignStrategyPurpose(postPlanItem?.marketing_angle);

  const marketingAngle = postPlanItem?.marketing_angle || "main";
  const customerStage = postPlanItem?.customer_stage || "warm";
  const ctaStrength = postPlanItem?.cta_strength || "medium";
  const scheduleFactText = getCampaignScheduleFactText(
    campaign,
    postPlanItem
  );

  return [
    `Create a high-quality social media image for the campaign "${campaignTitle}".`,
    `This image belongs to post ${postPlanItem?.campaign_post_index || index + 1} of ${
      postPlanItem?.campaign_post_count || "the campaign sequence"
    }.`,
    `Post role: ${postRole}.`,
    `Post purpose: ${postPurpose}.`,
    `Marketing angle: ${marketingAngle}.`,
    `Customer stage: ${customerStage}.`,
    `CTA strength: ${ctaStrength}.`,
    scheduleFactText,
    "Countdown accuracy rule: If the image includes readable countdown text such as '7 days left', 'dagar kvar' or similar, it must match the exact calendar distance from the scheduled post date to the main campaign date. Never base countdown text on the distance to another post in the sequence.",
    "Safer visual rule: Prefer campaign visuals without exact day-countdown numbers unless the schedule facts above make the number completely certain.",
    campaign?.image_guidance ? `Campaign image guidance: ${campaign.image_guidance}.` : "",
    campaign?.tone_guidance ? `Tone guidance: ${campaign.tone_guidance}.` : "",
    campaign?.product_selection_guidance
      ? `Product selection guidance: ${campaign.product_selection_guidance}.`
      : "",
    "Make the image feel professional, clean and suitable for a small business social media post.",
    "Do not include fake logos, fake discounts, fake reviews or fake guarantees.",
    "If text is used in the image, keep it short, clear and correctly spelled.",
  ]
    .filter(Boolean)
    .join("\n");
}

function createCampaignSlotsFromOpportunity({
  campaign,
  timeZone = DEFAULT_TIME_ZONE,
  defaultPublishTime = "09:00",
}) {
  const recommendedCount = getCampaignRecommendedPostCount(campaign);
  const postPlan = buildCampaignPostPlan(campaign, recommendedCount);
  const hasFixedCampaignDate = Boolean(campaign?.event_date);
  const hasCampaignDateRange = Boolean(campaign?.start_date && campaign?.end_date);

  if (hasFixedCampaignDate) {
    const fixedSchedule = buildFixedEventCampaignSchedule({
      campaign,
      postPlan,
      timeZone,
    });

    const dateUseCounts = {};

    return fixedSchedule.map((schedule, index) => {
      const postPlanItem = schedule.postPlanItem || postPlan[index] || {};
      const startDate = schedule.startDate || campaign.event_date;
      const daysBeforeEvent =
        typeof schedule.daysBeforeEvent === "number" ? schedule.daysBeforeEvent : 0;

      const sameDayIndex = dateUseCounts[startDate] || 0;
      dateUseCounts[startDate] = sameDayIndex + 1;

      const enhancedPostPlanItem = buildCampaignPostPlanItem({
        campaign,
        postPlanItem,
        index,
        total: fixedSchedule.length,
        daysBeforeEvent,
        timingAnchor: schedule.timingAnchor,
      });

      enhancedPostPlanItem.scheduled_date = startDate;
      enhancedPostPlanItem.campaign_main_date = campaign.event_date || null;
      const verifiedFixedDaysBefore = getVerifiedDaysBeforeCampaignMainDate(
        campaign,
        startDate
      );
      if (typeof verifiedFixedDaysBefore === "number") {
        enhancedPostPlanItem.days_before_event = verifiedFixedDaysBefore;
      }

      const contentSourceMode = getCampaignContentSourceMode(
        campaign,
        enhancedPostPlanItem,
        index,
        fixedSchedule.length
      );

      enhancedPostPlanItem.content_source_mode = contentSourceMode;

      return createSlot({
        startDate,
        weekday: schedule.weekday || getWeekdayFromDateString(startDate, timeZone),
        publishTime: getCampaignPublishTime(schedule.publishTime || getRecommendedCampaignPublishTime(schedule.intent, schedule.timingAnchor), sameDayIndex),
        prompt: buildCampaignPrompt(campaign, enhancedPostPlanItem, index),
        imagePrompt: buildCampaignImagePrompt(campaign, enhancedPostPlanItem),
        generateImage: true,
        contentTypeId: getCampaignSlotContentTypeId(contentSourceMode),
        contentTypeLabel: getCampaignSlotContentTypeLabel(campaign, contentSourceMode),
        usesWebsiteContent: shouldUseWebsiteContentForCampaign(
          contentSourceMode,
          campaign
        ),
        contentFormat: getCampaignSlotContentFormat(contentSourceMode),
        isCampaignSlot: true,
        campaignRole: enhancedPostPlanItem.role || "Campaign post",
        campaignSummary: buildCampaignSummary(
          campaign,
          enhancedPostPlanItem,
          index
        ),
        campaignPhase: enhancedPostPlanItem.campaign_phase || "",
        marketingAngle: enhancedPostPlanItem.marketing_angle || "",
        customerStage: enhancedPostPlanItem.customer_stage || "",
        ctaStrength: enhancedPostPlanItem.cta_strength || "",
        campaignPostIndex: enhancedPostPlanItem.campaign_post_index || index + 1,
        campaignPostCount: enhancedPostPlanItem.campaign_post_count || fixedSchedule.length,
        campaignGoal: enhancedPostPlanItem.campaign_goal || "",
        targetCustomerNeed: enhancedPostPlanItem.target_customer_need || "",
        strategyNotes: enhancedPostPlanItem.strategy_notes || "",
        dateLocked: true,
        timeZone,
      });
    });
  }

  if (hasCampaignDateRange) {
    const rangeSchedule = buildDateRangeCampaignSchedule({
      campaign,
      postPlan,
      timeZone,
    });

    return rangeSchedule.map((schedule, index) => {
      const postPlanItem = schedule.postPlanItem || postPlan[index] || {};
      const startDate = schedule.startDate || getSafeCampaignStartDate(campaign, timeZone);
      const enhancedPostPlanItem = buildCampaignPostPlanItem({
        campaign,
        postPlanItem,
        index,
        total: postPlan.length,
        daysBeforeEvent: schedule.daysBeforeEvent,
        timingAnchor: schedule.timingAnchor,
      });

      enhancedPostPlanItem.scheduled_date = startDate;
      enhancedPostPlanItem.campaign_main_date = campaign.end_date || campaign.start_date || null;
      const verifiedRangeDaysBefore = getVerifiedDaysBeforeCampaignMainDate(
        campaign,
        startDate
      );
      if (typeof verifiedRangeDaysBefore === "number") {
        enhancedPostPlanItem.days_before_event = verifiedRangeDaysBefore;
      }

      const contentSourceMode = getCampaignContentSourceMode(
        campaign,
        enhancedPostPlanItem,
        index,
        postPlan.length
      );

      enhancedPostPlanItem.content_source_mode = contentSourceMode;

      return createSlot({
        startDate,
        weekday: schedule.weekday || getWeekdayFromDateString(startDate, timeZone),
        publishTime: schedule.publishTime || getRecommendedTimeForDate(startDate, timeZone),
        prompt: buildCampaignPrompt(campaign, enhancedPostPlanItem, index),
        imagePrompt: buildCampaignImagePrompt(campaign, enhancedPostPlanItem),
        generateImage: true,
        contentTypeId: getCampaignSlotContentTypeId(contentSourceMode),
        contentTypeLabel: getCampaignSlotContentTypeLabel(campaign, contentSourceMode),
        usesWebsiteContent: shouldUseWebsiteContentForCampaign(
          contentSourceMode,
          campaign
        ),
        contentFormat: getCampaignSlotContentFormat(contentSourceMode),
        isCampaignSlot: true,
        campaignRole: enhancedPostPlanItem.role || "Campaign post",
        campaignSummary: buildCampaignSummary(
          campaign,
          enhancedPostPlanItem,
          index
        ),
        campaignPhase: enhancedPostPlanItem.campaign_phase || "",
        marketingAngle: enhancedPostPlanItem.marketing_angle || "",
        customerStage: enhancedPostPlanItem.customer_stage || "",
        ctaStrength: enhancedPostPlanItem.cta_strength || "",
        campaignPostIndex: enhancedPostPlanItem.campaign_post_index || index + 1,
        campaignPostCount: enhancedPostPlanItem.campaign_post_count || postPlan.length,
        campaignGoal: enhancedPostPlanItem.campaign_goal || "",
        targetCustomerNeed: enhancedPostPlanItem.target_customer_need || "",
        strategyNotes: enhancedPostPlanItem.strategy_notes || "",
        dateLocked: true,
        timeZone,
      });
    });
  }

  const fallbackStartDate = getSafeCampaignStartDate(campaign, timeZone);

  const smartSchedule = buildSmartSlotSchedule({
    startDate: fallbackStartDate,
    count: postPlan.length,
    timeZone,
    firstPublishTime: defaultPublishTime,
  });

  return postPlan.map((postPlanItem, index) => {
    const schedule = smartSchedule[index] || {
      startDate: fallbackStartDate,
      weekday: getWeekdayFromDateString(fallbackStartDate, timeZone),
      publishTime: defaultPublishTime,
    };

    const enhancedPostPlanItem = buildCampaignPostPlanItem({
      campaign,
      postPlanItem,
      index,
      total: postPlan.length,
      daysBeforeEvent: null,
      timingAnchor: null,
    });

    const contentSourceMode = getCampaignContentSourceMode(
      campaign,
      enhancedPostPlanItem,
      index,
      postPlan.length
    );

    enhancedPostPlanItem.content_source_mode = contentSourceMode;

    return createSlot({
      startDate: schedule.startDate,
      weekday: schedule.weekday,
      publishTime: schedule.publishTime,
      prompt: buildCampaignPrompt(campaign, enhancedPostPlanItem, index),
      imagePrompt: buildCampaignImagePrompt(campaign, enhancedPostPlanItem),
      generateImage: true,
      contentTypeId: getCampaignSlotContentTypeId(contentSourceMode),
      contentTypeLabel: getCampaignSlotContentTypeLabel(campaign, contentSourceMode),
      usesWebsiteContent: shouldUseWebsiteContentForCampaign(
        contentSourceMode,
        campaign
      ),
      contentFormat: getCampaignSlotContentFormat(contentSourceMode),
      isCampaignSlot: true,
      campaignRole: enhancedPostPlanItem.role || "Campaign post",
      campaignSummary: buildCampaignSummary(
        campaign,
        enhancedPostPlanItem,
        index
      ),
      campaignPhase: enhancedPostPlanItem.campaign_phase || "",
      marketingAngle: enhancedPostPlanItem.marketing_angle || "",
      customerStage: enhancedPostPlanItem.customer_stage || "",
      ctaStrength: enhancedPostPlanItem.cta_strength || "",
      campaignPostIndex: enhancedPostPlanItem.campaign_post_index || index + 1,
      campaignPostCount: enhancedPostPlanItem.campaign_post_count || postPlan.length,
      campaignGoal: enhancedPostPlanItem.campaign_goal || "",
      targetCustomerNeed: enhancedPostPlanItem.target_customer_need || "",
      strategyNotes: enhancedPostPlanItem.strategy_notes || "",
      dateLocked: true,
      timeZone,
    });
  });
}

const platformIconSources = {
  facebook: "/social-icons/facebook.png",
  instagram: "/social-icons/instagram.png",
  linkedin: "/social-icons/linkedin.png",
  pinterest: "/social-icons/pinterest.png",
  tiktok: "/social-icons/tiktok.png",
  x: "/social-icons/x.png",
  youtube: "/social-icons/youtube.png",
};

function normalizePlatformKey(platformValue) {
  const value = String(platformValue || "").trim().toLowerCase();

  if (!value) return "";
  if (value.includes("facebook")) return "facebook";
  if (value.includes("instagram")) return "instagram";
  if (value.includes("linkedin") || value.includes("linked in")) return "linkedin";
  if (value.includes("pinterest")) return "pinterest";
  if (value.includes("tiktok") || value.includes("tik tok")) return "tiktok";
  if (value === "x" || value.includes("twitter")) return "x";
  if (value.includes("youtube")) return "youtube";

  return value.replace(/[^a-z0-9_-]+/g, "_");
}

function formatConnectedPlatformLabel(platformValue) {
  const value = normalizePlatformKey(platformValue);

  if (value === "facebook") return "Facebook";
  if (value === "instagram") return "Instagram";
  if (value === "linkedin") return "LinkedIn";
  if (value === "pinterest") return "Pinterest";
  if (value === "tiktok") return "TikTok";
  if (value === "x") return "X";
  if (value === "youtube") return "YouTube";

  return String(platformValue || "").trim() || value;
}

function getPlatformIconSource(platformValue) {
  return platformIconSources[normalizePlatformKey(platformValue)] || "";
}

function getConnectedPlatformOptions(connectedPlatforms) {
  const seen = new Set();
  const options = [];

  for (const item of connectedPlatforms || []) {
    const key = normalizePlatformKey(item?.value || item?.label);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);

    options.push({
      value: key,
      label: formatConnectedPlatformLabel(item?.label || item?.value || key),
      platforms: [key],
      icon: getPlatformIconSource(key),
    });
  }

  return options;
}

function getSelectedPlatformKeys(platformValue, platformOptions = []) {
  const normalizedInput = String(platformValue || "").toLowerCase();

  const keys = platformOptions
    .map((item) => item.value)
    .filter((key) => normalizedInput.includes(key));

  if (keys.length > 0) {
    return Array.from(new Set(keys));
  }

  const directKey = normalizePlatformKey(platformValue);

  if (directKey && platformOptions.some((item) => item.value === directKey)) {
    return [directKey];
  }

  return [];
}

function formatPlatformSelectionFromKeys(keys = [], platformOptions = []) {
  return keys
    .map((key) => platformOptions.find((item) => item.value === key)?.label || formatConnectedPlatformLabel(key))
    .filter(Boolean)
    .join(" + ");
}


function SetupHelperNote({ variant = "goal", icon, children }) {
  return (
    <div className={`planner-setup-helper planner-setup-helper-${variant}`}>
      <span className="planner-setup-helper-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="planner-setup-helper-text">{children}</span>
    </div>
  );
}

function GoalHelperIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 18h14" />
      <path d="M7.5 18V12.5" />
      <path d="M12 18V8.5" />
      <path d="M16.5 18V5.5" />
      <path d="m14.8 7 2.3-2.5 1.9 2" />
    </svg>
  );
}

function FrequencyHelperIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m20 6-9 9-4-4" />
      <path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" />
    </svg>
  );
}

function TimingHelperIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.8v4.7l3.2 2" />
    </svg>
  );
}

export default function AutomationPage() {
  const { t, locale } = useUiText(["automation"]);

  function translateContentTypeLabel(type) {
    return t(`automation.contentType.${type.id}.label`);
  }

  function translateContentTypeShortLabel(type) {
    return t(`automation.contentType.${type.id}.shortLabel`);
  }

  function translateContentTypeDescription(type) {
    return t(`automation.contentType.${type.id}.description`);
  }

  const plannerLocaleIsSwedish = String(locale || "").toLowerCase().startsWith("sv");

  const plannerGoalCopy = {
    sell_more: {
      label: t("automation.planGoal.sell_more.label"),
      description: t("automation.planGoal.sell_more.description"),
    },
    get_followers: {
      label: t("automation.planGoal.get_followers.label"),
      description: t("automation.planGoal.get_followers.description"),
    },
    build_trust: {
      label: t("automation.planGoal.build_trust.label"),
      description: t("automation.planGoal.build_trust.description"),
    },
    educate_customers: {
      label: t("automation.planGoal.educate_customers.label"),
      description: t("automation.planGoal.educate_customers.description"),
    },
    stay_visible: {
      label: t("automation.planGoal.stay_visible.label"),
      description: t("automation.planGoal.stay_visible.description"),
    },
  };

  const plannerUiCopy = {
    planSummary: t("automation.planSummary"),
    readyToCreate: t("automation.readyToCreate"),
    spreeloChoosesLanguage: getAutoPostLanguageLabel(),
    platformHelp: t("automation.platformHelp"),
    languageForPosts: t("automation.languageForPosts"),
    repeatFull: t("automation.repeatFull"),
    languageHelpSmart: t("automation.languageHelpSmart"),
    repeatHelpSmart: t("automation.repeatHelpSmart"),
    timezoneHelpSmart: t("automation.timezoneHelpSmart"),
    planIncludesText: t("automation.planIncludesText"),
  };

  const previewCardCopy = {
    product_focus: {
      label: plannerLocaleIsSwedish ? "Produktfokus" : "Product focus",
      description: plannerLocaleIsSwedish ? "Framhäver relevanta produkter eller tjänster." : "Highlights relevant products or services.",
    },
    website_carousel: {
      label: plannerLocaleIsSwedish ? "Webbplatskarusell" : "Website carousel",
      description: plannerLocaleIsSwedish
        ? "Skapar flera slides från webbplats, produkt eller tjänst."
        : "Creates multiple slides from a website item, product or service.",
    },
    offers: {
      label: plannerLocaleIsSwedish ? "Kampanjer & erbjudanden" : "Campaigns & offers",
      description: plannerLocaleIsSwedish ? "Använder köptillfällen endast när det passar." : "Uses buying moments only when they fit.",
    },
    tips_advice: {
      label: plannerLocaleIsSwedish ? "Tips & råd" : "Tips & advice",
      description: plannerLocaleIsSwedish ? "Hjälpsamma inlägg som bygger värde och förtroende." : "Helpful posts that build value and trust.",
    },
    customer_inspiration: {
      label: plannerLocaleIsSwedish ? "Kundinspiration" : "Customer inspiration",
      description: plannerLocaleIsSwedish ? "Visar exempel, användningsfall och skäl att välja företaget." : "Shows examples, use cases and reasons to choose the business.",
    },
    faq: {
      label: plannerLocaleIsSwedish ? "FAQ / Frågor" : "FAQ / Questions",
      description: plannerLocaleIsSwedish ? "Besvarar vanliga frågor innan kunder behöver fråga." : "Answers common questions before customers need to ask.",
    },
    reminders: {
      label: plannerLocaleIsSwedish ? "Påminnelser" : "Reminders",
      description: plannerLocaleIsSwedish ? "Håller företaget synligt vid viktiga tillfällen." : "Keeps the business visible around important moments.",
    },
    common_mistakes: {
      label: plannerLocaleIsSwedish ? "Vanliga misstag" : "Common mistakes",
      description: plannerLocaleIsSwedish ? "Visar expertis genom att hjälpa kunder undvika problem." : "Shows expertise by helping customers avoid problems.",
    },
    mini_guide: {
      label: plannerLocaleIsSwedish ? "Mini-guide" : "Mini-guide",
      description: plannerLocaleIsSwedish ? "Lär ut något användbart i ett kort format." : "Teaches something useful in a short format.",
    },
    checklist: {
      label: plannerLocaleIsSwedish ? "Checklista" : "Checklist",
      description: plannerLocaleIsSwedish ? "Skapar tydliga steg och saker att komma ihåg." : "Creates clear steps and things to remember.",
    },
    seasonal: {
      label: plannerLocaleIsSwedish ? "Säsongsinnehåll" : "Seasonal content",
      description: plannerLocaleIsSwedish ? "Kopplar företaget till aktuell tid och kundbehov." : "Connects the business to current timing and needs.",
    },
    local_relevance: {
      label: plannerLocaleIsSwedish ? "Lokal relevans" : "Local relevance",
      description: plannerLocaleIsSwedish ? "Gör innehållet närmare och mer relevant lokalt." : "Makes the content feel more locally relevant.",
    },
    problem_solution: {
      label: plannerLocaleIsSwedish ? "Problem → lösning" : "Problem → solution",
      description: plannerLocaleIsSwedish ? "Utgår från ett kundbehov och visar hur företaget hjälper." : "Starts from a customer need and shows how the business helps.",
    },
    custom_prompt: {
      label: plannerLocaleIsSwedish ? "Egen idé" : "Custom idea",
      description: plannerLocaleIsSwedish ? "Använder din egen instruktion som grund." : "Uses your own instruction as the base.",
    },
    content_mix: {
      label: plannerLocaleIsSwedish ? "Innehållsmix" : "Content mix",
      description: plannerLocaleIsSwedish ? "Ger variation så planen inte känns upprepande." : "Adds variety so the plan does not feel repetitive.",
    },
  };

  function translateAutoPlanGoalLabel(goalId) {
    if (!goalId) return t("automation.chooseGoal");
    return plannerGoalCopy[goalId]?.label || t(`automation.planGoal.${goalId}.label`);
  }

  function translateAutoPlanGoalDescription(goalId) {
    return plannerGoalCopy[goalId]?.description || "";
  }

  function safePlannerText(key) {
    return plannerUiCopy[key] || t(`automation.${key}`);
  }

  function getAutoPostLanguageLabel() {
    const normalizedLocale = String(locale || "en").toLowerCase();
    const localeLanguageMap = {
      sv: "Svenska",
      da: "Dansk",
      no: "Norsk",
      de: "Deutsch",
      es: "Español",
      fr: "Français",
      it: "Italiano",
      nl: "Nederlands",
      pt: "Português",
      fi: "Suomi",
      pl: "Polski",
      ar: "العربية",
      ja: "日本語",
      zh: "中文",
      en: "English",
    };

    return localeLanguageMap[normalizedLocale] || "English";
  }

  function getLanguageDisplayLabel(value) {
    return value === "Auto" ? getAutoPostLanguageLabel() : value;
  }

  function getPlatformIconLabel(value) {
    const name = String(value || "").toLowerCase();
    if (name.includes("instagram")) return "📸";
    if (name.includes("linkedin")) return "in";
    if (name.includes("tiktok")) return "♪";
    if (name.includes("facebook")) return "f";
    return "●";
  }

  function translatePlanMode(value) {
    return t(`automation.planMode.${value || "manual"}`);
  }

  function translateScheduleType(value) {
    return value === "weekly" ? t("automation.weekly") : t("automation.once");
  }
  function translatePreviewCardLabel(cardId) {
    if (plannerLocaleIsSwedish && previewCardCopy[cardId]?.label) {
      return previewCardCopy[cardId].label;
    }

    return t(`automation.previewCard.${cardId}.label`);
  }

  function translatePreviewCardDescription(cardId) {
    if (plannerLocaleIsSwedish && previewCardCopy[cardId]?.description) {
      return previewCardCopy[cardId].description;
    }

    return t(`automation.previewCard.${cardId}.description`);
  }

  function getLocalizedSlotFormatLabel(slot) {
    if (slot?.contentFormat === "carousel") {
      return t("automation.textCarousel");
    }

    if (slot.usesWebsiteContent && slot.generateImage) {
      return t("automation.textWebsiteImage");
    }

    if (slot.generateImage) {
      return t("automation.textImage");
    }

    return t("automation.textOnly");
  }

  function getCustomerSlotLabel(slot) {
    const cardId = getContentPreviewCardId(slot?.contentTypeId);
    if (slot?.isCampaignSlot && slot.marketingAngle) return getCampaignAngleLabel(slot.marketingAngle);
    return translatePreviewCardLabel(cardId);
  }

  function getCustomerSlotPurpose(slot) {
    const cardId = getContentPreviewCardId(slot?.contentTypeId);
    if (slot?.isCampaignSlot && slot.campaignSummary) return slot.campaignSummary;
    return translatePreviewCardDescription(cardId);
  }


  const weekdayLabels = [
    t("automation.weekday.short.monday"),
    t("automation.weekday.short.tuesday"),
    t("automation.weekday.short.wednesday"),
    t("automation.weekday.short.thursday"),
    t("automation.weekday.short.friday"),
    t("automation.weekday.short.saturday"),
    t("automation.weekday.short.sunday"),
  ];

  const initialStartDate = getDateInputValueInTimeZone(
    new Date(),
    DEFAULT_TIME_ZONE
  );

  const initialRecommendedTime = getRecommendedTimeForDate(
    initialStartDate,
    DEFAULT_TIME_ZONE
  );

const [rules, setRules] = useState([]);
const [creditBalance, setCreditBalance] = useState(null);
const [currentBrandId, setCurrentBrandId] = useState("");
const [currentBrandProfile, setCurrentBrandProfile] = useState(null);
const [campaignOpportunity, setCampaignOpportunity] = useState(null);
const [campaignDebugInfo, setCampaignDebugInfo] = useState(null);

  const [planStartDate, setPlanStartDate] = useState(initialStartDate);
  const [defaultPublishTime, setDefaultPublishTime] = useState(
    initialRecommendedTime
  );
const [autoPlanGoal, setAutoPlanGoal] = useState("");
const [autoPlanPostCount, setAutoPlanPostCount] = useState(
  DEFAULT_AUTO_PLAN_POST_COUNT
);
const [showAddPostModal, setShowAddPostModal] = useState(false);
const [slots, setSlots] = useState([]);
  const [planCreationMode, setPlanCreationMode] = useState("auto");
  const [selectedContentTypeIds, setSelectedContentTypeIds] = useState(
    recommendedContentTypeIds
  );

  const [message, setMessage] = useState("");
  const [savedPlanSummary, setSavedPlanSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scheduleType, setScheduleType] = useState("weekly");
  const [editingRuleId, setEditingRuleId] = useState("");

  const [planName, setPlanName] = useState("");
  const [platform, setPlatform] = useState("");
const [platformDropdownOpen, setPlatformDropdownOpen] = useState(false);
const [connectedPlatforms, setConnectedPlatforms] = useState([]);
const [loadingConnectedPlatforms, setLoadingConnectedPlatforms] = useState(false);
const connectedPlatformOptions = getConnectedPlatformOptions(connectedPlatforms);
const selectedPlatformKeys = getSelectedPlatformKeys(platform, connectedPlatformOptions);
const selectedPlatformOptions = selectedPlatformKeys
  .map((key) => connectedPlatformOptions.find((item) => item.value === key))
  .filter(Boolean);
  const [tone, setTone] = useState("Friendly");
  const [language, setLanguage] = useState("Auto");
const baseLanguageOptions = [
  { value: "Auto", label: getAutoPostLanguageLabel() },
  { value: "Svenska", label: "Svenska" },
  { value: "English", label: "English" },
  { value: "Dansk", label: "Dansk" },
  { value: "Norsk", label: "Norsk" },
  { value: "Deutsch", label: "Deutsch" },
  { value: "Español", label: "Español" },
  { value: "Français", label: "Français" },
  { value: "Italiano", label: "Italiano" },
  { value: "Nederlands", label: "Nederlands" },
  { value: "Português", label: "Português" },
  { value: "Suomi", label: "Suomi" },
  { value: "Polski", label: "Polski" },
  { value: "العربية", label: "العربية" },
  { value: "日本語", label: "日本語" },
  { value: "中文", label: "中文" },
];
const languageOptions = baseLanguageOptions.filter((option, index, options) => {
  if (option.value === "Auto") return true;
  return !options.slice(0, index).some(
    (earlierOption) => earlierOption.label === option.label
  );
});
  const [postType, setPostType] = useState("Offer");
  const [length, setLength] = useState("Medium");
  const [ctaType, setCtaType] = useState("Learn more");
  const [timeZone, setTimeZone] = useState(DEFAULT_TIME_ZONE);
  const [showSavedRules, setShowSavedRules] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [showLearnMoreModal, setShowLearnMoreModal] = useState(false);
  const [recentlyAddedContentTypeId, setRecentlyAddedContentTypeId] =
  useState("");
  const [expandedInstructionSlotIds, setExpandedInstructionSlotIds] = useState(
    []
  );

  const [selectedRuleIds, setSelectedRuleIds] = useState([]);
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const [confirmingSingleDeleteId, setConfirmingSingleDeleteId] =
    useState(null);
  const [deletingRules, setDeletingRules] = useState(false);
  const [openPickerId, setOpenPickerId] = useState(null);

  useEffect(() => {
    const browserTimeZone = getBrowserTimeZone();
    const localeTimeZone = getLocaleDefaultTimeZone(locale);
    const resolvedTimeZone = browserTimeZone || localeTimeZone || DEFAULT_TIME_ZONE;
    const browserStartDate = getDateInputValueInTimeZone(
      new Date(),
      resolvedTimeZone
    );
    const browserRecommendedTime = getRecommendedTimeForDate(
      browserStartDate,
      resolvedTimeZone
    );

    setTimeZone(resolvedTimeZone);
    setPlanStartDate(browserStartDate);
    setDefaultPublishTime(browserRecommendedTime);
    setSlots((currentSlots) =>
      applySmartScheduleToSlots(
        currentSlots,
        browserStartDate,
        resolvedTimeZone,
        browserRecommendedTime,
        autoPlanGoal
      )
    );

    loadRules();
  }, []);

  const timeZoneOptions = useMemo(() => {
    const options = new Set([timeZone, getLocaleDefaultTimeZone(locale), DEFAULT_TIME_ZONE, ...commonTimeZones]);

    return Array.from(options).filter(Boolean);
  }, [timeZone, locale]);

  const plannedCredits = useMemo(() => {
    return slots.reduce(
      (total, slot) => total + (slot.generateImage ? 3 : 1),
      0
    );
  }, [slots]);

  const textOnlyCount = useMemo(() => {
    return slots.filter((slot) => !slot.generateImage).length;
  }, [slots]);

  const imageCount = useMemo(() => {
    return slots.filter((slot) => slot.generateImage).length;
  }, [slots]);

  const websiteContentCount = useMemo(() => {
    return slots.filter((slot) => slot.usesWebsiteContent).length;
  }, [slots]);

  const existingWeeklyCredits = useMemo(() => {
    return rules.reduce((total, rule) => {
      if (!rule.is_active) return total;
      if (rule.schedule_type === "once") return total;

      return total + (rule.credit_cost || 1);
    }, 0);
  }, [rules]);

  const monthlyEstimate =
    scheduleType === "weekly"
      ? (existingWeeklyCredits + plannedCredits) * 4
      : existingWeeklyCredits * 4 + plannedCredits;

  const hasEnoughCredits =
    !creditBalance || plannedCredits <= creditBalance.credits_remaining;

  const creditsRemaining = creditBalance?.credits_remaining ?? 0;
  const monthlyCreditLimit = creditBalance?.monthly_credit_limit ?? 0;
  const creditsAfterSaving = creditBalance
    ? Math.max(creditsRemaining - plannedCredits, 0)
    : 0;
  const creditUsagePercent =
    monthlyCreditLimit > 0
      ? Math.min(100, Math.round((creditsRemaining / monthlyCreditLimit) * 100))
      : 0;
const subscriptionPlanLabel = getPlanBadgeLabel(creditBalance);
  const subscriptionDateLabel = getSubscriptionDateLabel(creditBalance);
  const subscriptionDateValue = getSubscriptionDateValue(
    creditBalance,
    timeZone
  );
  const subscriptionNextStepText = getSubscriptionNextStepText(creditBalance);
  const subscriptionStatusLabel = getSubscriptionStatusLabel(
    creditBalance?.subscription_status
  );

  const savedRulesPreview = rules.slice(0, 3);
  const visibleRules = showSavedRules ? rules : savedRulesPreview;
  const visibleRuleIds = visibleRules.map((rule) => rule.id);
  const allVisibleRulesSelected =
    visibleRuleIds.length > 0 &&
    visibleRuleIds.every((ruleId) => selectedRuleIds.includes(ruleId));
    const websiteProductModeAvailable = Boolean(
    currentBrandProfile?.website_product_mode_available
  );

  const visibleContentTypes = useMemo(() => {
    return getVisibleContentTypes(websiteProductModeAvailable);
  }, [websiteProductModeAvailable]);
  const includedContentTypes = useMemo(() => {
  return getPlanIncludedContentTypes({
    planCreationMode,
    autoPlanGoal,
    autoPlanPostCount,
    selectedContentTypeIds,
    websiteProductModeAvailable,
  });
}, [
  planCreationMode,
  autoPlanGoal,
  autoPlanPostCount,
  selectedContentTypeIds,
  websiteProductModeAvailable,
]);
const planWasSaved = Boolean(savedPlanSummary);

const shouldShowPlannerDetails =
  !planWasSaved &&
  (planCreationMode === "campaign" ||
    (planCreationMode === "select" && slots.length > 0) ||
    (planCreationMode === "manual" && slots.length > 0) ||
    Boolean(autoPlanGoal));
async function getCurrentBrandIdForUser(currentUser, preferredBrandId = "") {
  if (preferredBrandId) {
    const { data: preferredBrand, error: preferredBrandError } = await supabase
      .from("brand_profiles")
      .select("id")
      .eq("id", preferredBrandId)
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (!preferredBrandError && preferredBrand?.id) {
      if (typeof window !== "undefined") {
        localStorage.setItem(getBrandStorageKey(currentUser.id), preferredBrand.id);
      }

      return preferredBrand.id;
    }
  }

  const savedBrandId =
    typeof window !== "undefined"
      ? localStorage.getItem(getBrandStorageKey(currentUser.id))
      : "";

  if (savedBrandId) {
    const { data: savedBrand, error: savedBrandError } = await supabase
      .from("brand_profiles")
      .select("id")
      .eq("id", savedBrandId)
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (!savedBrandError && savedBrand?.id) {
      return savedBrand.id;
    }
  }

  const { data: defaultBrand, error: defaultBrandError } = await supabase
    .from("brand_profiles")
    .select("id")
    .eq("user_id", currentUser.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (defaultBrandError) {
    throw defaultBrandError;
  }

  if (defaultBrand?.id && typeof window !== "undefined") {
    localStorage.setItem(getBrandStorageKey(currentUser.id), defaultBrand.id);
  }

  return defaultBrand?.id || "";
}
  function getCalendarCampaignHandoff(campaignOpportunityId, selectedBrandId) {
  if (typeof window === "undefined" || !campaignOpportunityId) {
    return null;
  }

  try {
    const raw = localStorage.getItem(CAMPAIGN_HANDOFF_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const campaign = parsed?.campaign || null;

    if (!campaign?.id || campaign.id !== campaignOpportunityId) {
      return null;
    }

    if (selectedBrandId && parsed?.brandProfileId && parsed.brandProfileId !== selectedBrandId) {
      return {
        ...campaign,
        brand_profile_id: parsed.brandProfileId,
        _handoffBrandMismatch: true,
      };
    }

    return campaign;
  } catch {
    return null;
  }
}

function clearCalendarCampaignHandoff() {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(CAMPAIGN_HANDOFF_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup errors.
  }
}

function getStoredCalendarCampaignHandoff() {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(CAMPAIGN_HANDOFF_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const campaign = parsed?.campaign || null;

    if (!campaign?.id) return null;

    return {
      campaign,
      brandProfileId:
        parsed?.brandProfileId ||
        campaign?.brand_profile_id ||
        campaign?.brandProfileId ||
        "",
      createdAt: parsed?.createdAt || "",
    };
  } catch {
    return null;
  }
}

function isRecentCalendarCampaignHandoff(handoff, maxAgeMinutes = 30) {
  if (!handoff?.createdAt) return false;

  const createdAtMs = new Date(handoff.createdAt).getTime();
  if (!Number.isFinite(createdAtMs)) return false;

  return Date.now() - createdAtMs <= maxAgeMinutes * 60 * 1000;
}

function maskDebugId(value) {
  const stringValue = String(value || "");
  if (!stringValue) return "";
  if (stringValue.length <= 10) return stringValue;
  return `${stringValue.slice(0, 6)}…${stringValue.slice(-4)}`;
}

function summarizeCampaignForDebug(campaign) {
  if (!campaign) return null;

  return {
    id: maskDebugId(campaign.id),
    title: campaign.title || "",
    brand_profile_id: maskDebugId(campaign.brand_profile_id || campaign.brandProfileId),
    user_id: maskDebugId(campaign.user_id),
    event_date: campaign.event_date || null,
    start_date: campaign.start_date || null,
    end_date: campaign.end_date || null,
    recommended_post_count: campaign.recommended_post_count ?? null,
    post_plan_length: Array.isArray(campaign.post_plan) ? campaign.post_plan.length : null,
    has_post_plan: Array.isArray(campaign.post_plan) && campaign.post_plan.length > 0,
    source_note: campaign._handoffBrandMismatch ? "handoff brand mismatch" : "",
  };
}


function buildDirectCalendarCampaignSlots({
  campaign,
  timeZone = DEFAULT_TIME_ZONE,
  defaultPublishTime = "09:00",
}) {
  const count = getCampaignRecommendedPostCount(campaign, 3);
  const fallbackPostPlan = buildFallbackCampaignPlan(count);
  const todayDateString = getDateInputValueInTimeZone(new Date(), timeZone);
  const safeStartDate = getLaterDateString(
    campaign?.start_date || campaign?.event_date || todayDateString,
    todayDateString
  );
  const safeEndDate = campaign?.event_date
    ? campaign.event_date
    : getLaterDateString(
        campaign?.end_date || addDaysToDateString(safeStartDate, Math.max(count - 1, 0) * 7),
        safeStartDate
      );
  const totalDays = Math.max(
    getDaysBetweenDateStrings(safeStartDate, safeEndDate) || 0,
    0
  );

  return fallbackPostPlan.map((postPlanItem, index) => {
    const ratio = count <= 1 ? 0 : index / Math.max(count - 1, 1);
    const startDate = campaign?.event_date
      ? getLaterDateString(
          addDaysToDateString(campaign.event_date, -(postPlanItem.days_before_event || 0)),
          todayDateString
        )
      : addDaysToDateString(safeStartDate, Math.round(totalDays * ratio));
    const weekday = getWeekdayFromDateString(startDate, timeZone);
    const enhancedPostPlanItem = buildCampaignPostPlanItem({
      campaign,
      postPlanItem,
      index,
      total: fallbackPostPlan.length,
      daysBeforeEvent: campaign?.event_date
        ? getDaysBetweenDateStrings(startDate, campaign.event_date)
        : null,
      timingAnchor: postPlanItem.timing_anchor || null,
    });
    const contentSourceMode = getCampaignContentSourceMode(
      campaign,
      enhancedPostPlanItem,
      index,
      fallbackPostPlan.length
    );

    enhancedPostPlanItem.content_source_mode = contentSourceMode;

    return createSlot({
      startDate,
      weekday,
      publishTime: getCampaignPublishTime(defaultPublishTime, index),
      prompt: buildCampaignPrompt(campaign, enhancedPostPlanItem, index),
      imagePrompt: buildCampaignImagePrompt(campaign, enhancedPostPlanItem, index),
      generateImage: true,
      contentTypeId: getCampaignSlotContentTypeId(contentSourceMode),
      contentTypeLabel: getCampaignSlotContentTypeLabel(campaign, contentSourceMode),
      usesWebsiteContent: shouldUseWebsiteContentForCampaign(
        contentSourceMode,
        campaign
      ),
      contentFormat: getCampaignSlotContentFormat(contentSourceMode),
      isCampaignSlot: true,
      campaignRole: enhancedPostPlanItem.role || `Campaign post ${index + 1}`,
      campaignSummary: buildCampaignSummary(campaign, enhancedPostPlanItem, index),
      campaignPhase: enhancedPostPlanItem.campaign_phase || "",
      marketingAngle: enhancedPostPlanItem.marketing_angle || "",
      customerStage: enhancedPostPlanItem.customer_stage || "",
      ctaStrength: enhancedPostPlanItem.cta_strength || "",
      campaignPostIndex: index + 1,
      campaignPostCount: fallbackPostPlan.length,
      campaignGoal: enhancedPostPlanItem.campaign_goal || campaign?.title || "",
      targetCustomerNeed: enhancedPostPlanItem.target_customer_need || "",
      strategyNotes: enhancedPostPlanItem.strategy_notes || "",
      dateLocked: true,
      timeZone,
    });
  });
}

async function loadCampaignOpportunityIntoPlanner({
  currentUser,
  selectedBrandId,
  campaignOpportunityId,
  selectedTimeZone,
}) {
  if (!campaignOpportunityId) {
    return false;
  }

  setCampaignDebugInfo((current) => ({
    ...(current || {}),
    enabled: true,
    loadCampaignFunctionCalled: true,
    loadStartedAt: new Date().toISOString(),
    selectedBrandId: maskDebugId(selectedBrandId),
    requestedCampaignId: maskDebugId(campaignOpportunityId),
  }));

  const campaignFromHandoff = getCalendarCampaignHandoff(
    campaignOpportunityId,
    selectedBrandId
  );

  setCampaignDebugInfo((current) => ({
    ...(current || {}),
    handoffCampaign: summarizeCampaignForDebug(campaignFromHandoff),
    handoffMatchedRequestedId: Boolean(campaignFromHandoff),
  }));

  let campaignFromDatabase = null;
  let error = null;

  let databaseQuery = supabase
    .from("brand_campaign_opportunities")
    .select("*")
    .eq("id", campaignOpportunityId)
    .eq("user_id", currentUser.id);

  if (selectedBrandId) {
    databaseQuery = databaseQuery.eq("brand_profile_id", selectedBrandId);
  }

  const primaryResult = await databaseQuery.maybeSingle();
  campaignFromDatabase = primaryResult.data || null;
  error = primaryResult.error || null;

  setCampaignDebugInfo((current) => ({
    ...(current || {}),
    primaryDatabaseFound: Boolean(campaignFromDatabase),
    primaryDatabaseCampaign: summarizeCampaignForDebug(campaignFromDatabase),
    primaryDatabaseError: primaryResult.error?.message || "",
  }));

  // Calendar handoff must be tolerant. Older rows, newly created rows, or rows
  // where the current brand has not caught up yet should not make the planner
  // fall back to the normal auto-plan view.
  if (!campaignFromDatabase && selectedBrandId) {
    const fallbackResult = await supabase
      .from("brand_campaign_opportunities")
      .select("*")
      .eq("id", campaignOpportunityId)
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (fallbackResult.data) {
      campaignFromDatabase = fallbackResult.data;
      error = null;
    } else if (fallbackResult.error && !error) {
      error = fallbackResult.error;
    }
  }
  setCampaignDebugInfo((current) => ({
    ...(current || {}),
    fallbackDatabaseFound: Boolean(campaignFromDatabase),
    fallbackDatabaseCampaign: summarizeCampaignForDebug(campaignFromDatabase),
    lastDatabaseError: error?.message || "",
  }));

  const campaign = mergeCampaignOpportunitySources(
    campaignFromDatabase,
    campaignFromHandoff
  );

  setCampaignDebugInfo((current) => ({
    ...(current || {}),
    mergedCampaign: summarizeCampaignForDebug(campaign),
    mergeSucceeded: Boolean(campaign),
  }));

  if (error && !campaign) {
    setCampaignDebugInfo((current) => ({
      ...(current || {}),
      finalStatus: "failed: database error and no campaign",
      finalError: error.message || "Unknown database error",
    }));
    setMessage(error.message);
    return false;
  }

  if (!campaign) {
    setCampaignDebugInfo((current) => ({
      ...(current || {}),
      finalStatus: "failed: no campaign from database or localStorage",
      finalError: t("automation.errorCampaignNotFound"),
    }));
    setMessage(t("automation.errorCampaignNotFound"));
    return false;
  }

  if (campaignFromDatabase && campaignFromHandoff) {
    clearCalendarCampaignHandoff();
  }

  const campaignTimeZone = selectedTimeZone || timeZone || DEFAULT_TIME_ZONE;

 const campaignStartDate = getSafeCampaignStartDate(
  campaign,
  campaignTimeZone
);
    
  const campaignPublishTime = getRecommendedTimeForDate(
    campaignStartDate,
    campaignTimeZone
  );

  let campaignSlots = [];
  let campaignSlotBuildError = null;

  try {
    // If the calendar campaign has no real post_plan, build the visible plan
    // directly from the campaign opportunity. This is the normal flow after the
    // faster brand analysis, where calendar rows are lightweight and posts are
    // only planned when the customer clicks "Skapa inlägg".
    const hasUsablePostPlan = Array.isArray(campaign.post_plan) && campaign.post_plan.length > 0;

    campaignSlots = hasUsablePostPlan
      ? createCampaignSlotsFromOpportunity({
          campaign,
          timeZone: campaignTimeZone,
          defaultPublishTime: campaignPublishTime,
        })
      : buildDirectCalendarCampaignSlots({
          campaign,
          timeZone: campaignTimeZone,
          defaultPublishTime: campaignPublishTime,
        });
  } catch (slotError) {
    campaignSlotBuildError = slotError;
    campaignSlots = [];
  }

  setCampaignDebugInfo((current) => ({
    ...(current || {}),
    campaignStartDate,
    campaignPublishTime,
    initialSlotCount: campaignSlots.length,
    slotBuildError: campaignSlotBuildError?.message || "",
  }));

  if (!campaignSlots.length) {
    const fallbackDate =
      campaign.event_date ||
      campaign.start_date ||
      campaign.end_date ||
      campaignStartDate;

    const fallbackCampaign = normalizeCampaignOpportunityForPlanner({
      ...campaign,
      event_date:
        campaign.event_date ||
        (campaign.start_date && campaign.end_date && campaign.start_date === campaign.end_date
          ? campaign.start_date
          : null),
      start_date: campaign.start_date || fallbackDate,
      end_date: campaign.end_date || campaign.start_date || fallbackDate,
      post_plan: buildFallbackCampaignPlan(
        getCampaignRecommendedPostCount(campaign, 5)
      ),
    });

    campaignSlots = createCampaignSlotsFromOpportunity({
      campaign: fallbackCampaign,
      timeZone: campaignTimeZone,
      defaultPublishTime: campaignPublishTime,
    });

    setCampaignDebugInfo((current) => ({
      ...(current || {}),
      fallbackCampaign: summarizeCampaignForDebug(fallbackCampaign),
      fallbackSlotCount: campaignSlots.length,
    }));
  }

  if (!campaignSlots.length) {
    const emergencyPostPlan = buildFallbackCampaignPlan(
      getCampaignRecommendedPostCount(campaign, 3)
    );
    const emergencySchedule = buildSmartSlotSchedule({
      startDate: campaignStartDate,
      count: emergencyPostPlan.length,
      timeZone: campaignTimeZone,
      firstPublishTime: campaignPublishTime,
    });

    campaignSlots = emergencyPostPlan.map((postPlanItem, index) => {
      const schedule = emergencySchedule[index] || {
        startDate: campaignStartDate,
        weekday: getWeekdayFromDateString(campaignStartDate, campaignTimeZone),
        publishTime: campaignPublishTime,
      };
      const enhancedPostPlanItem = buildCampaignPostPlanItem({
        campaign,
        postPlanItem,
        index,
        total: emergencyPostPlan.length,
        daysBeforeEvent: null,
        timingAnchor: null,
      });
      const contentSourceMode = getCampaignContentSourceMode(
        campaign,
        enhancedPostPlanItem,
        index,
        emergencyPostPlan.length
      );

      enhancedPostPlanItem.content_source_mode = contentSourceMode;

      return createSlot({
        startDate: schedule.startDate,
        weekday: schedule.weekday,
        publishTime: schedule.publishTime,
        prompt: buildCampaignPrompt(campaign, enhancedPostPlanItem, index),
        imagePrompt: buildCampaignImagePrompt(campaign, enhancedPostPlanItem, index),
        generateImage: true,
        contentTypeId: getCampaignSlotContentTypeId(contentSourceMode),
        contentTypeLabel: getCampaignSlotContentTypeLabel(campaign, contentSourceMode),
        usesWebsiteContent: shouldUseWebsiteContentForCampaign(
          contentSourceMode,
          campaign
        ),
        contentFormat: getCampaignSlotContentFormat(contentSourceMode),
        isCampaignSlot: true,
        campaignRole: enhancedPostPlanItem.role || "Campaign post",
        campaignSummary: buildCampaignSummary(
          campaign,
          enhancedPostPlanItem,
          index
        ),
        campaignPhase: enhancedPostPlanItem.campaign_phase || "",
        marketingAngle: enhancedPostPlanItem.marketing_angle || "",
        customerStage: enhancedPostPlanItem.customer_stage || "",
        ctaStrength: enhancedPostPlanItem.cta_strength || "",
        campaignPostIndex: enhancedPostPlanItem.campaign_post_index || index + 1,
        campaignPostCount:
          enhancedPostPlanItem.campaign_post_count || emergencyPostPlan.length,
        campaignGoal: enhancedPostPlanItem.campaign_goal || "",
        targetCustomerNeed: enhancedPostPlanItem.target_customer_need || "",
        strategyNotes: enhancedPostPlanItem.strategy_notes || "",
        dateLocked: true,
        timeZone: campaignTimeZone,
      });
    });
  }

  setCampaignDebugInfo((current) => ({
    ...(current || {}),
    finalStatus: campaignSlots.length > 0 ? "success: campaign slots created" : "failed: 0 slots after emergency fallback",
    finalSlotCount: campaignSlots.length,
    finalSlots: campaignSlots.slice(0, 7).map((slot) => ({
      id: slot.id,
      startDate: slot.startDate,
      weekday: slot.weekday,
      publishTime: slot.publishTime,
      contentTypeId: slot.contentTypeId,
      isCampaignSlot: Boolean(slot.isCampaignSlot),
      campaignRole: slot.campaignRole || "",
      campaignSummary: slot.campaignSummary || "",
    })),
  }));

  setCampaignOpportunity(campaign);
  setPlanCreationMode("campaign");
  setScheduleType("once");
  setPlanName(campaign.title || "Campaign plan");
  setLanguage(campaign.language || "Auto");
  setPostType("Campaign");
  setTone("Friendly");
  setCtaType("Learn more");
  setPlanStartDate(campaignSlots[0]?.startDate || campaignStartDate);
  setDefaultPublishTime(campaignPublishTime);
  setSlots(campaignSlots);
  setExpandedInstructionSlotIds([]);
  setSavedPlanSummary(null);
  setMessage("");
  return true;
}

async function loadConnectedPlatformsForBrand(userId, brandProfileId) {
  if (!userId || !brandProfileId) {
    setConnectedPlatforms([]);
    setPlatform("");
    return;
  }

  setLoadingConnectedPlatforms(true);

  const { data, error } = await supabase
    .from("social_connections")
    .select("platform, status")
    .eq("user_id", userId)
    .eq("brand_profile_id", brandProfileId)
    .eq("status", "connected");

  if (error) {
    console.error("Could not load connected platforms:", error);
    setConnectedPlatforms([]);
    setPlatform("");
    setLoadingConnectedPlatforms(false);
    return;
  }

  const uniquePlatforms = Array.from(
    new Set(
      (data || []).map((item) =>
        String(item.platform || "").toLowerCase()
      )
    )
  )
    .filter(Boolean)
    .map((value) => ({
      value,
      label: formatConnectedPlatformLabel(value),
    }));

  setConnectedPlatforms(uniquePlatforms);

  const platformOptions = getConnectedPlatformOptions(uniquePlatforms);

  setPlatform((currentValue) => {
    const currentKeys = getSelectedPlatformKeys(currentValue, platformOptions);

    if (currentKeys.length > 0) {
      return formatPlatformSelectionFromKeys(currentKeys, platformOptions);
    }

    return formatPlatformSelectionFromKeys(
      platformOptions.map((item) => item.value),
      platformOptions
    );
  });

  setLoadingConnectedPlatforms(false);
}

async function loadRules() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

const searchParams =
  typeof window !== "undefined"
    ? new URLSearchParams(window.location.search)
    : null;

const requestedMode = searchParams?.get("mode") || "";
const storedCampaignHandoff = getStoredCalendarCampaignHandoff();
const shouldUseStoredCampaignHandoff =
  requestedMode === "campaign" ||
  Boolean(searchParams?.get("campaignOpportunityId") || searchParams?.get("campaignId")) ||
  isRecentCalendarCampaignHandoff(storedCampaignHandoff);

const campaignOpportunityId =
  searchParams?.get("campaignOpportunityId") ||
  searchParams?.get("campaignId") ||
  (shouldUseStoredCampaignHandoff ? storedCampaignHandoff?.campaign?.id || "" : "");
const requestedBrandProfileId =
  searchParams?.get("brandProfileId") ||
  (shouldUseStoredCampaignHandoff ? storedCampaignHandoff?.brandProfileId || "" : "");
const requestedPlanId = searchParams?.get("plan") || "";
const shouldShowCampaignDebug =
  searchParams?.get("debugCampaign") === "1" ||
  requestedMode === "campaign" ||
  Boolean(campaignOpportunityId) ||
  Boolean(storedCampaignHandoff?.campaign?.id);

if (shouldShowCampaignDebug) {
  setCampaignDebugInfo({
    enabled: true,
    pageLoadedAt: new Date().toISOString(),
    currentUrl: window.location.href,
    queryString: window.location.search,
    requestedMode,
    urlCampaignOpportunityId: maskDebugId(searchParams?.get("campaignOpportunityId")),
    urlCampaignId: maskDebugId(searchParams?.get("campaignId")),
    resolvedCampaignOpportunityId: maskDebugId(campaignOpportunityId),
    urlBrandProfileId: maskDebugId(searchParams?.get("brandProfileId")),
    storedHandoffExists: Boolean(storedCampaignHandoff?.campaign?.id),
    storedHandoffIsRecent: isRecentCalendarCampaignHandoff(storedCampaignHandoff),
    storedHandoffBrandProfileId: maskDebugId(storedCampaignHandoff?.brandProfileId),
    storedHandoffCampaign: summarizeCampaignForDebug(storedCampaignHandoff?.campaign),
  });
}

let selectedBrandId = "";

try {
    selectedBrandId = await getCurrentBrandIdForUser(
    user,
    requestedBrandProfileId
  );
  setCurrentBrandId(selectedBrandId);
  if (shouldShowCampaignDebug) {
    setCampaignDebugInfo((current) => ({
      ...(current || {}),
      selectedBrandId: maskDebugId(selectedBrandId),
    }));
  }
  await loadConnectedPlatformsForBrand(user.id, selectedBrandId);
} catch (error) {
  setMessage(error.message || t("automation.errorLoadBrand"));
  setRules([]);
  setLoading(false);
  return;
}

if (!selectedBrandId) {
  setRules([]);
  setLoading(false);
  return;
}

const { data: brandProfileData, error: brandProfileError } = await supabase
  .from("brand_profiles")
  .select("id, business_name, website_product_mode_available, logo_url, logo_enabled_by_default")
  .eq("id", selectedBrandId)
  .eq("user_id", user.id)
  .maybeSingle();

if (brandProfileError) {
  setMessage(brandProfileError.message);
  setCurrentBrandProfile(null);
} else {
  setCurrentBrandProfile(brandProfileData || null);

  setSlots((currentSlots) =>
    currentSlots.map((slot) => {
      if (typeof slot.includeLogo === "boolean") {
        return slot;
      }

      return {
        ...slot,
        includeLogo: Boolean(brandProfileData?.logo_url) && brandProfileData?.logo_enabled_by_default !== false,
      };
    })
  );

  const brandAllowsWebsiteProductMode = Boolean(
    brandProfileData?.website_product_mode_available
  );

  if (!brandAllowsWebsiteProductMode) {
    const problemSolutionType = getContentTypeById("problem_solution");

    setSelectedContentTypeIds((currentTypeIds) =>
      getBrandSafeContentTypeIds(currentTypeIds, false)
    );

    setSlots((currentSlots) =>
      currentSlots.map((slot) => {
        if (slot.contentTypeId !== "website_item" || !problemSolutionType) {
          return slot;
        }

        return {
          ...slot,
          prompt: problemSolutionType.prompt,
          imagePrompt: problemSolutionType.imagePrompt,
          contentTypeId: problemSolutionType.id,
          contentTypeLabel: problemSolutionType.label,
          usesWebsiteContent: false,
          generateImage: true,
        };
      })
    );
  }
}
if (campaignOpportunityId) {
  const campaignLoaded = await loadCampaignOpportunityIntoPlanner({
    currentUser: user,
    selectedBrandId,
    campaignOpportunityId,
    selectedTimeZone: timeZone || DEFAULT_TIME_ZONE,
  });

  setCampaignDebugInfo((current) => ({
    ...(current || {}),
    campaignLoadedResult: Boolean(campaignLoaded),
  }));

  if (!campaignLoaded && requestedMode === "campaign") {
    setPlanCreationMode("campaign");
    setMessage(t("automation.errorCampaignNotFound"));
  }
} else if (shouldShowCampaignDebug) {
  setCampaignDebugInfo((current) => ({
    ...(current || {}),
    campaignLoadedResult: false,
    finalStatus: "no campaignOpportunityId was available in URL or localStorage",
  }));
}

const { data, error } = await supabase
  .from("automation_rules")
  .select("*")
  .eq("user_id", user.id)
  .eq("brand_profile_id", selectedBrandId);
    if (error) {
      setMessage(error.message);
    } else {
    const sortedRules = sortAutomationRules(data || []);

      setRules(sortedRules);
      setSelectedRuleIds((currentIds) =>
        currentIds.filter((ruleId) =>
          sortedRules.some((rule) => rule.id === ruleId)
        )
      );

      if (requestedPlanId) {
        const requestedRule = sortedRules.find((rule) => rule.id === requestedPlanId);

        if (requestedRule) {
          const requestedRuleGroup = getAutomationRuleGroup(sortedRules, requestedRule);
          loadExistingAutomationRuleGroupIntoPlanner(requestedRuleGroup);
        }
      }
    }

    const { data: balanceData, error: balanceError } = await supabase
      .from("user_credit_balances")
      .select(
  "credits_remaining, monthly_credit_limit, plan_name, subscription_status, subscription_plan, current_period_start, current_period_end, credits_renewed_at, trial_start, trial_end, cancel_at_period_end, payment_provider, provider_customer_id, provider_subscription_id, subscription_price_amount, subscription_currency"
)
      .eq("user_id", user.id)
      .single();

    if (!balanceError && balanceData) {
      setCreditBalance(balanceData);
    }

    setLoading(false);
  }

  function updateSlot(slotId, field, value) {
    setSlots((currentSlots) =>
      currentSlots.map((slot) => {
        if (slot.id !== slotId) {
          return slot;
        }

        if (field === "startDate") {
          const nextWeekday = getWeekdayFromDateString(value, timeZone);

          return {
            ...slot,
            startDate: value,
            weekday: nextWeekday,
            publishTime: getRecommendedTimeForWeekday(nextWeekday),
          };
        }

        return { ...slot, [field]: value };
      })
    );
  }

  function updatePlanStartDate(value) {
    setPlanStartDate(value);
    setSlots((currentSlots) =>
      applySmartScheduleToSlots(
        currentSlots,
        value,
        timeZone,
        defaultPublishTime,
        autoPlanGoal
      )
    );
  }

  function updateDefaultPublishTime(value) {
    setDefaultPublishTime(value);

    setSlots((currentSlots) =>
      applySmartScheduleToSlots(currentSlots, planStartDate, timeZone, value, autoPlanGoal)
    );
  }

  function toggleSlotInstructions(slotId) {
    setExpandedInstructionSlotIds((currentIds) =>
      currentIds.includes(slotId)
        ? currentIds.filter((id) => id !== slotId)
        : [...currentIds, slotId]
    );
  }

function addCampaignSlot() {
  if (!campaignOpportunity) {
    setMessage(t("automation.errorNoCampaignLoaded"));
    return;
  }

  setMessage("");

  setSlots((currentSlots) => {
    const nextIndex = currentSlots.length;
    const nextTotal = currentSlots.length + 1;
    const selectedTimeZone = timeZone || DEFAULT_TIME_ZONE;
    const hasFixedCampaignDate = Boolean(campaignOpportunity.event_date);

    let startDate = planStartDate;
    let publishTime = defaultPublishTime;
    let daysBeforeEvent = null;
    let timingAnchor = null;

    if (hasFixedCampaignDate) {
      const usedDaysBeforeEvent = currentSlots
        .map((slot) =>
          getDaysBetweenDateStrings(slot.startDate, campaignOpportunity.event_date)
        )
        .filter((value) => typeof value === "number" && value >= 0);

const todayDateString = getDateInputValueInTimeZone(
  new Date(),
  selectedTimeZone
);

const daysUntilEvent = getDaysBetweenDateStrings(
  todayDateString,
  campaignOpportunity.event_date
);

const maxFutureDaysBeforeEvent = Math.max(
  Math.floor(Number(daysUntilEvent) || 0),
  0
);

const futureDaysBeforeEvent = getFutureCampaignDaysBeforeEvent(
  nextTotal,
  maxFutureDaysBeforeEvent
);

const allFutureDaysBeforeEvent = Array.from({
  length: maxFutureDaysBeforeEvent + 1,
}).map((_, index) => maxFutureDaysBeforeEvent - index);

const preferredDays = Array.from(
  new Set([...futureDaysBeforeEvent, ...allFutureDaysBeforeEvent, 0])
);

daysBeforeEvent =
  preferredDays.find(
    (value) => !usedDaysBeforeEvent.includes(value)
  ) ?? 0;

startDate = addDaysToDateString(
  campaignOpportunity.event_date,
  -daysBeforeEvent
);

publishTime = getRecommendedTimeForDate(startDate, selectedTimeZone);
      
    } else if (campaignOpportunity.start_date && campaignOpportunity.end_date) {
      const temporaryPostPlan = buildCampaignPostPlan(
        campaignOpportunity,
        nextTotal
      );
      const temporarySchedule = buildDateRangeCampaignSchedule({
        campaign: campaignOpportunity,
        postPlan: temporaryPostPlan,
        timeZone: selectedTimeZone,
      });
      const usedDates = currentSlots.map((slot) => slot.startDate);
      const nextSchedule =
        temporarySchedule.find((item) => !usedDates.includes(item.startDate)) ||
        temporarySchedule[temporarySchedule.length - 1];

      startDate = nextSchedule?.startDate || planStartDate;
      publishTime = nextSchedule?.publishTime || getRecommendedTimeForDate(startDate, selectedTimeZone);
      daysBeforeEvent = nextSchedule?.daysBeforeEvent ?? null;
      timingAnchor = nextSchedule?.timingAnchor || null;
    } else {
      const sortedSlots = currentSlots
        .slice()
        .sort((a, b) =>
          `${a.startDate || ""} ${a.publishTime || ""}`.localeCompare(
            `${b.startDate || ""} ${b.publishTime || ""}`
          )
        );

const lastSlot = sortedSlots[sortedSlots.length - 1];

const safeCampaignStartDate = getSafeCampaignStartDate(
  campaignOpportunity,
  selectedTimeZone
);

const fallbackStartDate =
  lastSlot?.startDate ||
  planStartDate ||
  safeCampaignStartDate;

      const smartSchedule = buildSmartSlotSchedule({
        startDate: fallbackStartDate,
        count: 2,
        timeZone: selectedTimeZone,
        firstPublishTime: lastSlot?.publishTime || defaultPublishTime,
      });

      const nextSchedule = smartSchedule[1] || {
        startDate: addDaysToDateString(fallbackStartDate, 3),
        weekday: getWeekdayFromDateString(fallbackStartDate, selectedTimeZone),
        publishTime: defaultPublishTime,
      };

      startDate = nextSchedule.startDate;
      publishTime = nextSchedule.publishTime;
    }

    const postPlanItem = buildCampaignPostPlanItem({
      campaign: campaignOpportunity,
      postPlanItem: {},
      index: nextIndex,
      total: nextTotal,
      daysBeforeEvent,
      timingAnchor,
    });

    const contentSourceMode = getCampaignContentSourceMode(
      campaignOpportunity,
      postPlanItem,
      nextIndex,
      nextTotal
    );

    postPlanItem.content_source_mode = contentSourceMode;

    const newSlot = createSlot({
      startDate,
      weekday: getWeekdayFromDateString(startDate, selectedTimeZone),
      publishTime,
      prompt: buildCampaignPrompt(campaignOpportunity, postPlanItem, nextIndex),
      imagePrompt: buildCampaignImagePrompt(campaignOpportunity, postPlanItem),
     generateImage: true,
     contentTypeId: getCampaignSlotContentTypeId(contentSourceMode),
contentTypeLabel: getCampaignSlotContentTypeLabel(campaignOpportunity, contentSourceMode),
usesWebsiteContent: shouldUseWebsiteContentForCampaign(
  contentSourceMode,
  campaignOpportunity
),
contentFormat: getCampaignSlotContentFormat(contentSourceMode),
isCampaignSlot: true,
campaignRole: postPlanItem.role || "Campaign post",
campaignSummary: buildCampaignSummary(
  campaignOpportunity,
  postPlanItem,
  nextIndex
),
campaignPhase: postPlanItem.campaign_phase || "",
marketingAngle: postPlanItem.marketing_angle || "",
customerStage: postPlanItem.customer_stage || "",
ctaStrength: postPlanItem.cta_strength || "",
campaignPostIndex: postPlanItem.campaign_post_index || nextIndex + 1,
campaignPostCount: postPlanItem.campaign_post_count || nextTotal,
campaignGoal: postPlanItem.campaign_goal || "",
targetCustomerNeed: postPlanItem.target_customer_need || "",
strategyNotes: postPlanItem.strategy_notes || "",
dateLocked: false,
timeZone: selectedTimeZone,
    });


    return [...currentSlots, newSlot].sort((a, b) =>
      `${a.startDate || ""} ${a.publishTime || ""}`.localeCompare(
        `${b.startDate || ""} ${b.publishTime || ""}`
      )
    );
  });
}
function scrollToPlannerSchedule() {
  setTimeout(() => {
    const scheduleElement = document.querySelector(".planner-schedule-card");

    if (scheduleElement) {
      scheduleElement.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, 120);
}
  function addManualSlot() {
  setMessage("");

  const manualType = getContentTypeById("manual_prompt");
  const nextIndex = slots.length;

  const newSlot = createSlotFromContentType(
    manualType || {
      id: "manual_prompt",
      label: "Manual prompt",
      prompt: "",
      imagePrompt: "",
      usesWebsiteContent: false,
    },
    nextIndex,
    {
      startDate: planStartDate,
      timeZone,
      firstPublishTime: defaultPublishTime,
      generateImage: true,
    }
  );

  const preparedSlot = {
    ...newSlot,
    prompt: "",
    imagePrompt: "",
    generateImage: true,
    contentTypeId: "manual_prompt",
    contentTypeLabel: "Manual prompt",
    usesWebsiteContent: false,
  };

  setSlots((currentSlots) => [...currentSlots, preparedSlot]);
  setExpandedInstructionSlotIds((currentIds) => [
    ...currentIds,
    preparedSlot.id,
  ]);

  scrollToPlannerSchedule();
}
function addSlot() {
  setMessage("");

  if (planCreationMode === "campaign") {
    addCampaignSlot();
    return;
  }

  if (planCreationMode === "manual") {
    addManualSlot();
    return;
  }

  setShowAddPostModal(true);
}

  function addSlotFromContentType(typeId) {
    const selectedType = getContentTypeById(typeId);

    if (!selectedType) {
      return;
    }

    setSlots((currentSlots) => {
      const nextContentTypeIds = [
        ...currentSlots.map((slot) => slot.contentTypeId).filter(Boolean),
        selectedType.id,
      ];
      const smartSchedule = buildSmartSlotSchedule({
        startDate: planStartDate,
        count: currentSlots.length + 1,
        timeZone,
        contentTypeIds: nextContentTypeIds,
        goalId: autoPlanGoal,
      });

      const schedule = smartSchedule[currentSlots.length] || {
        startDate: planStartDate,
        weekday: getWeekdayFromDateString(planStartDate, timeZone),
        publishTime: getRecommendedTimeForDate(planStartDate, timeZone),
      };

      const newSlot = createSlot({
        startDate: schedule.startDate,
        publishTime: schedule.publishTime,
        weekday: schedule.weekday,
        prompt: selectedType.prompt,
        imagePrompt: selectedType.imagePrompt,
        generateImage: selectedType.id === "manual_prompt" ? false : true,
        contentTypeId: selectedType.id,
        contentTypeLabel: selectedType.label,
        usesWebsiteContent: Boolean(selectedType.usesWebsiteContent),
        contentFormat: selectedType.contentFormat || "single_image",
        timeZone,
      });

      if (selectedType.id === "manual_prompt") {
        setExpandedInstructionSlotIds((currentIds) => [
          ...currentIds,
          newSlot.id,
        ]);
      }

      return [...currentSlots, newSlot];
    });

    setShowAddPostModal(false);
  }
  function duplicateSlot(slotId) {
    const slotToCopy = slots.find((slot) => slot.id === slotId);
    if (!slotToCopy) return;

    setSlots((currentSlots) => [
      ...currentSlots,
      {
        ...slotToCopy,
        id: makeSlotId(),
      },
    ]);
  }

  function removeSlot(slotId) {
  if (slots.length === 1) {
    setMessage(t("automation.errorNeedOnePost"));
    return;
  }

  const slotIndex = slots.findIndex((slot) => slot.id === slotId);

  setSlots((currentSlots) =>
    currentSlots.filter((slot) => slot.id !== slotId)
  );

  if (planCreationMode === "select" && slotIndex >= 0) {
    setSelectedContentTypeIds((currentTypeIds) =>
      currentTypeIds.filter((_, index) => index !== slotIndex)
    );
  }
}

function changeAutoPlanGoal(goalId) {
  if (!goalId) {
    setAutoPlanGoal("");
    setSelectedContentTypeIds([]);
    setSlots([]);
    return;
  }

  const goalContentTypeIds = getGoalContentTypeIds({
    goalId,
    postCount: autoPlanPostCount,
    websiteProductModeAvailable,
  });

  setMessage("");
  setSavedPlanSummary(null);
  setAutoPlanGoal(goalId);
  
  if (planCreationMode === "select") {
  setSelectedContentTypeIds([]);
  setSlots([]);
  return;
}

  setSelectedContentTypeIds(goalContentTypeIds);

  setSlots(
    createRecommendedSlots({
      startDate: planStartDate,
      timeZone,
      autoPlanGoal: goalId,
      firstPublishTime: defaultPublishTime,
      postCount: autoPlanPostCount,
      websiteProductModeAvailable,
    })
  );
}
 function changeAutoPlanPostCount(nextCount) {
  setMessage("");
  setAutoPlanPostCount(nextCount);

   if (planCreationMode === "select") {
  setSelectedContentTypeIds([]);
  setSlots([]);
  return;
}

  if (!autoPlanGoal) {
    setSlots([]);
    setSelectedContentTypeIds([]);
    return;
  }

  const goalContentTypeIds = getGoalContentTypeIds({
    goalId: autoPlanGoal,
    postCount: nextCount,
    websiteProductModeAvailable,
  });

  setSelectedContentTypeIds(goalContentTypeIds);

  setSlots(
    createRecommendedSlots({
      startDate: planStartDate,
      timeZone,
      autoPlanGoal,
      firstPublishTime: defaultPublishTime,
      postCount: nextCount,
      websiteProductModeAvailable,
    })
  );
}
  function changePlanCreationMode(mode) {
    setMessage("");
    setPlanCreationMode(mode);

 if (mode === "auto") {
  if (!autoPlanGoal) {
    setSelectedContentTypeIds([]);
    setSlots([]);
    return;
  }

  const goalContentTypeIds = getGoalContentTypeIds({
    goalId: autoPlanGoal,
    postCount: autoPlanPostCount,
    websiteProductModeAvailable,
  });

  setSelectedContentTypeIds(goalContentTypeIds);

  setSlots(
    createRecommendedSlots({
      startDate: planStartDate,
      timeZone,
      autoPlanGoal,
      firstPublishTime: defaultPublishTime,
      postCount: autoPlanPostCount,
      websiteProductModeAvailable,
    })
  );

  return;
}

  if (mode === "select") {
  setSelectedContentTypeIds([]);
  setSlots([]);
  return;
}

  if (mode === "manual") {
  setSelectedContentTypeIds([]);
  setSlots([]);
  return;
}

if (mode === "manual") {
  setSelectedContentTypeIds([]);
  setSlots([]);
  return;
}

setSelectedContentTypeIds([]);
setSlots([
  createSlot({
    startDate: planStartDate,
    weekday: getWeekdayFromDateString(planStartDate, timeZone),
    publishTime: defaultPublishTime,
    timeZone,
  }),
]);
  }

function toggleContentType(typeId) {
  setMessage("");

  if (typeId === "website_item" && !websiteProductModeAvailable) {
    return;
  }

  if (selectedContentTypeIds.length >= autoPlanPostCount) {
    setMessage(
      t("automation.errorAlreadySelectedPosts", { count: autoPlanPostCount })
    );
    return;
  }

  const selectedType = getContentTypeById(typeId);

  if (!selectedType) {
    return;
  }

  const nextIndex = selectedContentTypeIds.length;

  const nextContentTypeIds = [...selectedContentTypeIds, typeId];
  const newSlot = createSlotFromContentType(selectedType, nextIndex, {
    startDate: planStartDate,
    timeZone,
    contentTypeIds: nextContentTypeIds,
    goalId: autoPlanGoal,
  });

  setSelectedContentTypeIds((currentTypeIds) => [...currentTypeIds, typeId]);
  setSlots((currentSlots) => [...currentSlots, newSlot]);

  setRecentlyAddedContentTypeId(typeId);

  setTimeout(() => {
    setRecentlyAddedContentTypeId("");
  }, 450);

  if (nextIndex + 1 >= autoPlanPostCount) {
    scrollToPlannerSchedule();
  }
}

  function toggleRuleSelection(ruleId) {
    setConfirmingBulkDelete(false);
    setConfirmingSingleDeleteId(null);

    setSelectedRuleIds((currentIds) =>
      currentIds.includes(ruleId)
        ? currentIds.filter((id) => id !== ruleId)
        : [...currentIds, ruleId]
    );
  }

  function toggleSelectVisibleRules() {
    setConfirmingBulkDelete(false);
    setConfirmingSingleDeleteId(null);

    if (allVisibleRulesSelected) {
      setSelectedRuleIds((currentIds) =>
        currentIds.filter((ruleId) => !visibleRuleIds.includes(ruleId))
      );
      return;
    }

    setSelectedRuleIds((currentIds) =>
      Array.from(new Set([...currentIds, ...visibleRuleIds]))
    );
  }

  function clearSelectedRules() {
    setSelectedRuleIds([]);
    setConfirmingBulkDelete(false);
    setConfirmingSingleDeleteId(null);
  }

  async function deleteRulesByIds(ruleIds) {
    if (!ruleIds.length) return;

    setDeletingRules(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const selectedBrandId =
  currentBrandId || (await getCurrentBrandIdForUser(user));

const { error } = await supabase
  .from("automation_rules")
  .delete()
  .eq("user_id", user.id)
  .eq("brand_profile_id", selectedBrandId)
  .in("id", ruleIds);

    if (error) {
      setMessage(error.message);
      setDeletingRules(false);
      return;
    }

    setRules((currentRules) =>
      currentRules.filter((rule) => !ruleIds.includes(rule.id))
    );
    setSelectedRuleIds((currentIds) =>
      currentIds.filter((ruleId) => !ruleIds.includes(ruleId))
    );
    setConfirmingBulkDelete(false);
    setConfirmingSingleDeleteId(null);
    setMessage(
      `${ruleIds.length} automation rule${
        ruleIds.length === 1 ? "" : "s"
      } deleted.`
    );

    setDeletingRules(false);
  }

  async function deleteSelectedRules() {
    if (!selectedRuleIds.length) return;

    if (!confirmingBulkDelete) {
      setConfirmingBulkDelete(true);
      setConfirmingSingleDeleteId(null);
      return;
    }

    await deleteRulesByIds(selectedRuleIds);
  }

  async function deleteSingleRule(ruleId) {
    if (confirmingSingleDeleteId !== ruleId) {
      setConfirmingSingleDeleteId(ruleId);
      setConfirmingBulkDelete(false);
      return;
    }

    await deleteRulesByIds([ruleId]);
  }

  function getAutomationRuleGroupKey(rule) {
    const createdMinute = String(rule?.created_at || "").slice(0, 16);
    const name = String(rule?.name || "").trim();
    const platformValue = String(rule?.platform || "").trim();
    const scheduleValue = String(rule?.schedule_type || "").trim();

    return [name, platformValue, scheduleValue, createdMinute].join("|");
  }

  function getAutomationRuleGroup(rulesToSearch, selectedRule) {
    if (!selectedRule?.id) return [];

    const selectedKey = getAutomationRuleGroupKey(selectedRule);

    return (rulesToSearch || [])
      .filter((rule) => getAutomationRuleGroupKey(rule) === selectedKey)
      .sort((a, b) =>
        `${a.run_date || ""} ${a.publish_time || ""}`.localeCompare(
          `${b.run_date || ""} ${b.publish_time || ""}`
        )
      );
  }

  function loadExistingAutomationRuleGroupIntoPlanner(ruleGroup) {
    const groupedRules = (ruleGroup || []).filter(Boolean);

    if (groupedRules.length <= 1) {
      loadExistingAutomationRuleIntoPlanner(groupedRules[0]);
      return;
    }

    const firstRule = groupedRules[0];
    const selectedTimeZone = firstRule.timezone || timeZone || DEFAULT_TIME_ZONE;
    const firstStartDate =
      firstRule.run_date ||
      getDateInputValueInTimeZone(
        firstRule.next_run_at ? new Date(firstRule.next_run_at) : new Date(),
        selectedTimeZone
      );

    setEditingRuleId("");
    setSavedPlanSummary(null);
    setMessage("");
    setCampaignOpportunity(null);
    setPlanCreationMode("auto");
    setPlanName(firstRule.name || "");
    setPlatform(firstRule.platform || "");
    setTone(firstRule.tone || "Friendly");
    setLanguage(firstRule.language || "Auto");
    setPostType(firstRule.post_type || "Offer");
    setLength(firstRule.length || "Medium");
    setCtaType(firstRule.cta_type || "Learn more");
    setScheduleType(firstRule.schedule_type || "weekly");
    setTimeZone(selectedTimeZone);
    setPlanStartDate(firstStartDate);
    setDefaultPublishTime(normalizeTime(firstRule.publish_time || defaultPublishTime));
    setAutoPlanGoal("");

    const preparedSlots = groupedRules.map((rule) => {
      const ruleStartDate =
        rule.run_date ||
        getDateInputValueInTimeZone(
          rule.next_run_at ? new Date(rule.next_run_at) : new Date(),
          selectedTimeZone
        );
      const contentType = getContentTypeById(rule.content_type_id);
      const contentTypeId = contentType?.id || rule.content_type_id || "manual_prompt";

      return createSlot({
        startDate: ruleStartDate,
        weekday: rule.weekday || getWeekdayFromDateString(ruleStartDate, selectedTimeZone),
        publishTime: normalizeTime(rule.publish_time || defaultPublishTime),
        prompt: rule.prompt || contentType?.prompt || "",
        imagePrompt: rule.image_prompt || contentType?.imagePrompt || "",
        generateImage: Boolean(rule.generate_image),
        includeEmojis: rule.include_emojis !== false,
        includeHashtags: rule.include_hashtags !== false,
        includeLogo: typeof rule.include_logo === "boolean" ? rule.include_logo : null,
        contentTypeId,
        contentTypeLabel:
          rule.content_type_label || contentType?.label || rule.post_type || "Manual prompt",
        usesWebsiteContent: Boolean(rule.uses_website_content || contentType?.usesWebsiteContent),
        contentFormat: rule.content_format || contentType?.contentFormat || "single_image",
        timeZone: selectedTimeZone,
      });
    });

    setSelectedContentTypeIds(preparedSlots.map((slot) => slot.contentTypeId).filter(Boolean));
    setSlots(preparedSlots);

    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        document
          .querySelector(".planner-primary-builder")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  function loadExistingAutomationRuleIntoPlanner(rule) {
    if (!rule?.id) return;

    const selectedTimeZone = rule.timezone || timeZone || DEFAULT_TIME_ZONE;
    const ruleStartDate =
      rule.run_date ||
      getDateInputValueInTimeZone(
        rule.next_run_at ? new Date(rule.next_run_at) : new Date(),
        selectedTimeZone
      );
    const rulePublishTime = normalizeTime(rule.publish_time || defaultPublishTime);
    const contentType = getContentTypeById(rule.content_type_id);
    const contentTypeId = contentType?.id || rule.content_type_id || "manual_prompt";

    setEditingRuleId(rule.id);
    setSavedPlanSummary(null);
    setMessage("");
    setCampaignOpportunity(null);
    setPlanCreationMode(contentTypeId === "manual_prompt" ? "manual" : "select");
    setPlanName(rule.name || "");
    setPlatform(rule.platform || "");
    setTone(rule.tone || "Friendly");
    setLanguage(rule.language || "Auto");
    setPostType(rule.post_type || "Offer");
    setLength(rule.length || "Medium");
    setCtaType(rule.cta_type || "Learn more");
    setScheduleType(rule.schedule_type || "weekly");
    setTimeZone(selectedTimeZone);
    setPlanStartDate(ruleStartDate);
    setDefaultPublishTime(rulePublishTime);
    setAutoPlanGoal("");
    setSelectedContentTypeIds(contentTypeId ? [contentTypeId] : []);
    setSlots([
      createSlot({
        startDate: ruleStartDate,
        weekday: rule.weekday || getWeekdayFromDateString(ruleStartDate, selectedTimeZone),
        publishTime: rulePublishTime,
        prompt: rule.prompt || contentType?.prompt || "",
        imagePrompt: rule.image_prompt || contentType?.imagePrompt || "",
        generateImage: Boolean(rule.generate_image),
        includeEmojis: rule.include_emojis !== false,
        includeHashtags: rule.include_hashtags !== false,
        includeLogo:
          typeof rule.include_logo === "boolean" ? rule.include_logo : null,
        contentTypeId,
        contentTypeLabel:
          rule.content_type_label || contentType?.label || rule.post_type || "Manual prompt",
        usesWebsiteContent: Boolean(rule.uses_website_content || contentType?.usesWebsiteContent),
        contentFormat: rule.content_format || contentType?.contentFormat || "single_image",
        timeZone: selectedTimeZone,
      }),
    ]);

    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        document
          .querySelector(".planner-primary-builder")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  async function savePlan() {
    setMessage("");
    setSavedPlanSummary(null);

    if (!slots.length) {
  setMessage(t("automation.errorChooseGoalBeforeSaving"));
  return;
}

    const invalidDateSlot = slots.find((slot) => !slot.startDate);

    if (invalidDateSlot) {
      setMessage(t("automation.errorStartDate"));
      return;
    }

    const invalidTimeSlot = slots.find((slot) => !slot.publishTime);

    if (invalidTimeSlot) {
      setMessage(t("automation.errorPublishTime"));
      return;
    }

    const invalidSlot = slots.find((slot) => !slot.prompt.trim());

    if (invalidSlot) {
      setMessage(t("automation.errorPrompt"));
      return;
    }

       if (creditBalance && plannedCredits > creditBalance.credits_remaining) {
      setMessage(t("automation.errorCredits", { credits: plannedCredits, remaining: creditBalance.credits_remaining }));
      return;
    }

    if (!platform) {
      setMessage(t("automation.errorConnectChannel"));
      return;
    }

    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

  const selectedBrandId =
  currentBrandId || (await getCurrentBrandIdForUser(user));

if (!selectedBrandId) {
  setMessage(t("automation.errorChooseBrand"));
  setSaving(false);
  return;
}

setCurrentBrandId(selectedBrandId);

const selectedTimeZone = timeZone || DEFAULT_TIME_ZONE;
const sortedPlanSlots = slots
  .slice()
  .sort((a, b) =>
    `${a.startDate || ""} ${a.publishTime || ""}`.localeCompare(
      `${b.startDate || ""} ${b.publishTime || ""}`
    )
  );
const firstPlanSlot = sortedPlanSlots[0];
const selectedGoalLabel = autoPlanGoal ? plannerGoalCopy[autoPlanGoal]?.label : "";
const sharedGeneratedPlanName =
  planName.trim() ||
  [
    selectedGoalLabel || t("automation.contentPlan"),
    firstPlanSlot?.startDate
      ? formatStartDateLabel(firstPlanSlot.startDate, selectedTimeZone, locale)
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

const rows = slots.map((slot) => {
      const slotWeekday = getWeekdayFromDateString(
        slot.startDate,
        selectedTimeZone
      );

      return {
        user_id: user.id,
        brand_profile_id: selectedBrandId,
        name: sharedGeneratedPlanName,
        weekday: slotWeekday,
        publish_time: slot.publishTime,
        prompt:
  slot.isCampaignSlot && slot.campaignSummary
    ? `${slot.prompt}

Post idea visible to customer:
${slot.campaignSummary}`
    : slot.prompt,
        platform,
        tone,
        language,
        post_type: postType,
        length,
        cta_type: ctaType,
        generate_image: slot.generateImage,
        image_prompt: slot.imagePrompt,
        include_emojis: slot.includeEmojis,
        include_hashtags: slot.includeHashtags,
        include_logo:
          typeof slot.includeLogo === "boolean"
            ? slot.includeLogo
            : Boolean(currentBrandProfile?.logo_url) && currentBrandProfile?.logo_enabled_by_default !== false,
        credit_cost: slot.generateImage ? 3 : 1,
        schedule_type: scheduleType,
        run_date: slot.startDate,
        timezone: selectedTimeZone,
        next_run_at: getInitialNextRunAtIso({
          scheduleType,
          publishTime: slot.publishTime,
          startDate: slot.startDate,
          timeZone: selectedTimeZone,
        }),
        approval_required: true,
        is_active: true,
               content_type_id: slot.contentTypeId,
        content_type_label: slot.contentTypeLabel,
        uses_website_content: Boolean(slot.usesWebsiteContent),
        content_format: slot.contentFormat || "single_image",

        campaign_phase: slot.campaignPhase || null,
        marketing_angle: slot.marketingAngle || null,
        customer_stage: slot.customerStage || null,
        cta_strength: slot.ctaStrength || null,
        campaign_post_index: slot.campaignPostIndex || null,
        campaign_post_count: slot.campaignPostCount || null,
        campaign_goal: slot.campaignGoal || null,
        target_customer_need: slot.targetCustomerNeed || null,
        strategy_notes: slot.strategyNotes || null,

        updated_at: new Date().toISOString(),
      };
    });

    if (editingRuleId) {
      const row = rows[0];
      const { data: updatedRules, error } = await supabase
        .from("automation_rules")
        .update(row)
        .eq("id", editingRuleId)
        .eq("user_id", user.id)
        .eq("brand_profile_id", selectedBrandId)
        .select("*");

      if (error) {
        setMessage(error.message);
        setSaving(false);
        return;
      }

      setRules((currentRules) =>
        sortAutomationRules([
          ...(updatedRules || []),
          ...currentRules.filter((rule) => rule.id !== editingRuleId),
        ])
      );
      setMessage(t("automation.planSaved"));
      setSavedPlanSummary({
        name: row.name || t("automation.contentPlan"),
        totalPosts: 1,
        scheduleType: row.schedule_type,
        postsPerWeek: row.schedule_type === "weekly" ? 1 : null,
        firstPostLabel: row.next_run_at
          ? formatDateTime(row.next_run_at, selectedTimeZone)
          : `${formatStartDateLabel(row.run_date, selectedTimeZone)} at ${normalizeTime(row.publish_time)}`,
        credits: row.credit_cost || 1,
        method: t("automation.contentPlan"),
      });
      setSaving(false);
      return;
    }

    const { data: insertedRules, error } = await supabase
  .from("automation_rules")
  .insert(rows)
  .select("*");

      if (error) {
      setMessage(error.message);
    } else {
      const nextRunDates = rows
        .map((row) => row.next_run_at)
        .filter(Boolean)
        .sort((a, b) => new Date(a) - new Date(b));

      const firstSlot = slots
        .slice()
        .sort((a, b) =>
          `${a.startDate || ""} ${a.publishTime || ""}`.localeCompare(
            `${b.startDate || ""} ${b.publishTime || ""}`
          )
        )[0];

      const firstPostLabel = nextRunDates[0]
        ? formatDateTime(nextRunDates[0], selectedTimeZone)
        : firstSlot
        ? `${formatStartDateLabel(
            firstSlot.startDate,
            selectedTimeZone
          )} at ${normalizeTime(firstSlot.publishTime)}`
        : "Not set";

      setMessage("");

      setSavedPlanSummary({
        name: sharedGeneratedPlanName,
        totalPosts: rows.length,
        scheduleType,
        postsPerWeek: scheduleType === "weekly" ? rows.length : null,
        firstPostLabel,
        credits: plannedCredits,
        method: formatPlanMode(planCreationMode),
      });

setPlanName("");
setLanguage("Auto");

setRules((currentRules) =>
  sortAutomationRules([...(insertedRules || []), ...currentRules])
);
    }

    setSaving(false);
  }
 function startAnotherPlan() {
  setMessage("");
  setSavedPlanSummary(null);
  setCampaignOpportunity(null);

  setPlanCreationMode("auto");
  setAutoPlanGoal("");
  setAutoPlanPostCount(DEFAULT_AUTO_PLAN_POST_COUNT);
  setSelectedContentTypeIds([]);
  setSlots([]);

  setPlanName("");
  setLanguage("Auto");
  setTone("Friendly");
  setPostType("Offer");
  setLength("Medium");
  setCtaType("Learn more");
  setScheduleType("weekly");
  setEditingRuleId("");
  setShowAdvancedSettings(false);

  if (typeof window !== "undefined") {
    const url = new URL(window.location.href);
    url.searchParams.delete("campaignOpportunityId");
    url.searchParams.delete("brandProfileId");
    url.searchParams.delete("plan");
    window.history.replaceState({}, "", url.toString());
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}
  return (
    <AppLayout active="automation">
      <div
        className={`automation-page planner-wizard-page ${campaignOpportunity ? "campaign-planner-clean" : ""}`}
        onClick={(event) => {
          if (!event.target.closest(".custom-picker-field")) {
            setOpenPickerId(null);
          }

          if (!event.target.closest(".platform-multiselect")) {
            setPlatformDropdownOpen(false);
          }
        }}
      >
        <div className="wizard-layout">
          <main className="wizard-main">
     <header className="planner-hero planner-hero-final">
  <div className="planner-hero-copy">
    <h2>
      {campaignOpportunity
        ? `Create campaign: ${campaignOpportunity.title}`
        : t("automation.heroSmartTitleWithBrand", {
            brandName: currentBrandProfile?.business_name || t("automation.yourBusiness"),
          })}
    </h2>
    <p>
      {campaignOpportunity
        ? t("automation.heroCampaignText")
        : t("automation.heroTextSmartPlan")}
    </p>
  </div>

  <div className="planner-hero-visual" aria-hidden="true">
    <div className="planner-hero-orb" />
    <div className="planner-hero-calendar">
      <span />
      <span className="checked">✓</span>
      <span />
      <span className="checked">✓</span>
      <span />
      <span className="checked">✓</span>
      <span />
      <span />
      <span className="checked">✓</span>
    </div>
    <div className="planner-hero-mascot">✦</div>
  </div>

  <button
    type="button"
    className="learn-more-button planner-hero-learn"
    onClick={() => setShowLearnMoreModal(true)}
  >
    ⓘ {t("automation.learnMore")}
  </button>
</header>

{campaignOpportunity && (
  <section className="campaign-mode-banner">
    <div>
      <p className="dashboard-eyebrow">{t("automation.campaignMode")}</p>
      <h3>{campaignOpportunity.title}</h3>
      <span>
        {campaignOpportunity.description ||
          t("automation.campaignDescriptionFallback")}
      </span>
    </div>

      <div className="campaign-mode-meta">
      <span>{t("automation.campaignDate")}</span>
      <strong>{getCampaignDateLabel(campaignOpportunity)}</strong>

      <span>{t("automation.recommendedPlan")}</span>
      <strong>
        {t("automation.postCount", { count: getCampaignRecommendedPostCount(campaignOpportunity, slots.length) })}
      </strong>
    </div>
  </section>
)}

{campaignDebugInfo?.enabled && (
  <section
    style={{
      margin: "18px 0",
      padding: "16px",
      border: "2px solid #f59e0b",
      borderRadius: "18px",
      background: "#fff7ed",
      color: "#111827",
      boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)",
    }}
  >
    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" }}>
      <div>
        <p style={{ margin: "0 0 4px", fontSize: "12px", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#92400e" }}>
          Campaign debug
        </p>
        <h3 style={{ margin: 0, fontSize: "18px" }}>Kalender → AI Content Studio</h3>
        <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#475569" }}>
          Skicka en skärmbild på denna ruta om kampanjen fortfarande hamnar i vanligt läge eller visar 0 inlägg.
        </p>
      </div>
      <strong style={{ color: campaignDebugInfo.finalSlotCount > 0 ? "#047857" : "#b45309" }}>
        {campaignDebugInfo.finalStatus || "debug active"}
      </strong>
    </div>
    <pre
      style={{
        marginTop: "12px",
        maxHeight: "360px",
        overflow: "auto",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        fontSize: "12px",
        lineHeight: 1.5,
        background: "#0f172a",
        color: "#e5e7eb",
        borderRadius: "12px",
        padding: "12px",
      }}
    >
      {JSON.stringify(campaignDebugInfo, null, 2)}
    </pre>
  </section>
)}

            {planCreationMode !== "campaign" && (
            <section className="planner-builder-card planner-primary-builder">
              <div className="planner-builder-header">
                <div className="planner-builder-step-badge">1</div>
                <div>
                  <h3>{t("automation.chooseGoalAndSchedule")}</h3>
                  <p>{t("automation.mainObjectiveSmart")}</p>
                </div>
              </div>

              <div className="planner-setup-grid">
<div className="planner-setup-card">
  <div className="setup-step-title">
    <span className="setup-title-icon" aria-hidden="true">🎯</span>
    <div>
      <strong>
        {planCreationMode === "campaign" ? t("automation.campaignGoal") : t("automation.goal")}
      </strong>
      <small>
        {planCreationMode === "campaign"
          ? t("automation.campaignGoalHelp")
          : t("automation.mainObjectiveSmart")}
      </small>
    </div>
  </div>

  {planCreationMode === "campaign" ? (
    <div className="planner-campaign-count-box">
      <strong>🎯</strong>
      <span>{t("automation.focusedCampaignFromCalendar")}</span>
    </div>
  ) : (
   <select
  className="planner-select-control"
  value={planCreationMode === "manual" ? "" : autoPlanGoal}
  disabled={planCreationMode === "manual"}
  onChange={(event) => {
    changeAutoPlanGoal(event.target.value);
  }}
>
 <option value="" disabled>
  {planCreationMode === "manual"
    ? t("automation.notUsedForManual")
    : t("automation.chooseGoalToBuild")}
</option>
      {autoPlanGoals.map((goal) => (
        <option key={goal.id} value={goal.id}>
          {translateAutoPlanGoalLabel(goal.id)}
        </option>
      ))}
    </select>
  )}

  <SetupHelperNote
    variant="goal"
    icon={<GoalHelperIcon />}
  >
    {planCreationMode === "campaign"
      ? t("automation.campaignConnectedText")
      : translateAutoPlanGoalDescription(autoPlanGoal) ||
        (plannerLocaleIsSwedish
          ? "Välj ett mål så anpassar Spreelo innehållstyperna efter din plan."
          : "Choose a goal so Spreelo can tailor the content types to your plan.")}
  </SetupHelperNote>
</div>

              <div className="planner-setup-card">
                <div className="setup-step-title">
                  <span className="setup-title-icon" aria-hidden="true">▦</span>
                  <div>
                    <strong>
                      {planCreationMode === "campaign"
                        ? t("automation.campaignPosts")
                        : t("automation.postsPerWeek")}
                    </strong>
                    <small>
                      {planCreationMode === "campaign"
                        ? t("automation.howManyCampaignPosts")
                        : t("automation.howOftenPost")}
                    </small>
                  </div>
                </div>

                {planCreationMode === "campaign" ? (
                  <div className="planner-campaign-count-box">
                    <strong>{slots.length}</strong>
                    <span>{t("automation.plannedCampaignPosts")}</span>
                  </div>
                ) : (
                  <div className="planner-segmented-buttons">
                    {autoPlanPostCountOptions.map((option) => (
                   <button
  type="button"
  key={option}
  disabled={planCreationMode === "manual"}
  className={
    planCreationMode !== "manual" && autoPlanPostCount === option
      ? "active"
      : ""
  }
  onClick={() => {
    if (planCreationMode === "manual") return;
    changeAutoPlanPostCount(option);
  }}
>
  {option}
</button>
                    ))}
                  </div>
                )}

                <SetupHelperNote
                  variant="frequency"
                  icon={<FrequencyHelperIcon />}
                >
                  {planCreationMode === "campaign"
                    ? t("automation.campaignPostsPrepared", { count: slots.length })
                    : planCreationMode === "manual"
                    ? t("automation.manualPostsAdded")
                    : t("automation.recommendedGrowthSmart")}
                </SetupHelperNote>
              </div>

              <div className="planner-setup-card">
                <div className="setup-step-title">
                  <span className="setup-title-icon" aria-hidden="true">📅</span>
                  <div>
                    <strong>{t("automation.startDateTime")}</strong>
                    <small>{t("automation.whenStart")}</small>
                  </div>
                </div>

                <div className="planner-date-time-row">
                  <DatePickerField
                    value={planStartDate}
                    onChange={updatePlanStartDate}
                    pickerId="top-start-date"
                    openPickerId={openPickerId}
                    setOpenPickerId={setOpenPickerId}
                    timeZone={timeZone}
                    compact
                    weekdayLabels={weekdayLabels}
                    locale={locale}
                  />

                  <TimePickerField
                    value={defaultPublishTime}
                    onChange={updateDefaultPublishTime}
                    pickerId="top-start-time"
                    openPickerId={openPickerId}
                    setOpenPickerId={setOpenPickerId}
                    compact
                  />
                </div>

                <SetupHelperNote
                  variant="timing"
                  icon={<TimingHelperIcon />}
                >
                  {t("automation.scheduleFromDateTime")}
                </SetupHelperNote>
              </div>
              </div>
            </section>
            )}

            {planCreationMode === "campaign" ? null : (
  <section className="planner-mode-card">
    <div className="planner-mode-grid">
      <button
        type="button"
        className={`planner-mode-option ${
          planCreationMode === "auto" ? "active" : ""
        }`}
        onClick={() => changePlanCreationMode("auto")}
      >
        <span className="mode-radio">
          {planCreationMode === "auto" ? "✓" : ""}
        </span>
        <div className="mode-big-icon">✦</div>
        <strong>{t("automation.autoPlan")}</strong>
        <p>{t("automation.autoPlanText")}</p>
        <small>{t("automation.recommended")}</small>
      </button>

      <button
        type="button"
        className={`planner-mode-option ${
          planCreationMode === "select" ? "active" : ""
        }`}
        onClick={() => changePlanCreationMode("select")}
      >
        <span className="mode-radio">
          {planCreationMode === "select" ? "✓" : ""}
        </span>
        <div className="mode-big-icon neutral">▦</div>
        <strong>{t("automation.chooseContentTypes")}</strong>
        <p>{t("automation.chooseContentTypesText")}</p>
      </button>

      <button
        type="button"
        className={`planner-mode-option ${
          planCreationMode === "manual" ? "active" : ""
        }`}
        onClick={() => changePlanCreationMode("manual")}
      >
        <span className="mode-radio">
          {planCreationMode === "manual" ? "✓" : ""}
        </span>
        <div className="mode-big-icon neutral">✎</div>
        <strong>{t("automation.manualPrompt")}</strong>
        <p>{t("automation.manualPromptText")}</p>
      </button>
    </div>

    {planCreationMode === "select" && (
      <div className="planner-content-picker">
        <div className="planner-section-heading">
          <div>
         <h3>{t("automation.choosePostTypes", { count: autoPlanPostCount })}</h3>
<p>
  {t("automation.choosePostTypesText")}
</p>
          </div>

          <span>
  {Math.min(selectedContentTypeIds.length, autoPlanPostCount)}/
  {autoPlanPostCount} {t("automation.selected")}
</span>
        </div>

        <div className="planner-content-grid">
                    {visibleContentTypes.map((type) => {
            const isRecentlyAdded = recentlyAddedContentTypeId === type.id;

            return (
              <button
                type="button"
                key={type.id}
               className={`planner-content-chip ${
  isRecentlyAdded ? "just-added" : ""
}`}
                onClick={() => toggleContentType(type.id)}
              >
                <span>{getContentTypeIcon(type.id)}</span>
                <strong>{translateContentTypeShortLabel(type)}</strong>
                <p>{translateContentTypeDescription(type)}</p>
              </button>
            );
          })}
        </div>
        <div className="content-picker-progress-note">
  {selectedContentTypeIds.length < autoPlanPostCount ? (
    <span>
      {t("automation.chooseMorePosts", { count: autoPlanPostCount - selectedContentTypeIds.length })}
    </span>
  ) : (
    <span>{t("automation.planReadyReview")}</span>
  )}
</div>
      </div>
    )}

  </section>
)}
            {planCreationMode === "manual" && !planWasSaved && (
  <section className="planner-manual-intro-card">
    <div>
      <h3>{t("automation.manualPrompt")}</h3>
      <p>
        {t("automation.manualIntroText")}
      </p>
    </div>

    <button type="button" className="add-plan-button" onClick={addManualSlot}>
      {t("automation.addManualPost")}
    </button>
  </section>
)}
{shouldShowPlannerDetails && (
  <>
              {planWasSaved ? (
  <section className="planner-schedule-card campaign-saved-card">
    <div className="campaign-saved-icon">✓</div>

    <div>
      <p className="dashboard-eyebrow">{t("automation.campaignScheduled")}</p>
      <h3>{t("automation.savedPlanReady", { name: savedPlanSummary.name })}</h3>
      <p>
        {t("automation.savedPlanText")}
      </p>

      <div className="campaign-saved-grid">
        <div>
          <span>{t("automation.plannedPosts")}</span>
          <strong>{savedPlanSummary.totalPosts}</strong>
        </div>

        <div>
          <span>{t("automation.firstPost")}</span>
          <strong>{savedPlanSummary.firstPostLabel}</strong>
        </div>


        <div>
          <span>{t("automation.credits")}</span>
          <strong>{savedPlanSummary.credits}</strong>
        </div>
      </div>

      <div className="campaign-saved-actions">
        <button type="button" onClick={() => setShowSavedRules(true)}>
          {t("automation.viewContentPlans")}
        </button>

        <a href="/">{t("automation.goToDashboard")}</a>
      </div>
    </div>
  </section>
) : (
  <section className="planner-schedule-card">
    <div className="planner-schedule-header">
      <div>
        <h3>{t("automation.planCreationPreviewTitle")}</h3>
        <span>{t("automation.planCreationPreviewText")}</span>
      </div>

    </div>

    <div className="planner-post-table">
      {slots.map((slot, index) => {
        const instructionsAreExpanded =
          expandedInstructionSlotIds.includes(slot.id);
        const displayLabel = getCustomerSlotLabel(slot);
        const displayDescription = getCustomerSlotPurpose(slot);
        const formatLabel = getLocalizedSlotFormatLabel(slot);
        const hasStrategyInfo =
          slot.isCampaignSlot &&
          (slot.marketingAngle ||
            slot.customerStage ||
            slot.ctaStrength ||
            slot.campaignPhase ||
            slot.strategyNotes);


        return (
          <article
          className={`planner-post-row type-${slot.contentTypeId || "custom"} ${
  instructionsAreExpanded ? "expanded" : ""
}`}
            key={slot.id}
          >
            <div className="planner-post-mainline">
              <div className="planner-post-index">{index + 1}</div>

                    <div className="planner-post-title">
                <div className="planner-post-title-row">
                  {slot.isCampaignSlot && (
                    <span
                      className={`strategy-stage-dot ${getCustomerStageDotClass(
                        slot.customerStage
                      )}`}
                      title={getCustomerStageLabel(slot.customerStage)}
                    />
                  )}

                  <span
                    className={`planner-post-type-icon type-${slot.contentTypeId || "custom"}`}
                    aria-hidden="true"
                  >
                    {getSlotTypeIcon(slot)}
                  </span>

                  <strong>
                    {slot.isCampaignSlot && slot.marketingAngle
                      ? getCampaignAngleLabel(slot.marketingAngle)
                      : displayLabel}
                  </strong>

                  {hasStrategyInfo && (
                    <button
                      type="button"
                      className="strategy-info-button"
                      aria-label={t("automation.showCampaignStrategy")}
                    >
                      i
                      <span className="strategy-info-popover">
                        <span className="strategy-info-title">
                          {t("automation.strategyForThisPost")}
                        </span>

                        <span>
                          <strong>{t("automation.audience")}:</strong>{" "}
                          {getCustomerStageLabel(slot.customerStage)}
                        </span>

                        <span>
                          <strong>{t("automation.angle")}:</strong>{" "}
                          {getCampaignAngleLabel(slot.marketingAngle)}
                        </span>

                        <span>
                          <strong>{t("automation.cta")}:</strong>{" "}
                          {getCtaStrengthLabel(slot.ctaStrength)}
                        </span>

                        {slot.campaignPhase && (
                          <span>
                            <strong>{t("automation.phase")}:</strong> {slot.campaignPhase}
                          </span>
                        )}

                        {slot.strategyNotes && (
                          <span className="strategy-info-note">
                            {slot.strategyNotes}
                          </span>
                        )}
                      </span>
                    </button>
                  )}
                </div>

                <span>{displayDescription}</span>
              </div>
              <div className="planner-post-date">
                {slot.dateLocked ? (
                  <div className="locked-campaign-date">
                    <strong>{formatStartDateLabel(slot.startDate, timeZone, locale)}</strong>
                    <span>{t("automation.lockedCampaignDate")}</span>

                    <button
                      type="button"
                      className="unlock-campaign-date-button"
                      onClick={() => updateSlot(slot.id, "dateLocked", false)}
                    >
                      Unlock
                    </button>
                  </div>
                ) : (
                  <DatePickerField
                    value={slot.startDate}
                    onChange={(value) =>
                      updateSlot(slot.id, "startDate", value)
                    }
                    pickerId={`slot-date-${slot.id}`}
                    openPickerId={openPickerId}
                    setOpenPickerId={setOpenPickerId}
                    timeZone={timeZone}
                    compact
                    weekdayLabels={weekdayLabels}
                    locale={locale}
                  />
                )}
              </div>

              <div className="planner-post-time">
                <TimePickerField
                  value={slot.publishTime}
                  onChange={(value) =>
                    updateSlot(slot.id, "publishTime", value)
                  }
                  pickerId={`slot-time-${slot.id}`}
                  openPickerId={openPickerId}
                  setOpenPickerId={setOpenPickerId}
                  compact
                />
              </div>

              <div className="planner-post-format">
                <span>{slot.generateImage ? "▧" : "T"}</span>
                {formatLabel}
              </div>

              <div className="planner-post-actions">
                <button
                  type="button"
                  className="planner-post-edit-icon-button"
                  title={instructionsAreExpanded ? t("automation.hide") : t("automation.edit")}
                  aria-label={instructionsAreExpanded ? t("automation.hide") : t("automation.edit")}
                  onClick={() => toggleSlotInstructions(slot.id)}
                >
                  {instructionsAreExpanded ? "✕" : "✎"}
                </button>

                <button
                  type="button"
                  title={t("automation.duplicate")}
                  onClick={() => duplicateSlot(slot.id)}
                >
                  ⧉
                </button>

              <button
  type="button"
  title={t("automation.remove")}
  aria-label={t("automation.removePost")}
  className="planner-post-delete-button"
  onClick={() => removeSlot(slot.id)}
>
  🗑
</button>
              </div>
            </div>

            {(instructionsAreExpanded ||
              planCreationMode === "manual" ||
              (!slot.isCampaignSlot && slot.contentTypeId === "manual_prompt")) && (
              <div className="planner-post-expanded">
                <div className="planner-post-expanded-copy">
                  <label>{slot.isCampaignSlot ? t("automation.postIdea") : t("automation.instructions")}</label>

                  <textarea
                    className="input prompt-textarea"
                    value={slot.isCampaignSlot ? slot.campaignSummary : slot.prompt}
                    onChange={(event) =>
                      updateSlot(
                        slot.id,
                        slot.isCampaignSlot ? "campaignSummary" : "prompt",
                        event.target.value
                      )
                    }
                    placeholder={
  slot.isCampaignSlot
    ? t("automation.placeholderCampaignPost")
    : t("automation.placeholderPostInstructions")
}
                  />

                  {slot.generateImage && (
                    <>
                      <label>{t("automation.imageDirection")}</label>
                      <textarea
                        className="input prompt-textarea"
                        value={slot.imagePrompt}
                        onChange={(event) =>
                          updateSlot(slot.id, "imagePrompt", event.target.value)
                        }
                        placeholder={t("automation.placeholderImageDirection")}
                      />
                    </>
                  )}
                </div>

                <div className="planner-post-options">
                  <label>
                    <input
                      type="checkbox"
                      checked={slot.generateImage}
                      onChange={(event) =>
                        updateSlot(slot.id, "generateImage", event.target.checked)
                      }
                    />
                    {slot.usesWebsiteContent
                      ? t("automation.websiteImageFallback")
                      : t("automation.aiImage")}
                  </label>

                  {currentBrandProfile?.logo_url && (
                    <label>
                      <input
                        type="checkbox"
                        checked={
                          typeof slot.includeLogo === "boolean"
                            ? slot.includeLogo
                            : currentBrandProfile.logo_enabled_by_default !== false
                        }
                        onChange={(event) =>
                          updateSlot(slot.id, "includeLogo", event.target.checked)
                        }
                      />
                      {t("automation.includeLogo")}
                    </label>
                  )}

                  <label>
                    <input
                      type="checkbox"
                      checked={slot.includeEmojis}
                      onChange={(event) =>
                        updateSlot(slot.id, "includeEmojis", event.target.checked)
                      }
                    />
                    {t("automation.emojis")}
                  </label>

                  <label>
                    <input
                      type="checkbox"
                      checked={slot.includeHashtags}
                      onChange={(event) =>
                        updateSlot(slot.id, "includeHashtags", event.target.checked)
                      }
                    />
                    {t("automation.hashtags")}
                  </label>

                  <span>{getSlotCreditLabel(slot)}</span>
                </div>
              </div>
            )}
          </article>
        );
      })}
    </div>

       <button
      type="button"
      className="planner-add-post-bottom"
      onClick={addSlot}
    >
      {planCreationMode === "campaign"
        ? t("automation.addAnotherCampaignPost")
        : planCreationMode === "manual"
        ? t("automation.addAnotherManualPost")
        : t("automation.addAnotherPost")}
    </button>
  </section>
)}

                        <section className="planner-settings-card planner-builder-card planner-settings-builder">
              <div className="planner-builder-header">
                <div className="planner-builder-step-badge">2</div>
                <div>
                  <h3>{t("automation.settings")}</h3>
                  <p>{t("automation.settingsHelp")}</p>
                </div>
                <span className="planner-recommended-pill">{t("automation.recommended")}</span>
              </div>

            <div className="planner-settings-grid simple">
  {loadingConnectedPlatforms ? (
    <div className="planner-setting-field planner-setting-connect-box">
      <div className="planner-setting-head">
        <span className="planner-setting-icon">🌐</span>
        <strong>{t("automation.platform")}</strong>
      </div>
      <div className="input">{t("automation.loadingConnectedChannels")}</div>
    </div>
  ) : connectedPlatformOptions.length > 0 ? (
    <div className="planner-setting-field">
      <div className="planner-setting-head">
        <span className="planner-setting-icon">🌐</span>
        <strong>{t("automation.platform")}</strong>
      </div>

      <div className={`platform-multiselect ${platformDropdownOpen ? "open" : ""}`}>
        <button
          type="button"
          className="platform-multiselect-button"
          onClick={(event) => {
            event.stopPropagation();
            setPlatformDropdownOpen((current) => !current);
          }}
        >
          <span className="platform-selected-icons">
            {selectedPlatformOptions.length > 0 ? (
              selectedPlatformOptions.map((item) => (
                <img
                  key={item.value}
                  src={item.icon}
                  alt={item.label}
                  className="platform-icon-img"
                />
              ))
            ) : (
              <span className="platform-placeholder">{t("automation.choosePlatform")}</span>
            )}
          </span>
          <span className="platform-caret">⌄</span>
        </button>

        {platformDropdownOpen && (
          <div className="platform-multiselect-menu" onClick={(event) => event.stopPropagation()}>
            {connectedPlatformOptions.map((item) => {
              const checked = selectedPlatformKeys.includes(item.value);

              return (
                <label key={item.value} className="platform-multiselect-option">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const nextKeys = checked
                        ? selectedPlatformKeys.filter((key) => key !== item.value)
                        : [...selectedPlatformKeys, item.value];

                      setPlatform(formatPlatformSelectionFromKeys(nextKeys, connectedPlatformOptions));
                    }}
                  />
                  <img src={item.icon} alt="" className="platform-icon-img" />
                  <span>{item.label}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <p>{safePlannerText("platformHelp")}</p>
    </div>
  ) : (
    <div className="planner-setting-field planner-setting-connect-box">
      <div className="planner-setting-head">
        <span className="planner-setting-icon">🌐</span>
        <strong>{t("automation.platform")}</strong>
      </div>

      <div className="planner-connect-first-card">
        <strong>{t("automation.connectSocialChannelFirst")}</strong>
        <p>{t("automation.connectSocialChannelFirstText")}</p>

        <a href="/social-channels" className="planner-connect-first-link">
          {t("automation.goToSocialChannels")}
        </a>
      </div>
    </div>
  )}

  <label className="planner-setting-field">
    <div className="planner-setting-head">
      <span className="planner-setting-icon">✧</span>
      <strong>{safePlannerText("languageForPosts")}</strong>
    </div>
    <select
      value={language}
      onChange={(event) => setLanguage(event.target.value)}
    >
      {languageOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
    <p>{safePlannerText("languageHelpSmart")}</p>
  </label>


  <label className="planner-setting-field">
    <div className="planner-setting-head">
      <span className="planner-setting-icon">↻</span>
      <strong>{safePlannerText("repeatFull")}</strong>
    </div>
    <select
      value={scheduleType}
      onChange={(event) => setScheduleType(event.target.value)}
    >
      <option value="weekly">{t("automation.weekly")}</option>
      <option value="once">{t("automation.oneTime")}</option>
    </select>
    <p>{safePlannerText("repeatHelpSmart")}</p>
  </label>


  <label className="planner-setting-field">
    <div className="planner-setting-head">
      <span className="planner-setting-icon">⏱</span>
      <strong>{t("automation.timezone")}</strong>
    </div>
    <select
      value={timeZone}
      onChange={(event) => setTimeZone(event.target.value)}
    >
      {timeZoneOptions.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
    <p>{safePlannerText("timezoneHelpSmart")}</p>
  </label>
</div>
            </section>

            {shouldShowPlannerDetails && !planWasSaved && (
              <section className="planner-includes-preview-card">
                <div className="planner-preview-panel">
                  <div className="planner-section-heading compact">
                    <div>
                      <h3>{t("automation.planIncludesTitle")}</h3>
                      <p>{safePlannerText("planIncludesText")}</p>
                    </div>
                  </div>

                  <div className="planner-includes-chip-grid">
                    {getPlanPreviewCardsFromTypes(includedContentTypes, autoPlanGoal).map((card) => (
                      <div className={`planner-includes-chip preview-${card.id}`} key={card.id}>
                        <span>{card.icon}</span>
                        <strong>{translatePreviewCardLabel(card.id)}</strong>
                        <small>{translatePreviewCardDescription(card.id)}</small>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}
  </>
)}
            <section className="planner-how-it-works-card">
              <h3>{t("automation.howItWorksTitle")}</h3>
              <div className="planner-how-it-works-grid">
                <div>
                  <span>✦</span>
                  <strong>{t("automation.howItWorksAutomaticTitle")}</strong>
                  <p>{t("automation.howItWorksAutomaticText")}</p>
                </div>

                <div>
                  <span>🌐</span>
                  <strong>{t("automation.howItWorksChannelsTitle")}</strong>
                  <p>{t("automation.howItWorksChannelsText")}</p>
                </div>

                <div>
                  <span>✉</span>
                  <strong>{t("automation.howItWorksApprovalTitle")}</strong>
                  <p>{t("automation.howItWorksApprovalText")}</p>
                </div>

                <div>
                  <span>⌘</span>
                  <strong>{t("automation.howItWorksManageTitle")}</strong>
                  <p>{t("automation.howItWorksManageText")}</p>
                </div>
              </div>
            </section>

            <section className="planner-save-card">
              <div>
  <h3>{savedPlanSummary ? t("automation.planSaved") : t("automation.startAutomaticPlanTitle")}</h3>
  <p>
    {savedPlanSummary
      ? t("automation.automationPlanReady")
      : t("automation.startAutomaticPlanHelp")}
  </p>
</div>
         {savedPlanSummary ? null : (
  <>
    <input
      className="planner-save-input"
      value={planName}
      onChange={(event) => setPlanName(event.target.value)}
      placeholder={t("automation.planNamePlaceholderShort")}
    />

    <div className="planner-save-action-stack">
      <button
        type="button"
        className="planner-save-button"
        onClick={savePlan}
        disabled={saving || !hasEnoughCredits}
      >
        {saving ? t("automation.saving") : t("automation.startActivatePlan")}
      </button>
      <p className="planner-save-trust">🔒 {t("automation.startAutomaticPlanTrust")}</p>
    </div>
  </>
)}

                          {message && <p className="planner-save-message">{message}</p>}

              {savedPlanSummary && (
                <div className="planner-save-success">
                  <div className="planner-save-success-icon">✓</div>

                  <div className="planner-save-success-content">
                    <div className="planner-save-success-header">
                      <div>
                        <p>{t("automation.yourContentPlanSaved")}</p>
                        <h4>{savedPlanSummary.name}</h4>
                      </div>

                      <span>{savedPlanSummary.method}</span>
                    </div>

                    <div className="planner-save-success-grid">
                      <div>
                        <span>
                          {savedPlanSummary.scheduleType === "weekly"
                            ? t("automation.postsPerWeek")
                            : t("automation.plannedPosts")}
                        </span>
                        <strong>
                          {savedPlanSummary.scheduleType === "weekly"
                            ? t("automation.postCount", { count: savedPlanSummary.postsPerWeek })
                            : t("automation.postCount", { count: savedPlanSummary.totalPosts })}
                        </strong>
                      </div>

                      <div>
                        <span>{t("automation.firstPost")}</span>
                        <strong>{savedPlanSummary.firstPostLabel}</strong>
                      </div>


                      <div>
                        <span>{t("automation.credits")}</span>
                        <strong>
                          {savedPlanSummary.credits} {t("automation.creditsUsedWhenGenerated")}
                        </strong>
                      </div>
                    </div>

                    <div className="planner-save-success-actions">
                      <button
                        type="button"
                        onClick={() => setShowSavedRules(true)}
                      >
                        {t("automation.viewContentPlans")}
                      </button>

                      <a href="/">{t("automation.goToDashboard")}</a>
                    </div>
                  </div>
                </div>
              )}
            </section>
            <section className="saved-card saved-card-compact">
              <div className="saved-header">
                <div>
                  <p>{t("automation.savedPlans")}</p>
                  <h3>{t("automation.contentPlans")}</h3>
                </div>

              </div>

              {loading ? (
                <div className="automation-empty">
                  <h4>{t("automation.loadingContentPlans")}</h4>
                  <p>{t("automation.loadingContentPlansText")}</p>
                </div>
              ) : rules.length === 0 ? (
                <div className="automation-empty">
                  <div className="folder-icon">📁</div>
                  <div>
                    <h4>{t("automation.noContentPlansYet")}</h4>
                    <p>{t("automation.noContentPlansText")}</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="saved-bulk-actions">
                    <label className="image-check">
                      <input
                        type="checkbox"
                        checked={allVisibleRulesSelected}
                        onChange={toggleSelectVisibleRules}
                      />
                      {t("automation.selectVisible")}
                    </label>

                    <span>
                      {t("automation.selectedRulesCount", { count: selectedRuleIds.length })}
                      {!showSavedRules && rules.length > 3
                        ? ` · ${t("automation.showingRulesCount", { visible: visibleRules.length, total: rules.length })}`
                        : ""}
                    </span>

                    {selectedRuleIds.length > 0 && (
                      <>
                        <button
                          type="button"
                          className="tiny-button"
                          onClick={clearSelectedRules}
                          disabled={deletingRules}
                        >
                          {t("automation.clear")}
                        </button>

                        <button
                          type="button"
                          className="danger-button"
                          onClick={deleteSelectedRules}
                          disabled={deletingRules}
                        >
                          {deletingRules
                            ? t("automation.deleting")
                            : confirmingBulkDelete
                            ? t("automation.confirmDeleteCount", { count: selectedRuleIds.length })
                            : t("automation.deleteSelectedCount", { count: selectedRuleIds.length })}
                        </button>
                      </>
                    )}

                    {confirmingBulkDelete && (
                      <span className="delete-confirm-note">
                        {t("automation.confirmDeleteSelectedRules")}
                      </span>
                    )}
                  </div>

                  <div className="saved-rule-list">
                    {visibleRules.map((rule) => {
                      const ruleTimeZone = rule.timezone || DEFAULT_TIME_ZONE;
                      const isSelected = selectedRuleIds.includes(rule.id);
                      const isConfirmingDelete =
                        confirmingSingleDeleteId === rule.id;

                      return (
                        <article
                          className={`saved-rule-card ${
                            isSelected ? "selected" : ""
                          }`}
                          key={rule.id}
                        >
                          <label className="image-check">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleRuleSelection(rule.id)}
                            />
                          </label>

                          <div>
                            <h4>
                              {rule.schedule_type === "once"
                                ? rule.run_date
                                : rule.weekday}{" "}
                              · {rule.publish_time?.slice(0, 5)}
                            </h4>
                            <p>
                              {rule.platform} ·{" "}
                              {rule.content_type_label || rule.post_type} ·{" "}
                              {rule.uses_website_content
                                ? t("automation.websiteContent")
                                : rule.generate_image
                                ? t("automation.textImage")
                                : t("automation.textOnly")}
                            </p>
                            <small>
                              {t("automation.nextRun")}: {" "}
                              {formatDateTime(rule.next_run_at, ruleTimeZone)}
                            </small>
                          </div>

                          <button
                            type="button"
                            className="danger-button"
                            onClick={() => deleteSingleRule(rule.id)}
                            disabled={deletingRules}
                          >
                            {isConfirmingDelete ? t("automation.confirm") : t("automation.delete")}
                          </button>
                        </article>
                      );
                    })}

                    {!showSavedRules && rules.length > 3 && (
                      <button
                        type="button"
                        className="show-more-rules"
                        onClick={() => setShowSavedRules(true)}
                      >
                        {t("automation.showMoreSavedRules", { count: rules.length - 3 })}
                      </button>
                    )}
                  </div>
                </>
              )}
            </section>
          </main>

                   <aside className="planner-sidebar">
                      <section className="planner-summary-card">
              <div className="planner-sidebar-title planner-summary-title">
                <span>▤</span>
                <div>
                  <h3>{safePlannerText("planSummary")}</h3>
                  <p>{safePlannerText("readyToCreate")}</p>
                </div>
              </div>

              <div className="planner-summary-list premium">
                {planCreationMode === "auto" && (
                  <div className="planner-summary-item">
                    <span className="planner-summary-icon">◎</span>
                    <div>
                      <span>{t("automation.goal")}</span>
                      <strong>{translateAutoPlanGoalLabel(autoPlanGoal)}</strong>
                    </div>
                  </div>
                )}


<div className="planner-summary-item">
  <span className="planner-summary-icon">▦</span>
  <div>
    <span>
      {scheduleType === "weekly" && planCreationMode !== "campaign"
        ? t("automation.postsPerWeek")
        : t("common.posts")}
    </span>
    <strong>
      {t("automation.postCount", { count: slots.length })}
    </strong>
  </div>
</div>
                <div className="planner-summary-item">
                  <span className="planner-summary-icon">◷</span>
                  <div>
                    <span>{t("automation.start")}</span>
                    <strong>
                      {formatStartDateLabel(planStartDate, timeZone, locale)},{" "}
                      {defaultPublishTime}
                    </strong>
                  </div>
                </div>


                <div className="planner-summary-item">
                  <span className="planner-summary-icon">🌐</span>
                  <div>
                    <span>{t("automation.platform")}</span>
                    <div className="planner-social-icon-row mini">
                      {selectedPlatformOptions.length > 0 ? (
                        selectedPlatformOptions.map((item) => (
                          <img
                            key={item.value}
                            src={item.icon}
                            alt={item.label}
                            className="platform-icon-img"
                          />
                        ))
                      ) : (
                        <strong>{t("automation.choosePlatform")}</strong>
                      )}
                    </div>
                  </div>
                </div>

                <div className="planner-summary-item">
                  <span className="planner-summary-icon">✧</span>
                  <div>
                    <span>{safePlannerText("languageForPosts")}</span>
                    <strong>{getLanguageDisplayLabel(language)}</strong>
                  </div>
                </div>

                <div className="planner-summary-item">
                  <span className="planner-summary-icon">↻</span>
                  <div>
                    <span>{safePlannerText("repeatFull")}</span>
                    <strong>{translateScheduleType(scheduleType)}</strong>
                  </div>
                </div>

                <div className="planner-summary-item">
                  <span className="planner-summary-icon">⏱</span>
                  <div>
                    <span>{t("automation.timezone")}</span>
                    <strong>{timeZone}</strong>
                  </div>
                </div>

                <div className="planner-summary-item">
                  <span className="planner-summary-icon success">✓</span>
                  <div>
                    <span>{t("automation.approval")}</span>
                    <strong>{t("automation.approvalAlwaysRequired")}</strong>
                  </div>
                </div>

              </div>

              <div className="planner-summary-status">
                <span>✓</span>
                <div>
                  <strong>{t("automation.planIsReady")}</strong>
                  <p>{t("automation.planReadyText")}</p>
                </div>
              </div>

              {creditBalance && !hasEnoughCredits && (
                <div className="planner-sidebar-warning">
                  {t("automation.sidebarCreditWarning", { credits: plannedCredits, remaining: creditBalance.credits_remaining })}
                </div>
              )}
            </section>

            <section className="planner-credits-card">
              <div className="planner-sidebar-title">
                <span>ⓘ</span>
                <h3>{t("automation.credits")}</h3>
              </div>

              {creditBalance ? (
                <>
                  <div className="planner-credit-number">
                    <strong>{creditsRemaining}</strong>
                    <span>/ {monthlyCreditLimit || "—"} {t("automation.creditsLeft")}</span>
                  </div>

                  <div className="planner-credit-progress">
                    <div style={{ width: `${creditUsagePercent}%` }} />
                  </div>

                            <p className="planner-credit-reset">
                    {subscriptionDateLabel}: {subscriptionDateValue}
                  </p>

                  <div className="planner-credit-included">
                    <span className="planner-credit-included-icon">✓</span>
                    <span>
                      {t("automation.creditsIncludedIn")} 
                      {creditBalance.subscription_status === "trialing"
                        ? t("automation.starterTrial")
                        : subscriptionPlanLabel}
                    </span>
                  </div>

                  <div className="planner-credit-wave" />

                  <div className="planner-credit-help">
                    <strong>{t("automation.needMoreCredits")}</strong>
                    <p>{t("automation.upgradeText")}</p>
                  </div>

                  <button type="button" className="planner-upgrade-button">
                    {t("automation.upgradePlan")}
                  </button>
                </>
              ) : (
                <div className="summary-note">
                  <strong>{t("automation.noCreditBalance")}</strong>
                  <p>
                    {t("automation.noCreditBalanceText")}
                  </p>
                </div>
              )}
            </section>
          </aside>
            </div>

        {showAddPostModal && (
          <div
            className="add-post-modal-backdrop"
            onClick={() => setShowAddPostModal(false)}
          >
            <div
              className="add-post-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="add-post-modal-header">
                <div>
                  <p>{t("automation.addPlannedPost")}</p>
                  <h3>{t("automation.chooseContentType")}</h3>
                  <span>
                    {t("automation.chooseContentTypeText")}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAddPostModal(false)}
                >
                  ✕
                </button>
              </div>

              <div className="add-post-modal-grid">
                              {visibleContentTypes.map((type) => (
                  <button
                    type="button"
                    key={type.id}
                    className="add-post-type-card"
                    onClick={() => addSlotFromContentType(type.id)}
                  >
                    <strong>{translateContentTypeLabel(type)}</strong>
                    <p>{translateContentTypeDescription(type)}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {showLearnMoreModal && (
  <div
    className="learn-more-modal-backdrop"
    onClick={() => setShowLearnMoreModal(false)}
  >
    <div
      className="learn-more-modal"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="learn-more-modal-header">
        <div>
          <p>
            {campaignOpportunity ? t("automation.campaignPlanHelp") : t("automation.contentCreatorHelp")}
          </p>
          <h3>
            {campaignOpportunity
              ? t("automation.aboutCampaignPlan")
              : t("automation.howContentCreatorWorks")}
          </h3>
        </div>

        <button
          type="button"
          onClick={() => setShowLearnMoreModal(false)}
        >
          ✕
        </button>
      </div>

      {campaignOpportunity ? (
        <div className="learn-more-modal-content">
          <p>
            {t("automation.campaignHelpIntro")}
          </p>

          <div className="learn-more-steps">
            <div>
              <span>1</span>
              <strong>{t("automation.campaignDate")}</strong>
              <p>
                {t("automation.campaignDateHelp")}
              </p>
            </div>

            <div>
              <span>2</span>
              <strong>{t("automation.recommendedPlan")}</strong>
              <p>
                {t("automation.recommendedPlanHelp")}
              </p>
            </div>

            <div>
              <span>3</span>
              <strong>{t("automation.editBeforeSaving")}</strong>
              <p>
                {t("automation.editBeforeSavingHelp")}
              </p>
            </div>

            <div>
              <span>4</span>
              <strong>{t("automation.nothingPublishedYet")}</strong>
              <p>
                {t("automation.nothingPublishedYetHelp")}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="learn-more-modal-content">
          <p>
            {t("automation.creatorHelpIntro")}
          </p>

          <div className="learn-more-steps">
            <div>
              <span>1</span>
              <strong>{t("automation.chooseGoal")}</strong>
              <p>
                {t("automation.chooseGoalHelpModal")}
              </p>
            </div>

            <div>
              <span>2</span>
              <strong>{t("automation.choosePostAmount")}</strong>
              <p>
                {t("automation.choosePostAmountHelp")}
              </p>
            </div>

            <div>
              <span>3</span>
              <strong>{t("automation.reviewSchedule")}</strong>
              <p>
                {t("automation.reviewScheduleHelp")}
              </p>
            </div>

            <div>
              <span>4</span>
              <strong>{t("automation.saveThePlan")}</strong>
              <p>
                {t("automation.saveThePlanHelp")}
              </p>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        className="primary-button full"
        onClick={() => setShowLearnMoreModal(false)}
      >
        {t("automation.gotIt")}
      </button>
    </div>
  </div>
)}
      </div>
    </AppLayout>
  );
}

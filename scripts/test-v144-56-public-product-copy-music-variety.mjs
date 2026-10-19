import assert from "node:assert/strict";
import fs from "node:fs";
import {
  VIDEO_MUSIC_LIBRARY,
  selectBestVideoMusicFromTracks,
} from "../lib/videoMusicLibrary.js";

const route = fs.readFileSync("app/api/cron/run-automations/route.js", "utf8");
const finalizer = fs.readFileSync("app/api/cron/finalize-kling-videos/route.js", "utf8");
const adminRegenerate = fs.readFileSync("app/api/admin/post-approvals/regenerate/route.js", "utf8");

// Product labels: internal plan/schedule names must never become visible copy.
const eyebrowStart = route.indexOf("function isExplicitCalendarCampaignRule");
const eyebrowEnd = route.indexOf("function stripBrandPrefixFromProductTitle", eyebrowStart);
assert.ok(eyebrowStart >= 0 && eyebrowEnd > eyebrowStart, "Could not extract product eyebrow helpers");
const eyebrowSource = route.slice(eyebrowStart, eyebrowEnd);
const eyebrowFactory = new Function(`
  const getCampaignThemeContract = (rule) => rule?.campaign_theme_contract || null;
  const normalizeCampaignMarketingStrategy = (value) => value || null;
  const extractPromptLineValue = () => "";
  ${eyebrowSource}
  return { getCustomerFacingCampaignTheme, getProductLabelEyebrow };
`);
const { getCustomerFacingCampaignTheme, getProductLabelEyebrow } = eyebrowFactory();

const internalPlanRule = {
  name: "Sälj mer · tors",
  prompt: "Create a product post.",
};
assert.equal(getCustomerFacingCampaignTheme(internalPlanRule), "", "Internal plan name must not become campaign theme");
assert.equal(getProductLabelEyebrow(internalPlanRule), "", "Internal goal/weekday must not become image eyebrow");
assert.equal(
  getProductLabelEyebrow({ campaign_theme_contract: { primaryTheme: "Sommar" } }),
  "Sommar",
  "A real seasonal theme may become a short visible eyebrow"
);
assert.equal(
  getProductLabelEyebrow({ campaign_theme_contract: { primaryTheme: "Halloween" } }),
  "Halloween",
  "A real occasion may become a short visible eyebrow"
);

// Campaign lock must still protect real seasonal campaigns, without treating a
// generic Content Studio plan name as a public campaign.
const campaignLockStart = route.indexOf("function getCampaignIdentityLock(rule)");
const campaignLockEnd = route.indexOf("function formatCampaignVisualContextForPrompt(rule)", campaignLockStart);
const campaignLockSource = route.slice(campaignLockStart, campaignLockEnd);
const campaignLockFactory = new Function(
  "isCampaignScopedWebsiteRule",
  "getCampaignThemeContract",
  "normalizeCampaignMarketingStrategy",
  "extractPromptLineValue",
  "normalizeCampaignStrategyText",
  "collectUniqueTerms",
  "extractExplicitCampaignMatchTerms",
  "normalizeSearchText",
  `${campaignLockSource}\nreturn { getCampaignIdentityLock, formatCampaignIdentityLockForPrompt };`
);
const normalizeSearch = (value) => String(value || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const collectUnique = (values, limit = 30) => {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const text = String(value || "").trim();
    const key = normalizeSearch(text);
    if (!text || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
};
const { getCampaignIdentityLock } = campaignLockFactory(
  (rule) => Boolean(rule?.campaign_phase || rule?.campaign_goal || rule?.campaign_post_index),
  (rule) => rule?.campaign_theme_contract || null,
  (value) => value || null,
  () => "",
  (value, maxLength = 500) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength),
  collectUnique,
  (rule) => rule?.product_match_terms || [],
  normalizeSearch
);
assert.equal(
  getCampaignIdentityLock({ campaign_phase: "conversion", name: "Sälj mer · tors" }),
  null,
  "An internal goal/weekday plan name must not become a campaign identity lock"
);
assert.equal(
  getCampaignIdentityLock({
    campaign_phase: "conversion",
    name: "Sälj mer · tors",
    campaign_theme_contract: { primaryTheme: "Black Friday", approvedThemeTerms: ["Black Friday"] },
  })?.activeCampaign,
  "Black Friday",
  "A real recognized campaign theme must retain the campaign identity lock"
);

// Shared product presentation: do not repeat the product category under a title
// that already contains the same category.
const presentationStart = route.indexOf("function stripBrandPrefixFromProductTitle");
const presentationEnd = route.indexOf("async function deriveLocalPackshotLabelAnalysis", presentationStart);
assert.ok(presentationStart >= 0 && presentationEnd > presentationStart, "Could not extract product presentation helper");
const presentationSource = route
  .slice(presentationStart, presentationEnd)
  .replace("export function getCarouselProductLabelPresentation", "function getCarouselProductLabelPresentation");
const getPresentation = new Function(`
  const normalizeProductBrandIdentity = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\\s+/g, " ").trim();
  ${presentationSource}
  return getCarouselProductLabelPresentation;
`)();

assert.deepEqual(
  getPresentation({
    locked_product_title: "Grillkorv 5-pack ca 290 gram",
    locked_product_brand: "Carlströms",
    product_display_type: "Grillkorv",
  }),
  {
    brand: "Carlströms",
    title: "Grillkorv 5-pack ca 290 gram",
    descriptor: "",
    rawTitle: "Grillkorv 5-pack ca 290 gram",
  },
  "Generic category must disappear when it merely repeats the main product name"
);

assert.equal(
  getPresentation({
    locked_product_title: "ELEMENTAL UNISEX - Dagryggsäck - black/white",
    locked_product_brand: "Nike Sportswear",
    product_display_type: "Dagryggsäck",
  }).descriptor,
  "Dagryggsäck · black/white",
  "Useful distinct product type and colour must still be preserved"
);

// Audit the other customer-facing paths touched by this regression.
const deterministicStart = route.indexOf("function buildDeterministicDeliveryCopy");
const deterministicEnd = route.indexOf("function escapeAutomationEmailHtml", deterministicStart);
const deterministicSource = route.slice(deterministicStart, deterministicEnd);
assert.ok(!/rule\?\.name|rule\.name/.test(deterministicSource), "Fallback caption must not expose the internal plan name");

const adPromptStart = route.indexOf("function buildWebsiteItemAdImagePrompt");
const adPromptEnd = route.indexOf("export async function generateWebsiteItemAdImage", adPromptStart);
const adPromptSource = route.slice(adPromptStart, adPromptEnd);
assert.match(adPromptSource, /Never use internal automation\/plan names, goal labels, slot labels, weekdays or scheduling metadata as visible ad copy/);
assert.match(adPromptSource, /Do not repeat the product name or generic product category in multiple text elements/);

const emergencyStart = route.indexOf("async function renderEmergencySocialCard");
const emergencyEnd = route.indexOf("async function uploadEmergencySocialCard", emergencyStart);
const emergencySource = route.slice(emergencyStart, emergencyEnd);
assert.ok(!/productTitle \|\| rule\?\.name/.test(emergencySource), "Emergency card headline must not expose internal plan name");

assert.ok(
  !adminRegenerate.includes("occurrence?.campaign_title || reviewCase?.campaign_title || rule?.name"),
  "Admin carousel regeneration must not turn internal occurrence/plan titles into public campaign copy"
);
assert.match(route, /isProductLabelTextRedundant\(headline, candidate\)/, "Kling overlay must suppress redundant subheadlines");

// Music selection: keep semantic matching, but rotate away from recent repeats
// and give equally suitable tracks deterministic per-post variety.
assert.ok(VIDEO_MUSIC_LIBRARY.length >= 36, "The cleaned library must contain all retained tracks plus the 17 Suno clips");
const musicContext = {
  content_format: "animated_video",
  content_type_label: "Product post",
  goal: "sell more",
  industry: "retail",
  product_title: "Grillkorv 5-pack ca 290 gram",
  product_category: "Grillkorv",
  post_copy: "Perfekt till grillkvällen",
};

const seededChoices = Array.from({ length: 8 }, (_, index) =>
  selectBestVideoMusicFromTracks({
    tracks: VIDEO_MUSIC_LIBRARY,
    context: musicContext,
    targetDurationSeconds: 6,
    selectionSeed: `post-${index + 1}`,
  })?.id
).filter(Boolean);
assert.ok(new Set(seededChoices).size >= 3, "Different posts should not deterministically collapse to one song when several are similarly suitable");

const first = selectBestVideoMusicFromTracks({
  tracks: VIDEO_MUSIC_LIBRARY,
  context: musicContext,
  targetDurationSeconds: 6,
  selectionSeed: "repeat-a",
});
assert.ok(first?.id);
const second = selectBestVideoMusicFromTracks({
  tracks: VIDEO_MUSIC_LIBRARY,
  context: musicContext,
  targetDurationSeconds: 6,
  selectionSeed: "repeat-b",
  recentTrackIds: [first.id],
});
assert.ok(second?.id);
assert.notEqual(second.id, first.id, "The immediately previous song must be strongly de-prioritized when alternatives exist");

assert.match(route, /recentUsePenalty: musicSelection\?\.recentUsePenalty/);
assert.match(route, /selectionSeed: postId/);
assert.match(finalizer, /selectionSeed: post\.id/);
assert.match(finalizer, /brandProfileId: post\.brand_profile_id/);

console.log("v144.56 public product copy + video music variety checks passed");

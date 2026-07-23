import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");

const [campaignPlanner, contentPlanner, automationCron, automationPage, packageJson] =
  await Promise.all([
    read("app/api/plan-campaign/route.js"),
    read("app/api/plan-content/route.js"),
    read("app/api/cron/run-automations/route.js"),
    read("app/automation/page.jsx"),
    read("package.json"),
  ]);

function extractFunctionSource(source, name) {
  const starts = [`function ${name}`, `async function ${name}`]
    .map((needle) => source.indexOf(needle))
    .filter((index) => index >= 0);
  assert.ok(starts.length > 0, `Could not find function ${name}`);
  const start = Math.min(...starts);
  const openingBrace = source.indexOf("{", start);
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = openingBrace; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }

    if (["'", '"', "`"].includes(character)) quote = character;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }

  throw new Error(`Unclosed function ${name}`);
}

// Store campaigns are normalized after AI planning: normally 65-80% product
// formats, at least one AI product ad, at most one carousel, and optional Reels.
assert.ok(campaignPlanner.includes("enforceProductDrivenCampaignPolicy"));
assert.ok(campaignPlanner.includes("planSatisfiesV129CampaignPolicy"));
assert.ok(campaignPlanner.includes("Math.ceil(count * 0.65)"));
assert.ok(campaignPlanner.includes("Math.floor(count * 0.8)"));
assert.ok(campaignPlanner.includes('content_source_mode === "website_product_ad"'));
assert.ok(campaignPlanner.includes('content_source_mode === "website_carousel"'));
assert.ok(campaignPlanner.includes("campaignSupportsAnimatedReel"));
assert.ok(campaignPlanner.includes("chooseSupportingCampaignMode"));
assert.ok(campaignPlanner.includes("Do not automatically repeat the same carousel + Reel + seasonal combination"));
assert.ok(campaignPlanner.includes("Every verified store or ecommerce campaign must contain at least one website_product_ad"));
assert.ok(campaignPlanner.includes("A campaign may contain at most one website_carousel"));
assert.ok(campaignPlanner.includes("website_reel is optional, never mandatory"));
assert.ok(!campaignPlanner.includes("Use at most one, and only when"));

// AI Content Studio remains restricted to the three approved goals and uses
// genuinely different rolling multi-week strategies.
assert.ok(contentPlanner.includes('allowedGoals = new Set(["sell_more", "get_followers", "build_trust"])'));
assert.ok(contentPlanner.includes("The only supported goals are Sell more, Get more followers and Build trust"));
assert.ok(contentPlanner.includes("Judge the balance across a rolling multi-week schedule"));
assert.ok(contentPlanner.includes("make product businesses clearly more product-driven"));
assert.ok(contentPlanner.includes("primarily engaging, saveable and shareable"));
assert.ok(contentPlanner.includes("primarily helpful, educational, explanatory and uncertainty-reducing"));
const goalBlock = automationPage.match(/const autoPlanGoals = \[([\s\S]*?)\n\];/)?.[1] || "";
assert.deepEqual(
  [...goalBlock.matchAll(/\bid:\s*"([^"]+)"/g)].map((match) => match[1]),
  ["sell_more", "get_followers", "build_trust"],
);

// Product verification rejects technical assets and system URLs before network
// verification, while search pages remain discovery sources rather than products.
assert.ok(automationCron.includes("function isBadProductUrl"));
assert.ok(automationCron.includes("woff2?"));
assert.ok(automationCron.includes("css|m?js|map|json|xml"));
assert.ok(automationCron.includes("graphql|ajax|admin"));
assert.ok(automationCron.includes("checkout|checkouts|cart|basket"));
assert.ok(automationCron.includes("shopifycdn|shopifycloud|shopifysvc"));
assert.ok(automationCron.includes("Store search pages may still be used"));
assert.ok(automationCron.includes('(?:collections?|categories?|search|sok|sök|pages?)'));
const isBadProductUrl = new Function(
  `${extractFunctionSource(automationCron, "isBadProductUrl")}; return isBadProductUrl;`,
)();
assert.equal(isBadProductUrl("https://shop.example/assets/font.woff2"), true);
assert.equal(isBadProductUrl("https://shop.example/api/products.json"), true);
assert.equal(isBadProductUrl("https://shop.example/checkout"), true);
assert.equal(isBadProductUrl("https://shop.example/search?q=halloween"), true);
assert.equal(isBadProductUrl("https://shop.example/products/halloween-shirt"), false);

// Empty custom templates are excluded and near-identical size/colour variants
// share one product-family key throughout selection and reuse history.
assert.ok(automationCron.includes("function isLikelyVisuallyEmptyProductTemplate"));
assert.ok(automationCron.includes("genericTitleOnly"));
assert.ok(automationCron.includes("!isLikelyVisuallyEmptyProductTemplate(item)"));
assert.ok(automationCron.includes("function normalizeProductFamilyTitle"));
assert.ok(automationCron.includes("function getProductFamilyKey"));
assert.ok(automationCron.includes("seenFamilies"));
assert.ok(automationCron.includes("product_family_key"));
assert.ok(automationCron.includes("itemFamilyKey && usedFamilyKey"));
const normalizeSearchTextForTest = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
const normalizeProductFamilyTitle = new Function(
  "normalizeSearchText",
  "sanitizeProductTitleForCard",
  `${extractFunctionSource(automationCron, "normalizeProductFamilyTitle")}; return normalizeProductFamilyTitle;`,
)(normalizeSearchTextForTest, (value) => String(value || "").trim());
assert.equal(
  normalizeProductFamilyTitle("Premium Poster 30x40 cm"),
  normalizeProductFamilyTitle("Premium Poster 50x70 cm"),
);
assert.equal(
  normalizeProductFamilyTitle("Classic T-shirt - L"),
  normalizeProductFamilyTitle("Classic T-shirt - XL"),
);
assert.equal(
  normalizeProductFamilyTitle("Halloween T-shirt - Black"),
  normalizeProductFamilyTitle("Halloween T-shirt - White"),
);
assert.notEqual(
  normalizeProductFamilyTitle("Halloween T-shirt"),
  normalizeProductFamilyTitle("Christmas T-shirt"),
);
const emptyTemplateFilter = new Function(
  "normalizeSearchText",
  `${extractFunctionSource(automationCron, "isLikelyVisuallyEmptyProductTemplate")}; return isLikelyVisuallyEmptyProductTemplate;`,
)(normalizeSearchTextForTest);
assert.equal(
  emptyTemplateFilter({
    title: "Designa själv T-shirt",
    description: "Lägg till ditt tryck",
    image_url: "https://shop.example/blank-template.png",
  }),
  true,
);
assert.equal(
  emptyTemplateFilter({
    title: "Designa själv T-shirt med Halloweenmotiv",
    description: "Färdig visuell produkt",
    image_url: "https://shop.example/halloween-cat.png",
  }),
  false,
);

// Campaign relevance remains the first ranking dimension. Reuse is enabled only
// after fresh relevant candidates cannot fill the five-product requirement.
assert.ok(automationCron.includes("function compareCampaignScoredCandidates"));
assert.ok(automationCron.includes("campaignFitScore"));
assert.ok(automationCron.includes("freshSupportingCandidateCount < CAROUSEL_PRODUCT_SLIDE_TARGET"));
assert.ok(automationCron.includes("allowUsedAfterExhausted: allowCampaignReuseAfterExhausted"));
assert.ok(automationCron.includes('process.env.STRICT_PRODUCT_NO_REUSE || "true"'));
assert.ok(automationCron.includes("allowUsedAfterExhausted = Boolean(allowUsedAfterExhausted)"));
assert.ok(automationCron.includes("strongReserveCount < reserveTarget"));
assert.ok(automationCron.includes("entry.campaignSignal?.hasMeaningfulCampaignSignal"));
assert.ok(automationCron.includes("Only consider previously used winners after all fresh"));

// Reel candidates are image-validated before selection. Shopify {width} URLs are
// resolved, and one primary plus at most three reserves are attempted in one run.
assert.ok(automationCron.includes("function normalizeShopifyImageWidthUrl"));
assert.ok(automationCron.includes("replace(/\\{\\s*width\\s*\\}/gi"));
assert.ok(automationCron.includes("prepareAnimatedReelProductCandidates"));
assert.ok(automationCron.includes("maximumCandidates: 4"));
assert.ok(automationCron.includes("animatedReelCandidates.slice(0, 4)"));
assert.ok(automationCron.includes("Animated Reel product attempt failed"));
assert.ok(automationCron.includes("websiteItem = candidate.item"));
assert.ok(automationCron.includes("usedWebsiteImageUrlsThisRun.add"));
const reelAttemptBlock = automationCron.slice(
  automationCron.indexOf("const renderCandidates = animatedReelCandidates.slice(0, 4)"),
  automationCron.indexOf("} else if (wantsImage && isWebsiteTextAdRule", automationCron.indexOf("const renderCandidates = animatedReelCandidates.slice(0, 4)")),
);
assert.ok(reelAttemptBlock.indexOf("usedWebsiteImageUrlsThisRun.add") > reelAttemptBlock.indexOf("videoUrl = animatedVideo.videoUrl"));
const normalizeShopifyImageWidthUrl = new Function(
  `${extractFunctionSource(automationCron, "normalizeShopifyImageWidthUrl")}; return normalizeShopifyImageWidthUrl;`,
)();
assert.equal(
  normalizeShopifyImageWidthUrl("https://cdn.shopify.com/product_{width}x.jpg"),
  "https://cdn.shopify.com/product_1600x.jpg",
);
assert.equal(
  normalizeShopifyImageWidthUrl("https://cdn.shopify.com/product_{{width}}x.jpg"),
  "https://cdn.shopify.com/product_1600x.jpg",
);

// V127/V128 rendering safeguards remain intact. The carousel still has five
// text-free product slides and the existing AI-generated sixth slide.
assert.ok(automationCron.includes("async function renderCarouselProductSlideImage"));
assert.ok(automationCron.includes("generateCarouselOutroSlideImage"));
assert.ok(automationCron.includes("CAROUSEL_MIN_PRODUCT_SLIDES = 5"));
assert.match(
  automationCron,
  /slide_type:\s*'content',[\s\S]{0,180}headline:\s*null,[\s\S]{0,80}body:\s*null,[\s\S]{0,80}cta_text:\s*null/,
);
assert.ok(!automationCron.includes("renderCarouselLabelTextLayer"));
assert.ok(automationPage.includes('return mappedContentTypes[sourceMode] || "seasonal"'));
assert.ok(!automationPage.includes('return mappedContentTypes[sourceMode] || "manual_prompt"'));

// Execute the actual campaign normalizer with external services stubbed. This
// verifies the policy for every supported campaign length, not only its source text.
let executableCampaignPlanner = campaignPlanner
  .replace(
    /import OpenAI[^;]+;\n/,
    "class OpenAI { constructor() { this.responses = {}; } }\n",
  )
  .replace(
    /import \{ createClient \}[^;]+;\n/,
    "const createClient = () => ({});\n",
  );
executableCampaignPlanner +=
  "\nexport { enforceProductDrivenCampaignPolicy, planSatisfiesV129CampaignPolicy };\n";
const campaignPolicyModule = await import(
  `data:text/javascript;base64,${Buffer.from(executableCampaignPlanner).toString("base64")}`
);
const productModes = new Set([
  "website_product",
  "website_product_ad",
  "website_reel",
  "website_carousel",
]);
const testBrand = {
  website_product_mode_available: true,
  industry: "fashion ecommerce",
};
const testCampaign = { title: "Seasonal fashion collection launch" };

for (let postCount = 1; postCount <= 7; postCount += 1) {
  const inputItems = Array.from({ length: postCount }, (_, index) => ({
    role: `Post ${index + 1}`,
    purpose: "Test purpose",
    content_source_mode: index % 2 === 0 ? "seasonal" : "tips",
  }));
  const normalizedItems =
    campaignPolicyModule.enforceProductDrivenCampaignPolicy(
      inputItems,
      testCampaign,
      testBrand,
    );
  const productCount = normalizedItems.filter((item) =>
    productModes.has(item.content_source_mode),
  ).length;
  const expectedMinimum = postCount <= 2 ? 1 : Math.ceil(postCount * 0.65);
  const expectedMaximum = postCount <= 2 ? 1 : Math.floor(postCount * 0.8);

  assert.ok(productCount >= expectedMinimum && productCount <= expectedMaximum);
  assert.ok(
    normalizedItems.some(
      (item) => item.content_source_mode === "website_product_ad",
    ),
  );
  assert.ok(
    campaignPolicyModule.planSatisfiesV129CampaignPolicy(
      normalizedItems,
      testCampaign,
      testBrand,
    ),
  );
}

const suitableMultiReelPlan = campaignPolicyModule.enforceProductDrivenCampaignPolicy(
  [
    { role: "Reel 1", purpose: "Visual product story", content_source_mode: "website_reel" },
    { role: "Reel 2", purpose: "Second visual product story", content_source_mode: "website_reel" },
    { role: "AI ad", purpose: "Product advertisement", content_source_mode: "website_product_ad" },
    { role: "Product", purpose: "Product highlight", content_source_mode: "website_product" },
    { role: "Guide", purpose: "Supporting content", content_source_mode: "mini_guide" },
  ],
  testCampaign,
  testBrand,
);
assert.equal(
  suitableMultiReelPlan.filter((item) => item.content_source_mode === "website_reel").length,
  2,
);
assert.ok(
  campaignPolicyModule.planSatisfiesV129CampaignPolicy(
    suitableMultiReelPlan,
    testCampaign,
    testBrand,
  ),
);

assert.ok(packageJson.includes('"test:v129"'));

console.log("V129 product-driven campaign and Reel reserve checks passed.");

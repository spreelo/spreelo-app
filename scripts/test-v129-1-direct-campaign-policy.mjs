import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");

const [policySource, automationPage, packageJson] = await Promise.all([
  read("lib/calendarCampaignPolicy.js"),
  read("app/automation/page.jsx"),
  read("package.json"),
]);

const policyModule = await import(
  `data:text/javascript;base64,${Buffer.from(policySource).toString("base64")}`
);

const {
  campaignHasDirectProductCapability,
  directCalendarPlanSatisfiesPolicy,
  enforceDirectCalendarCampaignPolicy,
  getDirectProductCampaignCountBounds,
} = policyModule;

const productModes = new Set([
  "website_product",
  "website_product_ad",
  "website_reel",
  "website_carousel",
]);

const productCampaign = {
  id: "christmas-gifts",
  title: "Christmas gift ideas – Personal gifts for the whole family",
  description:
    "Highlight personally designed clothes, mugs and posters as unique Christmas gifts for family and friends.",
  event_type: "seasonal gift campaign",
  campaign_category: "gift shopping",
  website_content_fit: "strong",
  website_content_strategy: "product",
  product_match_terms: ["christmas gifts", "personalised clothing", "mugs", "posters"],
  product_search_queries: ["christmas gifts family", "personalised gifts"],
  product_avoid_terms: ["blank template"],
};

assert.equal(campaignHasDirectProductCapability(productCampaign), true);
assert.deepEqual(getDirectProductCampaignCountBounds(7), {
  minimum: 5,
  maximum: 5,
});

// This is the exact format mix that exposed the browser-side bug: two carousels
// and only four product formats out of seven.
const screenshotPlan = [
  { role: "Seasonal content", content_source_mode: "seasonal", marketing_angle: "awareness" },
  { role: "Tips & advice", content_source_mode: "tips", marketing_angle: "engagement" },
  { role: "Website carousel 1", content_source_mode: "website_carousel", marketing_angle: "product_discovery" },
  { role: "Website carousel 2", content_source_mode: "website_carousel", marketing_angle: "product_discovery" },
  { role: "FAQ", content_source_mode: "faq", marketing_angle: "trust" },
  { role: "Text + ad", content_source_mode: "website_product_ad", marketing_angle: "product_push" },
  { role: "Animated product video", content_source_mode: "website_reel", marketing_angle: "urgency" },
];

const correctedScreenshotPlan = enforceDirectCalendarCampaignPolicy(
  screenshotPlan,
  productCampaign,
);
const correctedProductCount = correctedScreenshotPlan.filter((item) =>
  productModes.has(item.content_source_mode),
).length;

assert.equal(correctedProductCount, 5);
assert.equal(
  correctedScreenshotPlan.filter(
    (item) => item.content_source_mode === "website_carousel",
  ).length,
  1,
);
assert.ok(
  correctedScreenshotPlan.some(
    (item) => item.content_source_mode === "website_product_ad",
  ),
);
assert.equal(
  directCalendarPlanSatisfiesPolicy(correctedScreenshotPlan, productCampaign),
  true,
);
assert.equal(correctedScreenshotPlan[3].content_source_mode, "website_product");
assert.notEqual(correctedScreenshotPlan[3].role, "Website carousel 2");
assert.ok(
  correctedScreenshotPlan.some(
    (item) => item.content_source_mode === "seasonal",
  ),
  "The Christmas campaign should retain useful seasonal support content",
);

// Every supported campaign length must satisfy the same 65-80%, AI-ad and
// single-carousel rules in the direct calendar path.
for (let postCount = 1; postCount <= 7; postCount += 1) {
  const input = Array.from({ length: postCount }, (_, index) => ({
    role: `Post ${index + 1}`,
    purpose: "Test",
    content_source_mode:
      index === 0
        ? "website_carousel"
        : index === 1
          ? "website_carousel"
          : index % 2 === 0
            ? "tips"
            : "seasonal",
  }));
  const corrected = enforceDirectCalendarCampaignPolicy(input, productCampaign);
  const bounds = getDirectProductCampaignCountBounds(postCount);
  const productCount = corrected.filter((item) =>
    productModes.has(item.content_source_mode),
  ).length;

  assert.ok(productCount >= bounds.minimum && productCount <= bounds.maximum);
  assert.ok(
    corrected.some((item) => item.content_source_mode === "website_product_ad"),
  );
  assert.ok(
    corrected.filter((item) => item.content_source_mode === "website_carousel")
      .length <= 1,
  );
  assert.equal(directCalendarPlanSatisfiesPolicy(corrected, productCampaign), true);
}

// Reel is optional and must be replaced when campaign information signals that
// usable visual material is weak.
const weakVisualCampaign = {
  ...productCampaign,
  description: "Information only with limited imagery and no usable image.",
};
const weakVisualPlan = enforceDirectCalendarCampaignPolicy(
  [
    { content_source_mode: "website_reel" },
    { content_source_mode: "website_product_ad" },
    { content_source_mode: "tips" },
  ],
  weakVisualCampaign,
);
assert.equal(
  weakVisualPlan.some((item) => item.content_source_mode === "website_reel"),
  false,
);
assert.equal(directCalendarPlanSatisfiesPolicy(weakVisualPlan, weakVisualCampaign), true);

// Non-product campaigns must not be forced into product formats.
const serviceCampaign = {
  title: "Book a consultation",
  website_content_fit: "strong",
  website_content_strategy: "service",
};
const servicePlan = [
  { content_source_mode: "faq" },
  { content_source_mode: "tips" },
  { content_source_mode: "website_service" },
];
assert.deepEqual(
  enforceDirectCalendarCampaignPolicy(servicePlan, serviceCampaign),
  servicePlan,
);

// The UI's real direct calendar path must import and apply the policy before
// content type IDs, labels and prompts are generated for the visible slots.
assert.ok(
  automationPage.includes(
    'import { enforceDirectCalendarCampaignPolicy } from "../../lib/calendarCampaignPolicy";',
  ),
);
const directFunctionStart = automationPage.indexOf(
  "function buildDirectCalendarCampaignSlots",
);
const directFunctionEnd = automationPage.indexOf(
  "async function loadCampaignOpportunityIntoPlanner",
  directFunctionStart,
);
const directFunction = automationPage.slice(directFunctionStart, directFunctionEnd);
assert.ok(directFunction.includes("const plannedItems = schedule.map"));
assert.ok(
  directFunction.includes("const policyPostPlan = enforceDirectCalendarCampaignPolicy"),
);
assert.ok(
  directFunction.indexOf("enforceDirectCalendarCampaignPolicy") <
    directFunction.indexOf("return createSlot"),
);
assert.ok(directFunction.includes("const contentSourceMode = enhancedPostPlanItem.content_source_mode"));
assert.ok(packageJson.includes('"test:v129-1"'));

console.log("V129.1 direct calendar campaign policy checks passed.");

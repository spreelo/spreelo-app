import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");

const [route, automationPage, formatLibrary, campaignPlanner, postPage, approvalPage, packageJson, nextConfig] =
  await Promise.all([
    read("app/api/cron/run-automations/route.js"),
    read("app/automation/page.jsx"),
    read("lib/contentFormatLibrary.js"),
    read("app/api/plan-campaign/route.js"),
    read("app/posts/[id]/page.jsx"),
    read("app/admin/post-approvals/page.jsx"),
    read("package.json"),
    read("next.config.mjs"),
  ]);

// Carousel product slides are image-only. The old label renderer and font
// dependency must not be reachable from the automation route.
assert.ok(route.includes("async function renderCarouselProductSlideImage"));
assert.ok(route.includes("extractStrictTransparentProductCutout"));
assert.ok(route.includes("selectStaticImageBackground"));
assert.ok(route.includes("preserve the website image and its existing"));
assert.ok(!route.includes("renderCarouselLabelTextLayer"));
assert.ok(!route.includes("getCarouselLabelFontFile"));
assert.ok(!route.includes('text: "PREMIUM"'));
assert.ok(!route.includes("CAROUSEL_LABEL_FONT_FILE"));

// Saved carousel rows contain no product-copy fields. The existing sixth AI
// outro and the five-product/600-second safeguards stay in place.
assert.match(
  route,
  /slide_type:\s*'content',[\s\S]{0,180}headline:\s*null,[\s\S]{0,80}body:\s*null,[\s\S]{0,80}cta_text:\s*null/,
);
assert.ok(route.includes("generateCarouselOutroSlideImage"));
assert.ok(route.includes("CAROUSEL_MIN_PRODUCT_SLIDES = 5"));
assert.ok(route.includes("export const maxDuration = 600"));

// Clean single-product posts reuse the safe renderer. The separate AI text ad
// and animated Reel remain available.
assert.ok(route.includes('fileSuffix: "website-product-card"'));
assert.ok(route.includes("Website Text + Ad image generation failed"));
assert.ok(automationPage.includes('id: "website_item_text_ad"'));
assert.ok(automationPage.includes('id: "animated_website_item"'));
assert.ok(automationPage.includes("do not invent prices, discounts, guarantees, features or availability"));

// Exactly three customer-facing goals are defined.
const goalBlock = automationPage.match(/const autoPlanGoals = \[([\s\S]*?)\n\];/)?.[1] || "";
assert.deepEqual(
  [...goalBlock.matchAll(/\bid:\s*"([^"]+)"/g)].map((match) => match[1]),
  ["sell_more", "get_followers", "build_trust"],
);
assert.ok(goalBlock.includes('label: "Sell more"'));
assert.ok(goalBlock.includes('label: "Get more followers"'));
assert.ok(goalBlock.includes('label: "Build trust"'));

// Retired formats are filtered from the studio and absent from the default
// format library and new campaign planner choices.
for (const retiredId of ["behind_scenes", "case_example", "local", "comparison"]) {
  assert.ok(automationPage.includes(`"${retiredId}"`));
  assert.ok(!formatLibrary.includes(`content_type_id: "${retiredId}"`));
}
assert.ok(automationPage.includes("RETIRED_CONTENT_TYPE_IDS"));
assert.ok(automationPage.includes("RETIRED_CONTENT_TYPE_IDS.has(type.id)"));
assert.ok(!campaignPlanner.includes('"comparison"'));
assert.ok(!campaignPlanner.includes('"case_example"'));
assert.ok(campaignPlanner.includes('"mini_guide"'));
assert.ok(campaignPlanner.includes('"myth_fact"'));
assert.ok(campaignPlanner.includes('"mistakes"'));

// Carousel copy is not rendered beneath images in user/admin previews.
assert.ok(postPage.includes('post?.content_format !== "carousel"'));
assert.ok(approvalPage.includes('post.content_format !== "carousel"'));

// V126's packaged label font is intentionally gone.
assert.ok(!packageJson.includes("@fontsource/inter"));
assert.ok(!nextConfig.includes("@fontsource/inter"));

console.log("V127 clean product images and content-goal checks passed.");

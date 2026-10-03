import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync("app/api/cron/run-automations/route.js", "utf8");
const adminRegenerate = fs.readFileSync("app/api/admin/post-approvals/regenerate/route.js", "utf8");

const brandStart = route.indexOf("function normalizeProductBrandIdentity");
const brandEnd = route.indexOf("async function reviewResolvedProductImageIdentity", brandStart);
assert.ok(brandStart >= 0 && brandEnd > brandStart);
const brandSource = route.slice(brandStart, brandEnd);
const brandHelpers = new Function(`
  const normalizeComparableValue = (value) => String(value || "").toLowerCase().trim();
  ${brandSource}
  return { areEquivalentProductBrands, hasHardSemanticBrandConflict, hasHardSemanticModelConflict, hasHardSemanticVariantConflict, isCompatibleObservedBrandFamily };
`)();

assert.equal(
  brandHelpers.areEquivalentProductBrands("Jordan", "Nike Air Jordan"),
  true,
  "a fuller parent/co-brand observation must remain compatible with the locked Jordan brand"
);
assert.equal(
  brandHelpers.hasHardSemanticBrandConflict(
    { brand_or_model_conflict: true, observed_brand: "Nike Air Jordan", reason: "Nike and Jordan branding is visible." },
    "Jordan"
  ),
  false,
  "compatible parent/sub-brand wording must not become a hard brand conflict"
);
assert.equal(
  brandHelpers.hasHardSemanticBrandConflict(
    { brand_or_model_conflict: true, observed_brand: "adidas", reason: "Different brand logo." },
    "Nike Sportswear"
  ),
  true,
  "genuinely unrelated brands must still fail closed"
);
assert.equal(
  brandHelpers.hasHardSemanticModelConflict({ model_conflict: false, brand_or_model_conflict: true, reason: "The prominent Nike and Jordan logos conflict with Jordan only." }),
  false,
  "a brand-family wording issue alone must not be promoted to a model mismatch"
);
assert.equal(
  brandHelpers.hasHardSemanticVariantConflict({ variant_conflict: true, reason: "The colour is clearly different from the locked variant." }),
  true,
  "a real variant conflict must remain a hard stop"
);
assert.equal(
  brandHelpers.hasHardSemanticVariantConflict({ variant_conflict: false, reason: "The visible design style and branding elements are consistent with the expected brand. No conflicting brand or product variant is visible." }),
  false,
  "an explicit no-conflict review must not be misread as a hard variant conflict"
);

const presentationStart = route.indexOf("function stripBrandPrefixFromProductTitle");
const presentationEnd = route.indexOf("async function deriveLocalPackshotLabelAnalysis", presentationStart);
assert.ok(presentationStart >= 0 && presentationEnd > presentationStart);
const presentationSource = route.slice(presentationStart, presentationEnd).replace("export function getCarouselProductLabelPresentation", "function getCarouselProductLabelPresentation");
const getPresentation = new Function(`
  const normalizeProductBrandIdentity = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\\s+/g, " ").trim();
  ${presentationSource}
  return getCarouselProductLabelPresentation;
`)();

assert.deepEqual(
  getPresentation({
    locked_product_title: "ELEMENTAL UNISEX - Dagryggsäck - black/white",
    locked_product_brand: "Nike Sportswear",
    product_display_type: "Dagryggsäck",
  }),
  {
    brand: "Nike Sportswear",
    title: "ELEMENTAL UNISEX",
    descriptor: "Dagryggsäck · black/white",
    rawTitle: "ELEMENTAL UNISEX - Dagryggsäck - black/white",
  }
);
assert.equal(
  getPresentation({
    locked_product_title: "AIR SCHOOL BACKPACK UNISEX SET - Pennfodral - black",
    locked_product_brand: "Jordan",
    product_display_type: "Ryggsäck med pennfodral",
  }).descriptor,
  "Ryggsäck med pennfodral · black",
  "the customer-facing label must use the verified product type instead of blindly repeating misleading retailer taxonomy"
);


const svgStart = route.indexOf("function buildCarouselProductLabelSvg");
const svgEnd = route.indexOf("export async function renderCarouselProductSlideImage", svgStart);
assert.ok(svgStart >= 0 && svgEnd > svgStart);
const svgSource = route.slice(svgStart, svgEnd);
const buildLabelSvg = new Function(`
  const CAROUSEL_PRODUCT_LABEL_PLACEMENTS = { top_left: { x: 52, y: 48, width: 390, height: 184 } };
  const boxesOverlapWithPadding = () => false;
  const layoutProductTitle = (title) => ({ lines: [String(title)], fontSize: 22, lineHeight: 27, profile: { direction: "ltr", family: "Noto Sans", script: "global" } });
  const escapeProductSvg = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  ${svgSource}
  return buildCarouselProductLabelSvg;
`)();
const renderedLabel = buildLabelSvg({
  title: "ELEMENTAL UNISEX",
  brand: "Nike Sportswear",
  descriptor: "Dagryggsäck · black/white",
  eyebrow: "SKOLSTART 2026",
  analysis: { placement: "top_left", layout: "compact_card", textTone: "dark" },
  productCanvasBox: { x: 500, y: 400, width: 300, height: 400 },
});
assert.ok(renderedLabel?.svg?.includes("NIKE SPORTSWEAR"), "rendered card must visibly contain the locked brand");
assert.ok(renderedLabel?.svg?.includes("ELEMENTAL UNISEX"), "rendered card must contain the model name");
assert.ok(renderedLabel?.svg?.includes("Dagryggsäck · black/white"), "rendered card must contain the concise product descriptor");

assert.match(route, /display_product_type/);
assert.match(route, /product_display_type:/);
assert.match(route, /productBrand: productLabelPresentation\.brand/);
assert.match(route, /productDescriptor: productLabelPresentation\.descriptor/);
assert.match(route, /const brandMarkup = hasBrand/);
assert.match(route, /lockedBrandFamilyFalseNegative/);
assert.match(adminRegenerate, /getCarouselProductLabelPresentation/);
assert.match(adminRegenerate, /productBrand: presentation\.brand/);

console.log("v143.65 brand-aware identity + product-label presentation tests passed.");

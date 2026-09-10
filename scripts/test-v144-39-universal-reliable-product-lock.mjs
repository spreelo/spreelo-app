import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyCommercePage } from "../lib/productEngineV2.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const route = fs.readFileSync(
  path.join(root, "app/api/cron/run-automations/route.js"),
  "utf8"
);

// Reliability contracts from v144.38 must remain intact.
for (const required of [
  'const hasPageBoundProductProof = Boolean(',
  'Number(pageClassification.confidence || 0) >= 78',
  'const exactPageGalleryImage = extractBestProductImageFromHtml(',
  'Store Map verified product could not be locked; trying next verified product',
  '{ allowAiRepair: false }',
  '["in_stock", "available"].includes(availabilityStatus)',
  'Product image semantic AI gate skipped for deterministic same-page locked asset',
  'product_image_semantic_reason: "deterministic_same_page_locked_asset"',
]) {
  assert.ok(route.includes(required), `missing v144.39 reliability contract: ${required}`);
}

// Fresh Store Map products must not regress to one-candidate terminal failure.
assert.ok(
  route.indexOf('Store Map verified product could not be locked; trying next verified product') >
    route.indexOf('if (storeMapSingleProductResult?.products?.length)'),
  "Store Map verified-pool retry must remain in the single-product path"
);

// Product price removal must stay intact.
for (const forbidden of [
  "locked_product_price",
  "product_price",
  "sale_price",
  "original_price",
  "price_source",
  "price_confidence",
  "price_rejected_reason",
  "visible_price",
  "current_price",
]) {
  assert.ok(!route.includes(forbidden), `product price field returned: ${forbidden}`);
}

// Execute only the final lock function with deterministic helpers so we can
// regression-test a schema-less/custom storefront page and a category page.
const start = route.indexOf("function extractLockedProductObjectFromHtml");
const end = route.indexOf("\n\nfunction imageUrlMatchesProductIdentity", start);
assert.ok(start >= 0 && end > start, "lock function source not found");
const source = route.slice(start, end);
const titleHelperStart = route.indexOf("function isGenericProductTitlePlaceholder");
const titleHelperEnd = route.indexOf("\n\nfunction getHostnameFromUrl", titleHelperStart);
assert.ok(titleHelperStart >= 0 && titleHelperEnd > titleHelperStart, "product-title safety helper source not found");
const titleHelperSource = route.slice(titleHelperStart, titleHelperEnd);

const makeExtractor = new Function(
  "classifyCommercePage",
  "crypto",
  `
  const canonicalizeWebsiteProductUrl = (value, base) => {
    try {
      const url = new URL(value, base || value);
      url.search = "";
      url.hash = "";
      url.pathname = url.pathname.replace(/\\/$/, "") || "/";
      return url.toString();
    } catch { return null; }
  };
  const extractCanonicalProductPageUrl = (html, pageUrl) => {
    const match = String(html).match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i);
    return match?.[1] || pageUrl;
  };
  const isHttpUrl = (value) => /^https?:\\/\\//i.test(String(value || ""));
  const isSameOrSubdomainUrl = (value, website) => new URL(value).hostname.endsWith(new URL(website).hostname);
  const matchesConfiguredWebsiteMarket = () => true;
  const isLikelyNonProductUrl = () => false;
  const isLikelyBadDiscoveryPageUrl = () => false;
  const findExactPageJsonLdProduct = () => null;
  const getProductImagesFromJsonLd = () => [];
  const decodeHtmlEntities = (value) => String(value || "").replace(/&amp;/g, "&");
  const getMetaContent = (html, names) => {
    const tags = String(html).match(/<meta\\b[^>]*>/gi) || [];
    for (const name of names) {
      for (const tag of tags) {
        const key = tag.match(/(?:property|name)=["']([^"']+)["']/i)?.[1];
        const content = tag.match(/content=["']([^"']+)["']/i)?.[1];
        if (key === name && content) return decodeHtmlEntities(content);
      }
    }
    return "";
  };
  const resolveUrl = (value, base) => new URL(value, base).toString();
  const isBadProductImageUrl = () => false;
  const isLikelyProductDetailUrl = () => false;
  const sanitizeProductTitleForCard = (value) => decodeHtmlEntities(value).split(" | ")[0].trim();
  const stripHtmlToText = (value) => String(value || "").replace(/<[^>]+>/g, " ").replace(/\\s+/g, " ").trim();
  ${titleHelperSource}
  const extractPageTitle = (html) => String(html).match(/<title[^>]*>([^<]+)/i)?.[1] || "";
  const getStructuredProductIdentifier = () => "";
  const getStructuredProductBrand = () => "";
  const inferCurrentProductAvailability = ({ html }) => /add to cart|lägg i varukorg/i.test(html) ? "available" : "unknown";
  const canonicalProductImageAssetKey = (value) => String(value || "").split("?")[0];
  const normalizeComparableValue = (value) => String(value || "").trim().toLowerCase();
  const hasEcommerceProofText = (html) => /add to cart|lägg i varukorg/i.test(html);
  const hasDirectProductPurchaseAction = (html) => /add to cart|lägg i varukorg/i.test(html);
  const extractBestProductImageFromHtml = () => null;
  const buildLockedProductIdentityFingerprint = ({ url, identifier, title, primaryImageUrl }) =>
    crypto.createHash("sha256").update([url, identifier, title, primaryImageUrl].join("|")).digest("hex").slice(0, 24);
  ${source}
  return extractLockedProductObjectFromHtml;
`
)(classifyCommercePage, crypto);

const pageUrl = "https://shop.example/women/custom/nested/universal-product-slug";
const productHtml = `
<html><head>
<title>Universal Product | Example Shop</title>
<link rel="canonical" href="${pageUrl}">
<meta property="og:type" content="website">
<meta property="og:title" content="Universal Product | Example Shop">
<meta property="og:image" content="https://cdn.example/assets/main-product.jpg?format=webp">
</head><body>
<h1>Universal Product</h1>
<form class="product-form"><button>Add to cart</button></form>
<div class="product-card">Related one</div>
<div class="product-card">Related two</div>
<div class="product-card">Related three</div>
<div class="product-card">Related four</div>
</body></html>`;

const classification = classifyCommercePage({ html: productHtml, url: pageUrl });
assert.equal(classification.pageType, "product");
const locked = makeExtractor({ html: productHtml, pageUrl, websiteUrl: "https://shop.example" });
assert.ok(locked, "schema-less/custom product page must lock without retailer-specific URL rules");
assert.equal(locked.title, "Universal Product");
assert.equal(locked.url, pageUrl);
assert.equal(locked.primaryImageUrl, "https://cdn.example/assets/main-product.jpg?format=webp");
assert.equal(locked.purchaseActionDetected, true);
assert.equal(locked.exactProductPageVerified, true);

const categoryUrl = "https://shop.example/women/vibrators";
const categoryHtml = `
<link rel="canonical" href="${categoryUrl}">
<meta property="og:type" content="website">
<meta property="og:title" content="All vibrators">
<meta property="og:image" content="https://cdn.example/assets/category-banner.jpg">
<h1>All vibrators</h1>
${Array.from({ length: 8 }, (_, i) => `<div class="product-card">Product ${i}</div>`).join("")}`;
assert.notEqual(classifyCommercePage({ html: categoryHtml, url: categoryUrl }).pageType, "product");
assert.equal(
  makeExtractor({ html: categoryHtml, pageUrl: categoryUrl, websiteUrl: "https://shop.example" }),
  null,
  "category/listing page must never become one locked product"
);

console.log("v144.39 universal reliable product-lock regression checks passed.");

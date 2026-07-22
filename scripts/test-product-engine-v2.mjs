import assert from "node:assert/strict";
import {
  classifyCommercePage,
  detectCommercePlatform,
  getAdaptiveProductPoolTargets,
  sanitizeCatalogPrice,
  sanitizeProductSearchQueryList,
} from "../lib/productEngineV2.js";

assert.deepEqual(
  sanitizeProductSearchQueryList([
    "fall2026",
    "this belongs time",
    "using exact code",
    "halloween godis",
    "skräckgodis",
  ]),
  ["halloween godis", "skräckgodis"]
);

assert.equal(
  detectCommercePlatform({
    url: "https://example.se",
    html: '<img src="https://cdn.quickbutik.com/images/store/product.jpg">',
  }),
  "quickbutik"
);

assert.equal(
  classifyCommercePage({
    url: "https://example.se/for-henne/stavar",
    html: '<div class="product-card">Product</div>'.repeat(6),
    productSchemaFound: false,
    ecommerceProofFound: true,
  }).pageType,
  "category"
);

assert.equal(
  classifyCommercePage({
    url: "https://example.se/products/example-product",
    html: '<form class="product-form"><button>Add to cart</button></form>',
    productSchemaFound: false,
    ecommerceProofFound: true,
  }).pageType,
  "product"
);

assert.equal(
  sanitizeCatalogPrice({
    price: "999:-",
    html: "Fri frakt över 999:-",
    source: "visible_product_page_price",
  }).price,
  ""
);

assert.equal(
  sanitizeCatalogPrice({
    price: "499 kr",
    html: "Produktpris 499 kr. Fri frakt över 999 kr.",
    source: "visible_product_page_price",
  }).price,
  "499 kr"
);

assert.deepEqual(getAdaptiveProductPoolTargets(5), {
  requiredCount: 5,
  minimumCandidatePool: 30,
  minimumVerifiedPool: 12,
  reserveCount: 5,
  aiRankLimit: 25,
  finalVerificationLimit: 30,
});

console.log("Product Engine V2 helper tests passed.");

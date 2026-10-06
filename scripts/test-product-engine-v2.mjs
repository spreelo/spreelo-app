import assert from "node:assert/strict";
import {
  classifyCommercePage,
  detectCommercePlatform,
  getAdaptiveProductPoolTargets,
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
  classifyCommercePage({
    url: "https://example.se/for-henne/vibratorer/lelo-nea-3",
    html: `
      <link rel="canonical" href="https://example.se/for-henne/vibratorer/lelo-nea-3">
      <meta property="og:image" content="https://cdn.quickbutik.com/product.jpg">
      <h1>LELO Nea 3</h1>
      <form class="product-form"><button>Add to cart</button></form>
      <div class="product-card">Related</div>
      <div class="product-card">Related</div>
      <div class="product-card">Related</div>
      <div class="product-card">Related</div>
    `,
    productSchemaFound: false,
    ecommerceProofFound: true,
  }).pageType,
  "product",
  "A Quickbutik-style product page must be recognized without relying on price metadata"
);


// Search-origin query parameters must not turn a deterministic product-detail
// URL into a search page. The page still needs the existing commerce proof.
assert.equal(
  classifyCommercePage({
    url: "https://power.se/gaming/pc/asus-v16/p-4098465/?q=gaming",
    html: '<h1>ASUS V16</h1><form class="product-form"><button>Add to cart</button></form>',
    productSchemaFound: false,
    ecommerceProofFound: true,
  }).pageType,
  "product",
  "A real product URL with a retailer search query must remain a product"
);

// The safety side of the change: a genuine search URL must still be rejected
// as search even when the returned HTML contains commerce-looking cards.
assert.equal(
  classifyCommercePage({
    url: "https://example.se/search?q=gaming",
    html: '<div class="product-card">Product</div>'.repeat(8),
    productSchemaFound: false,
    ecommerceProofFound: true,
  }).pageType,
  "search",
  "A genuine retailer search URL must remain classified as search"
);

assert.deepEqual(getAdaptiveProductPoolTargets(5), {
  requiredCount: 5,
  minimumCandidatePool: 30,
  minimumVerifiedPool: 8,
  reserveCount: 5,
  aiRankLimit: 20,
  finalVerificationLimit: 15,
});

console.log("Product Engine V2 helper tests passed.");

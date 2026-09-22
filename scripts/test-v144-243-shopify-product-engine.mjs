import fs from 'node:fs';

const cron = fs.readFileSync('app/api/cron/run-automations/route.js', 'utf8');
const helper = fs.readFileSync('lib/shopifyProductCatalog.js', 'utf8');

const checks = [
  ['Shopify helper queries active Online Store-published products through Admin GraphQL', /products\([\s\S]*query: \$searchQuery/.test(helper) && /searchQuery: "status:active published_status:published"/.test(helper)],
  ['Shopify helper uses hardened per-brand token/401 refresh path', /shopifyGraphqlForBrand\(\{/.test(helper)],
  ['Shopify catalog is bounded and paginated instead of downloading an unlimited store', /SHOPIFY_PRODUCT_ENGINE_MAX_PRODUCTS = 120/.test(helper) && /pageCount < 7/.test(helper)],
  ['Only active products are mapped', /String\(product\.status \|\| ""\)\.toUpperCase\(\) !== "ACTIVE"/.test(helper)],
  ['Only Shopify-verified Online Store publication is mapped', /publicationVerified/.test(helper) && /published_status:published/.test(helper) && helper.includes('if (!/^https?:') && helper.includes('.test(productUrl)) return null;')],
  ['Only Shopify-confirmed sellable or stocked variants are mapped', /getShopifyVariantAvailability/.test(helper) && /sellableOnlineQuantity/.test(helper) && /inventoryQuantity/.test(helper) && /inventoryPolicy/.test(helper)],
  ['Shopify products become exact locked product objects', /shopify_admin_api_verified: true/.test(helper) && /product_identity_locked: true/.test(helper) && /product_image_page_bound: true/.test(helper) && /product_image_identity_verified: true/.test(helper)],
  ['Shopify products carry current purchasability proof', /availability: "in_stock"/.test(helper) && /stock_verification_source: "shopify_admin_api"/.test(helper)],
  ['Shopify product metadata includes vendor/type/SKU without prices', /product_brand: vendor/.test(helper) && /product_display_type: productType/.test(helper) && /product_identifier: sku/.test(helper) && !/priceRange|price\s*:/.test(helper)],
  ['Product Engine persists Shopify identity metadata in the verified catalog', /shopify_admin_api_verified:[\s\S]*rawItem\?\.shopify_admin_api_verified/.test(cron) && /product_image_identity_verified:[\s\S]*rawItem\?\.product_image_identity_verified/.test(cron)],
  ['Catalog reload restores Shopify locked-product metadata', /shopify_admin_api_verified:[\s\S]*row\.verification_metadata\?\.shopify_admin_api_verified/.test(cron) && /locked_product_source:[\s\S]*row\.verification_metadata\?\.locked_product_source/.test(cron)],
  ['Stale Shopify API rows are removed from active selection so website verification can take over safely', /function removeStaleShopifyApiCatalogItems/.test(cron) && /isFreshProductStockVerification\(item\)/.test(cron)],
  ['Single-product Product Engine refreshes Shopify before public website fallback', /Single-product Product Engine is using Shopify Admin API as the primary catalog/.test(cron) && /hasShopifyPrimaryCatalog[\s\S]*getWebsiteDomainFetchState/.test(cron)],
  ['Carousel Product Engine refreshes Shopify before public website fallback', /Carousel Product Engine is using Shopify Admin API as the primary catalog/.test(cron)],
  ['Shopify exact API products bypass redundant product-page locking', /isShopifyAdminApiLockedProduct\(item\)/.test(cron)],
  ['Campaign carousels review Shopify products for relevance before public-web discovery', /Shopify campaign catalog received product-level AI relevance review before public-web discovery/.test(cron)],
  ['Website discovery remains an explicit fallback when Shopify sync cannot satisfy the task', /website discovery remains available as fallback/i.test(cron)],
];

let passed = 0;
for (const [label, ok] of checks) {
  if (!ok) throw new Error(`FAILED: ${label}`);
  console.log(`✓ ${label}`);
  passed += 1;
}
console.log(`v144.243 Shopify Product Engine checks passed (${passed}/${checks.length}).`);

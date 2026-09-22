import fs from "node:fs";

const source = fs.readFileSync("lib/shopifyProductCatalog.js", "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(`v144.248 failed: ${message}`);
};

const pureSource = source
  .replace(/^import[^\n]+\n/, "")
  .replace(/export const SHOPIFY_PRODUCT_ENGINE_QUERY/, "const SHOPIFY_PRODUCT_ENGINE_QUERY")
  .replace(/export function getShopifyVariantAvailability/, "function getShopifyVariantAvailability")
  .replace(/export function mapShopifyProductNodeToCatalogItem/, "function mapShopifyProductNodeToCatalogItem")
  .split("export async function fetchShopifyProductEngineCatalog")[0];

const helpers = new Function(`${pureSource}\nreturn { mapShopifyProductNodeToCatalogItem };`)();
const { mapShopifyProductNodeToCatalogItem } = helpers;

const passwordProtectedDevProduct = {
  id: "gid://shopify/Product/1",
  handle: "the-3p-fulfilled-snowboard",
  title: "The 3p Fulfilled Snowboard",
  description: "Test product",
  onlineStoreUrl: null,
  productType: "snowboard",
  vendor: "Spreelo Test Store 2",
  status: "ACTIVE",
  tags: ["Winter"],
  featuredMedia: { preview: { image: { url: "https://cdn.example.com/snowboard.jpg", altText: "Snowboard", width: 1000, height: 1000 } } },
  variants: {
    nodes: [{
      id: "gid://shopify/ProductVariant/1",
      title: "Default Title",
      sku: "sku-hosted-1",
      availableForSale: false,
      sellableOnlineQuantity: 0,
      inventoryQuantity: 20,
      inventoryPolicy: "DENY",
      image: null,
    }],
  },
};

const verified = mapShopifyProductNodeToCatalogItem(passwordProtectedDevProduct, {
  publicationVerified: true,
  shopDomain: "spreelo-test-store-2.myshopify.com",
});
assert(verified?.shopify_admin_api_verified === true, "published password-protected dev-store product must be accepted");
assert(verified?.url === "https://spreelo-test-store-2.myshopify.com/products/the-3p-fulfilled-snowboard", "canonical Shopify fallback URL must use connected shop domain + handle");
assert(verified?.shopify_availability_signal === "inventory_quantity", "positive Admin inventory must remain the availability proof");

const unverified = mapShopifyProductNodeToCatalogItem(passwordProtectedDevProduct, {
  publicationVerified: false,
  shopDomain: "spreelo-test-store-2.myshopify.com",
});
assert(unverified === null, "null onlineStoreUrl must not bypass publication verification on its own");

assert(source.includes('searchQuery: "status:active published_status:published"'), "Shopify fetch must verify Online Store publication with Shopify search, not onlineStoreUrl");
assert(source.includes("Development stores are always password-protected"), "code must document the Shopify dev-store onlineStoreUrl behavior");
assert(source.includes("constructedProductUrlCount"), "diagnostics must expose constructed dev-store URLs");
assert(source.includes("...diagnostics"), "eligibility failure diagnostics must be flattened for Vercel logs");
assert(!/priceRange|compareAtPrice|\bprice\s*\{/.test(source), "Shopify Product Engine must still not import product prices");

console.log("v144.248 Shopify dev-store publication checks passed (8/8).");

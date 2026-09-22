import fs from "node:fs";

const source = fs.readFileSync("lib/shopifyProductCatalog.js", "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(`v144.247 failed: ${message}`);
};

// Evaluate only the pure Shopify mapping helpers. The OAuth/network import and
// catalog-fetch function are deliberately excluded so this remains a local,
// deterministic regression test.
const pureSource = source
  .replace(/^import[^\n]+\n/, "")
  .replace(/export const SHOPIFY_PRODUCT_ENGINE_QUERY/, "const SHOPIFY_PRODUCT_ENGINE_QUERY")
  .replace(/export function getShopifyVariantAvailability/, "function getShopifyVariantAvailability")
  .replace(/export function mapShopifyProductNodeToCatalogItem/, "function mapShopifyProductNodeToCatalogItem")
  .split("export async function fetchShopifyProductEngineCatalog")[0];

const helpers = new Function(`${pureSource}\nreturn { getShopifyVariantAvailability, mapShopifyProductNodeToCatalogItem };`)();
const { getShopifyVariantAvailability, mapShopifyProductNodeToCatalogItem } = helpers;

const baseProduct = {
  id: "gid://shopify/Product/1",
  title: "Test Snowboard",
  description: "A test product",
  onlineStoreUrl: "https://example.myshopify.com/products/test-snowboard",
  productType: "Snowboard",
  vendor: "Test Store",
  status: "ACTIVE",
  tags: ["Winter"],
  featuredMedia: { preview: { image: { url: "https://cdn.example.com/product.jpg", altText: "Snowboard", width: 1000, height: 1000 } } },
};

function productWithVariant(variant, overrides = {}) {
  return { ...baseProduct, ...overrides, variants: { nodes: [{ id: "gid://shopify/ProductVariant/1", title: "Default Title", sku: "SKU-1", image: null, ...variant }] } };
}

const available = getShopifyVariantAvailability({ availableForSale: true, inventoryQuantity: null, sellableOnlineQuantity: null, inventoryPolicy: "DENY" });
assert(available.eligible === true && available.signal === "available_for_sale", "availableForSale=true must remain eligible");

const onlineStock = getShopifyVariantAvailability({ availableForSale: false, sellableOnlineQuantity: 4, inventoryQuantity: 4, inventoryPolicy: "DENY" });
assert(onlineStock.eligible === true && onlineStock.availability === "in_stock" && onlineStock.signal === "sellable_online_quantity", "positive online-sellable inventory must be eligible");

const adminStock = getShopifyVariantAvailability({ availableForSale: false, sellableOnlineQuantity: 0, inventoryQuantity: 20, inventoryPolicy: "DENY" });
assert(adminStock.eligible === true && adminStock.availability === "in_stock" && adminStock.signal === "inventory_quantity", "positive Shopify Admin inventory must be eligible even when availableForSale is false");

const continueSelling = getShopifyVariantAvailability({ availableForSale: false, sellableOnlineQuantity: 0, inventoryQuantity: 0, inventoryPolicy: "CONTINUE" });
assert(continueSelling.eligible === true && continueSelling.availability === "available" && continueSelling.signal === "continue_selling", "continue-selling variants must remain promotable");

const unavailable = getShopifyVariantAvailability({ availableForSale: false, sellableOnlineQuantity: 0, inventoryQuantity: 0, inventoryPolicy: "DENY" });
assert(unavailable.eligible === false, "zero-stock DENY variants must remain blocked");

const inventoryFallbackProduct = mapShopifyProductNodeToCatalogItem(productWithVariant({ availableForSale: false, sellableOnlineQuantity: 0, inventoryQuantity: 20, inventoryPolicy: "DENY" }));
assert(inventoryFallbackProduct?.shopify_admin_api_verified === true, "inventory-backed Shopify product must map into the locked Product Engine format");
assert(inventoryFallbackProduct?.availability === "in_stock", "inventory-backed product must carry in-stock status");
assert(inventoryFallbackProduct?.shopify_availability_signal === "inventory_quantity", "inventory fallback must remain traceable");

assert(mapShopifyProductNodeToCatalogItem(productWithVariant({ availableForSale: false, sellableOnlineQuantity: 0, inventoryQuantity: 20, inventoryPolicy: "DENY" }, { status: "DRAFT" })) === null, "draft Shopify products must stay blocked");
assert(mapShopifyProductNodeToCatalogItem(productWithVariant({ availableForSale: false, sellableOnlineQuantity: 0, inventoryQuantity: 20, inventoryPolicy: "DENY" }, { onlineStoreUrl: null })) === null, "products without Online Store publication must stay blocked");
assert(mapShopifyProductNodeToCatalogItem(productWithVariant({ availableForSale: false, sellableOnlineQuantity: 0, inventoryQuantity: 0, inventoryPolicy: "DENY" })) === null, "unsellable and unstocked Shopify products must stay blocked");
assert(mapShopifyProductNodeToCatalogItem(productWithVariant({ availableForSale: false, sellableOnlineQuantity: 0, inventoryQuantity: 20, inventoryPolicy: "DENY" }, { featuredMedia: null })) === null, "products without a product image must stay blocked");

assert(source.includes("sellableOnlineQuantity") && source.includes("inventoryQuantity") && source.includes("inventoryPolicy"), "Admin GraphQL query must request Shopify inventory signals");
assert(source.includes("Keep this fallback Shopify-only"), "fallback must explicitly remain Shopify-only");
assert(!/priceRange|compareAtPrice|\bprice\s*\{/.test(source), "Shopify Product Engine must still not import product prices");

console.log("v144.247 Shopify inventory eligibility checks passed (13/13).");

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`✓ ${message}`);
};

const helper = await import(pathToFileURL(path.join(root, "lib/shopifyBrandIsolation.js")).href);
const claim = read("app/api/shopify/onboarding/claim/route.js");
const embedded = read("app/api/shopify/embedded/bootstrap/route.js");
const onboardingPage = read("app/shopify/onboarding/page.jsx");
const legacyConnect = read("app/api/shopify/connect/route.js");

const brands = [
  { id: "brand-a", business_name: "Store A", website_url: "https://store-a.myshopify.com" },
  { id: "brand-b", business_name: "Store B", website_url: "https://www.store-b.example" },
  { id: "brand-c", business_name: "Store C", website_url: "https://store-c.myshopify.com" },
];
const webConnections = [
  { brand_profile_id: "brand-b", website_url: "https://www.store-b.example", detected_signals: { shop_domain: "store-b.myshopify.com" } },
];
const legacyBuggyAppStoreWeb = {
  brand_profile_id: "brand-b",
  website_url: "https://store-b.myshopify.com",
  detected_signals: { shop_domain: "store-b.myshopify.com", install_source: "shopify_app_store" },
};

assert(
  helper.brandMatchesExactShopifyShop({ brand: brands[0], webConnection: null, shopDomain: "store-a.myshopify.com" }),
  "brand website_url can prove an exact myshopify identity"
);
assert(
  !helper.brandMatchesExactShopifyShop({ brand: brands[1], webConnection: null, shopDomain: "store-b.myshopify.com" }),
  "a custom primary domain alone cannot impersonate a Shopify shop identity"
);
assert(
  helper.brandMatchesExactShopifyShop({ brand: brands[1], webConnection: webConnections[0], shopDomain: "store-b.myshopify.com" }),
  "stored detected_signals.shop_domain proves the exact Shopify shop identity"
);
assert(
  !helper.brandMatchesExactShopifyShop({ brand: brands[1], webConnection: legacyBuggyAppStoreWeb, shopDomain: "store-b.myshopify.com" }),
  "legacy App Store web-data written by the old claim cannot self-prove a mismatched brand mapping"
);

const unique = helper.selectExactShopifyBrand({ brands, webConnections, shopDomain: "store-b.myshopify.com" });
assert(unique.match?.id === "brand-b" && unique.matches.length === 1, "exact shop selection returns only the matching brand");

const mismatchedPreferred = helper.selectExactShopifyBrand({
  brands,
  webConnections,
  shopDomain: "store-b.myshopify.com",
  preferredBrandProfileId: "brand-a",
});
assert(mismatchedPreferred.match?.id === "brand-b", "a stale preferred brand cannot override exact shop identity");

const duplicates = helper.selectExactShopifyBrand({
  brands: [
    { id: "brand-1", website_url: "https://duplicate.myshopify.com" },
    { id: "brand-2", website_url: "https://duplicate.myshopify.com" },
  ],
  shopDomain: "duplicate.myshopify.com",
  preferredBrandProfileId: "brand-2",
});
assert(duplicates.match?.id === "brand-2" && duplicates.matches.length === 2, "an exact preferred mapping wins only among exact duplicate matches");

assert(claim.includes("selectExactShopifyBrand") && claim.includes("SHOPIFY_BRAND_DOMAIN_MISMATCH"), "App Store claim refuses arbitrary existing brand selection");
assert(claim.includes('const websiteUrl = `https://${onboarding.shop_domain}`'), "new App Store brands are anchored to the exact myshopify domain");
assert(!claim.includes("brandRows.length === 1 && !String(brandRows[0].website_url"), "legacy single-empty-brand auto-link fallback is removed");
assert(!claim.includes("normalizeHostname(onboarding.primary_domain)"), "custom primary domain is no longer treated as Shopify identity");
assert(/exactMatches\.length > 1[\s\S]*brands: exactMatches\.map\(publicBrand\)/.test(claim), "ambiguous legacy duplicate matches require explicit exact-shop selection instead of guessing");
assert(claim.includes("clearLegacyAppStoreWebBinding") && /previousBrandProfileId[\s\S]*clearLegacyAppStoreWebBinding/.test(claim), "re-binding a shop removes the old App Store-derived web identity from the stale brand");
assert(claim.includes("allow_create_new: false") && onboardingPage.includes("allowCreateNewBrand"), "ambiguous exact legacy duplicates cannot create yet another duplicate brand from the selection UI");

assert(embedded.includes("loadExactShopifyBrandForUser") && embedded.includes("selectExactShopifyBrand"), "embedded bootstrap validates the stored brand against the exact Shopify shop");
assert(embedded.includes("resolvedBrandProfileId") && embedded.includes("Shopify embedded shop-to-brand mapping repaired"), "embedded bootstrap can automatically repair a stale mapping when one exact brand exists");
assert(embedded.includes("isolated onboarding required") && embedded.includes("exactMatchCount"), "mismatched embedded mappings are forced through isolated onboarding instead of auto-login");
assert(legacyConnect.includes('flow: "brand_connect"') && legacyConnect.includes('flow: "app_store_identity"'), "manual Grow Brain Shopify connection flow remains intact");

console.log("\nv144.255 Shopify shop-to-brand isolation checks passed.");

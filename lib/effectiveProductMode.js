import { createSupabaseAdminClient } from "./shopifyOAuth.js";
import {
  ensureShopifyFullCatalogSync,
  fetchShopifyProductEngineCatalog,
} from "./shopifyProductCatalog.js";

const SHOPIFY_PRODUCT_MODE_PROBE_LIMIT = 40;

function buildShopifyProductModeReason(catalog) {
  const eligibleCount = Number(catalog?.diagnostics?.eligibleProductCount || catalog?.items?.length || 0);
  return `Verified from the connected Shopify Admin API: ${eligibleCount} active Online Store product${eligibleCount === 1 ? "" : "s"} with a Shopify-confirmed sellable or stocked variant and product image.`;
}

export async function resolveEffectiveProductMode({
  brandProfile = null,
  brandProfileId = "",
  userId = "",
  supabaseAdmin = null,
  persist = true,
} = {}) {
  const resolvedBrandProfileId = String(brandProfileId || brandProfile?.id || "").trim();

  if (brandProfile?.website_product_mode_available === true) {
    return {
      available: true,
      source: "website_analysis",
      reason: brandProfile?.website_product_mode_reason || "Verified product mode is already available for this brand.",
      sourceUrl: brandProfile?.website_product_source_url || brandProfile?.website_url || "",
      shopDomain: null,
      eligibleProductCount: null,
      persisted: false,
    };
  }

  if (!resolvedBrandProfileId) {
    return {
      available: false,
      source: "none",
      reason: "missing_brand",
      sourceUrl: "",
      shopDomain: null,
      eligibleProductCount: 0,
      persisted: false,
    };
  }

  const admin = supabaseAdmin || createSupabaseAdminClient();

  try {
    const catalog = await fetchShopifyProductEngineCatalog({
      supabaseAdmin: admin,
      brandProfileId: resolvedBrandProfileId,
      maxProducts: SHOPIFY_PRODUCT_MODE_PROBE_LIMIT,
    });

    const items = Array.isArray(catalog?.items) ? catalog.items : [];
    const shopifyAvailable = catalog?.connected === true && items.length > 0;

    if (!shopifyAvailable) {
      return {
        available: false,
        source: catalog?.connected ? "shopify_no_eligible_products" : "none",
        reason: String(catalog?.diagnostics?.reason || "no_verified_product_mode"),
        sourceUrl: "",
        shopDomain: catalog?.shopDomain || null,
        eligibleProductCount: items.length,
        persisted: false,
      };
    }

    // Start Shopify's asynchronous full-catalog index as soon as product mode
    // is confirmed. The quick probe above remains the fast path for UI, while
    // the bulk job removes the old 120-product coverage ceiling for real stores.
    try {
      await ensureShopifyFullCatalogSync({
        supabaseAdmin: admin,
        brandProfileId: resolvedBrandProfileId,
        startIfNeeded: true,
        pollExisting: false,
      });
    } catch (error) {
      console.warn("Could not start Shopify full catalog sync from product-mode probe", {
        brandProfileId: resolvedBrandProfileId,
        message: error?.message || String(error),
      });
    }

    const checkedAt = new Date().toISOString();
    const reason = buildShopifyProductModeReason(catalog);
    const sourceUrl = String(items[0]?.url || (catalog?.shopDomain ? `https://${catalog.shopDomain}` : "")).trim();
    let persisted = false;

    if (persist) {
      let updateQuery = admin
        .from("brand_profiles")
        .update({
          website_product_mode_available: true,
          website_product_mode_checked_at: checkedAt,
          website_product_mode_reason: reason,
          website_product_source_url: sourceUrl || null,
        })
        .eq("id", resolvedBrandProfileId);

      if (userId) updateQuery = updateQuery.eq("user_id", userId);

      const { error: persistError } = await updateQuery;
      if (persistError) {
        console.warn("Could not persist Shopify-backed product mode", {
          brandProfileId: resolvedBrandProfileId,
          message: persistError.message,
        });
      } else {
        persisted = true;
      }
    }

    return {
      available: true,
      source: "shopify_admin_api",
      reason,
      sourceUrl,
      shopDomain: catalog?.shopDomain || null,
      eligibleProductCount: items.length,
      checkedAt,
      persisted,
    };
  } catch (error) {
    console.warn("Shopify product-mode verification failed; preserving existing website analysis state", {
      brandProfileId: resolvedBrandProfileId,
      message: error?.message || String(error || "unknown_error"),
    });

    return {
      available: false,
      source: "shopify_probe_failed",
      reason: error?.requiresReconnect ? "shopify_reconnect_required" : "shopify_probe_failed",
      sourceUrl: "",
      shopDomain: null,
      eligibleProductCount: 0,
      persisted: false,
    };
  }
}

export async function enrichBrandProfileWithEffectiveProductMode(options = {}) {
  const brandProfile = options?.brandProfile || null;
  const productMode = await resolveEffectiveProductMode(options);

  if (!brandProfile || productMode.available !== true || brandProfile.website_product_mode_available === true) {
    return { brandProfile, productMode };
  }

  return {
    productMode,
    brandProfile: {
      ...brandProfile,
      website_product_mode_available: true,
      website_product_mode_checked_at: productMode.checkedAt || new Date().toISOString(),
      website_product_mode_reason: productMode.reason || brandProfile.website_product_mode_reason || "",
      website_product_source_url: productMode.sourceUrl || brandProfile.website_product_source_url || brandProfile.website_url || "",
    },
  };
}

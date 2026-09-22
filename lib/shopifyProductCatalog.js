import { getShopifyEnv, shopifyGraphqlForBrand } from "./shopifyOAuth.js";

const SHOPIFY_PRODUCT_ENGINE_PAGE_SIZE = 20;
const SHOPIFY_PRODUCT_ENGINE_MAX_PRODUCTS = 120;

export const SHOPIFY_PRODUCT_ENGINE_QUERY = `#graphql
query SpreeloProductEngineCatalog($first: Int!, $after: String, $searchQuery: String) {
  products(
    first: $first
    after: $after
    sortKey: UPDATED_AT
    reverse: true
    query: $searchQuery
  ) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      handle
      title
      description
      onlineStoreUrl
      productType
      vendor
      status
      tags
      featuredMedia { preview { image { url altText width height } } }
      variants(first: 25) {
        nodes {
          id
          title
          sku
          availableForSale
          sellableOnlineQuantity
          inventoryQuantity
          inventoryPolicy
          image { url altText width height }
        }
      }
    }
  }
}`;

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getShopifyProductDescription(product) {
  const description = cleanText(product?.description);
  if (description) return description;

  const fallback = [product?.vendor, product?.productType, product?.title]
    .map(cleanText)
    .filter(Boolean)
    .filter((value, index, list) => list.findIndex((entry) => entry.toLowerCase() === value.toLowerCase()) === index)
    .join(" · ");
  return fallback || "Shopify product";
}

function getFeaturedShopifyImage(product, eligibleVariant = null) {
  const featured = product?.featuredMedia?.preview?.image || null;
  const variantImage = eligibleVariant?.image || null;
  const image = featured?.url ? featured : variantImage?.url ? variantImage : null;
  if (!image?.url) return null;
  return {
    url: cleanText(image.url),
    altText: cleanText(image.altText),
    width: Number(image.width || 0) || null,
    height: Number(image.height || 0) || null,
  };
}

function finiteQuantity(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function getShopifyVariantAvailability(variant) {
  if (!variant) return { eligible: false, availability: "unknown", signal: "missing_variant", evidence: "" };

  const availableForSale = variant?.availableForSale === true;
  const sellableOnlineQuantity = finiteQuantity(variant?.sellableOnlineQuantity);
  const inventoryQuantity = finiteQuantity(variant?.inventoryQuantity);
  const inventoryPolicy = String(variant?.inventoryPolicy || "").trim().toUpperCase();

  // Shopify can report availableForSale=false for generated/dev-store and
  // fulfillment setups even while the Admin API reports positive sellable or
  // stocked inventory. Keep this fallback Shopify-only: the website Product
  // Engine and every non-Shopify source continue using their existing gates.
  if (availableForSale) {
    const inStock = (sellableOnlineQuantity ?? 0) > 0 || (inventoryQuantity ?? 0) > 0;
    return {
      eligible: true,
      availability: inStock ? "in_stock" : "available",
      signal: "available_for_sale",
      evidence: "Shopify Admin API reports availableForSale=true for this variant.",
      sellableOnlineQuantity,
      inventoryQuantity,
      inventoryPolicy,
    };
  }

  if ((sellableOnlineQuantity ?? 0) > 0) {
    return {
      eligible: true,
      availability: "in_stock",
      signal: "sellable_online_quantity",
      evidence: `Shopify Admin API reports sellableOnlineQuantity=${sellableOnlineQuantity} for this variant.`,
      sellableOnlineQuantity,
      inventoryQuantity,
      inventoryPolicy,
    };
  }

  if ((inventoryQuantity ?? 0) > 0) {
    return {
      eligible: true,
      availability: "in_stock",
      signal: "inventory_quantity",
      evidence: `Shopify Admin API reports inventoryQuantity=${inventoryQuantity} for this active Online Store variant.`,
      sellableOnlineQuantity,
      inventoryQuantity,
      inventoryPolicy,
    };
  }

  if (inventoryPolicy === "CONTINUE") {
    return {
      eligible: true,
      availability: "available",
      signal: "continue_selling",
      evidence: "Shopify Admin API reports inventoryPolicy=CONTINUE, so the merchant allows orders when inventory reaches zero.",
      sellableOnlineQuantity,
      inventoryQuantity,
      inventoryPolicy,
    };
  }

  return {
    eligible: false,
    availability: "unknown",
    signal: "not_sellable_or_stocked",
    evidence: "",
    sellableOnlineQuantity,
    inventoryQuantity,
    inventoryPolicy,
  };
}

function findEligibleShopifyVariant(product) {
  const variants = Array.isArray(product?.variants?.nodes) ? product.variants.nodes : [];
  for (const variant of variants) {
    const availability = getShopifyVariantAvailability(variant);
    if (availability.eligible) return { variant, availability };
  }
  return { variant: null, availability: null };
}

function inspectShopifyProductNode(product) {
  const active = Boolean(product && String(product.status || "").toUpperCase() === "ACTIVE");
  const productUrl = cleanText(product?.onlineStoreUrl);
  const onlineStorePublished = /^https?:\/\//i.test(productUrl);
  const { variant, availability } = findEligibleShopifyVariant(product);
  const image = getFeaturedShopifyImage(product, variant);
  return {
    active,
    onlineStorePublished,
    hasEligibleVariant: Boolean(variant),
    hasImage: Boolean(image?.url),
    availabilitySignal: availability?.signal || "none",
  };
}

export function mapShopifyProductNodeToCatalogItem(product, { verifiedAt = new Date().toISOString() } = {}) {
  if (!product || String(product.status || "").toUpperCase() !== "ACTIVE") return null;

  const productUrl = cleanText(product.onlineStoreUrl);
  if (!/^https?:\/\//i.test(productUrl)) return null;

  const { variant: eligibleVariant, availability: variantAvailability } = findEligibleShopifyVariant(product);
  if (!eligibleVariant || !variantAvailability?.eligible) return null;

  const image = getFeaturedShopifyImage(product, eligibleVariant);
  if (!image?.url) return null;

  const variantTitle = cleanText(eligibleVariant?.title);
  const sku = cleanText(eligibleVariant?.sku);
  const vendor = cleanText(product?.vendor);
  const productType = cleanText(product?.productType);
  const shopifyProductId = cleanText(product?.id);
  const shopifyVariantId = cleanText(eligibleVariant?.id);
  const availabilityStatus = variantAvailability.availability || "available";
  const stockEvidence = variantAvailability.evidence || "Shopify Admin API verified this active Online Store product as currently sellable.";

  return {
    type: "product",
    title: cleanText(product.title),
    description: getShopifyProductDescription(product),
    url: productUrl,
    image_url: image.url,
    category: productType,
    tags: Array.isArray(product.tags) ? product.tags.map(cleanText).filter(Boolean).slice(0, 30) : [],
    commerce_platform: "shopify",
    page_type: "product",
    page_type_confidence: 100,
    availability: availabilityStatus,
    product_schema_verified: true,
    ecommerce_proof_found: true,
    concrete_product_verified: true,
    product_page_verified: true,
    purchase_action_detected: true,
    product_confidence: 100,
    last_verified_at: verifiedAt,
    stock_verified_at: verifiedAt,
    stock_verification_source: "shopify_admin_api",
    stock_verification_evidence: stockEvidence,
    locked_product_availability: availabilityStatus,
    locked_product_availability_evidence: stockEvidence,
    product_identity_locked: true,
    technical_identity_same_page_verified: true,
    product_image_page_bound: true,
    product_image_page_bound_source: "shopify_admin_api",
    product_image_source_page_url: productUrl,
    product_image_identity_verified: true,
    product_image_identity_unresolved: false,
    product_image_identity_method: "shopify_admin_api_featured_media",
    locked_product_page_object: true,
    exact_page_verified: true,
    locked_product_source: "shopify_admin_api",
    shopify_admin_api_verified: true,
    shopify_product_id: shopifyProductId,
    shopify_variant_id: shopifyVariantId,
    shopify_availability_signal: variantAvailability.signal,
    shopify_sellable_online_quantity: variantAvailability.sellableOnlineQuantity,
    shopify_inventory_quantity: variantAvailability.inventoryQuantity,
    shopify_inventory_policy: variantAvailability.inventoryPolicy,
    product_brand: vendor,
    locked_product_brand: vendor,
    product_display_type: productType,
    locked_product_category: productType,
    product_identifier: sku,
    locked_product_identifier: sku,
    product_color: variantTitle && variantTitle.toLowerCase() !== "default title" ? variantTitle : "",
    locked_product_color: variantTitle && variantTitle.toLowerCase() !== "default title" ? variantTitle : "",
    source_page_url: productUrl,
    campaign_fit_source: "shopify_admin_api",
    selection_priority: 500,
    verification_level: "shopify_admin_api",
    reason: "Verified directly from the connected Shopify store via the Admin API.",
    image_width: image.width,
    image_height: image.height,
  };
}

export async function fetchShopifyProductEngineCatalog({
  supabaseAdmin,
  brandProfileId,
  maxProducts = SHOPIFY_PRODUCT_ENGINE_MAX_PRODUCTS,
}) {
  if (!supabaseAdmin || !brandProfileId) {
    return { connected: false, items: [], shopDomain: null, diagnostics: { reason: "missing_context" } };
  }

  const { data: connection, error: connectionError } = await supabaseAdmin
    .from("shopify_connections")
    .select("id,brand_profile_id,shop_domain,status,scopes")
    .eq("brand_profile_id", brandProfileId)
    .maybeSingle();

  if (connectionError) throw connectionError;
  if (!connection?.id || connection.status !== "connected") {
    return {
      connected: false,
      items: [],
      shopDomain: connection?.shop_domain || null,
      diagnostics: { reason: connection?.status || "not_connected" },
    };
  }

  const scopes = Array.isArray(connection.scopes)
    ? connection.scopes
    : String(connection.scopes || "").split(/[\s,]+/).filter(Boolean);
  if (!scopes.includes("read_products")) {
    return {
      connected: true,
      items: [],
      shopDomain: connection.shop_domain,
      diagnostics: { reason: "missing_read_products_scope" },
    };
  }

  const env = getShopifyEnv();
  const boundedMax = Math.max(1, Math.min(250, Number(maxProducts || SHOPIFY_PRODUCT_ENGINE_MAX_PRODUCTS) || SHOPIFY_PRODUCT_ENGINE_MAX_PRODUCTS));
  const verifiedAt = new Date().toISOString();
  const nodes = [];
  let after = null;
  let pageCount = 0;

  while (nodes.length < boundedMax && pageCount < 7) {
    const first = Math.min(SHOPIFY_PRODUCT_ENGINE_PAGE_SIZE, boundedMax - nodes.length);
    const { data } = await shopifyGraphqlForBrand({
      supabaseAdmin,
      brandProfileId,
      apiVersion: env.apiVersion,
      query: SHOPIFY_PRODUCT_ENGINE_QUERY,
      variables: {
        first,
        after,
        searchQuery: "status:active",
      },
    });

    const connectionData = data?.products || {};
    const pageNodes = Array.isArray(connectionData?.nodes) ? connectionData.nodes : [];
    nodes.push(...pageNodes);
    pageCount += 1;

    if (!connectionData?.pageInfo?.hasNextPage || !connectionData?.pageInfo?.endCursor || !pageNodes.length) break;
    after = connectionData.pageInfo.endCursor;
  }

  const items = nodes
    .map((product) => mapShopifyProductNodeToCatalogItem(product, { verifiedAt }))
    .filter(Boolean);

  const inspections = nodes.map(inspectShopifyProductNode);
  const diagnostics = {
    fetchedProductCount: nodes.length,
    eligibleProductCount: items.length,
    activeProductCount: inspections.filter((item) => item.active).length,
    onlineStorePublishedCount: inspections.filter((item) => item.onlineStorePublished).length,
    productsWithEligibleVariantCount: inspections.filter((item) => item.hasEligibleVariant).length,
    productsWithImageCount: inspections.filter((item) => item.hasImage).length,
    availableForSaleSignalCount: inspections.filter((item) => item.availabilitySignal === "available_for_sale").length,
    sellableOnlineQuantitySignalCount: inspections.filter((item) => item.availabilitySignal === "sellable_online_quantity").length,
    inventoryQuantitySignalCount: inspections.filter((item) => item.availabilitySignal === "inventory_quantity").length,
    continueSellingSignalCount: inspections.filter((item) => item.availabilitySignal === "continue_selling").length,
    pageCount,
    maxProducts: boundedMax,
    source: "shopify_admin_api",
  };

  if (nodes.length > 0 && items.length === 0) {
    console.info("Shopify Product Engine found products but none passed Shopify eligibility", {
      brandProfileId,
      shopDomain: connection.shop_domain,
      diagnostics,
    });
  }

  return {
    connected: true,
    items,
    shopDomain: connection.shop_domain,
    diagnostics,
  };
}

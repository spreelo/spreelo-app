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

function getFeaturedShopifyImage(product, availableVariant = null) {
  const featured = product?.featuredMedia?.preview?.image || null;
  const variantImage = availableVariant?.image || null;
  const image = featured?.url ? featured : variantImage?.url ? variantImage : null;
  if (!image?.url) return null;
  return {
    url: cleanText(image.url),
    altText: cleanText(image.altText),
    width: Number(image.width || 0) || null,
    height: Number(image.height || 0) || null,
  };
}

export function mapShopifyProductNodeToCatalogItem(product, { verifiedAt = new Date().toISOString() } = {}) {
  if (!product || String(product.status || "").toUpperCase() !== "ACTIVE") return null;

  const productUrl = cleanText(product.onlineStoreUrl);
  if (!/^https?:\/\//i.test(productUrl)) return null;

  const variants = Array.isArray(product?.variants?.nodes) ? product.variants.nodes : [];
  const availableVariant = variants.find((variant) => variant?.availableForSale === true) || null;
  if (!availableVariant) return null;

  const image = getFeaturedShopifyImage(product, availableVariant);
  if (!image?.url) return null;

  const variantTitle = cleanText(availableVariant?.title);
  const sku = cleanText(availableVariant?.sku);
  const vendor = cleanText(product?.vendor);
  const productType = cleanText(product?.productType);
  const shopifyProductId = cleanText(product?.id);
  const shopifyVariantId = cleanText(availableVariant?.id);
  const stockEvidence = "Shopify Admin API reports this active Online Store product has an available-for-sale variant.";

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
    availability: "in_stock",
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
    locked_product_availability: "in_stock",
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

  return {
    connected: true,
    items,
    shopDomain: connection.shop_domain,
    diagnostics: {
      fetchedProductCount: nodes.length,
      eligibleProductCount: items.length,
      pageCount,
      maxProducts: boundedMax,
      source: "shopify_admin_api",
    },
  };
}

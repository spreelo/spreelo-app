import { getShopifyEnv, shopifyGraphqlForBrand } from "./shopifyOAuth.js";

const SHOPIFY_PRODUCT_ENGINE_PAGE_SIZE = 20;
const SHOPIFY_PRODUCT_ENGINE_MAX_PRODUCTS = 120;
const SHOPIFY_FULL_CATALOG_REFRESH_MS = 6 * 60 * 60 * 1000;

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

const SHOPIFY_FULL_CATALOG_BULK_QUERY = `#graphql
{
  products(query: "status:active published_status:published") {
    edges {
      node {
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
        variants {
          edges {
            node {
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
    }
  }
}`;

const SHOPIFY_FULL_CATALOG_START_MUTATION = `#graphql
mutation SpreeloStartFullCatalogSync($query: String!) {
  bulkOperationRunQuery(query: $query, groupObjects: false) {
    bulkOperation { id status }
    userErrors { field message }
  }
}`;

const SHOPIFY_FULL_CATALOG_STATUS_QUERY = `#graphql
query SpreeloFullCatalogSyncStatus($id: ID!) {
  bulkOperation(id: $id) {
    id
    status
    errorCode
    objectCount
    rootObjectCount
    url
    partialDataUrl
  }
}`;

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeShopDomain(value) {
  return cleanText(value)
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

function getVerifiedShopifyProductUrl(product, { shopDomain = "", publicationVerified = false } = {}) {
  const onlineStoreUrl = cleanText(product?.onlineStoreUrl);
  if (/^https?:\/\//i.test(onlineStoreUrl)) return onlineStoreUrl;

  // Development stores are always password-protected. Shopify can therefore
  // return onlineStoreUrl=null even for a product that the Admin API's
  // published_status:published filter verified as published to Online Store.
  // In that Shopify-only case, construct the canonical product path from the
  // connected shop domain + Shopify handle. Non-Shopify product sources never
  // use this fallback.
  if (!publicationVerified) return "";
  const domain = normalizeShopDomain(shopDomain);
  const handle = cleanText(product?.handle);
  if (!domain || !handle) return "";
  return `https://${domain}/products/${encodeURIComponent(handle)}`;
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

function inspectShopifyProductNode(product, { shopDomain = "", publicationVerified = false } = {}) {
  const active = Boolean(product && String(product.status || "").toUpperCase() === "ACTIVE");
  const returnedOnlineStoreUrl = /^https?:\/\//i.test(cleanText(product?.onlineStoreUrl));
  const productUrl = getVerifiedShopifyProductUrl(product, { shopDomain, publicationVerified });
  const onlineStorePublished = publicationVerified || returnedOnlineStoreUrl;
  const { variant, availability } = findEligibleShopifyVariant(product);
  const image = getFeaturedShopifyImage(product, variant);
  return {
    active,
    onlineStorePublished,
    returnedOnlineStoreUrl,
    constructedProductUrl: Boolean(productUrl && !returnedOnlineStoreUrl),
    hasEligibleVariant: Boolean(variant),
    hasImage: Boolean(image?.url),
    availabilitySignal: availability?.signal || "none",
  };
}

export function mapShopifyProductNodeToCatalogItem(
  product,
  { verifiedAt = new Date().toISOString(), shopDomain = "", publicationVerified = false } = {}
) {
  if (!product || String(product.status || "").toUpperCase() !== "ACTIVE") return null;

  const productUrl = getVerifiedShopifyProductUrl(product, { shopDomain, publicationVerified });
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
        searchQuery: "status:active published_status:published",
      },
    });

    const connectionData = data?.products || {};
    const pageNodes = Array.isArray(connectionData?.nodes) ? connectionData.nodes : [];
    nodes.push(...pageNodes);
    pageCount += 1;

    if (!connectionData?.pageInfo?.hasNextPage || !connectionData?.pageInfo?.endCursor || !pageNodes.length) break;
    after = connectionData.pageInfo.endCursor;
  }

  // The GraphQL search itself verifies Online Store publication. This matters
  // for password-protected development stores, where Shopify intentionally
  // returns onlineStoreUrl=null even for published products.
  const publicationVerifiedByQuery = true;
  const items = nodes
    .map((product) => mapShopifyProductNodeToCatalogItem(product, {
      verifiedAt,
      shopDomain: connection.shop_domain,
      publicationVerified: publicationVerifiedByQuery,
    }))
    .filter(Boolean);

  const inspections = nodes.map((product) => inspectShopifyProductNode(product, {
    shopDomain: connection.shop_domain,
    publicationVerified: publicationVerifiedByQuery,
  }));
  const diagnostics = {
    fetchedProductCount: nodes.length,
    eligibleProductCount: items.length,
    activeProductCount: inspections.filter((item) => item.active).length,
    onlineStorePublishedCount: inspections.filter((item) => item.onlineStorePublished).length,
    onlineStoreUrlReturnedCount: inspections.filter((item) => item.returnedOnlineStoreUrl).length,
    constructedProductUrlCount: inspections.filter((item) => item.constructedProductUrl).length,
    publicationVerifiedByQuery,
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
      ...diagnostics,
    });
  }

  return {
    connected: true,
    items,
    shopDomain: connection.shop_domain,
    diagnostics,
  };
}

function isMissingShopifyCatalogSyncColumnError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    (message.includes("column") && message.includes("does not exist")) ||
    (message.includes("could not find") && message.includes("column")) ||
    message.includes("schema cache")
  );
}

function createShopifyBulkCatalogAssembler({ verifiedAt, shopDomain }) {
  const items = [];
  let currentProduct = null;
  let rootProductCount = 0;
  let variantObjectCount = 0;
  let malformedLineCount = 0;

  const flushCurrent = () => {
    if (!currentProduct) return;
    const mapped = mapShopifyProductNodeToCatalogItem(currentProduct, {
      verifiedAt,
      shopDomain,
      publicationVerified: true,
    });
    if (mapped) items.push(mapped);
    currentProduct = null;
  };

  const consumeLine = (rawLine) => {
    const line = String(rawLine || "").trim();
    if (!line) return;

    let record;
    try {
      record = JSON.parse(line);
    } catch {
      malformedLineCount += 1;
      return;
    }

    const parentId = cleanText(record?.__parentId);
    if (parentId) {
      variantObjectCount += 1;
      if (currentProduct?.id === parentId) {
        const { __parentId, ...variant } = record;
        currentProduct.variants.nodes.push(variant);
      }
      return;
    }

    const id = cleanText(record?.id);
    if (!id.startsWith("gid://shopify/Product/")) return;

    flushCurrent();
    rootProductCount += 1;
    currentProduct = {
      ...record,
      variants: { nodes: [] },
    };
  };

  const finish = () => {
    flushCurrent();
    return {
      items,
      diagnostics: {
        rootProductCount,
        variantObjectCount,
        malformedLineCount,
        eligibleProductCount: items.length,
      },
    };
  };

  return { consumeLine, finish };
}

export function parseShopifyFullCatalogJsonlText(
  text,
  { verifiedAt = new Date().toISOString(), shopDomain = "" } = {}
) {
  const assembler = createShopifyBulkCatalogAssembler({ verifiedAt, shopDomain });
  for (const line of String(text || "").split(/\r?\n/)) assembler.consumeLine(line);
  return assembler.finish();
}

async function downloadShopifyBulkCatalog({ url, verifiedAt, shopDomain }) {
  const response = await fetch(url, { method: "GET", cache: "no-store" });
  if (!response.ok) {
    const error = new Error(`Shopify bulk catalog download failed (${response.status})`);
    error.status = response.status;
    throw error;
  }

  if (!response.body?.getReader) {
    const text = await response.text();
    return parseShopifyFullCatalogJsonlText(text, { verifiedAt, shopDomain });
  }

  const assembler = createShopifyBulkCatalogAssembler({ verifiedAt, shopDomain });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      assembler.consumeLine(buffer.slice(0, newlineIndex));
      buffer = buffer.slice(newlineIndex + 1);
      newlineIndex = buffer.indexOf("\n");
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) assembler.consumeLine(buffer);
  return assembler.finish();
}

async function readShopifyFullCatalogSyncConnection({ supabaseAdmin, brandProfileId }) {
  const { data, error } = await supabaseAdmin
    .from("shopify_connections")
    .select(
      "id,brand_profile_id,shop_domain,status,scopes,shopify_catalog_bulk_operation_id,shopify_catalog_bulk_status,shopify_catalog_bulk_started_at,shopify_catalog_last_full_sync_at,shopify_catalog_product_count,shopify_catalog_last_error"
    )
    .eq("brand_profile_id", brandProfileId)
    .maybeSingle();

  if (error && isMissingShopifyCatalogSyncColumnError(error)) {
    return { connection: null, schemaSupported: false, error };
  }
  if (error) throw error;
  return { connection: data || null, schemaSupported: true, error: null };
}

async function updateShopifyFullCatalogSyncState({
  supabaseAdmin,
  connectionId,
  operationId = "",
  updates,
}) {
  let query = supabaseAdmin
    .from("shopify_connections")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", connectionId);
  if (operationId) query = query.eq("shopify_catalog_bulk_operation_id", operationId);
  const { error } = await query;
  if (error) throw error;
}

export async function ensureShopifyFullCatalogSync({
  supabaseAdmin,
  brandProfileId,
  startIfNeeded = true,
  pollExisting = true,
  refreshMs = SHOPIFY_FULL_CATALOG_REFRESH_MS,
} = {}) {
  if (!supabaseAdmin || !brandProfileId) {
    return { connected: false, supported: true, status: "missing_context", items: [] };
  }

  const state = await readShopifyFullCatalogSyncConnection({ supabaseAdmin, brandProfileId });
  if (!state.schemaSupported) {
    return {
      connected: false,
      supported: false,
      status: "schema_missing",
      items: [],
      diagnostics: { reason: "shopify_full_catalog_sync_sql_missing" },
    };
  }

  const connection = state.connection;
  if (!connection?.id || connection.status !== "connected") {
    return {
      connected: false,
      supported: true,
      status: connection?.status || "not_connected",
      items: [],
      shopDomain: connection?.shop_domain || null,
    };
  }

  const scopes = Array.isArray(connection.scopes)
    ? connection.scopes
    : String(connection.scopes || "").split(/[\s,]+/).filter(Boolean);
  if (!scopes.includes("read_products")) {
    return {
      connected: true,
      supported: true,
      status: "missing_read_products_scope",
      items: [],
      shopDomain: connection.shop_domain,
    };
  }

  const env = getShopifyEnv();
  const operationId = cleanText(connection.shopify_catalog_bulk_operation_id);
  const syncStatus = cleanText(connection.shopify_catalog_bulk_status).toLowerCase();
  const lastFullSyncMs = Date.parse(connection.shopify_catalog_last_full_sync_at || "") || 0;
  const syncFresh = lastFullSyncMs > 0 && Date.now() - lastFullSyncMs < Math.max(60_000, Number(refreshMs || 0));

  if (operationId && ["created", "running", "downloaded"].includes(syncStatus) && !pollExisting) {
    return {
      connected: true,
      supported: true,
      status: syncStatus,
      operationId,
      items: [],
      shopDomain: connection.shop_domain,
      startedAt: connection.shopify_catalog_bulk_started_at || null,
      diagnostics: { source: "shopify_admin_bulk_api" },
    };
  }

  if (operationId && ["created", "running", "downloaded"].includes(syncStatus)) {
    const { data } = await shopifyGraphqlForBrand({
      supabaseAdmin,
      brandProfileId,
      apiVersion: env.apiVersion,
      query: SHOPIFY_FULL_CATALOG_STATUS_QUERY,
      variables: { id: operationId },
    });
    const operation = data?.bulkOperation || null;
    if (!operation?.id) {
      const message = "Shopify full catalog bulk operation could not be found";
      await updateShopifyFullCatalogSyncState({
        supabaseAdmin,
        connectionId: connection.id,
        operationId,
        updates: {
          shopify_catalog_bulk_status: "failed",
          shopify_catalog_last_error: message,
          shopify_catalog_bulk_operation_id: null,
        },
      });
      return {
        connected: true,
        supported: true,
        status: "failed",
        operationId,
        items: [],
        shopDomain: connection.shop_domain,
        diagnostics: { reason: message, source: "shopify_admin_bulk_api" },
      };
    }

    const apiStatus = cleanText(operation?.status).toUpperCase();

    if (apiStatus === "COMPLETED" && operation?.url) {
      const verifiedAt = new Date().toISOString();
      const parsed = await downloadShopifyBulkCatalog({
        url: operation.url,
        verifiedAt,
        shopDomain: connection.shop_domain,
      });
      await updateShopifyFullCatalogSyncState({
        supabaseAdmin,
        connectionId: connection.id,
        operationId,
        updates: {
          shopify_catalog_bulk_status: "downloaded",
          shopify_catalog_product_count: parsed.items.length,
          shopify_catalog_last_error: null,
        },
      });
      return {
        connected: true,
        supported: true,
        status: "downloaded",
        operationId,
        items: parsed.items,
        shopDomain: connection.shop_domain,
        startedAt: connection.shopify_catalog_bulk_started_at || null,
        diagnostics: {
          ...parsed.diagnostics,
          objectCount: Number(operation?.objectCount || 0),
          rootObjectCount: Number(operation?.rootObjectCount || 0),
          source: "shopify_admin_bulk_api",
        },
      };
    }

    if (["FAILED", "CANCELED", "CANCELING", "EXPIRED"].includes(apiStatus)) {
      const message = `Shopify full catalog bulk sync ${apiStatus.toLowerCase()}${operation?.errorCode ? `: ${operation.errorCode}` : ""}`;
      await updateShopifyFullCatalogSyncState({
        supabaseAdmin,
        connectionId: connection.id,
        operationId,
        updates: {
          shopify_catalog_bulk_status: "failed",
          shopify_catalog_last_error: message.slice(0, 1000),
          shopify_catalog_bulk_operation_id: null,
        },
      });
      return {
        connected: true,
        supported: true,
        status: "failed",
        operationId,
        items: [],
        shopDomain: connection.shop_domain,
        diagnostics: { reason: message, source: "shopify_admin_bulk_api" },
      };
    }

    await updateShopifyFullCatalogSyncState({
      supabaseAdmin,
      connectionId: connection.id,
      operationId,
      updates: {
        shopify_catalog_bulk_status: apiStatus === "CREATED" ? "created" : "running",
        shopify_catalog_last_error: null,
      },
    });
    return {
      connected: true,
      supported: true,
      status: apiStatus === "CREATED" ? "created" : "running",
      operationId,
      items: [],
      shopDomain: connection.shop_domain,
      diagnostics: {
        objectCount: Number(operation?.objectCount || 0),
        rootObjectCount: Number(operation?.rootObjectCount || 0),
        source: "shopify_admin_bulk_api",
      },
    };
  }

  if (syncFresh || !startIfNeeded) {
    return {
      connected: true,
      supported: true,
      status: syncFresh ? "fresh" : syncStatus || "idle",
      operationId: "",
      items: [],
      shopDomain: connection.shop_domain,
      diagnostics: {
        productCount: Number(connection.shopify_catalog_product_count || 0),
        lastFullSyncAt: connection.shopify_catalog_last_full_sync_at || null,
        source: "shopify_admin_bulk_api",
      },
    };
  }

  const { data } = await shopifyGraphqlForBrand({
    supabaseAdmin,
    brandProfileId,
    apiVersion: env.apiVersion,
    query: SHOPIFY_FULL_CATALOG_START_MUTATION,
    variables: { query: SHOPIFY_FULL_CATALOG_BULK_QUERY },
  });
  const payload = data?.bulkOperationRunQuery || {};
  const userErrors = Array.isArray(payload?.userErrors) ? payload.userErrors : [];
  if (userErrors.length) {
    const message = userErrors.map((item) => item?.message).filter(Boolean).join("; ") || "Shopify rejected the full catalog bulk sync";
    await updateShopifyFullCatalogSyncState({
      supabaseAdmin,
      connectionId: connection.id,
      updates: {
        shopify_catalog_bulk_status: "failed",
        shopify_catalog_last_error: message.slice(0, 1000),
        shopify_catalog_bulk_operation_id: null,
      },
    });
    return {
      connected: true,
      supported: true,
      status: "failed",
      items: [],
      shopDomain: connection.shop_domain,
      diagnostics: { reason: message, source: "shopify_admin_bulk_api" },
    };
  }

  const operation = payload?.bulkOperation || null;
  const newOperationId = cleanText(operation?.id);
  if (!newOperationId) {
    throw new Error("Shopify did not return a bulk operation ID for the full catalog sync");
  }

  const startedAt = new Date().toISOString();
  await updateShopifyFullCatalogSyncState({
    supabaseAdmin,
    connectionId: connection.id,
    updates: {
      shopify_catalog_bulk_operation_id: newOperationId,
      shopify_catalog_bulk_status: cleanText(operation?.status).toLowerCase() || "created",
      shopify_catalog_bulk_started_at: startedAt,
      shopify_catalog_last_error: null,
    },
  });

  return {
    connected: true,
    supported: true,
    status: cleanText(operation?.status).toLowerCase() || "created",
    operationId: newOperationId,
    items: [],
    shopDomain: connection.shop_domain,
    startedAt,
    diagnostics: { source: "shopify_admin_bulk_api" },
  };
}

export async function markShopifyFullCatalogSyncIngested({
  supabaseAdmin,
  brandProfileId,
  operationId,
  productCount = 0,
} = {}) {
  if (!supabaseAdmin || !brandProfileId || !operationId) return false;
  const state = await readShopifyFullCatalogSyncConnection({ supabaseAdmin, brandProfileId });
  if (!state.schemaSupported || !state.connection?.id) return false;
  if (cleanText(state.connection.shopify_catalog_bulk_operation_id) !== cleanText(operationId)) return false;

  const completedAt = new Date().toISOString();
  await updateShopifyFullCatalogSyncState({
    supabaseAdmin,
    connectionId: state.connection.id,
    operationId,
    updates: {
      shopify_catalog_bulk_operation_id: null,
      shopify_catalog_bulk_status: "completed",
      shopify_catalog_last_full_sync_at: completedAt,
      shopify_catalog_product_count: Math.max(0, Number(productCount || 0)),
      shopify_catalog_last_error: null,
    },
  });
  return true;
}

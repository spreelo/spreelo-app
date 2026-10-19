import { explicitCollectionScope } from './storeMapCollectionScope.js';
import { collectionListingCandidates, productBreadcrumbIncludesCollection } from './collectionListingEvidence.js';

// A customer-selected Shopify collection is a hard product boundary. Search
// relevance and a valid product page do not establish collection membership.
const cache = new Map();
const TIMEOUT_MS = 9000;
const CACHE_MS = 2 * 60 * 1000;
const PAGE_SIZE = 250;
const MAX_PAGES = 5;
const productProofCache = new Map();

function productHandle(productUrl) {
  try {
    const url = new URL(productUrl);
    const match = url.pathname.match(/(?:^|\/)products\/([^/?#]+)/i);
    return match ? decodeURIComponent(match[1]).toLowerCase() : null;
  } catch {
    return null;
  }
}

export function collectionIncludesHandle(handles, productUrl) {
  const target = productHandle(productUrl);
  return Boolean(target && Array.isArray(handles) && handles.some(
    (handle) => String(handle).toLowerCase() === target
  ));
}

async function readUrl(url, fetcher) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetcher(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json,text/html;q=0.8' },
      redirect: 'follow',
    });
  } finally {
    clearTimeout(timeout);
  }
}

function imageFromProduct(product) {
  return product?.image?.src || product?.images?.[0]?.src || null;
}

async function loadCollectionIndex(collection, fetcher) {
  const handles = new Set();
  const candidates = [];
  let hasValidFeed = false;
  let complete = false;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    try {
      const suffix = page === 1 ? '' : `&page=${page}`;
      const response = await readUrl(`${collection}/products.json?limit=${PAGE_SIZE}${suffix}`, fetcher);
      if (!response.ok) break;
      const payload = await response.json();
      if (!Array.isArray(payload?.products)) break;
      hasValidFeed = true;
      for (const product of payload.products) {
        if (!product?.handle) continue;
        const handle = String(product.handle).toLowerCase();
        if (handles.has(handle)) continue;
        handles.add(handle);
        candidates.push({
          url: `${new URL(collection).origin}/products/${encodeURIComponent(product.handle)}`,
          title: String(product.title || product.handle),
          image_url: imageFromProduct(product),
          collection_feed_verified: true,
          selection_priority: 300,
        });
      }
      if (payload.products.length < PAGE_SIZE) {
        complete = true;
        break;
      }
    } catch (error) {
      if (error?.code === 'WEBSITE_RATE_LIMITED' || Number(error?.status) === 429) throw error;
      break;
    }
  }
  if (hasValidFeed && handles.size) {
    return { handles, candidates, complete, provenance: 'shopify_collection_feed' };
  }

  // HTML is only positive membership evidence. Missing links can be lazy-loaded
  // or paginated, and therefore do not prove a product is absent.
  try {
    const response = await readUrl(collection, fetcher);
    if (response.ok && (!response.url || explicitCollectionScope(response.url) === collection)) {
      const body = await response.text();
      for (const candidate of collectionListingCandidates(body, collection)) {
        const handle = productHandle(candidate.url);
        if (!handle || handles.has(handle)) continue;
        handles.add(handle);
        candidates.push(candidate);
      }
      if (handles.size) return { handles, candidates, complete: false, provenance: 'collection_html' };
    }
  } catch (error) {
    if (error?.code === 'WEBSITE_RATE_LIMITED' || Number(error?.status) === 429) throw error;
  }
  return { handles, candidates, complete: false, provenance: 'unavailable' };
}

async function getCollectionIndex(collection, fetcher, refresh = false) {
  const cached = !refresh && cache.get(collection);
  if (cached && cached.expires > Date.now()) return cached;
  const index = await loadCollectionIndex(collection, fetcher);
  const result = { ...index, expires: Date.now() + CACHE_MS };
  if (cache.size >= 200) cache.delete(cache.keys().next().value);
  cache.set(collection, result);
  return result;
}

export async function verifyExplicitCollectionMembership({
  sourceUrl, productUrl, fetcher = fetch, refresh = false, checkProductPage = true, productHtml = null,
}) {
  const collection = explicitCollectionScope(sourceUrl);
  if (!collection) return { applicable: false, verified: true, reason: 'No explicit collection restriction' };
  let product;
  try { product = new URL(productUrl); } catch {
    return { applicable: true, verified: false, reason: 'Invalid product URL' };
  }
  const scope = new URL(collection);
  if (product.origin.toLowerCase() !== scope.origin.toLowerCase()) {
    return { applicable: true, verified: false, reason: 'Product is outside configured storefront' };
  }
  const handle = productHandle(productUrl);
  if (!handle) return { applicable: true, verified: false, reason: 'Not a product detail URL' };
  const index = await getCollectionIndex(collection, fetcher, refresh);
  let verified = index.handles.has(handle);
  let provenance = index.provenance;
  if (!verified && !index.complete && checkProductPage) {
    const key = `${collection}\n${product.origin}/products/${handle}`;
    const cached = productProofCache.get(key);
    let proof = typeof productHtml !== 'string' && !refresh && cached?.expires > Date.now() ? cached.verified : null;
    if (proof === null) {
      proof = false;
      try {
        const response = typeof productHtml === 'string'
          ? { ok: true, text: async () => productHtml }
          : await readUrl(productUrl, fetcher);
        if (response.ok && (!response.url || productHandle(response.url) === handle)) {
          proof = productBreadcrumbIncludesCollection(await response.text(), productUrl, collection);
        }
      } catch (error) {
        if (error?.code === 'WEBSITE_RATE_LIMITED' || Number(error?.status) === 429) throw error;
      }
      if (productProofCache.size >= 500) productProofCache.delete(productProofCache.keys().next().value);
      productProofCache.set(key, { verified: proof, expires: Date.now() + CACHE_MS });
    }
    verified = proof;
    if (verified) provenance = 'exact_product_breadcrumb';
  }
  return {
    applicable: true,
    verified,
    evidenceComplete: index.complete,
    evidenceCount: index.handles.size,
    provenance,
    reason: verified
      ? `Product linked by ${provenance}`
      : index.complete
        ? 'Product absent from complete configured collection feed'
        : 'Product membership not confirmed by current collection data',
  };
}

// Filter *before* candidate selection, not after it. Excluded products must
// never return via another catalog fallback in the same occurrence.
export async function filterExplicitCollectionCandidates({
  sourceUrl, items, fetcher = fetch, refreshIfEmpty = true,
}) {
  const input = Array.isArray(items) ? items : [];
  if (!explicitCollectionScope(sourceUrl)) {
    return { items: input, rejected: [], applicable: false };
  }
  const verify = (item, refresh = false) => verifyExplicitCollectionMembership({
    sourceUrl,
    productUrl: item?.url || item?.product_url || item?.item_url || '',
    fetcher,
    refresh,
    checkProductPage: false,
  });
  let eligible = [];
  let rejected = [];
  let pending = [];
  const classify = (item, result) => {
    if (result.verified) eligible.push(item);
    else if (result.applicable && result.evidenceComplete === false &&
        result.reason === 'Product membership not confirmed by current collection data') {
      eligible.push(item);
      pending.push(item);
    } else rejected.push({ item, reason: result.reason });
  };
  for (const item of input) classify(item, await verify(item));
  // If a stale cache excluded everything, refresh once against current Shopify
  // data, then recheck the pool. Never treat a fuzzy title match as evidence.
  if (refreshIfEmpty && input.length && !eligible.length &&
      (await verify(input[0])).evidenceCount > 0) {
    await verify(input[0], true);
    eligible = [];
    rejected = [];
    pending = [];
    for (const item of input) classify(item, await verify(item));
  }
  return { items: eligible, rejected, pending, applicable: true };
}

// When discovery/scoring caches contain only wrong-category products, get a
// genuine collection shortlist directly from Shopify rather than reusing them.
export async function getExplicitCollectionProductCandidates({
  sourceUrl, fetcher = fetch,
}) {
  const collection = explicitCollectionScope(sourceUrl);
  if (!collection) return [];
  const index = await getCollectionIndex(collection, fetcher, false);
  return index.candidates.slice(0, 250);
}

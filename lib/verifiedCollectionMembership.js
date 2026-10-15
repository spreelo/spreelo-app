import { explicitCollectionScope } from './storeMapCollectionScope.js';

// A customer-selected Shopify collection is a hard product boundary. Search
// relevance and a valid product page do not establish collection membership.
const cache = new Map();
const TIMEOUT_MS = 9000;
const CACHE_MS = 2 * 60 * 1000;
const PAGE_SIZE = 250;
const MAX_PAGES = 5;

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
    } catch {
      break;
    }
  }
  if (hasValidFeed) {
    return { handles, candidates, complete, provenance: 'shopify_collection_feed' };
  }

  // HTML is only positive membership evidence. Missing links can be lazy-loaded
  // or paginated, and therefore do not prove a product is absent.
  try {
    const response = await readUrl(collection, fetcher);
    if (response.ok) {
      const body = await response.text();
      for (const match of body.matchAll(/(?:\/collections\/[^/\s"'<>]+)?\/products\/([a-z0-9%_-]+)/gi)) {
        const handle = decodeURIComponent(match[1]).toLowerCase();
        if (handles.has(handle)) continue;
        handles.add(handle);
        candidates.push({
          url: `${new URL(collection).origin}/products/${encodeURIComponent(handle)}`,
          title: handle.replace(/-/g, ' '),
          image_url: null,
          collection_feed_verified: true,
          selection_priority: 200,
        });
      }
      return { handles, candidates, complete: false, provenance: 'collection_html' };
    }
  } catch {}
  return { handles, candidates, complete: false, provenance: 'unavailable' };
}

async function getCollectionIndex(collection, fetcher, refresh = false) {
  const cached = !refresh && cache.get(collection);
  if (cached && cached.expires > Date.now()) return cached;
  const index = await loadCollectionIndex(collection, fetcher);
  const result = { ...index, expires: Date.now() + CACHE_MS };
  cache.set(collection, result);
  return result;
}

export async function verifyExplicitCollectionMembership({
  sourceUrl, productUrl, fetcher = fetch, refresh = false,
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
  const verified = index.handles.has(handle);
  return {
    applicable: true,
    verified,
    reason: verified
      ? `Product linked by ${index.provenance}`
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
  });
  let eligible = [];
  let rejected = [];
  for (const item of input) {
    const result = await verify(item);
    if (result.verified) eligible.push(item);
    else rejected.push({ item, reason: result.reason });
  }
  // If a stale cache excluded everything, refresh once against current Shopify
  // data, then recheck the pool. Never treat a fuzzy title match as evidence.
  if (refreshIfEmpty && input.length && !eligible.length) {
    await verify(input[0], true);
    eligible = [];
    rejected = [];
    for (const item of input) {
      const result = await verify(item);
      if (result.verified) eligible.push(item);
      else rejected.push({ item, reason: result.reason });
    }
  }
  return { items: eligible, rejected, applicable: true };
}

// When discovery/scoring caches contain only wrong-category products, get a
// genuine collection shortlist directly from Shopify rather than reusing them.
export async function getExplicitCollectionProductCandidates({
  sourceUrl, fetcher = fetch,
}) {
  const collection = explicitCollectionScope(sourceUrl);
  if (!collection) return [];
  const index = await getCollectionIndex(collection, fetcher);
  return index.candidates.slice(0, 250);
}

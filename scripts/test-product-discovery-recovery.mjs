import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { explicitCollectionScope } from '../lib/storeMapCollectionScope.js';
import { getWebsiteCooldownState } from '../lib/websiteCooldownStatus.js';

const source = fs.readFileSync('app/api/cron/run-automations/route.js', 'utf8');
function definition(name) {
  const match = new RegExp(`^(?:export )?(?:async )?function ${name}\\(`, 'm').exec(source);
  assert(match, name);
  const rest = source.slice(match.index).replace(/^export /, '');
  const next = /\n(?:export )?(?:async )?function /g.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}
const quiet = { log() {}, info() {}, warn() {}, error() {} };
const origin = url => new URL(url).origin;
const used = (item, history) => history.some(row => (row.url || row.item_url) === item.url);
const dedupe = rows => [...new Map(rows.map(row => [row.url, row])).values()];
const base = {
  console: quiet, URL, Date, Map, Set, explicitCollectionScope,
  getWebsiteOrigin: origin, getWebsiteSearchBaseUrls: url => [origin(url)],
  isHttpUrl: url => /^https?:/.test(url || ''), isLikelyNonProductUrl: () => false,
  scorePossibleProductLink: () => 10, dedupeUrlItems: dedupe,
  hasWebsiteItemAlreadyBeenUsed: used, buildCampaignDiscoverySearches: () => ['unrelated-category'],
  isWebsiteRateLimitError: error => error.code === 'WEBSITE_RATE_LIMITED',
};
function feedContext(fetchJson) {
  const ctx = vm.createContext({ ...base, fetchJson });
  for (const name of ['shopifyFeedProductCandidates', 'readShopifyProductFeed',
    'discoverShopifyProductsJson', 'discoverShopifyCollectionJson', 'buildLikelyDiscoveryUrls']) {
    vm.runInContext(definition(name), ctx);
  }
  return ctx;
}
const product = handle => ({ handle, title: handle, body_html: '<p>Verified feed description</p>',
  images: [{ src: `https://shop.test/images/${handle}.png` }], variants: [{ available: true }] });
const collection = 'https://shop.test/collections/chosen';
const history = Array.from({ length: 250 }, (_, n) => ({ url: `https://shop.test/products/old-${n}` }));
const requests = [];
const feed = feedContext(async url => {
  requests.push(url);
  return { products: new URL(url).searchParams.get('page') === '2'
    ? [product('fresh-on-page-two')]
    : Array.from({ length: 250 }, (_, n) => product(`old-${n}`)) };
});
const candidates = await feed.discoverShopifyCollectionJson({ websiteUrl: collection, campaignPrompt: '', usedItems: history });
assert.equal(candidates.length, 1);
assert.equal(candidates[0].url, 'https://shop.test/products/fresh-on-page-two');
assert.equal(candidates[0].authoritative_public_commerce_feed, true);
assert.equal(candidates[0].product_image_page_bound, true);
assert.equal(requests.length, 2, 'continue past a full page of used products');
assert(requests.every(url => new URL(url).pathname === '/collections/chosen/products.json'));
await feed.discoverShopifyProductsJson({ websiteUrl: collection, campaignPrompt: '' });
assert.equal(requests.length, 2, 'a chosen collection must not open the whole-store feed');
assert.deepEqual(Array.from(feed.buildLikelyDiscoveryUrls(collection, 'other', 'shopify')),
  [`${collection}/products.json?limit=250`, collection]);
const unavailable = feed.shopifyFeedProductCandidates({ products: [{ ...product('unknown'), variants: [] }], websiteUrl: collection });
assert.equal(unavailable[0].authoritative_public_commerce_feed, false, 'unknown stock must not become verified stock');
const soldOut = feed.shopifyFeedProductCandidates({ products: [{ ...product('sold-out'), variants: [{ available: false, inventory_quantity: 10 }] }], websiteUrl: collection });
assert.equal(soldOut[0].authoritative_public_commerce_feed, false, 'explicitly unavailable variants must not become purchasable through inventory alone');
const rateLimit = Object.assign(new Error('Remote 429'), { code: 'WEBSITE_RATE_LIMITED', origin: 'http_response' });
await assert.rejects(feedContext(async () => { throw rateLimit; }).discoverShopifyCollectionJson({ websiteUrl: collection }), error => error === rateLimit);
console.log('PASS: JSON feed, pagination beyond used products, exact collection, stock evidence and genuine 429 propagation');

// Exercise the actual discovery URL dispatcher. A generated products.json
// URL must reach JSON decoding, even if the initial page did not reveal Shopify.
const dispatchCalls = [];
const dispatch = feedContext(async url => {
  dispatchCalls.push(url);
  return { products: [product('from-json-dispatch')] };
});
Object.assign(dispatch, {
  getWebsiteDomainFetchState: async () => ({}), isWebsiteAccessProtectedState: () => false,
  fetchHtml: async url => {
    assert(!url.includes('products.json'), 'JSON must never be sent to the HTML reader');
    return '<html>Catalog</html>';
  },
  normalizeComparableValue: value => String(value || '').toLowerCase(),
  detectCommercePlatform: () => 'generic', extractProductLinksFromDiscoveryPage: () => [],
  discoverProductsFromSitemaps: async () => [], WEBSITE_PRODUCT_DISCOVERY_FETCH_LIMIT: 12,
  WEBSITE_PRODUCT_DISCOVERY_VERIFY_LIMIT: 8, PRODUCT_ENGINE_V2_POOL_TARGETS: { minimumCandidatePool: 12 },
  getProductMarketCodeForRule: () => 'se', matchesConfiguredWebsiteMarket: () => true,
  upsertWebsiteProductCandidateQueue: async () => true,
});
vm.runInContext(definition('discoverProductCandidatesFromWebsite'), dispatch);
const dispatched = await dispatch.discoverProductCandidatesFromWebsite({ websiteUrl: collection, campaignPrompt: '' });
assert.equal(dispatched[0]?.url, 'https://shop.test/products/from-json-dispatch');
assert.equal(dispatchCalls.length, 1);
console.log('PASS: actual website discovery routes JSON URLs to the JSON reader');

const focused = feedContext(async () => ({ products: [product('feed-first')] }));
Object.assign(focused, {
  getWebsiteDomainFetchState: async () => ({}), isWebsiteAccessProtectedState: () => false,
  WEBSITE_PRODUCT_DISCOVERY_VERIFY_LIMIT: 8, WEBSITE_VERIFICATION_SOFT_DEADLINE_MS: 225_000,
  CAROUSEL_PRODUCT_SLIDE_TARGET: 5, CAROUSEL_PRODUCT_RESERVE_TARGET: 5,
  getAdaptiveProductPoolTargets: () => ({ minimumCandidatePool: 12, minimumVerifiedPool: 5 }),
  buildCampaignResearchText: () => '', canonicalizeWebsiteProductUrl: value => value,
  canonicalizeStoreMapUrl: value => value, normalizeComparableValue: value => String(value || '').toLowerCase(),
  rankFocusedCategoryCandidatesForVerification: dedupe, loadWebsiteProductCandidateQueue: async () => [],
  upsertWebsiteProductCandidateQueue: async () => true,
  isAuthoritativePublicCommerceFeedLockedProduct: item => item.authoritative_public_commerce_feed && item.product_image_page_bound,
  verifyDiscoveredWebsiteProductCandidates: async ({ candidates, limit }) => candidates.slice(0, limit),
  buildTrustedCategoryCardProducts: () => [], dedupeWebsiteItemsByUrlTitleAndImage: dedupe,
  fetchHtml: async () => { throw new Error('A usable exact feed must avoid HTML crawling'); },
  discoverProductCandidatesFromWebsite: async () => { throw new Error('A usable exact feed must avoid broad discovery'); },
});
vm.runInContext(definition('discoverProductsFromFocusedCategory'), focused);
const focusedItems = await focused.discoverProductsFromFocusedCategory({ categoryUrl: collection, rule: {}, limit: 1 });
assert.equal(focusedItems[0]?.url, 'https://shop.test/products/feed-first');
assert.equal(focusedItems.rateLimited, false);
console.log('PASS: real focused discovery uses an adequate exact feed before HTML or broad discovery');

// Replay the observed failure: research returns a used product, then a fresh
// candidate whose AI replacement is used, then a genuinely fresh product.
async function researchCase({ alwaysUsedReplacement = false, repeatOnly = false } = {}) {
  let searches = 0, repairs = 0, directReads = 0;
  const ctx = vm.createContext({ ...base,
    CAROUSEL_WEB_SEARCH_MAX_VERIFIED_ITEMS: 8, CAROUSEL_WEB_SEARCH_CANDIDATE_LIMIT: 12,
    PRODUCT_RESEARCH_MODEL: 'test', PRODUCT_RESEARCH_FAST_MODEL: 'test', CAROUSEL_MIN_PRODUCT_SLIDES: 2,
    normalizeComparableValue: value => String(value || '').toLowerCase(),
    canonicalizeWebsiteProductUrl: value => value, isManufacturerCatalogSource: () => false,
    getWebsiteDomainFetchState: async () => ({ cooldownActive: true }),
    isWebsiteAccessProtectedState: () => false, isWebsiteRateLimitedState: () => true,
    isWebsiteSecurityBlockedError: () => false,
    buildCampaignResearchText: () => '', isProductEligibleForWebsiteSource: () => true,
    getPrimaryCampaignResearchRank: item => item.campaign_research_rank || 1,
    sortFreshProductCandidatesFirst: rows => rows,
    findProductUrlWithWebSearch: async () => {
      searches++;
      return { products: [repeatOnly || searches === 1
        ? { url: history[0].url, title: 'Already used' }
        : { url: `https://shop.test/products/new-${searches}`, title: `New ${searches}` }] };
    },
    extractProductDataFromProductPage: async () => { directReads++; throw rateLimit; },
    repairAuthoritativeWebAgentProductAssets: async ({ selectedCandidates }) => {
      repairs++;
      const item = alwaysUsedReplacement || repairs === 1
        ? { ...selectedCandidates[0], url: history[0].url }
        : selectedCandidates[0];
      return { repairedCandidates: [{ ...item, image_url: 'https://shop.test/new.png' }] };
    },
    hydrateAuthoritativeWebAgentProduct: async ({ candidate }) => candidate,
    dedupeWebsiteItemsByUrlTitleAndImage: dedupe,
    applyAiCampaignFitScores: async ({ items }) => items,
  });
  vm.runInContext(definition('findWebsiteProductWithWebSearch'), ctx);
  const result = await ctx.findWebsiteProductWithWebSearch({
    openai: {}, rule: {}, brandProfile: {}, websiteUrl: 'https://shop.test/',
    usedWebsiteItems: history, excludePreviouslyUsed: true, desiredVerifiedCount: 2,
    deadlineMs: Date.now() + 120_000,
  });
  return { result, searches, repairs, directReads };
}
const recovered = await researchCase();
assert.equal(recovered.result.length, 1);
assert.equal(recovered.result[0].url, 'https://shop.test/products/new-3');
assert.equal(recovered.searches, 3);
assert.equal(recovered.repairs, 2);
assert.equal(recovered.directReads, 2, 'do not fetch the already-used discovery candidate');
const exhausted = await researchCase({ alwaysUsedReplacement: true });
assert.equal(exhausted.result.length, 0, 'a used AI replacement must not count as success');
assert.equal(exhausted.repairs, 2, 'exact repair must remain bounded');
const repeated = await researchCase({ repeatOnly: true });
assert.equal(repeated.searches, 3);
assert.equal(repeated.repairs, 0);
assert.equal(repeated.directReads, 0);
console.log('PASS: used discovery/repair results cannot end research; later fresh result succeeds within bounded calls');

// Execute the actual single-product entry point through its saved-pool path.
const cachedProduct = { url: 'https://shop.test/products/cached', title: 'Cached verified product',
  image_url: 'https://shop.test/cached.png', product_identity_locked: true,
  product_image_semantic_verified: true, stock_verified_at: new Date().toISOString(), availability: 'in_stock' };
async function savedPoolCase({ item = cachedProduct, member = true, recent = [], rateLimited = false } = {}) {
  let discoveryCalls = 0, sourceChecks = 0;
  const reachedDiscovery = new Error('LIVE_DISCOVERY_REACHED');
  const ctx = vm.createContext({ ...base,
    WEBSITE_PRODUCT_REUSE_LIMIT: 100, WEBSITE_PRODUCT_CATALOG_SELECT_LIMIT: 500,
    WEBSITE_TEXT_INTENT_STORE_VERIFY_LIMIT: 8, PROTECTED_PRODUCT_STOCK_FRESH_MS: 2 * 3600_000,
    resolveWebsiteTextProductIntentRule: async ({ rule }) => rule,
    getRuleContentSourceScope: () => 'product_category',
    isAiProductVideoRule: () => true,
    getWebsiteProductSourceUrl: () => collection,
    getWebsiteFetchDomain: value => new URL(value).hostname,
    isProductIntentScopedWebsiteRule: () => false,
    getWebsiteDomainFetchState: async () => ({}), isWebsiteAccessProtectedState: () => false,
    getRecentUsedWebsiteItems: async () => recent,
    getWebsiteProductCatalogItems: async () => [item],
    removeStaleShopifyApiCatalogItems: rows => rows, filterWebsiteCatalogItemsForRule: rows => rows,
    dedupeWebsiteItemsByUrlTitleAndImage: dedupe,
    isSameOrSubdomainUrl: (a, b) => origin(a) === origin(b),
    matchesConfiguredWebsiteMarket: () => true, getProductMarketCodeForRule: () => 'se',
    isProductConfirmedPurchasable: value => value.availability === 'in_stock',
    isProductEligibleForWebsiteSource: value => value.availability === 'in_stock',
    isIndexedSecurityFallbackLockedProduct: () => false,
    isAuthoritativePublicCommerceFeedLockedProduct: () => false,
    isShopifyAdminApiLockedProduct: () => false, isAcceptableWebsiteTextProductSelection: () => true,
    filterExplicitCollectionCandidates: async ({ items }) => ({ items: member ? items : [] }),
    verifyExplicitCollectionMembership: async () => { sourceChecks++; return { applicable: true, verified: member }; },
    chooseUnusedWebsiteItem: async ({ items }) => ({ item: items[0], cycleNumber: 1 }),
    areSameWebsiteItem: (a, b) => a.url === b.url,
    discoverProductsFromFocusedCategory: async () => {
      discoveryCalls++;
      if (rateLimited) return Object.assign([], { rateLimited: true, retryAfterMs: 900_000 });
      throw reachedDiscovery;
    },
    resolveLockedProductUrlForUse: async () => { throw new Error('Unverified cache must not bypass locking'); },
  });
  vm.runInContext(source.slice(source.indexOf('class WebsiteRateLimitError extends Error'), source.indexOf('function isWebsiteRateLimitError(')), ctx);
  for (const name of ['getProductStockVerificationTimestamp', 'isFreshProductStockVerification', 'prepareWebsiteContentForRule']) {
    vm.runInContext(definition(name), ctx);
  }
  let result, error;
  try {
    result = await ctx.prepareWebsiteContentForRule({ supabase: {}, openai: {},
      rule: { uses_website_content: true, id: 'r', user_id: 'u', brand_profile_id: 'b' },
      brandProfile: {}, summary: { website_content_rules: 0, website_items_found: 0, website_content_success: 0 } });
  } catch (caught) { error = caught; }
  return { result, error, reachedDiscovery, discoveryCalls, sourceChecks };
}
const saved = await savedPoolCase();
assert.equal(saved.result?.websiteItem.url, cachedProduct.url, saved.error?.stack);
assert.equal(saved.discoveryCalls, 0, 'fresh saved item avoids a new crawl');
assert.equal(saved.sourceChecks, 1, 'the final hard collection boundary remains enforced');
for (const options of [
  { item: { ...cachedProduct, stock_verified_at: '2020-01-01' } },
  { item: { ...cachedProduct, availability: 'unknown' } },
  { item: { ...cachedProduct, product_image_semantic_verified: false } },
  { item: { ...cachedProduct, url: 'https://other.test/products/cached' } },
  { member: false }, { recent: [{ url: cachedProduct.url }] },
]) {
  const skipped = await savedPoolCase(options);
  assert.equal(skipped.result, undefined);
  assert.equal(skipped.error, skipped.reachedDiscovery);
}
console.log('PASS: real preparation uses fresh unused locked cache first; stale, unknown-stock, unverified, cross-store and wrong-collection items cannot bypass discovery');
const deferredCategory = await savedPoolCase({ item: { ...cachedProduct, stock_verified_at: '2020-01-01' }, rateLimited: true });
assert.equal(deferredCategory.error?.code, 'WEBSITE_RATE_LIMITED');
assert.equal(deferredCategory.error?.origin, 'domain_cooldown', 'the focused wrapper must preserve domain state classification for real-429 policy');

const waiting = { generation_occurrence_status: 'retry_pending', generation_failure_code: 'website_rate_limited',
  is_active: true, retry_not_before: '2026-10-16T10:12:00Z', next_run_at: '2026-10-17T10:00:00Z', timezone: 'Europe/Stockholm' };
assert.equal(getWebsiteCooldownState(waiting).retryAt, waiting.retry_not_before);
assert.equal(getWebsiteCooldownState({ ...waiting, generation_occurrence_status: 'failed_terminal' }), null);
assert.equal(getWebsiteCooldownState({ ...waiting, plan_state: 'paused' }), null);
assert.equal(getWebsiteCooldownState({ plan_state: 'paused', rules: [waiting] }), null);
assert.equal(getWebsiteCooldownState({ ...waiting, generation_failure_code: 'provider_error' }), null);
assert.equal(getWebsiteCooldownState({ ...waiting, retry_not_before: 'bad' }).retryAt, null);
assert.equal(getWebsiteCooldownState({ rules: [
  { ...waiting, retry_not_before: '2026-10-16T11:00:00Z' }, waiting,
] }).retryAt, waiting.retry_not_before);
console.log('PASS: cooldown status uses persisted retry time, grouped plans and paused/terminal/provider boundaries');

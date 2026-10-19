import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { collectionListingCandidates, productBreadcrumbIncludesCollection } from '../lib/collectionListingEvidence.js';
import { filterExplicitCollectionCandidates, verifyExplicitCollectionMembership } from '../lib/verifiedCollectionMembership.js';

const fixture = name => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const recorded = JSON.parse(fixture('v144381-horze-candidates.json'));
const shell = fixture('v144381-horze-collection-shell.html');
const productHtml = fixture('v144381-aurora-product-evidence.html');
const source = recorded.sourceUrl;
const aurora = 'https://horze.se/products/aurora-riding-helmet-black-55-57';
assert.equal(recorded.candidates.length, 100);
assert(recorded.candidates.some(item => item.url === aurora));
assert.equal(recorded.capturedFeed.products.length, 0);
assert(productBreadcrumbIncludesCollection(productHtml, aurora, source), 'captured exact-page breadcrumb proves the category');
assert(!productBreadcrumbIncludesCollection(productHtml, aurora, 'https://horze.se/collections/hast'));
assert(!productBreadcrumbIncludesCollection(productHtml, 'https://horze.se/products/different-product', source));
assert(!productBreadcrumbIncludesCollection(`<link rel="canonical" href="${aurora}"><nav><a href="${source}">Ryttare</a></nav>`, aurora, source));

const reads = [];
const fetcher = async url => {
  reads.push(url);
  if (url.includes('/products.json?')) return { ok: true, json: async () => recorded.capturedFeed };
  if (url === source) return { ok: true, url, text: async () => shell };
  if (url === aurora) return { ok: true, url, text: async () => productHtml };
  throw new Error(`Unexpected fetch: ${url}`);
};
const result = await filterExplicitCollectionCandidates({ sourceUrl: source, items: recorded.candidates, fetcher });
assert.equal(result.rejected.length, 0, 'empty JSON must not reject all 100 recorded candidates');
assert.equal(result.pending.length, 100, 'unknown membership is deferred, never called verified');
assert.equal(reads.length, 2, 'bulk prefilter does not fetch 100 product pages or repeat empty feeds');
const proof = await verifyExplicitCollectionMembership({ sourceUrl: source, productUrl: aurora, fetcher });
assert.equal(proof.verified, true);
assert.equal(proof.provenance, 'exact_product_breadcrumb');
assert.equal(proof.evidenceComplete, false, 'the whole category is still not declared completely indexed');
assert.equal(reads.length, 3);
assert.equal((await verifyExplicitCollectionMembership({ sourceUrl: source, productUrl: aurora, fetcher })).verified, true);
assert.equal(reads.length, 3, 'selected-product proof is cached for the final boundary');
assert.equal((await verifyExplicitCollectionMembership({ sourceUrl: source, productUrl: 'https://other.test/products/aurora', fetcher })).verified, false);
assert.equal((await filterExplicitCollectionCandidates({ sourceUrl: source, items: [{url:'https://other.test/products/aurora'}, {url:'https://horze.se/policies/legal-notice'}], fetcher })).items.length, 0);

// No extra HTTP request when the ordinary product verifier already read HTML.
const inlineUrl = 'https://inline.test/products/helmet';
const inlineSource = 'https://inline.test/collections/rider';
const inlineHtml = productHtml.replaceAll('https://horze.se', 'https://inline.test')
  .replaceAll('/products/aurora-riding-helmet-black-55-57', '/products/helmet')
  .replaceAll('/collections/ryttare', '/collections/rider');
let inlineReads = 0;
const inlineFetcher = async url => {
  inlineReads++;
  assert(!url.includes('/products/helmet'), 'the already fetched product must not be fetched again');
  return url.includes('products.json') ? {ok:true,json:async()=>({products:[]})} : {ok:true,text:async()=>'<main></main>'};
};
assert.equal((await verifyExplicitCollectionMembership({sourceUrl:inlineSource,productUrl:inlineUrl,productHtml:inlineHtml,fetcher:inlineFetcher})).verified,true);
assert.equal(inlineReads,2);

// An actual complete nonempty category remains a hard boundary (Pressit).
const pressit = 'https://pressit.test/collections/t-shirts';
let pressitReads = 0;
const pressitFetcher = async () => { pressitReads++; return {ok:true,json:async()=>({products:[{handle:'shirt'}]})}; };
const strict = await filterExplicitCollectionCandidates({sourceUrl:pressit,items:[{url:'https://pressit.test/products/shirt'},{url:'https://pressit.test/products/poster'}],fetcher:pressitFetcher});
assert.deepEqual(strict.items.map(item=>item.url),['https://pressit.test/products/shirt']);
assert.equal(strict.pending.length,0);
assert.equal(pressitReads,1);
assert.equal((await verifyExplicitCollectionMembership({sourceUrl:pressit,productUrl:'https://pressit.test/products/poster',productHtml:inlineHtml,fetcher:pressitFetcher})).verified,false);
assert.equal(pressitReads,1,'a complete feed is not overridden by another page');

// Only a genuine listing or category-scoped product path counts as HTML proof.
const html = `<header><a href="/products/nav">Menu</a></header><main>
<nav><a href="/products/nav-in-main">Menu</a></nav>
<div class="product-grid"><article><a href="/products/real" title="Real">Real</a></article></div>
<section class="recommendations"><div class="product-grid"><a href="/products/recommended">Other</a></div></section>
<script>"<div class='product-grid'><a href='/products/script'>fake</a></div>"</script>
<template><div class="product-grid"><a href="/products/template">Template</a></div></template>
<a href="/collections/rider/products/scoped">Scoped</a><a href="https://other.test/products/foreign">Foreign</a></main>`;
assert.deepEqual(collectionListingCandidates(html,'https://shop.test/collections/rider').map(item=>new URL(item.url).pathname),['/products/real','/products/scoped']);

const rate = Object.assign(new Error('Website returned 429'), {code:'WEBSITE_RATE_LIMITED',status:429});
let rateReads=0;
await assert.rejects(filterExplicitCollectionCandidates({sourceUrl:'https://limited.test/collections/rider',items:[{url:'https://limited.test/products/helmet'}],fetcher:async()=>{rateReads++;throw rate;}}),error=>error===rate);
assert.equal(rateReads,1,'real 429 must propagate without HTML fallback or retries');

// Execute the real worker helpers, not copied implementations.
const route = fs.readFileSync(new URL('../app/api/cron/run-automations/route.js',import.meta.url),'utf8');
function definition(name) {
  const start = route.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));
  assert(start>=0,name);
  const rest=route.slice(start);
  const next=/\n(?:export )?(?:async )?function /g.exec(rest);
  return next?rest.slice(0,next.index):rest;
}
const context=vm.createContext({URL,normalizeWebsiteUrl:value=>String(value||'').trim()});
for(const name of ['getRuleContentSourceUrl','getWebsiteProductSourceUrl','isBadProductUrl'])vm.runInContext(definition(name),context);
const brand={website_url:'https://horze.se/',website_product_source_url:source};
assert.equal(context.getWebsiteProductSourceUrl(brand,{content_source_scope:'whole_website'}),'https://horze.se/');
assert.equal(context.getWebsiteProductSourceUrl(brand,{content_source_scope:'product_category',content_source_url:source}),source);
assert.equal(context.getWebsiteProductSourceUrl(brand,{content_source_scope:'exact_product',content_source_url:aurora}),aurora);
assert.equal(context.getWebsiteProductSourceUrl(brand,null),source,'legacy calls without a rule retain existing behavior');
for(const url of ['https://horze.se/policies/legal-notice','https://horze.se/%3E%3C/svg%3E','https://horze.se/cdn/shop/t/648/assets/'])assert(context.isBadProductUrl(url),url);
assert(!context.isBadProductUrl(aurora));
context.isManufacturerCatalogSource=()=>false;
for(const name of ['normalizeProductAvailabilityStatus','getProductPromotionAvailability','isProductKnownUnavailableForPromotion','isProductConfirmedPurchasable','isProductEligibleForWebsiteSource'])vm.runInContext(definition(name),context);
for(const availability of ['out_of_stock','unknown','preorder','backorder','discontinued']) {
  assert.equal(context.isProductEligibleForWebsiteSource({url:aurora,title:'AURORA',image_url:'helmet.png',availability},{}),false,availability);
}
assert.equal(context.isProductEligibleForWebsiteSource({availability:'in_stock'},{}),true);
assert.match(definition('extractProductDataFromProductPage'),/productHtml: html/,'reuse the exact product page for membership');
assert.match(definition('verifyDiscoveredWebsiteProductCandidates'),/pendingMembershipUrls\.has\(candidateCacheKey\)/,'feed-backed unknown candidates cannot bypass membership after ranking copies');
assert.match(definition('findWebsiteProductWithWebSearch'),/!isBadProductUrl\(item\?\.url\)/,'policy/SVG/asset candidates never count toward research target');

const quiet={info(){},log(){},warn(){},error(){}};
const queueWrites=[];
const worker=vm.createContext({URL,Date,Map,Set,process,console:quiet,
  WEBSITE_PRODUCT_DISCOVERY_VERIFY_LIMIT:8,WEBSITE_VERIFICATION_SOFT_DEADLINE_MS:225000,
  PRODUCT_ENGINE_V2_POOL_TARGETS:{minimumCandidatePool:12},
  filterExplicitCollectionCandidates:options=>filterExplicitCollectionCandidates({...options,fetcher}),
  verifyExplicitCollectionMembership:options=>verifyExplicitCollectionMembership({...options,fetcher}),
  normalizeComparableValue:value=>String(value||'').toLowerCase(),canonicalizeWebsiteProductUrl:value=>value,
  // Ranking is allowed to copy candidate objects. Identity-based membership
  // tests would silently let a wrong-category authoritative feed through.
  rankFocusedCategoryCandidatesForVerification:items=>items.map(item=>({...item})),
  getProductMarketCodeForRule:()=> 'se',matchesConfiguredWebsiteMarket:()=>true,
  isBadProductUrl:context.isBadProductUrl,isAuthoritativePublicCommerceFeedLockedProduct:()=>true,
  isWebsiteRateLimitError:error=>error?.code==='WEBSITE_RATE_LIMITED',
  isLikelyBadDiscoveryPageUrl:()=>false,
  updateWebsiteProductCandidateQueueStatus:async value=>queueWrites.push(value),
});
vm.runInContext(definition('verifyDiscoveredWebsiteProductCandidates'),worker);
const verified=await worker.verifyDiscoveredWebsiteProductCandidates({websiteUrl:source,limit:1,
  candidates:[{url:'https://horze.se/products/wrong-category',title:'Wrong'},
    {url:aurora,title:'AURORA ridhjälm Black 55–57',image_url:'https://horze.se/helmet.png'}]});
assert.equal(verified.length,1);
assert.equal(verified[0].url,aurora,'actual worker skips a candidate without category proof and advances to a matching one');
assert(queueWrites.some(value=>value.status==='rejected' && value.productUrls.includes('https://horze.se/products/wrong-category')));
assert(queueWrites.some(value=>value.status==='verified' && value.productUrls.includes(aurora)));

const entered=Object.assign(new Error('Reached existing identity/stock extraction'),{marker:true});
let pageReads=0;
worker.fetchHtml=async()=>{pageReads++;return productHtml;};
worker.getVerifiedProductTitleCandidate=()=>{throw entered;};
vm.runInContext(definition('extractProductDataFromProductPage'),worker);
await assert.rejects(worker.extractProductDataFromProductPage({websiteUrl:source,productUrl:aurora}),error=>error===entered);
await assert.rejects(worker.extractProductDataFromProductPage({websiteUrl:source,productUrl:'https://horze.se/products/wrong-category'}),error=>error.code==='COLLECTION_MEMBERSHIP_UNVERIFIED');
assert.equal(pageReads,2,'exact-page proof reuses each existing page read');
console.log('PASS 144.381: 100 recorded Horze candidates deferred, captured Aurora breadcrumb accepted, exact-page HTML reused, complete Pressit boundary retained, menus/recommendations excluded, real 429 propagated, whole-site source respected and bogus research URLs removed.');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { embeddedProductUrlLeads, isDirectProductPagePath, oldestUsedProductLeads } from '../lib/productDiscoveryRecovery144392.js';

const store = 'https://kottfabriken.se/';
const listing = `${store}c/notkott/entrecote`;
const prod1 = `${store}p/notkott/entrecote/entrecote-hangmorad-sverige`;
const prod2 = `${store}p/notkott/entrecote/wagyu-entrecote`;
const html = `
  <a href="/c/notkott/entrecote">Entrecote category</a>
  <a href="/p/notkott/entrecote/entrecote-hangmorad-sverige">Entrecote</a>
  <script type="application/json">{"productUrl":"\\/p\\/notkott\\/entrecote\\/wagyu-entrecote"}</script>
  <script type="application/json">{"productUrl":"\\u002Fp\\u002Fnotkott\\u002Fentrecote\\u002Fwagyu-entrecote"}</script>
  <a href="https://other-store.se/p/private-item">External</a>
  <a href="/b/other">Brand page</a>
`;
const leads = embeddedProductUrlLeads(html, listing, store);
assert.deepEqual(leads, [prod1, prod2], 'embedded product links should survive JSON escaping; category/brand/external links must not enter');
assert.equal(isDirectProductPagePath(prod1), true);
assert.equal(isDirectProductPagePath(listing), false);
assert.equal(isDirectProductPagePath(`${store}b/brand`), false);
assert.equal(isDirectProductPagePath(`${store}products/model-1`), true);
assert.deepEqual(embeddedProductUrlLeads('<a href="/c/notkott/entrecote">category</a>', listing, store), []);
assert.deepEqual(embeddedProductUrlLeads(html, listing, store, 1), [prod1], 'existing small candidate budget respected');

const leadsOld = oldestUsedProductLeads({
  websiteUrl: store,
  savedCatalog: [
    {url: prod2, title:'wagyu', times_used:2, last_used_at:'2026-10-20T12:00:00Z',image_url:'https://kottfabriken.se/media/a.jpg'},
    {url: prod1, title:'entrecote', times_used:0, image_url:'https://kottfabriken.se/media/b.jpg'},
    {url: `${store}p/new-not-used`, title:'new', times_used:0},
    {url: `${store}c/notkott/entrecote`, title:'category', times_used:4},
    {url: `https://other-store.se/p/item`, title:'other store', times_used:4},
  ],
  history: [
    { item_url:prod1, item_title:'entrecote', created_at:'2026-09-01T11:00:00Z' },
    { item_url:`${store}p/smaksattare/apple-salsa`, item_title:'salsa', created_at:'2026-08-01T11:00:00Z' },
  ],
});
assert.deepEqual(leadsOld.map(v=>v.url), [ `${store}p/smaksattare/apple-salsa`, prod1, prod2 ], 'oldest used product first, never discovery-only items');
assert.equal(leadsOld[0].image_url, '', 'missing old image does not prevent safe live-page verification');
assert.equal(oldestUsedProductLeads({websiteUrl:store,savedCatalog:[{url:prod1,title:'unused'}],history:[]}).length,0, 'mere discovery is not an actual use');

const route = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../app/api/cron/run-automations/route.js'),'utf8');
const reuse = route.indexOf('Bounded old-product reuse before paid web search completed');
const paid = route.indexOf('Starting bounded product web-research fallback');
assert(reuse >= 0 && paid > reuse, 'bounded used-product recovery must run before paid web research');
assert(route.includes('embeddedProductUrlLeads(html, pageUrl, websiteUrl, 60)'), 'extract from existing fetched page');
assert(route.includes('allowReuseWhenExhausted: true'), 'explicit controlled reuse selection');
assert(route.includes('allowAiRepair: false'), 'do not pay for AI recovery of reused records');
assert(route.includes('isProductEligibleForWebsiteSource(prepared.websiteItem, rule, brandProfile)'), 'live product and availability checked again');
assert(route.includes('verifyExplicitCollectionMembership'), 'explicitly selected product category protection remains');
assert(route.includes('!websiteAccessProtected && productResearchFallbackReason !== "rate_limited"'), 'no direct old-product retry under protected / rate-limited domain');
assert(route.includes('examined >= 3 || Date.now() >= retryUntil'), 'do not expand retry budget unbounded');
console.log('144.392 product discovery & controlled reuse: 16+ checks passed');

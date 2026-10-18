import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  verifyExplicitCollectionMembership,
  filterExplicitCollectionCandidates,
  getExplicitCollectionProductCandidates,
} from '../lib/verifiedCollectionMembership.js';

const source = 'https://pressit.se/collections/t-shirts-355';
const poster = { url: 'https://pressit.se/products/petposter-bolma-pyra-fimpa-60x60cm', title: 'Petposter' };
const shirt = { url: 'https://pressit.se/products/tryckt-tshirt-dam', title: 'T-shirt dam' };
const other = { url: 'https://pressit.se/products/tshirt-herr', title: 'T-shirt herr' };
let fetchCalls = 0;
const fetcher = async (url) => {
  fetchCalls += 1;
  assert.match(url, /\/collections\/t-shirts-355\/products\.json\?limit=250$/);
  return { ok: true, json: async () => ({ products: [
    { handle: 'tryckt-tshirt-dam', title: 'T-shirt dam', images: [{src:'https://pressit.se/assets/dam.png'}] },
    { handle: 'tshirt-herr', title: 'T-shirt herr', image: {src:'https://pressit.se/assets/herr.png'} },
  ] }) };
};
const selected = await filterExplicitCollectionCandidates({
  sourceUrl: source, items: [poster, shirt, other], fetcher,
});
assert.deepEqual(selected.items.map(v => v.url), [shirt.url,other.url]);
assert.equal(selected.rejected.length, 1);
assert.equal(fetchCalls, 1, 'the collection feed should be cached across product checks');
assert.equal((await verifyExplicitCollectionMembership({sourceUrl:source,productUrl:poster.url,fetcher})).verified, false);
assert.equal((await verifyExplicitCollectionMembership({sourceUrl:source,productUrl:shirt.url,fetcher})).verified, true);
const direct = await getExplicitCollectionProductCandidates({sourceUrl:source,fetcher});
assert.equal(direct.length, 2);
assert.ok(direct.every(v => v.collection_feed_verified && v.title && v.image_url));
assert.equal(fetchCalls, 1, 'direct candidates should reuse the verified feed');

const noScope = await filterExplicitCollectionCandidates({
  sourceUrl:'https://pressit.se/',items:[poster],fetcher,
});
assert.equal(noScope.items.length,1);
assert.equal(noScope.applicable,false);

const paginationSource = 'https://pressit.se/collections/page-test-355';
let pages = [];
const pageFetcher = async url => {
  pages.push(url);
  return { ok: true, json: async () => ({ products: url.includes('page=2')
    ? [{ handle:'late-t-shirt',title:'Late T-shirt', images: [{src:'https://pressit.se/l.png'}]}]
    : Array.from({length:250},(_,i)=>({handle:`other-${i}`,title:`Other ${i}`}))
  })};
};
assert.equal((await verifyExplicitCollectionMembership({
  sourceUrl:paginationSource,
  productUrl:'https://pressit.se/products/late-t-shirt',fetcher:pageFetcher,
})).verified,true,'legitimate products on page 2 must not be rejected');
assert.equal(pages.length,2);

const refreshSource = 'https://pressit.se/collections/refresh-test-355';
let count = 0;
const refreshFetcher = async () => {
  count += 1;
  return {ok:true,json:async()=>({products:count===1 ? [{handle:'old-poster'}] : [{handle:'new-tshirt'}]})};
};
const refreshed = await filterExplicitCollectionCandidates({
  sourceUrl:refreshSource,items:[{url:'https://pressit.se/products/new-tshirt'}],fetcher:refreshFetcher,
});
assert.equal(refreshed.items.length,1,'empty cached pool should trigger one fresh collection request');
assert.equal(count,2);

const rejectedDomain = await filterExplicitCollectionCandidates({
  sourceUrl:source,items:[{url:'https://other-store.com/products/tryckt-tshirt-dam'}],fetcher,
});
assert.equal(rejectedDomain.items.length,0);

const route = fs.readFileSync(new URL('../app/api/cron/run-automations/route.js', import.meta.url),'utf8');
const filtered = route.indexOf('const collectionCatalogFilter = await filterExplicitCollectionCandidates');
const selectedAt = route.indexOf('let catalogSelection = await chooseUnusedWebsiteItem',filtered);
assert.ok(filtered>0 && selectedAt>filtered,'filter must run before catalog selection');
assert.match(route.slice(selectedAt,selectedAt+5000),/const maxCatalogAttempts = Math\.min\(productIntentScoped \? 6 : 12/,'a rejected catalog item must advance to the next item');
assert.match(route,/const filteredDiscoveredPool = await filterExplicitCollectionCandidates/);
assert.match(route,/const filteredReusePool = await filterExplicitCollectionCandidates/);
console.log('PASS v144.355: collection prefilter, direct Shopify candidates, pagination, stale cache refresh, cross-store rejection and multi-candidate fallback');

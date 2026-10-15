import { explicitCollectionScope } from './storeMapCollectionScope.js';

// A collection URL denotes a product boundary, not just a seed for search.
// Product titles, AI fit scores and store-map shelves are not evidence of
// membership. Fail closed when the store won't give verifiable membership.
const cache=new Map();
const TIMEOUT=9000;
function productHandle(productUrl) {
  try {const u=new URL(productUrl);const match=u.pathname.match(/(?:^|\/)products\/([^/?#]+)/i);return match?decodeURIComponent(match[1]).toLowerCase():null;}
  catch{return null;}
}
export function collectionIncludesHandle(handles,productUrl){
  const target=productHandle(productUrl);
  return Boolean(target && Array.isArray(handles) && handles.map(v=>String(v).toLowerCase()).includes(target));
}
async function readUrl(url,fetcher) {
  const controller=new AbortController();const abort=setTimeout(()=>controller.abort(),TIMEOUT);
  try {return await fetcher(url,{signal:controller.signal,headers:{Accept:'application/json,text/html;q=0.8'},redirect:'follow'});}
  finally{clearTimeout(abort);}
}
export async function verifyExplicitCollectionMembership({sourceUrl,productUrl,fetcher=fetch}){
  const collection=explicitCollectionScope(sourceUrl);
  if(!collection)return {applicable:false,verified:true,reason:'No explicit collection restriction'};
  let product;
  try{product=new URL(productUrl);}catch{return {applicable:true,verified:false,reason:'Invalid product URL'};}
  const scope=new URL(collection);
  if(product.origin.toLowerCase()!==scope.origin.toLowerCase())return {applicable:true,verified:false,reason:'Product is outside configured storefront'};
  const handle=productHandle(productUrl);
  if(!handle)return {applicable:true,verified:false,reason:'Not a product detail URL'};
  const cacheKey=collection;
  const recent=cache.get(cacheKey);
  if(recent && recent.expires>Date.now())return {applicable:true,verified:recent.handles.has(handle),reason:'Verified against cached collection index'};
  const discovered=new Set();
  let retrieved=false;
  try{
    // Shopify's collection-specific API is authoritative for membership.
    const r=await readUrl(`${collection}/products.json?limit=250`,fetcher);
    if(r.ok){const payload=await r.json();if(Array.isArray(payload?.products)){retrieved=true;for(const p of payload.products)if(p?.handle)discovered.add(String(p.handle).toLowerCase());}}
  }catch{}
  if(!retrieved){
    try{
      const r=await readUrl(collection,fetcher);
      if(r.ok){const body=await r.text();retrieved=true;
        for(const match of body.matchAll(/(?:\/collections\/[^/\s"'<>]+)?\/products\/([a-z0-9%_-]+)/gi)) discovered.add(decodeURIComponent(match[1]).toLowerCase());
        // HTML pagination / lazy-loading is not a complete collection index.
        // Positive membership is valid, but absence is uncertain.
        if(discovered.has(handle))return {applicable:true,verified:true,reason:'Product linked directly in configured collection'};
        return {applicable:true,verified:false,reason:'Product membership not verified from collection listing'};
      }
    }catch{}
  }
  if(!retrieved)return {applicable:true,verified:false,reason:'Collection index unavailable for positive verification'};
  cache.set(cacheKey,{handles:discovered,expires:Date.now()+5*60*1000});
  return {applicable:true,verified:discovered.has(handle),reason:discovered.has(handle)?'Product present in collection feed':'Product absent from configured collection feed'};
}

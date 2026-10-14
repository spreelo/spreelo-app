// Authentication and user preferences are persistent state. Only these explicitly
// rebuildable caches may be evicted; never clear origin storage or match a broad
// "spreelo_" prefix (which also contains user choices and unsaved handoffs).
export const BROWSER_CACHE_MAX_CHARS = 512 * 1024;
export const BROWSER_CACHE_MAX_ENTRY_CHARS = 384 * 1024;
export const BROWSER_CACHE_MAX_ENTRIES = 24;
const AUTH_RESERVE_CHARS = 64 * 1024;
const PROBE_KEY = 'spreelo_storage_capacity_probe_v344';
const cachePatterns = [/^spreelo_ui_labels_v\d+_/, /^spreelo_ui_preloaded_v\d+_/, /^spreelo_plan_recommendation_v\d+_/];
export const isRebuildableBrowserCache = key => cachePatterns.some(pattern => pattern.test(String(key)));
const isQuota = error => error?.name === 'QuotaExceededError' || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED';

function entries(storage) {
  const list=[];
  for(let i=0;i<storage.length;i++) {
    const key=storage.key(i);
    if(key!=null && isRebuildableBrowserCache(key)) list.push({key,chars:key.length+(storage.getItem(key)?.length||0)});
  }
  return list;
}
function evict(storage, exclude='') {
  // Largest first makes a quota recovery bounded even after many old versions.
  const candidate=entries(storage).filter(item=>item.key!==exclude).sort((a,b)=>b.chars-a.chars)[0];
  if(!candidate)return false;
  storage.removeItem(candidate.key);return true;
}
export function pruneBrowserCaches(storage, {keepKey=''}={}) {
  let list=entries(storage);
  for(const item of list) if(item.chars>BROWSER_CACHE_MAX_ENTRY_CHARS)storage.removeItem(item.key);
  list=entries(storage);
  while(list.length>BROWSER_CACHE_MAX_ENTRIES || list.reduce((n,item)=>n+item.chars,0)>BROWSER_CACHE_MAX_CHARS) {
    if(!evict(storage,keepKey) && !evict(storage))break;
    list=entries(storage);
  }
}
export function prepareBrowserStorage(storage) {
  pruneBrowserCaches(storage);
  // Leave capacity for sign-in and token refresh even before the auth SDK's
  // initial write test. Never permanently reserve it or log stored contents.
  const reserve='0'.repeat(AUTH_RESERVE_CHARS);
  while(true) {
    try {storage.setItem(PROBE_KEY,reserve);storage.removeItem(PROBE_KEY);return true;}
    catch(error) {
      try {storage.removeItem(PROBE_KEY);} catch {}
      if(!isQuota(error)||!evict(storage))throw error;
    }
  }
}
export function writeBrowserCache(storage,key,value) {
  if(!isRebuildableBrowserCache(key))throw new Error('Only rebuildable browser caches can use this writer');
  const text=String(value);
  try {
    if(key.length+text.length>BROWSER_CACHE_MAX_ENTRY_CHARS) {storage.removeItem(key);return false;}
    // Removing an older value also moves this entry to the end of storage order.
    storage.removeItem(key);
    pruneBrowserCaches(storage);
    let list=entries(storage);
    while(list.length>=BROWSER_CACHE_MAX_ENTRIES || list.reduce((n,item)=>n+item.chars,0)+key.length+text.length>BROWSER_CACHE_MAX_CHARS) {
      if(!evict(storage))return false;
      list=entries(storage);
    }
    storage.setItem(key,text);
    prepareBrowserStorage(storage);
    return storage.getItem(key)===text;
  } catch {
    // Cache is optional. Its callers retain their existing in-memory/server data.
    return false;
  }
}
export function writeOptionalBrowserCache(key,value) {
  if(typeof window==='undefined')return false;
  try{return writeBrowserCache(window.localStorage,key,value);}catch{return false;}
}
export function createPersistentAuthStorage(getStorage) {
  return {
    getItem:key=>getStorage().getItem(key),
    setItem(key,value) {
      const storage=getStorage();
      while(true) {
        try {storage.setItem(key,value);return;}
        catch(error) {
          if(isQuota(error)&&evict(storage))continue;
          // Do not silently report a successful persistent login held in memory.
          // Preserve the exception type; callers can distinguish storage failures.
          throw error;
        }
      }
    },
    removeItem:key=>getStorage().removeItem(key),
  };
}

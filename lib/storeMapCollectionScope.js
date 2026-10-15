// A user-selected /collections/:handle source is a hard product boundary.
// Campaign variety cannot override it by silently promoting another shelf.
export function explicitCollectionScope(url) {
  try {
    const value=new URL(url);
    const path=value.pathname.replace(/\/+$/,'').toLowerCase();
    return /^\/collections\/[^/]+$/.test(path)?`${value.origin.toLowerCase()}${path}`:null;
  } catch { return null; }
}
export function restrictToExplicitCollection(shelves,sourceUrl) {
  const scope=explicitCollectionScope(sourceUrl);
  if(!scope)return shelves;
  return (shelves||[]).filter(shelf=>{
    try { const url=new URL(shelf?.url||'');return `${url.origin.toLowerCase()}${url.pathname.replace(/\/+$/,'').toLowerCase()}`===scope; }
    catch {return false;}
  });
}

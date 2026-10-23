/**
 * v144.392. Zero-AI, zero-network evidence extraction from HTML already fetched
 * by Product Engine. URLs are leads, never proof of stock, main image, or identity.
 */
const PRODUCT_PATH = /\/(?:p|pd|products?|produkt(?:er)?|product-detail|item)\/[^/?#\s"'<>]+/i;
const LISTING_PATH = /^\/(?:c|b|collections?|categories?|kategori(?:er)?|kategorier|search|sok|sök)(?:\/|$)/i;

export function isDirectProductPagePath(value) {
  try {
    const path = new URL(value, 'https://example.invalid').pathname;
    return PRODUCT_PATH.test(path) && !LISTING_PATH.test(path);
  } catch { return false; }
}

// The e-commerce frontend may serialize links as escaped JSON (\\/p\\/...
// or \\u002Fp\\u002F...). Decode only URL separators; never evaluate scripts.
export function embeddedProductUrlLeads(html, pageUrl, websiteUrl, maxResults = 60) {
  const result = [];
  const seen = new Set();
  let origin;
  try { origin = new URL(websiteUrl).hostname.replace(/^www\./i, '').toLowerCase(); }
  catch { return result; }
  const text = String(html || '')
    .replace(/\\u002f/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&amp;/gi, '&');
  const pattern = /https?:\/\/[^\s"'<>\\]+|\/(?:p|pd|products?|produkt(?:er)?|product-detail|item)\/[^\s"'<>\\]+/gi;
  for (const match of text.matchAll(pattern)) {
    const raw = match[0].replace(/[),;\]}]+$/, '');
    try {
      const url = new URL(raw, pageUrl);
      const host = url.hostname.replace(/^www\./i, '').toLowerCase();
      if (host !== origin || !/^https?:$/.test(url.protocol) || !isDirectProductPagePath(url.href)) continue;
      url.hash = ''; url.search = '';
      const key = url.href.toLowerCase().replace(/\/$/, '');
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(url.href);
      if (result.length >= Math.max(1, Math.min(100, Number(maxResults) || 60))) break;
    } catch { /* malformed URLs aren't candidates */ }
  }
  return result;
}

/** Oldest first, without mistaking mere discovery for use. Caller must still
 * re-fetch and verify each item using the existing product lock safety gate. */
export function oldestUsedProductLeads({ savedCatalog = [], history = [], websiteUrl, maxResults = 12 }) {
  const latest = new Map();
  const used = new Set();
  const normalize = url => {
    try {
      const u = new URL(url);
      u.hash = ''; u.search = '';
      return u.href.replace(/\/$/, '').toLowerCase();
    } catch { return ''; }
  };
  const hostname = (() => { try { return new URL(websiteUrl).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } })();
  const allowed = url => {
    try {
      const u = new URL(url);
      return u.hostname.replace(/^www\./, '').toLowerCase() === hostname &&
        /^https?:$/.test(u.protocol) && isDirectProductPagePath(u.href);
    } catch { return false; }
  };
  for (const item of savedCatalog) {
    const url = item?.url || item?.product_url || '';
    if (!allowed(url)) continue;
    const key = normalize(url);
    latest.set(key, { ...item, url, title: item?.title || item?.item_title || '', image_url: item?.image_url || item?.item_image_url || '' });
    if (Number(item?.times_used || 0) > 0 || item?.last_used_at || /(?:^|_)used$/i.test(String(item?.discovery_source || item?.catalog_source || ''))) used.add(key);
  }
  for (const item of history) {
    const url = item?.item_url || item?.product_url || item?.url || '';
    if (!allowed(url)) continue;
    const key = normalize(url);
    used.add(key);
    const old = latest.get(key) || {};
    latest.set(key, {
      ...old,
      url: old.url || url,
      title: old.title || item?.item_title || item?.title || '',
      image_url: old.image_url || item?.item_image_url || item?.image_url || '',
      last_used_at: old.last_used_at || item?.created_at || null,
    });
  }
  return [...latest.entries()]
    .filter(([key]) => used.has(key))
    .map(([, item]) => item)
    .sort((a, b) => {
      const at = Date.parse(a?.last_used_at || '') || 0;
      const bt = Date.parse(b?.last_used_at || '') || 0;
      return at - bt || (Number(a?.times_used || 0) - Number(b?.times_used || 0));
    })
    .slice(0, Math.max(0, Math.min(30, Number(maxResults) || 12)));
}

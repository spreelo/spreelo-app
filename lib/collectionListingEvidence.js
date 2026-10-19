// Only links inside the selected page's product listing prove membership.
// Global menus, promotional banners and recommendation widgets do not.
function decodeAttribute(value) {
  return String(value || '').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

export function collectionListingCandidates(html, collection) {
  const output = new Map();
  const stack = [];
  const source = String(html || '').replace(/<!--[^]*?-->/g, '')
    .replace(/<(script|style|template)\b[^>]*>[^]*?<\/\1\s*>/gi, '');
  for (const token of source.matchAll(/<\/?([a-z][a-z0-9-]*)\b([^>]*?)>/gi)) {
    const tag = token[1].toLowerCase();
    if (token[0].startsWith('</')) {
      const index = stack.findLastIndex(node => node.tag === tag);
      if (index >= 0) stack.length = index;
      continue;
    }
    const attrs = {};
    for (const m of token[2].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      attrs[m[1].toLowerCase()] = decodeAttribute(m[2] ?? m[3] ?? m[4]);
    }
    const parent = stack.at(-1) || {};
    const label = `${tag} ${attrs.id || ''} ${attrs.class || ''} ${attrs['data-app'] || ''}`;
    const node = {
      tag,
      main: parent.main || tag === 'main' || attrs.role === 'main',
      excluded: parent.excluded || /^(header|footer|nav|aside)$/.test(tag) ||
        /recommend|recently[-_ ]?viewed|upsell|cross[-_ ]?sell|related[-_ ]?products|banner/i.test(label),
      listing: parent.listing || /product[-_ ]?(?:grid|listing|collection)|collection[-_ ]?(?:grid|products)|algolia[-_ ]listing|^product-collection\b/i.test(label) ||
        Object.hasOwn(attrs, 'data-product-grid'),
    };
    if (tag === 'a' && node.main && !node.excluded && attrs.href) {
      try {
        const url = new URL(attrs.href, collection);
        const base = new URL(collection);
        const match = url.pathname.match(/^\/products\/([^/]+)\/?$/i) ||
          (url.pathname.startsWith(`${base.pathname}/products/`) && url.pathname.match(/\/products\/([^/]+)\/?$/i));
        if (url.origin === base.origin && match && (node.listing || url.pathname.startsWith(`${base.pathname}/products/`))) {
          const handle = decodeURIComponent(match[1]).toLowerCase();
          output.set(handle, { url: `${base.origin}/products/${encodeURIComponent(handle)}`,
            title: attrs.title || attrs['aria-label'] || handle.replace(/-/g, ' '),
            image_url: null, collection_feed_verified: true, selection_priority: 200 });
        }
      } catch {}
    }
    if (!/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(tag) && !token[0].endsWith('/>')) stack.push(node);
  }
  return [...output.values()];
}

export function productBreadcrumbIncludesCollection(html, productUrl, collection) {
  const source = String(html || '');
  const normalize = value => {
    try {
      const url = new URL(value, productUrl);
      return `${url.origin}${url.pathname.replace(/\/+$/, '')}`.toLowerCase();
    } catch { return ''; }
  };
  // A global navigation link is insufficient. Require the exact product's
  // canonical page and its structured BreadcrumbList, not a fuzzy title match.
  const canonical = [...source.matchAll(/<link\b[^>]*>/gi)].find(match =>
    /\brel\s*=\s*["']canonical["']/i.test(match[0]));
  const href = canonical?.[0].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
  const documents = [];
  for (const match of source.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([^]*?)<\/script\s*>/gi)) {
    try { documents.push(JSON.parse(match[1])); } catch {}
  }
  const exactProduct = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 12) return false;
    if (Array.isArray(value)) return value.some(item => exactProduct(item, depth + 1));
    const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
    if (types.includes('Product') || types.includes('ProductGroup')) {
      const offers = Array.isArray(value.offers) ? value.offers : [value.offers];
      return [value.url, value['@id'], ...offers.map(offer => offer?.url)]
        .filter(Boolean).some(url => normalize(url) === normalize(productUrl));
    }
    return exactProduct(value['@graph'], depth + 1);
  };
  // Some stores canonicalize all sizes to a family URL. An exact Product/Offer
  // URL is also valid page-identity evidence; a similar slug is never enough.
  if ((!href || normalize(decodeAttribute(href)) !== normalize(productUrl)) &&
      !documents.some(value => exactProduct(value))) return false;
  const visit = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 12) return false;
    if (Array.isArray(value)) return value.some(item => visit(item, depth + 1));
    const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
    if (types.includes('BreadcrumbList') && Array.isArray(value.itemListElement)) {
      return value.itemListElement.some(entry => {
        const item = entry?.item;
        return normalize(typeof item === 'string' ? item : item?.['@id'] || item?.url) === normalize(collection);
      });
    }
    return visit(value['@graph'], depth + 1);
  };
  return documents.some(value => visit(value));
}

/** Public official model-detail pages complement the multi-tier price table.
 * These are review candidates, never an authoritative machine-readable pricing API.
 * Do not infer a model price from a sibling, snapshot, marketing summary or alias.
 */
export const SPREELO_PRICE_PRIORITY_MODELS = Object.freeze([
  'gpt-4.1-mini', 'gpt-5.5', 'gpt-5.6-sol',
  'gpt-image-2', 'gpt-image-2.5-flare',
]);

const DOCUMENTED_DETAILS = Object.freeze([
  'gpt-4.1-mini', 'gpt-5.5', 'gpt-5.6-sol', 'gpt-image-2.5-flare',
]);
const MAX_DOCUMENT = 2_000_000;
const money = String.raw`\$\s*(\d+(?:\.\d{1,9})?)`;

function textFromDocument(value) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&dollar;|&#36;|&#x24;/gi, '$')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\|/g, ' ')
    .replace(/[`*_|#]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function section(text, start, end) {
  const from = text.search(start);
  if (from < 0) return '';
  const tail = text.slice(from);
  const endMatch = end.exec(tail.slice(1));
  return (endMatch ? tail.slice(0, endMatch.index + 1) : tail).slice(0, 1800);
}

function uniqueTokenPrices(text, labels) {
  const pattern = new RegExp(labels.map(label => String.raw`\b${label}\s*${money}`).join(String.raw`[\s\S]{0,160}?`), 'gi');
  const matches = [...text.matchAll(pattern)].map(match => match.slice(1).map(Number));
  if (!matches.length || matches.some(row => row.some(n => !Number.isFinite(n) || n < 0 || n > 100000))) return null;
  const unique = new Map(matches.map(row => [row.join('|'), row]));
  return unique.size === 1 ? [...unique.values()][0] : null;
}

/** Parse ONLY the pricing section of the exact model's public detail page.
 * A model title and explicit modality / token labels must all be present.
 * Reject duplicate/conflicting triples, marketing prices and empty labels.
 */
export function parseOfficialModelDetail(model, raw) {
  if (!DOCUMENTED_DETAILS.includes(model) || typeof raw !== 'string' || raw.length > MAX_DOCUMENT || raw.length < 100) return null;
  const text = textFromDocument(raw);
  const pricing = section(text, /\bPricing\s+(?:Pricing\s+)?is\s+based\s+on\b/i, /\bModalities\b/i);
  if (!pricing || !/\bPer\s+1M\s+tokens\b/i.test(pricing)) return null;
  const textTokens = section(pricing, /\bText\s+tokens\b/i, /\b(?:Image\s+tokens|Quick\s+comparison|Modalities)\b/i);
  if (!textTokens) return null;
  if (model.startsWith('gpt-image-')) {
    const imageTokens = section(pricing, /\bImage\s+tokens\b/i, /\b(?:Quick\s+comparison|Modalities)\b/i);
    const t = uniqueTokenPrices(textTokens, ['Input', 'Cached\\s+input']);
    const i = uniqueTokenPrices(imageTokens, ['Input', 'Cached\\s+input', 'Output']);
    if (!t || !i || i[2] <= 0) return null;
    return {model,pricing_kind:'image',input_usd_per_m:t[0],cached_input_usd_per_m:t[1],
      output_usd_per_m:i[2],image_input_usd_per_m:i[0],cached_image_input_usd_per_m:i[1]};
  }
  const result = uniqueTokenPrices(textTokens, ['Input', 'Cached\\s+input', 'Output']);
  if (!result || result[2] <= 0) return null;
  return {model,pricing_kind:'text',input_usd_per_m:result[0],cached_input_usd_per_m:result[1],output_usd_per_m:result[2]};
}

/** Independently fetch official detail pages for the models Spreelo currently uses.
 * Prefer .md to avoid client UI table selections (Standard / Batch / Fast).
 * A failure means price UNKNOWN, not the previous embedded fallback price.
 */
export async function fetchSpreeloModelPriceEvidence({fetcher=fetch}) {
  return Promise.all(DOCUMENTED_DETAILS.map(async model => {
    const sourceUrl = `https://developers.openai.com/api/docs/models/${model}`;
    for (const url of [sourceUrl + '.md', sourceUrl]) {
      try {
        const response = await fetcher(url, {headers:{'user-agent':'Spreelo-OpenAI-Discovery/144.391'},
          signal:AbortSignal.timeout(7000),cache:'no-store'});
        if (!response.ok) continue;
        const raw = await response.text();
        const candidate = parseOfficialModelDetail(model,raw);
        if (candidate) return {...candidate,source_url:sourceUrl};
      } catch { /* Try canonical HTML after Markdown; don't guess on failure. */ }
    }
    return null;
  })).then(rows => rows.filter(Boolean));
}

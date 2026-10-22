/**
 * Conservative parser for PUBLIC OpenAI price-page tables, not a pricing API.
 * This parser never approves rates. It only provides review candidates where
 * ONE unique complete USD/1M token price tuple is visible for an exact model.
 * Different pricing modes, long context tiers or duplicated conflicting rows
 * are deliberately ambiguous and must be reviewed manually.
 */
export const OPENAI_PRICING_SOURCE = 'https://developers.openai.com/api/docs/pricing';
const MODEL_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{1,119}$/;
const MONEY_PATTERN = /^\$\s*(\d+(?:\.\d{1,9})?)$/;

export function validOpenAIModelId(value) {
  return typeof value === 'string' && MODEL_PATTERN.test(value) && !value.startsWith('ft-');
}

function decodeHtml(s) {
  return String(s || '').replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&dollar;|&#36;|&#x24;/gi, '$')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;|&#34;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Math.min(65535, Number(n))));
}

function visibleText(value) {
  return decodeHtml(value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function money(cell) {
  const match = MONEY_PATTERN.exec(String(cell || '').trim());
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value >= 0 && value <= 100000 ? value : null;
}

function normalizeHeader(v) {
  return String(v).trim().toLowerCase().replace(/\s+/g, ' ');
}

function collectHtmlTables(html) {
  const rows = [];
  // Regex is used only to extract inert text from fixed-source tables.
  // If upstream renders another structure, rates remain unknown (fail closed).
  for (const match of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const tr = [...match[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
      .map(row => [...row[1].matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
        .map(cell => visibleText(cell[2]))).filter(row => row.length);
    if (tr.length > 1) rows.push(tr);
  }
  return rows;
}

function markdownCells(line) {
  const cells = line.split('|').map(x=>x.trim());
  if (line.startsWith('|')) cells.shift();
  if (line.endsWith('|')) cells.pop();
  return cells;
}

function collectMarkdownTables(text) {
  const groups = [];
  const lines = String(text || '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*\|?\s*Model\s*\|/i.test(lines[i])) continue;
    const table = [markdownCells(lines[i])];
    let j = i + 1;
    if (/^[\s|:-]+$/.test(lines[j] || '')) j++;
    while (j < lines.length && lines[j].includes('|')) {
      const row = markdownCells(lines[j]);
      if (row.length < 3) break;
      table.push(row);
      j++;
    }
    if (table.length > 1) groups.push(table);
    i = j - 1;
  }
  return groups;
}

function parseTable(table, observations) {
  const headers = table[0].map(normalizeHeader);
  const modelCol = headers.findIndex(h => h === 'model' || h.startsWith('model '));
  const inputCol = headers.findIndex(h => h === 'input');
  const outputCol = headers.findIndex(h => h === 'output');
  const cachedCol = headers.findIndex(h => h === 'cached input' || h === 'cached input tokens');
  const modalityCol = headers.findIndex(h => h === 'modality');
  if (modelCol < 0 || inputCol < 0 || outputCol < 0 || cachedCol < 0) return;
  let carriedModel = '';
  let imageParts = new Map();
  for (const sourceRow of table.slice(1)) {
    // A row-spanned model cell is omitted by HTML/Markdown serializers.
    const row = modalityCol >= 0 && sourceRow.length === headers.length - 1 && modelCol === 0 &&
      /^(?:text|image)$/i.test(String(sourceRow[0] || '').trim())
      ? ['', ...sourceRow] : sourceRow;
    const rawModel = row[modelCol]?.trim() || '';
    const modality = modalityCol >= 0 ? String(row[modalityCol] || '').toLowerCase() : null;
    // Markdown uses `Text | $...` to continue the preceding image model.
    // `Text` is syntactically a valid model ID, but it is a modality label here.
    const continuation = modalityCol >= 0 && /^(?:text|image)$/i.test(rawModel);
    if (rawModel && validOpenAIModelId(rawModel) && !continuation) carriedModel = rawModel;
    const model = rawModel && validOpenAIModelId(rawModel) && !continuation ? rawModel :
      (modality === 'text' || modality === 'image' || continuation ? carriedModel : '');
    if (!validOpenAIModelId(model)) continue;
    const input = money(row[inputCol]), output = money(row[outputCol]), cached = money(row[cachedCol]);
    if (modalityCol >= 0) {
      if (modality === 'image' && input !== null && output !== null && cached !== null) {
        imageParts.set(model, {image_input_usd_per_m:input,output_usd_per_m:output,cached_image_input_usd_per_m:cached});
      }
      if (modality === 'text' && input !== null && cached !== null && imageParts.has(model)) {
        const image = imageParts.get(model);
        observations.push({model,pricing_kind:'image',input_usd_per_m:input,cached_input_usd_per_m:cached,
          output_usd_per_m:image.output_usd_per_m,image_input_usd_per_m:image.image_input_usd_per_m,
          cached_image_input_usd_per_m:image.cached_image_input_usd_per_m});
        imageParts.delete(model);
      }
    } else if (input !== null && output !== null && cached !== null) {
      observations.push({model,pricing_kind:'text',input_usd_per_m:input,cached_input_usd_per_m:cached,output_usd_per_m:output});
    }
  }
}

export function parseOpenAIPublishedPrices(page) {
  if (typeof page !== 'string' || page.length < 40 || page.length > 5_000_000) {
    return { candidates:[], ambiguousModels:[], observedModels:[], status:'unreadable' };
  }
  const tables = /<table\b/i.test(page) ? collectHtmlTables(page) : collectMarkdownTables(page);
  const observations = [];
  for (const table of tables) parseTable(table, observations);
  const byModel = new Map();
  for (const item of observations) {
    const list = byModel.get(item.model) || [];
    list.push(item);
    byModel.set(item.model, list);
  }
  const candidates = [], ambiguousModels = [];
  for (const [model, list] of byModel) {
    const distinct = new Map(list.map(item => [JSON.stringify(item), item]));
    if (distinct.size === 1) candidates.push([...distinct.values()][0]);
    else ambiguousModels.push(model);
  }
  return { candidates, ambiguousModels, observedModels:[...byModel.keys()], status:tables.length ? 'parsed' : 'unreadable',tableCount:tables.length };
}

export function samePrices(a, b) {
  const keys=['pricing_kind','input_usd_per_m','cached_input_usd_per_m','output_usd_per_m',
    'image_input_usd_per_m','cached_image_input_usd_per_m'];
  return keys.every(key => key==='pricing_kind'
    ? String(a?.[key]||'text')===String(b?.[key]||'text')
    : (a?.[key]==null&&b?.[key]==null) || Number(a?.[key])===Number(b?.[key]));
}

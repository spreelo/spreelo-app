import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = path.join(root, 'lib/shopifyProductCatalog.js');
let catalogSource = fs.readFileSync(catalogPath, 'utf8');
catalogSource = catalogSource
  .replace(/^import[^\n]+\n/, '')
  .replace(/export\s+async\s+function\s+/g, 'async function ')
  .replace(/export\s+function\s+/g, 'function ')
  .replace(/export\s+const\s+/g, 'const ');
catalogSource += '\n;globalThis.__spreeloTest = { SHOPIFY_FULL_CATALOG_BULK_QUERY, parseShopifyFullCatalogJsonlText };\n';

const context = vm.createContext({
  console,
  Date,
  JSON,
  Math,
  Number,
  String,
  Boolean,
  Array,
  Object,
  RegExp,
  TextDecoder,
  fetch: async () => { throw new Error('fetch should not run in parser test'); },
  getShopifyEnv: () => ({ apiVersion: '2026-07' }),
  shopifyGraphqlForBrand: async () => { throw new Error('GraphQL should not run in parser test'); },
});
vm.runInContext(catalogSource, context, { filename: catalogPath });
const { SHOPIFY_FULL_CATALOG_BULK_QUERY, parseShopifyFullCatalogJsonlText } = context.__spreeloTest;

const route = fs.readFileSync(path.join(root, 'app/api/cron/run-automations/route.js'), 'utf8');
const mode = fs.readFileSync(path.join(root, 'lib/effectiveProductMode.js'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'spreelo-v144.251-SQL.sql'), 'utf8');

assert.match(SHOPIFY_FULL_CATALOG_BULK_QUERY, /products\(query: "status:active published_status:published"\)/);
assert.doesNotMatch(SHOPIFY_FULL_CATALOG_BULK_QUERY, /products\(first:/);
assert.match(SHOPIFY_FULL_CATALOG_BULK_QUERY, /variants\s*\{/);

const jsonl = [
  JSON.stringify({
    id: 'gid://shopify/Product/1', handle: 'snowboard', title: 'Snowboard', description: 'Fast board',
    onlineStoreUrl: null, productType: 'Snowboard', vendor: 'Spreelo', status: 'ACTIVE', tags: ['snow'],
    featuredMedia: { preview: { image: { url: 'https://cdn.example.com/snow.jpg', altText: 'Snowboard', width: 1200, height: 1200 } } },
  }),
  JSON.stringify({
    id: 'gid://shopify/ProductVariant/11', title: 'Default Title', sku: 'SNOW-1', availableForSale: false,
    sellableOnlineQuantity: 0, inventoryQuantity: 20, inventoryPolicy: 'DENY', image: null,
    __parentId: 'gid://shopify/Product/1',
  }),
  JSON.stringify({
    id: 'gid://shopify/Product/2', handle: 'sold-out', title: 'Sold out', description: '',
    onlineStoreUrl: 'https://example.com/products/sold-out', productType: 'Board', vendor: 'Spreelo', status: 'ACTIVE', tags: [],
    featuredMedia: { preview: { image: { url: 'https://cdn.example.com/out.jpg', altText: '', width: 800, height: 800 } } },
  }),
  JSON.stringify({
    id: 'gid://shopify/ProductVariant/22', title: 'Default Title', sku: 'OUT-1', availableForSale: false,
    sellableOnlineQuantity: 0, inventoryQuantity: 0, inventoryPolicy: 'DENY', image: null,
    __parentId: 'gid://shopify/Product/2',
  }),
].join('\n');

const parsed = parseShopifyFullCatalogJsonlText(jsonl, {
  verifiedAt: '2026-09-23T18:00:00.000Z',
  shopDomain: 'spreelo-test-store.myshopify.com',
});
assert.equal(parsed.diagnostics.rootProductCount, 2);
assert.equal(parsed.diagnostics.variantObjectCount, 2);
assert.equal(parsed.items.length, 1);
assert.equal(parsed.items[0].title, 'Snowboard');
assert.equal(parsed.items[0].url, 'https://spreelo-test-store.myshopify.com/products/snowboard');
assert.equal(parsed.items[0].shopify_inventory_quantity, 20);

assert.match(route, /ensureShopifyFullCatalogSync/);
assert.ok(
  route.indexOf('const result = await fetchShopifyProductEngineCatalog') < route.indexOf('if (result?.connected === true)'),
  'full-catalog branch must stay behind the existing confirmed-Shopify probe'
);
assert.match(route, /Shopify full product catalog indexed from Admin Bulk API/);
assert.match(route, /batchSize = 150/);
assert.match(route, /maxProducts = 120/); // fast bootstrap only, not total coverage
assert.match(mode, /await ensureShopifyFullCatalogSync/);
assert.match(mode, /pollExisting: false/);
assert.match(sql, /shopify_catalog_bulk_operation_id/);
assert.match(sql, /shopify_catalog_last_full_sync_at/);

console.log('v144.251 Shopify full catalog tests: 17/17');

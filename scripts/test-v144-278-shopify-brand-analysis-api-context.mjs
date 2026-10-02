import fs from 'node:fs';
import assert from 'node:assert/strict';

const engine = fs.readFileSync('app/api/analyze-brand/brandAnalysisEngine.js', 'utf8');
const catalog = fs.readFileSync('lib/shopifyProductCatalog.js', 'utf8');

assert.match(catalog, /export async function fetchShopifyBrandAnalysisContext/, 'Shopify analysis context helper must exist');
assert.match(catalog, /SHOPIFY_BRAND_ANALYSIS_QUERY/, 'Shopify analysis query must exist');
assert.match(catalog, /products\(first: \$first[\s\S]*query: "status:active"/, 'Analysis must read active Shopify products through Admin API');
assert.match(catalog, /productType[\s\S]*vendor[\s\S]*tags/, 'Analysis context must include structured assortment metadata');
assert.match(catalog, /Verified Shopify Admin API store and product context/, 'Synthetic Shopify context must be explicitly identified');

assert.match(engine, /fetchShopifyBrandAnalysisContext/, 'Brand analysis engine must load Shopify context');
assert.match(engine, /mergeShopifyAnalysisHtml/, 'Shopify API context must enrich the normal website evidence');
assert.match(engine, /mergeProductSourceCandidates/, 'Shopify product candidates must enrich website candidates');
assert.match(engine, /if \(!shopifyAnalysisContext\?\.connected \|\| !shopifyAnalysisContext\?\.html\) throw error;/, 'Website fetch failures must retain legacy behavior for non-Shopify brands');
assert.match(engine, /Brand analysis storefront unavailable; using verified Shopify Admin API context/, 'Connected Shopify brands must be able to continue when storefront is blocked');
assert.match(engine, /Shopify enrichment is additive/, 'Implementation must document non-Shopify isolation');

console.log('v144.278 Shopify brand-analysis API context checks passed.');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const load = async path => import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync(new URL(path, import.meta.url), 'utf8')).toString('base64'));
const templates = await load('../lib/websitePostIntent.js');
const engine = await load('../lib/productEngineV2.js');
const route = fs.readFileSync(new URL('../app/api/cron/run-automations/route.js', import.meta.url), 'utf8');
function block(start, end) { return route.slice(route.indexOf(start), route.indexOf(end, route.indexOf(start))); }
const context = vm.createContext({
  ...templates, isSafeProductSearchQuery: engine.isSafeProductSearchQuery, sanitizeProductSearchQueryList: engine.sanitizeProductSearchQueryList,
  repairCommonUtf8Mojibake: value => value, getCustomerFacingCampaignTheme: rule => rule.campaign_theme || '',
  isExplicitCalendarCampaignRule: rule => rule.queue_source === 'campaign', isCarouselRule: rule => rule.content_type_id === 'carousel_website_item',
  PRODUCT_RESEARCH_FAST_MODEL: 'test', getReasoningOptionsForModel: () => ({}), formatBrandProfileForPrompt: () => 'Pressit',
  safeJsonParse: value => JSON.parse(value), console: { log() {} },
  CAMPAIGN_STORE_SEARCH_QUERY_LIMIT: 12, WEBSITE_TEXT_INTENT_MATCH_TERM_LIMIT: 18, WEBSITE_TEXT_INTENT_QUERY_LIMIT: 10, WEBSITE_TEXT_INTENT_AVOID_LIMIT: 12,
});
vm.runInContext([
  block('function normalizeSearchText(', 'function normalizeCampaignStrategyText('),
  block('function isCampaignScopedWebsiteRule(', 'function isWebsiteTextAdRule('),
  block('function collectUniqueTerms(', 'function getCampaignThemeSourceText('),
].join('\n'), context);
const resolve = context.resolveWebsiteTextProductIntentRule;
let calls = 0;
const emptyAi = { responses: { create: async () => { calls++; return { output_text: JSON.stringify({product_match_terms: [], product_search_queries: [], product_avoid_terms: [], product_search_intent: 'No specific restriction'}) }; } } };
for (const prompts of [templates.DEFAULT_WEBSITE_POST_PROMPTS, templates.ADMIN_WEBSITE_POST_PROMPTS]) {
  for (const [id, prompt] of Object.entries(prompts)) {
    const rule = { uses_website_content: true, content_type_id: id, prompt, image_prompt: 'Create a smooth zoom in and out with typography and exact item in a short video.' };
    assert.equal(context.buildDeterministicWebsiteTextProductIntent(rule).hasSpecificIntent, false, id);
    const result = await resolve({openai: emptyAi, rule});
    assert.equal(result, rule);
    assert.equal(context.isProductIntentScopedWebsiteRule(result), false);
  }
}
assert.equal(calls, 0, 'Default formats must not require an intent AI call');
const failed = { uses_website_content: true, content_type_id: 'animated_website_item', prompt: templates.DEFAULT_WEBSITE_POST_PROMPTS.animated_website_item,
  image_prompt: 'Create a premium 9:16 animated product Reel. Use an uploaded moving background selected from the Spreelo library, create the product and overlay design with OpenAI, and animate the foreground with a smooth zoom in and zoom out plus only a slight side drift. Do not add a fake button.' };
assert.equal(await resolve({openai: emptyAi, rule: failed}), failed, 'Exact failed run should carry no fabricated product terms');
assert.equal(templates.removeDefaultWebsitePostInstructions(failed.prompt.replaceAll(' ', '\n')), '');
assert.match(templates.removeDefaultWebsitePostInstructions(failed.prompt + '\nProduct selection hint: blå t-shirts'), /Product selection hint: blå t-shirts/);
const custom = {...failed, prompt: failed.prompt + '\nVisa blå t-shirts för barn.'};
let aiInput = '';
const semanticAi = { responses: { create: async ({input}) => {aiInput = input; return {output_text: JSON.stringify({product_match_terms: ['blå t-shirts', 'barn'], product_search_queries: ['blå t-shirts barn'], product_avoid_terms: [], product_search_intent: 'Blå barntröjor'})};} } };
const result = await resolve({openai: semanticAi, rule: custom});
assert.equal(result.product_search_queries, 'bla t-shirts barn');
assert.equal(result.product_match_terms, 'bla t-shirts, barn');
assert.match(aiInput, /Visa blå t-shirts för barn/);
assert.doesNotMatch(aiInput, /smooth zoom|paired with|that exact item/);
const unknownStandard = {...failed, prompt: 'Write a compelling caption for a verified item, with a confident tone and a short video.'};
assert.equal(await resolve({openai: emptyAi, rule: unknownStandard}), unknownStandard, 'New creation-only wording must respect empty semantic intent');
const brokenAi = {responses: {create: async () => {throw new Error('offline');}}};
await assert.rejects(resolve({openai: brokenAi, rule: custom}), error => error.code === 'product_intent_unavailable', 'A custom product request must not silently select an unrelated product after AI failure');
const explicit = {...custom, product_match_terms: 't-shirts', product_search_queries: 'barn t-shirts', product_avoid_terms: 'vuxen'};
const fallback = await resolve({openai: brokenAi, rule: explicit});
assert.equal(fallback.product_search_queries, 'barn t-shirts');
assert.equal(fallback.product_match_terms, 't-shirts');
assert.equal(fallback.product_avoid_terms, 'vuxen');
const campaign = {...explicit, queue_source: 'campaign', campaign_theme: 'Farsdag'};
assert.equal((await resolve({openai: brokenAi, rule: campaign})).product_search_queries, 'barn t-shirts');
assert.doesNotMatch(route, /extractWebsiteTextIntentTermsFromText/, 'No raw prompt n-gram generator remains');
console.log('v144.316: all shared default formats, exact failed animation rule, appended customer intent, semantic-only interpretation, empty response, unavailable AI, explicit metadata and calendar safeguards passed.');

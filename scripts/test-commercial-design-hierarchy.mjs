import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sharp from 'sharp';
import { generateIndependentAdvertisingAssets, renderArtDirectedTypography } from '../lib/videoAdvertisingAssetPipeline.js';
import { composeVideoEndCardLayers } from '../lib/klingEndCard.js';
import { repeatsAdvertisingMessage, distinctProductEyebrow, isProductLabelHeadline, COMMERCIAL_COPY_HIERARCHY } from '../lib/videoAdvertisingHierarchy.js';
import { VIDEO_ART_DIRECTION, VIDEO_DESIGN_VERSION } from '../lib/videoArtDirection.js';
import { buildVideoOverlayEdit, buildProductPushEdit } from '../lib/shotstack.js';
import { verifyExplicitCollectionMembership, filterExplicitCollectionCandidates } from '../lib/verifiedCollectionMembership.js';

const png = svg => sharp(Buffer.from(svg)).png().toBuffer();
const background = await png(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect width="1080" height="1920" fill="#171819"/><path d="M850 0H1080V420Z M0 1560V1920H240Z" fill="#C9A34D"/><path d="M930 0H1080V230Z M0 1770V1920H95Z" fill="#75633C"/></svg>`);
const logo = await png('<svg xmlns="http://www.w3.org/2000/svg" width="470" height="100"><text x="8" y="76" font-family="DejaVu Sans" font-size="76" font-weight="700" fill="#111821">TESTLOGO</text></svg>');
let paid = 0;
const params = { openai: { images: { edit: async () => {
  paid++; return { data: [{ b64_json: background.toString('base64') }] };
} } }, model: 'fixture', referenceFiles: [],
  headline: 'Låt motivet ta plats', closingLine: 'Upptäck kollektionen',
  designDirection: 'Confident modern editorial sans-serif, generous space, charcoal and warm gold from the product. Short headline with a quieter invitation.',
  brand: { business_name: 'Pressit', primary_color: '#171819' } };
const art = await generateIndependentAdvertisingAssets(params);
assert.equal(paid, 1, 'normal design still purchases only one background');
const card = await composeVideoEndCardLayers({ background: art.endCard, headlineArtwork: art.headline,
  headline: params.headline, closingText: art.closingText, closingLine: params.closingLine,
  productLabel: 'Bepansrade Enhörningar', brand: params.brand, logoBuffer: logo, language: 'sv', preserveDesign: true });
assert(card.layout && card.hasSender, 'new cards expose measured layout and sender ownership');
assert(card.layout.closing.width < card.layout.headline.width);
assert(card.layout.closing.height < card.layout.headline.height * .8, 'CTA cannot rival the main hook');
assert(card.layout.closing.top > card.layout.headline.top + card.layout.headline.height + 50);
assert(card.layout.sender.top > card.layout.closing.top + card.layout.closing.height + 60);
assert(card.layout.sender.width >= 280);
assert(card.layout.sender.top + card.layout.sender.height < 1660, 'sender clears social UI');
const dominantInk = async buffer => {
  const { data } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const counts = new Map();
  for (let i = 0; i < data.length; i += 4) if (data[i+3] > 230) {
    const key = Array.from(data.subarray(i, i+3)).join(','); counts.set(key, (counts.get(key) || 0)+1);
  }
  return [...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0];
};
assert.notEqual(await dominantInk(art.closingText), '143,226,255', 'no automatic cyan last-line accent');
const bare = await renderArtDirectedTypography({ text: 'Un seul message clair', backgroundBuffer: background });
const { data, info } = await sharp(bare).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
for (let y=0;y<info.height;y++) for (const x of [0,info.width-1]) assert(data[(y*info.width+x)*4+3] < 10, 'lettering must not clip at the canvas edge');
assert(repeatsAdvertisingMessage('Bepansrade Enhörningar T-shirt', 'Bepansrade Enhörningar'));
assert.equal(isProductLabelHeadline('Bepansrade Enhörningar T-shirt','Bepansrade Enhörningar'),true);
assert.equal(isProductLabelHeadline('A chair for quiet moments','Chair'),false);
assert.equal(distinctProductEyebrow('Bepansrade Enhörningar', 'Bepansrade Enhörningar T-shirt'), '');
const oldCopy = 'Bepansrade Enhörningar T-shirt';
const repeatedArt = await renderArtDirectedTypography({ text: oldCopy, backgroundBuffer: background });
const noDuplication = await composeVideoEndCardLayers({ background, headlineArtwork: repeatedArt,
  headline: oldCopy, closingText: art.closingText, closingLine: params.closingLine,
  productLabel: 'Bepansrade Enhörningar', brand: params.brand, preserveDesign: true });
assert.equal(noDuplication.layout.eyebrow, null);
const sameCTA = await composeVideoEndCardLayers({ background, headlineArtwork: art.headline,
  headline: params.headline, closingText: art.headline, closingLine: params.headline,
  brand: params.brand, preserveDesign: true });
assert.equal(sameCTA.layout.closing, null, 'identical hook and CTA must not be rendered twice');

const timeline = buildVideoOverlayEdit({ videoUrl: 'video', textOverlayUrl: 'type', logoOverlayUrl: 'logo',
  endCardUrl: 'card', endCardIncludesSender: true, durationSeconds: 5, closingHoldSeconds: 1.5 });
const logoClip = timeline.timeline.tracks.flatMap(track=>track.clips).find(clip=>clip.asset?.src==='logo');
assert.equal(logoClip.length, 4.6, 'corner logo stops when sender-owned card begins');
const legacy = buildVideoOverlayEdit({ videoUrl: 'video', textOverlayUrl: 'type', logoOverlayUrl: 'logo',
  endCardUrl: 'card', durationSeconds: 5, closingHoldSeconds: 1.5 });
assert.equal(legacy.timeline.tracks.flatMap(track=>track.clips).find(clip=>clip.asset?.src==='logo').length, 6.5);
const animation = buildProductPushEdit({ backgroundVideoUrl: 'background', productDataUri: 'product',
  logoOverlayUrl: 'logo', endCardUrl: 'card', endCardIncludesSender: true, durationSeconds: 5, closingHoldSeconds: 1.5 });
assert.equal(animation.timeline.tracks.flatMap(track=>track.clips).find(clip=>clip.asset?.src==='logo').length, 4.6);
console.log('PASS: actual typography, subdued CTA, measured spacing, no duplicate label/CTA, real sender contrast and legacy-safe logo timing');

const worker = fs.readFileSync('app/api/cron/run-automations/route.js', 'utf8');
const finalizer = fs.readFileSync('app/api/cron/finalize-kling-videos/route.js', 'utf8');
const definition = (source, name) => {
  const start = new RegExp(`^(?:export )?(?:async )?function ${name}\\(`, 'm').exec(source)?.index;
  assert(start !== undefined, name); const rest=source.slice(start).replace(/^export /,'');
  const next=/\n(?:export )?(?:async )?function /g.exec(rest); return next?rest.slice(0,next.index):rest;
};
const quiet = { info(){}, log(){}, warn(){}, error(){} };
const plan = { headline: oldCopy, subheadline: 'Bepansrade Enhörningar', cta: params.closingLine,
  main_placement:'lower_left',cta_placement:'lower_left',main_layout:{left:64,top:1160,width:720,height:340},
  cta_layout:{},protected_regions:[],placement_confidence:.95,design_direction:params.designDirection };
async function copyCase(results) {
  const calls=[];
  const ctx=vm.createContext({ console:quiet, COMMERCIAL_COPY_HIERARCHY, repeatsAdvertisingMessage, isProductLabelHeadline,
    VIDEO_ART_DIRECTION, VIDEO_DESIGN_VERSION, CREATIVE_DIRECTOR_BRIEF:'Verified facts only.',
    KLING_PRODUCT_IDENTITY_AUDIT_MODEL:'fixture', KLING_FINISHED_TYPOGRAPHY_PLACEMENTS:{lower_left:{}},
    normalizeKlingCreativeLine:(value)=>String(value||'').trim(), getFallbackKlingCta:()=>params.closingLine,
    normalizeKlingLayout:value=>value||{}, getKlingPlacementBox:()=>({}), sceneSafeKlingLayout:value=>value,
    klingLayoutSchema:()=>({type:'object'}), truncate:value=>String(value||''),
    getOpenAiTextOutput:response=>response.output_text,
  });
  vm.runInContext(definition(finalizer,'planFinishedKlingAdvertisingCreative'),ctx);
  const output=await ctx.planFinishedKlingAdvertisingCreative({post:{content:'Svensk verifierad produkttext'},
    selection:{verified_product_title:'Bepansrade Enhörningar'},frames:[{buffer:background}],
    openai:{responses:{create:async(request)=>{calls.push(request);const result=results.shift();if(result instanceof Error)throw result;assert(result,'unexpected paid planning call');return{output_text:JSON.stringify(result)};}}}});
  return{output,calls};
}
const corrected=await copyCase([plan,{...plan,headline:params.headline,subheadline:''}]);
assert.equal(corrected.calls.length,2);assert.equal(corrected.output.headline,params.headline);
assert(corrected.calls[1].input[0].content[0].text.includes('It repeats the product label'));
const repeated=await copyCase([plan,plan]);
assert.equal(repeated.calls.length,2);assert.equal(repeated.output.subheadline,'');
assert(repeated.output.copy_feedback, 'known repeated copy is advisory, never an admin hold');
const unavailable=await copyCase([new Error('Timeout')]);
assert.equal(unavailable.calls.length,1,'transport outage cannot trigger another planning request');
assert.equal(unavailable.output.source,'deterministic_fallback');
console.log('PASS: actual finished-film copy planner corrects a product-label hook once, preserves safe fallback and never retries an outage');

const scope='https://filter-test.test/collections/chosen';
const shirt={url:'https://filter-test.test/products/shirt'},poster={url:'https://filter-test.test/products/poster'};
let feeds=0;
const fetcher=async()=>{feeds++;return{ok:true,json:async()=>({products:[{handle:'shirt'}]})};};
const entered=new Error('ENTERED_VERIFICATION_RANKING');
const ctx=vm.createContext({console:quiet,WEBSITE_PRODUCT_DISCOVERY_VERIFY_LIMIT:12,WEBSITE_VERIFICATION_SOFT_DEADLINE_MS:225000,
  filterExplicitCollectionCandidates:options=>filterExplicitCollectionCandidates({...options,fetcher}),
  rankFocusedCategoryCandidatesForVerification:items=>{
    assert.deepEqual(Array.from(items).map(item=>item.url),[shirt.url]);throw entered;
  }});
vm.runInContext(definition(worker,'verifyDiscoveredWebsiteProductCandidates'),ctx);
await assert.rejects(ctx.verifyDiscoveredWebsiteProductCandidates({candidates:[poster,shirt],websiteUrl:scope}),error=>error===entered);
assert.equal(feeds,1,'category membership is checked once before product requests and AI verification');
assert.equal((await verifyExplicitCollectionMembership({sourceUrl:scope,productUrl:poster.url,fetcher})).verified,false);
console.log('PASS: actual worker excludes wrong-category candidates before ranking and expensive product verification');

if(process.env.SPREELO_WRITE_DESIGN_PREVIEWS==='1') {
  fs.mkdirSync('docs/previews/144360',{recursive:true});
  const example=await composeVideoEndCardLayers({background:art.endCard,headlineArtwork:art.headline,
    headline:params.headline,closingText:art.closingText,closingLine:params.closingLine,
    productLabel:'Bepansrade Enhörningar',brand:params.brand,language:'sv',preserveDesign:true});
  fs.writeFileSync('docs/previews/144360/end-card-hook.png',example.cardBuffer);
  fs.writeFileSync('docs/previews/144360/end-card-product-label-fallback.png',noDuplication.cardBuffer);
}

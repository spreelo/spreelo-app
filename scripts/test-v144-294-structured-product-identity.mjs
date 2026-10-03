import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const route=fs.readFileSync('app/api/cron/run-automations/route.js','utf8');
const start=route.indexOf('function normalizeProductBrandIdentity');
const end=route.indexOf('async function reviewCarouselProductOnlyImages',start);
assert.ok(start>=0&&end>start);
const context=vm.createContext({
 console:{info(){},warn(){}},
 normalizeComparableValue:v=>String(v||'').toLowerCase().trim(),
 getDeterministicProductImageVariantConflict:()=>null,
 getProductImageResolverPageUrl:item=>item.product_url,
 truncateText:(s,n)=>s.slice(0,n),
 mapWithConcurrency:async(items,limit,fn)=>Promise.all(items.map(fn)),
 fetchPublicImageForResolution:async()=>({buffer:Buffer.from('test-image')}),
 getSharpRuntime:()=>()=>({rotate(){return this;},resize(){return this;},png(){return this;},async toBuffer(){return Buffer.from('test-normalized-image');}}),
 PRODUCT_RESEARCH_FAST_MODEL:'existing-fast-model',
 safeJsonParse:JSON.parse,
 getOpenAiResponseOutputText:r=>r.output_text,
});
vm.runInContext(route.slice(start,end),context);
const base={id:'0:0',matches_product:true,product_type_match:true,brand_or_model_conflict:false,brand_conflict:false,model_conflict:false,variant_conflict:false,observed_brand:'',display_product_type:'Herr T-shirt',confidence:0.99,reason:''};
const exactReason="The image shows a men's T-shirt featuring the exact slogan and design 'If It's Not About Fishing I'm Not Interested', matching the product title description. The product type is a T-shirt as expected. No visible brand conflict or variant mismatch is present.";
const options={expectedBrand:'',lockedSource:'locked_product_page_object'};
const accept=(r,o=options)=>context.isStructuredProductImageReviewAccepted(r,o);
for(const reason of [exactReason,'No conflicting brand or product variant is visible.','No brand mismatch, wrong model or different colour is present.','Brand conflict and variant mismatch are absent.','Ingen konflikt finns.','']){
 assert.equal(accept({...base,reason}),true,reason);
}
for(const field of ['brand_conflict','model_conflict','variant_conflict']){
 assert.equal(accept({...base,[field]:true,reason:'No conflict is visible.'}),false,`${field} must stop even with contradictory prose`);
 for(const bad of [undefined,null,'false',0])assert.equal(accept({...base,[field]:bad}),false,`${field} invalid type must stop`);
}
for(const changes of [{matches_product:false},{product_type_match:false},{confidence:0.89},{confidence:NaN},{confidence:'0.99'},{confidence:1.1},{brand_or_model_conflict:true}])assert.equal(accept({...base,...changes}),false);
assert.equal(accept({...base,observed_brand:'Adidas'},{...options,expectedBrand:'Nike'}),false,'Observed unrelated brand must stop even if AI flag is false');
const family={...base,matches_product:false,brand_or_model_conflict:true,brand_conflict:true,observed_brand:'Nike Air Jordan'};
assert.equal(accept(family,{...options,expectedBrand:'Jordan'}),true,'Existing compatible brand family exception preserved');
assert.equal(accept({...family,model_conflict:true},{...options,expectedBrand:'Jordan'}),false);
assert.equal(accept({...family,variant_conflict:true},{...options,expectedBrand:'Jordan'}),false);
const item={title:"If It's Not About Fishing - Herr - T-shirt",product_url:'https://example.test/products/fishing',image_url:'https://example.test/fishing.png',locked_product_source:'locked_product_page_object',product_image_identity_verified:true};
async function review(r,items=[item]){
 let calls=0;
 const openai={responses:{async create(request){calls++;
  assert.equal(request.model,'existing-fast-model');assert.equal(request.max_output_tokens,2200);
  const schema=request.text.format.schema.properties.images.items;
  for(const field of ['brand_conflict','model_conflict','variant_conflict']){assert.equal(schema.properties[field].type,'boolean');assert.ok(schema.required.includes(field));}
  return {output_text:JSON.stringify({images:[r]})};
 }}};
 const result=await context.reviewResolvedProductImageIdentity({openai,items,ruleId:'regression'});
 return {result,calls};
}
const match=await review({...base,reason:exactReason});assert.equal(match.calls,1);assert.equal(match.result[0].image_url,item.image_url);assert.equal(match.result[0].product_image_semantic_verified,true);
for(const field of ['brand_conflict','model_conflict','variant_conflict']){
 const failed=await review({...base,[field]:true});assert.equal(failed.calls,1);assert.equal(failed.result[0].image_url,null);
}
const missing=await review({id:'0:0',matches_product:true});assert.equal(missing.result[0].image_url,null);assert.equal(missing.calls,1);
const existing=await review(base,[{...item,product_image_semantic_verified:true}]);assert.equal(existing.calls,0,'Already verified images must reuse existing check');assert.equal(existing.result[0].image_url,item.image_url);
context.getDeterministicProductImageVariantConflict=()=>({conflicts:['pack_count','volume']});
const deterministic=await review(base);assert.equal(deterministic.calls,0);assert.equal(deterministic.result[0].image_url,null);assert.equal(deterministic.result[0].product_image_semantic_reason,'deterministic_variant_conflict');
console.log('PASS v144.294: exact fishing incident accepted; structured conflicts and invalid responses rejected; brand families and deterministic guards preserved; one existing AI call, verified reuse zero calls.');

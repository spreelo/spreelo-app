import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sharp from 'sharp';
import {calculateAnimatedProductLayout,prepareAnimatedProductLayout} from '../lib/animatedProductLayout.js';
import {inspectTypographyShape} from '../lib/animatedTypographyQuality.js';
import {buildProductPushEdit} from '../lib/shotstack.js';
const source=fs.readFileSync('app/api/cron/run-automations/route.js','utf8');
const extract=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
for (const [w,h] of [[1800,600],[400,1500],[800,950],[4000,100],[30,4000],[900,900]]) {
 const layout=calculateAnimatedProductLayout(w,h), p=layout.product, t=layout.text;
 assert.ok(Math.abs(p.width - p.height*w/h) <= Math.max(1,w/h), "Aspect ratio may differ only by integer-pixel rounding");
 assert.ok(p.left>=60 && p.left+p.width<=1020);
 assert.ok(p.top>=280 && p.top+p.height<=1450);
 const zoom={left:p.left-p.width*(layout.motionScale-1)/2,right:p.left+p.width+p.width*(layout.motionScale-1)/2,top:p.top-p.height*(layout.motionScale-1)/2,bottom:p.top+p.height+p.height*(layout.motionScale-1)/2};
 assert.ok(zoom.left>=0 && zoom.right<=1080);
 assert.ok(zoom.bottom<t.top || zoom.top>t.top+t.height,'Text must not overlap product at maximum zoom');
 assert.ok(t.top+t.height<=1630);
 const edit=buildProductPushEdit({backgroundVideoUrl:'https://example.com/background.mp4',productDataUri:'data:image/webp;base64,AA',productWidth:p.width,productHeight:p.height,textOverlayUrl:'https://example.com/text.png',animationLayout:layout});
 const clips=edit.timeline.tracks.flatMap(x=>x.clips);
 const html=clips.find(x=>x.asset.type==='html5');
 assert.ok(html.asset.css.includes(`top:${p.top}px`));
 assert.ok(html.asset.css.includes(`height:${p.height}px`));
 assert.ok(html.asset.js.includes('opacity:0'));
 assert.equal(clips.find(x=>x.asset.src==='https://example.com/text.png').start,0.6);
 assert.equal(layout.motionScale,1.065);
 assert.ok(html.asset.js.includes('scale:1.065'));
}
const padded=await sharp({create:{width:1200,height:800,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:Buffer.from('<svg width="900" height="300"><rect width="900" height="300" fill="white"/></svg>'),left:150,top:250}]).png().toBuffer();
const prepared=await prepareAnimatedProductLayout(padded);
assert.equal(prepared.layout.kind,'wide');assert.equal(prepared.sourceBounds.width,900);assert.equal(prepared.sourceBounds.height,300);
const metadata=await sharp(prepared.cutoutBuffer).metadata();assert.equal(metadata.width,900);
const opaque=await sharp({create:{width:150,height:200,channels:4,background:'white'}}).png().toBuffer();
assert.equal((await prepareAnimatedProductLayout(opaque)).sourceBounds.width,150,'White source pixels must not be removed');
const ctx=vm.createContext({sharp,Buffer,console,inspectTypographyShape,ANIMATED_TEXT_PANEL_SOURCE_WIDTH:1408,ANIMATED_TEXT_PANEL_SOURCE_HEIGHT:480,ANIMATED_TEXT_PANEL_LEFT:128,ANIMATED_TEXT_PANEL_TOP:1280,ANIMATED_TEXT_PANEL_WIDTH:824,ANIMATED_TEXT_PANEL_HEIGHT:281});
vm.runInContext(extract('async function createAnimatedProductLayer','async function createAnimatedLogoOverlay'),ctx);
const layer=await ctx.createAnimatedProductLayer({preparedCutoutBuffer:prepared.cutoutBuffer,animationLayout:prepared.layout});
assert.equal(layer.productWidth,prepared.layout.product.width); assert.equal(layer.productHeight,prepared.layout.product.height);
assert.ok(layer.productDataUri.length<=175000);
vm.runInContext(extract('async function normalizeGeneratedAnimatedTextPanel','function cleanKlingOverlayTextLine'),ctx);
const text=await sharp({create:{width:1408,height:480,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:Buffer.from('<svg width="1408" height="480"><text x="704" y="285" text-anchor="middle" font-size="160" font-family="sans-serif" font-weight="bold">Make room</text></svg>')}]).png().toBuffer();
for(const layout of [prepared.layout,calculateAnimatedProductLayout(400,1500)]) {
 const overlay=await ctx.normalizeGeneratedAnimatedTextPanel(text,layout);
 const {data,info}=await sharp(overlay.textOverlayBuffer).raw().toBuffer({resolveWithObject:true});
 let visible=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>28){visible++;assert.ok(x>=layout.text.left && x<layout.text.left+layout.text.width && y>=layout.text.top && y<layout.text.top+layout.text.height);}
 assert.ok(visible>1000);
}
Object.assign(ctx,{getCarouselProductLabelPresentation:()=>({title:'Printed slogan shirt'}),truncateText:(s,n)=>String(s).slice(0,n),sanitizeProductTitleForCard:s=>s,rgbToHex:()=> '#004499',stripDetectedPrices:s=>s,getAnimatedOverlayThemeContext:()=> 'brand awareness'});
vm.runInContext(extract('function buildAnimatedTextPanelPrompt','function splitAnimatedOverlayTitle'),ctx);
const prompt=ctx.buildAnimatedTextPanelPrompt({rule:{language:'English'},postContent:'Discover the collection',animationLayout:prepared.layout,advertisingCopy:{headline:'Make room'}});
assert.ok(prompt.includes('ABOVE a wide product'));assert.ok(prompt.includes('EXACT LOCKED ADVERTISING TEXT'));assert.ok(prompt.includes('Make room'));assert.ok(prompt.includes('Do not compose any new copy'));assert.ok(prompt.includes('Never imitate the product print'));assert.ok(prompt.includes('The real product is the visual focus'));
console.log('v144.300 adaptive layout, alpha bounds, aspect ratios, zoom safety, Shotstack payload, typography placement and advertising instructions passed');

vm.runInContext(extract('async function getAnimatedOverlayBackgroundLuminance','function getAnimatedOverlayBrightnessLabel'),ctx);
const background = await sharp({create:{width:1080,height:1920,channels:3,background:'black'}}).composite([{input:Buffer.from('<svg width="920" height="280"><rect width="920" height="280" fill="white"/></svg>'),left:80,top:420}]).png().toBuffer();
assert.ok(await ctx.getAnimatedOverlayBackgroundLuminance(background,{},prepared.layout)>250,'Wide typography contrast must sample its top region');
assert.ok(await ctx.getAnimatedOverlayBackgroundLuminance(background,{},calculateAnimatedProductLayout(400,1500))<1,'Tall typography samples its bottom region');
console.log('Text contrast follows selected text region');

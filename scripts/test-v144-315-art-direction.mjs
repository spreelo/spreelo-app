import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sharp from 'sharp';
import {splitKlingAdvertisingAtlas,composeKlingAdvertisingEndCard,buildKlingAdvertisingAtlasPrompt} from '../lib/klingEndCard.js';
import {inspectTypographyShape} from '../lib/animatedTypographyQuality.js';

// Simulate provider drift: the background ends 32 px before the old fixed cut,
// starts away from the edge, and has transparent top/bottom gutters.
const bg=await sharp({create:{width:520,height:984,channels:4,background:'#aabbcc'}}).png().toBuffer();
const message=Buffer.from('<svg width="800" height="180" xmlns="http://www.w3.org/2000/svg"><text x="30" y="120" font-family="sans-serif" font-size="100" fill="white">New favorite</text></svg>');
// Deliberately asymmetric padding on the CTA asset. The visible letters, not
// the padded canvas, must be centered by the compositor.
const cta=await sharp({create:{width:700,height:180,channels:4,background:'#00000000'}}).composite([{input:Buffer.from('<svg width="700" height="180" xmlns="http://www.w3.org/2000/svg"><rect x="390" y="80" width="280" height="65" fill="#ee00dd"/></svg>')}]).png().toBuffer();
const atlas=await sharp({create:{width:1536,height:1024,channels:4,background:'#00000000'}}).composite([{input:bg,left:24,top:20},{input:message,left:660,top:140},{input:cta,left:600,top:700}]).png().toBuffer();
const split=await splitKlingAdvertisingAtlas(atlas);
assert.deepEqual(split.backgroundBounds,{left:24,top:20,width:520,height:984});
for(const x of [0,1079]){const p=await sharp(split.endCard).ensureAlpha().extract({left:x,top:1000,width:1,height:1}).raw().toBuffer();assert.deepEqual([...p],[170,187,204,255]);}
const logo=await sharp({create:{width:200,height:80,channels:4,background:'#ff0000'}}).png().toBuffer();
const card=await composeKlingAdvertisingEndCard({background:split.endCard,closingText:split.closingText,closingLine:'Discover the collection',brand:{business_name:'Pressit'},logoBuffer:logo});
const {data,info}=await sharp(card).ensureAlpha().raw().toBuffer({resolveWithObject:true});
let minX=info.width,maxX=-1,minY=info.height,maxY=-1;
for(let y=850;y<1500;y++)for(let x=0;x<info.width;x++){const i=(y*info.width+x)*4;if(data[i]>210&&data[i+1]<30&&data[i+2]>180){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}}
assert(Math.abs((minX+maxX)/2-540)<=1);assert(Math.abs((minY+maxY)/2-1175)<=1);
const center=await sharp(card).extract({left:540,top:675,width:1,height:1}).raw().toBuffer();assert.equal(center[0],255);assert.equal(center[1],0);
const noisy=await sharp(split.endCard).composite([{input:Buffer.from('<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg"><path d="M100 675 H980" stroke="black" stroke-width="6"/></svg>')}]).png().toBuffer();
const quiet=await composeKlingAdvertisingEndCard({background:noisy,closingText:split.closingText,logoBuffer:logo});
const muted=await sharp(quiet).extract({left:200,top:675,width:1,height:1}).raw().toBuffer();assert(muted[0]>60,'The original sharp black stroke beside the logo must be softened locally');
const noLogo=await composeKlingAdvertisingEndCard({background:split.endCard,closingText:null,closingLine:'Discover the collection',brand:{business_name:'North Peak'}});assert.equal((await sharp(noLogo).metadata()).height,1920);
const prompt=buildKlingAdvertisingAtlasPrompt({headline:'New favorite',closingLine:'Discover the collection',brand:{business_name:'North Peak'},hasLogo:true});assert(prompt.includes('THREE independent assets'));assert(prompt.includes('NO text, letters, stars'));assert(prompt.includes('Do NOT draw the logo'));assert(prompt.includes('ONLY transparent closing-line typography'));

const source=fs.readFileSync('app/api/cron/run-automations/route.js','utf8');
const ctx=vm.createContext({sharp,inspectTypographyShape,ANIMATED_TEXT_PANEL_LEFT:128,ANIMATED_TEXT_PANEL_TOP:1280,ANIMATED_TEXT_PANEL_WIDTH:824,ANIMATED_TEXT_PANEL_HEIGHT:281});
const a=source.indexOf('async function normalizeGeneratedAnimatedTextPanel'),b=source.indexOf('function cleanKlingOverlayTextLine',a);vm.runInContext(source.slice(a,b),ctx);
const lettering=await sharp(Buffer.from('<svg width="1408" height="480" xmlns="http://www.w3.org/2000/svg"><text x="80" y="260" font-family="sans-serif" font-size="150" fill="white">Your style</text></svg>')).png().toBuffer();
for(const box of [{left:128,top:1280,width:824,height:281},{left:80,top:420,width:920,height:280}]){
 const result=await ctx.normalizeGeneratedAnimatedTextPanel(lettering,{text:box});
 const {data:rgba,info:dim}=await sharp(result.textOverlayBuffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let left=dim.width,right=-1,top=dim.height,bottom=-1;
 for(let y=0;y<dim.height;y++)for(let x=0;x<dim.width;x++)if(rgba[(y*dim.width+x)*4+3]>=28){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 const bounds={left,top,width:right-left+1,height:bottom-top+1};
 assert(bounds.width<=Math.round((box.width-24)*.86));assert(bounds.height<=Math.round((box.height-24)*.78));
 assert(Math.abs(bounds.left+bounds.width/2-(box.left+box.width/2))<=1);assert(Math.abs(bounds.top+bounds.height/2-(box.top+box.height/2))<=1);
}
const animationPrompt=source.slice(source.indexOf('function buildAnimatedTextPanelPrompt'),source.indexOf('function splitAnimatedOverlayTitle'));
assert(animationPrompt.includes('The real product is the visual focus'));assert(animationPrompt.includes('generous line spacing'));assert(animationPrompt.includes('avoid heavy italic styling'));assert(animationPrompt.includes('never use heavy extrusion'));
await sharp(card).resize(540,960).toFile('/workspace/scratch/5f3579686467/end-card315-test.png');
console.log('v144.315: shifted atlas bounds, edge-to-edge background, alpha-isolated text, visible CTA centering, real logo/no-logo sender, airy centered animation typography and art-direction contracts passed.');

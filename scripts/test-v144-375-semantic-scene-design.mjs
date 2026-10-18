import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';
import {sceneHeadlineTreatment,SCENE_HEADLINE_BRIEF} from '../lib/videoSceneHeadline.js';
import {renderArtDirectedTypography} from '../lib/videoAdvertisingAssetPipeline.js';
const plan={family:'serif',support_family:'sans',layout:'stacked',lines:['Landkrabba','för en stund'],dominant_phrase:'Landkrabba',accent_phrase:'Landkrabba',primary:'#FFFFFF',accent:'#F5CC7D',weight:700,support_scale:.64};
const direction=JSON.stringify(plan),text=plan.lines.join(' ');
const t=sceneHeadlineTreatment(text,direction,'för en stund');
assert.deepEqual(t.lines,plan.lines);assert.equal(t.scaleForLine('Landkrabba'),1);assert.equal(t.scaleForLine('för en stund'),.64);
assert.equal(t.family,'Noto Serif');assert.equal(t.supportFamily,'Noto Sans');assert.equal(t.accentPhrase,'Landkrabba','explicit production direction supersedes an obsolete free-text emphasis');
const trailing={...plan,lines:['Gör plats för','din idé'],dominant_phrase:'din idé',accent_phrase:'din idé'};
const tt=sceneHeadlineTreatment(trailing.lines.join(' '),JSON.stringify(trailing));assert.equal(tt.scaleForLine('Gör plats för'),.64);assert.equal(tt.scaleForLine('din idé'),1);
const legacy=sceneHeadlineTreatment('Låt tröjan snacka','stacked bold','');assert.equal(legacy.scaleForLine('Låt'),1,'without semantic evidence, never guess significance from line length or order');
for(const bad of ['{incomplete',JSON.stringify({...plan,lines:['Missing','words']}),JSON.stringify({...plan,lines:['för en stund','Landkrabba']})]){
 const p=sceneHeadlineTreatment(text,bad);assert(p.lines===null||p.lines.join(' ')===text,'malformed directions remain deliverable without altering approved words');
}
const dark=await sharp({create:{width:1080,height:1920,channels:3,background:'#18252E'}}).png().toBuffer();
const output=await renderArtDirectedTypography({text,designDirection:direction,sceneDesign:true,backgroundBuffer:dark});
const {data,info}=await sharp(output).ensureAlpha().raw().toBuffer({resolveWithObject:true});
let a={count:0,minY:Infinity,maxY:-1},b={count:0,minY:Infinity,maxY:-1};
for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
 const i=(y*info.width+x)*4;if(data[i+3]<240)continue;
 let group=data[i]>235&&data[i+1]>190&&data[i+1]<220&&data[i+2]<160?a:data[i]>245&&data[i+1]>245&&data[i+2]>245?b:null;
 if(group){group.count++;group.minY=Math.min(group.minY,y);group.maxY=Math.max(group.maxY,y);}
}
assert(a.count>100&&b.count>100);assert(a.maxY-a.minY>(b.maxY-b.minY)*1.25,'actual colored hero glyphs are larger than the support, regardless of line order');
assert(a.maxY<b.minY,'approved reading order and line separation preserved');
for(const kind of ['cta','endcard_headline'])assert.deepEqual(await renderArtDirectedTypography({text,designDirection:direction,kind,sceneDesign:true}),await renderArtDirectedTypography({text,designDirection:direction,kind}),'new interpretation is confined to moving headlines');
assert(SCENE_HEADLINE_BRIEF.includes('BEFORE assigning size or color'));assert(SCENE_HEADLINE_BRIEF.includes('not a new object field'));
fs.mkdirSync('/tmp/spreelo-144375-qa',{recursive:true});await sharp(output).trim().png().toFile('/tmp/spreelo-144375-qa/semantic-headline.png');
console.log('PASS 144.375: planner explicitly selects semantic hero, exact groups, real bundled font pairing and palette; leading/trailing hero produces correct glyph-size hierarchy; invalid legacy plans never fail or rewrite copy; ending render paths unchanged.');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';
import {sceneHeadlineTreatment} from '../lib/videoSceneHeadline.js';
import {renderArtDirectedTypography,generateIndependentAdvertisingAssets} from '../lib/videoAdvertisingAssetPipeline.js';
const text='Bär hemmaplan',direction='Heavy stacked sans-serif #FFFFFF #F4C226',emphasis='hemmaplan';
const treatment=sceneHeadlineTreatment(text,direction,emphasis);
assert.deepEqual(treatment.lines,['Bär','hemmaplan']);assert.equal(treatment.scaleForLine('Bär',0),.68);assert.equal(treatment.scaleForLine('hemmaplan',1),1);
assert.equal(sceneHeadlineTreatment(text,'inline bold').stacked,false);
assert.equal(sceneHeadlineTreatment(text,'balanced serif').stacked,false);
assert.deepEqual(sceneHeadlineTreatment('Gör plats åt din idé','stacked','din idé').lines,['Gör plats åt','din idé']);
assert.equal(sceneHeadlineTreatment('Ett eget uttryck','stacked','missing phrase').lines,null,'invalid emphasis cannot remove or invent words');
const dark=await sharp({create:{width:1080,height:1920,channels:3,background:'#18212A'}}).png().toBuffer();
const args={text,designDirection:direction,emphasisText:emphasis,backgroundBuffer:dark};
const before=await renderArtDirectedTypography(args);
const after=await renderArtDirectedTypography({...args,sceneDesign:true});
assert.notDeepEqual(before,after);
const bounds=async b=>(await sharp(b).trim().png().toBuffer({resolveWithObject:true})).info;
assert((await bounds(after)).height>(await bounds(before)).height,'short moving phrase gains actual display hierarchy');
const {data,info}=await sharp(after).ensureAlpha().raw().toBuffer({resolveWithObject:true});
let white=0,gold=0;for(let i=0;i<data.length;i+=info.channels)if(data[i+3]>230){if(data[i]>245&&data[i+1]>245)white++;if(data[i]>235&&data[i+1]>170&&data[i+1]<210&&data[i+2]<80)gold++;}
assert(white>100&&gold>100,'chosen semantic accent survives in actual pixels');
assert.deepEqual(await renderArtDirectedTypography({...args,kind:'cta',sceneDesign:true}),await renderArtDirectedTypography({...args,kind:'cta'}),'scene flag cannot alter end-card invitation');
assert.deepEqual(await renderArtDirectedTypography({...args,kind:'endcard_headline',sceneDesign:true}),await renderArtDirectedTypography({...args,kind:'endcard_headline'}),'scene flag cannot alter end-card headline');
assert.notDeepEqual(after,await renderArtDirectedTypography({...args,sceneDesign:true,designDirection:'stacked elegant serif #FFFFFF #F4C226'}),'bundled serif and sans choices produce genuinely different letterforms');
for(const word of ['إطلالتك الخاصة','自分らしく着る','Bær din stil']){
 const b=await renderArtDirectedTypography({text:word,designDirection:'stacked bold #FFFFFF #F4C226',sceneDesign:true});assert((await bounds(b)).width>10);
}
let imageCalls=0;
const master=await sharp({create:{width:864,height:1536,channels:3,background:'#204545'}}).png().toBuffer();
const params={openai:{images:{generate:async()=>{imageCalls++;return {data:[{b64_json:master.toString('base64')}]};}}},model:'gpt-image-2.5-flare',headline:text,closingHeadline:'Eslöv följer med.',closingLine:'Se erbjudandet',renderEndCardMaster:true,sceneBackground:dark,creativeConcept:{scene_typography:direction,scene_emphasis:emphasis}};
const split=await generateIndependentAdvertisingAssets(params);
assert.equal(imageCalls,1);assert.deepEqual(split.headline,after,'production pipeline opts in only for moving headline');
assert.deepEqual(split.closingText,await renderArtDirectedTypography({text:params.closingLine,designDirection:'',kind:'cta',backgroundBuffer:split.endCard}));
fs.mkdirSync('/tmp/spreelo-144374-qa',{recursive:true});
for(const [name,b] of [['before',before],['after',after]])await sharp(await sharp(dark).composite([{input:await sharp(b).trim().resize({width:900,height:380,fit:'inside'}).png().toBuffer(),left:90,top:1280}]).png().toBuffer()).resize(540,960).png().toFile('/tmp/spreelo-144374-qa/'+name+'.png');
console.log('PASS 144.374: semantic display hierarchy, inline/balanced options, real bundled serif/sans difference, exact words and accents, multilingual rendering; production moving headline changes without extra image calls or end-card changes.');

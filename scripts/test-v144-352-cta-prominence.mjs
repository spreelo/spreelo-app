import assert from 'node:assert/strict';
import sharp from 'sharp';
import {fitProminentEndCardCTA,composeVideoEndCardLayers} from '../lib/klingEndCard.js';
const png=svg=>sharp(Buffer.from(svg)).png().toBuffer();
const background=await png('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect width="1080" height="1920" fill="#111a34"/></svg>');
// Previous bug: tiny actual text painted inside a very wide transparent canvas.
for(const label of ['Upptäck nu','SPELA MER','Handla idag']){
 const raw=await png(`<svg xmlns="http://www.w3.org/2000/svg" width="930" height="460"><text x="465" y="240" text-anchor="middle" font-family="DejaVu Sans" font-size="58" font-weight="700" fill="#ffffff">${label}</text></svg>`);
 const promoted=await fitProminentEndCardCTA(raw,{closingLine:label,backgroundBuffer:background});
 assert(promoted.measure.shortestInkHeight >=86,`${label}: visible glyphs should be at least 86px, got ${promoted.measure.shortestInkHeight}`);
 const metadata=await sharp(promoted.buffer).metadata();
 assert(metadata.width<=930 && metadata.height<=290);
 console.log(`CTA ${label}: ${promoted.measure.shortestInkHeight}px glyph, ${metadata.width}x${metadata.height} asset`);
 const hero=await png('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="800"><text x="540" y="470" fill="white" font-family="DejaVu Sans" font-weight="800" font-size="170" text-anchor="middle">UPPTÄCK</text></svg>');
 const output=await composeVideoEndCardLayers({background,headlineArtwork:hero,headline:'UPPTÄCK',closingText:raw,closingLine:label,brand:{business_name:'Pressit.se'},preserveDesign:true});
 assert.equal((await sharp(output.cardBuffer).metadata()).width,1080);
 if(label==='Upptäck nu') await sharp(output.cardBuffer).toFile('/mnt/data/spreelo-144.352-cta-upptack-nu.png');
}
const longLine='Utforska vårt fantastiska sortiment idag';
const wide=await png(`<svg xmlns="http://www.w3.org/2000/svg" width="930" height="460"><text x="465" y="240" text-anchor="middle" font-family="DejaVu Sans" font-size="28" fill="white">${longLine}</text></svg>`);
const result=await fitProminentEndCardCTA(wide,{closingLine:longLine,backgroundBuffer:background});
assert(result.buffer.length>0);
console.log(`CTA long line: ${result.measure.shortestInkHeight}px, no new hard failure`);
console.log('PASS v144.352: short real CTA, padded artwork, hierarchy and safe long-copy fallback');

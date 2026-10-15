import assert from 'node:assert/strict';
import sharp from 'sharp';
import { composeVideoEndCardLayers } from '../lib/klingEndCard.js';

const png=svg=>sharp(Buffer.from(svg)).png().toBuffer();
const bg=await png(`<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg"><rect width="1080" height="1920" fill="#101932"/><path d="M0 300L290 0H400L0 440" fill="#007aff" opacity=".25"/><path d="M800 1920L1080 1500V1650L940 1920" fill="#ad2dff" opacity=".4"/></svg>`);
const headline=await png(`<svg width="1400" height="1024" xmlns="http://www.w3.org/2000/svg"><text x="700" y="420" text-anchor="middle" fill="#ffffff" font-size="160" font-weight="800" font-family="DejaVu Sans">UPPTÄCK</text><text x="700" y="610" text-anchor="middle" fill="#2de1f0" font-size="155" font-weight="800" font-family="DejaVu Sans">KRAFTEN</text></svg>`);
const cta=await png(`<svg width="1400" height="1024" xmlns="http://www.w3.org/2000/svg"><text x="700" y="550" text-anchor="middle" fill="#da82ff" font-size="125" font-weight="800" font-family="DejaVu Sans">SPELA MER</text></svg>`);
const common={background:bg,headlineArtwork:headline,headline:'UPPTÄCK KRAFTEN',closingText:cta,closingLine:'SPELA MER',brand:{business_name:'POWER'},hasLogo:false,preserveDesign:true};
const hier=await composeVideoEndCardLayers({...common,productLabel:'Lenovo Legion 5'});
const noProduct=await composeVideoEndCardLayers({...common,productLabel:'A complete and extremely excessively long product name that should never be shrunk'});
const old=await composeVideoEndCardLayers({background:bg,closingText:cta,closingLine:'SPELA MER',brand:{business_name:'POWER'},hasLogo:false,preserveDesign:true});
for(const output of [hier,noProduct,old]) {
  const meta=await sharp(output.cardBuffer).metadata();
  assert.equal(meta.width,1080);assert.equal(meta.height,1920);
  assert((await sharp(output.foregroundBuffer).stats()).channels[3].max>230);
}
assert.notDeepEqual(hier.cardBuffer,old.cardBuffer,'existing artwork must become a distinct hierarchy');
assert.notDeepEqual(hier.cardBuffer,noProduct.cardBuffer,'verified short product eyebrow should be visible');
const missingHero=await composeVideoEndCardLayers({...common,headlineArtwork:null});
assert.deepEqual(missingHero.cardBuffer,old.cardBuffer,'old single-CTA fallback must remain exact');
// Malformed hero asset must NOT turn an otherwise renderable customer ad into a failure.
const corrupt=await composeVideoEndCardLayers({...common,headlineArtwork:Buffer.from('invalid-image')});
assert.deepEqual(corrupt.cardBuffer,old.cardBuffer);
const tinyHero=await png(`<svg width="930" height="200" xmlns="http://www.w3.org/2000/svg"><text x="465" y="100" text-anchor="middle" fill="white" font-size="13" font-family="DejaVu Sans">UPPTÄCK KRAFTEN</text></svg>`);
const heroRescued=await composeVideoEndCardLayers({...common,headlineArtwork:tinyHero});
assert.equal((await sharp(heroRescued.cardBuffer).metadata()).height,1920);
const tinyCta=await png(`<svg width="930" height="200" xmlns="http://www.w3.org/2000/svg"><text x="465" y="100" text-anchor="middle" fill="white" font-size="14" font-family="DejaVu Sans">SPELA MER</text></svg>`);
const rescued=await composeVideoEndCardLayers({...common,closingText:tinyCta});
assert.equal((await sharp(rescued.cardBuffer).metadata()).width,1080);
if(process.env.SPREELO_WRITE_TEST_ARTIFACT==='1') await sharp(hier.cardBuffer).toFile('/mnt/data/spreelo-144.351-endcard-test.png');
console.log('PASS v144.351: deliberate hook/CTA hierarchy, verified eyebrow, long name safely skipped, previous-card fallback, corrupt artwork fallback, miniature headline and CTA recovery');

import sharp from 'sharp';
import { separateCommercialWebsite } from './videoCommercialConcept.js';
import { renderArtDirectedTypography } from './videoAdvertisingAssetPipeline.js';
import { measureAdvertisingTypography } from './videoTypographyPreflight.js';
import { END_CARD_LAYOUT_POLICY } from './videoEndCardBrief.js';

const W=1080,H=1920;
const empty=()=>sharp({create:{width:W,height:H,channels:4,background:'#00000000'}});
async function fitInk(buffer,width,height) {
  return sharp(buffer).ensureAlpha().trim({background:'#00000000',threshold:8})
    .resize({width,height,fit:'inside'}).png().toBuffer();
}
async function inkHeight(buffer) {
  const meta=await sharp(buffer).metadata();
  const canvas=await empty().composite([{input:buffer,left:Math.round((W-meta.width)/2),top:480}]).png().toBuffer();
  const measured=await measureAdvertisingTypography(canvas);
  return Math.max(1,...measured.bands.map(b=>b.height));
}
export async function composeDominantEndCard({backgroundBuffer,headline,closingLine,designDirection='',brand={},websiteUrl='',emphasisText=''}) {
  const separated=separateCommercialWebsite(closingLine,websiteUrl||brand.website_url);
  closingLine=separated.invitation;
  const hero=await fitInk(await renderArtDirectedTypography({text:headline,kind:'endcard_headline',designDirection,brand,backgroundBuffer,emphasisText}),930,580);
  const hm=await sharp(hero).metadata(),heroInk=await inkHeight(hero);
  const layout={policy:END_CARD_LAYOUT_POLICY,eyebrow:null,sender:null,headline:null,closing:null,website:null,
    box:{left:70,top:480,width:940,height:1000},copy:{headline,invitation:closingLine,website:separated.domain}};
  const overlays=[];
  let y=560;
  const place=async(buffer,key)=>{
    const meta=await sharp(buffer).metadata(),left=Math.round((W-meta.width)/2);
    layout[key]={left,top:y,width:meta.width,height:meta.height};
    overlays.push({input:buffer,left,top:y});return meta.height;
  };
  y+=await place(hero,'headline');
  layout.headline.ink=heroInk;layout.headline.widthRatio=hm.width/W;
  if(String(closingLine||'').trim()) {
    y+=115;
    let cta=await fitInk(await renderArtDirectedTypography({text:closingLine,kind:'endcard_cta',designDirection,brand,backgroundBuffer}),850,190);
    const cap=Math.min(100,heroInk*.62),actual=await inkHeight(cta);
    if(actual>cap){const m=await sharp(cta).metadata();cta=await sharp(cta).resize({width:Math.max(1,Math.round(m.width*cap/actual)),height:Math.max(1,Math.round(m.height*cap/actual)),fit:'fill'}).png().toBuffer();}
    y+=await place(cta,'closing');
  }
  const domain=separated.domain;
  if(domain){
    y+=36;
    const website=await fitInk(await renderArtDirectedTypography({text:domain,kind:'endcard_website',designDirection,brand,backgroundBuffer}),720,53);
    y+=await place(website,'website');
  }
  // Translate as one group when needed; never shrink the dominant typography.
  const shift=Math.max(0,y-1480);
  if(shift){for(const layer of overlays)layer.top-=shift;for(const key of ['headline','closing','website'])if(layout[key])layout[key].top-=shift;}
  const foregroundBuffer=await empty().composite(overlays).png().toBuffer();
  const cardBuffer=await sharp(backgroundBuffer).composite([{input:foregroundBuffer}]).png().toBuffer();
  return {backgroundBuffer,foregroundBuffer,cardBuffer,layout,hasSender:false};
}

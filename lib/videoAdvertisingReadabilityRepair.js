import sharp from 'sharp';
import { escapeProductSvg } from './globalProductTypography.js';

// v144.349: a KNOWN, visually reviewed failure should cause a real layout and
// contrast change to the ALREADY-APPROVED wording; no new paid image/video
// request. This is NOT a bypass of the visual reviewer.
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const lum=(r,g,b)=>{const linear=x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;};return .2126*linear(r)+.7152*linear(g)+.0722*linear(b);};
const contrast=(a,b)=>(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
const fixable=new Set(['low_contrast','too_small','wrong_alignment','poor_hierarchy','unfinished_end_card']);
export function isLocallyRepairableReview(error) {
  return error?.code==='VIDEO_ADVERTISING_DESIGN_REJECTED' && fixable.has(error?.review?.issue);
}

async function sampleArea(buffer,area) {
  // Sharp only honors the LAST resize in one pipeline. Normalize first,
  // then crop/sample in a second pipeline, otherwise large boxes can fail.
  const normalized=await sharp(buffer).rotate().resize(1080,1920,{fit:'cover'}).png().toBuffer();
  const box={left:clamp(Math.round(area.left),0,1060),top:clamp(Math.round(area.top),0,1900),
    width:clamp(Math.round(area.width),20,1080-clamp(Math.round(area.left),0,1060)),
    height:clamp(Math.round(area.height),20,1920-clamp(Math.round(area.top),0,1900))};
  const {data}=await sharp(normalized).extract(box).removeAlpha().resize(12,8,{fit:'fill'}).raw().toBuffer({resolveWithObject:true});
  const result=[];for(let i=0;i<data.length;i+=3)result.push(lum(data[i],data[i+1],data[i+2]));
  return result;
}
function balancedLines(text,font,maxWidth,maxLines) {
  // Real type is later measured using Sharp's alpha bounds before being placed;
  // this first pass just chooses readable word breaks, never truncates the copy.
  const words=String(text||'').trim().split(/\s+/).filter(Boolean);
  const lines=[];let current='';
  const approxWidth=v=>[...v].reduce((n,c)=>n+(c===' '?0.31:/[MWÅÄÖmw]/.test(c)?0.84:/[ilI.,!]/.test(c)?0.32:0.61),0)*font;
  for(const word of words){
    if(approxWidth(word)>maxWidth) return null;
    const next=current?`${current} ${word}`:word;
    if(current && approxWidth(next)>maxWidth){lines.push(current);current=word;}else current=next;
  }
  if(current)lines.push(current);
  return lines.length<=maxLines?lines:null;
}

export async function renderReadableAdvertisingLettering({text,backgroundFrames=[],box,designDirection='',brand={},variant=0,minFontSize=68,canvasWidth=1080,canvasHeight=1920}) {
  const copy=String(text||'').trim();
  if(!copy || copy.length>160)throw new Error('Readability repair requires complete, concise approved copy');
  const safe={left:clamp(Math.round(box?.left??72),20,canvasWidth-100),
    top:clamp(Math.round(box?.top??1270),20,canvasHeight-120),
    width:Math.round(box?.width??936),height:Math.round(box?.height??330)};
  safe.width=clamp(safe.width,100,canvasWidth-safe.left-20);
  safe.height=clamp(safe.height,120,canvasHeight-safe.top-20);
  const editorial=/\b(editorial|elegant|serif|fashion|elegans|lyx)\b/i.test(designDirection);
  const font=editorial?'DejaVu Serif, Liberation Serif, serif':'DejaVu Sans, Liberation Sans, sans-serif';
  const maxWidth=safe.width-40;
  let chosen;
  for(let size=Math.min(138,Math.floor(safe.height/2.4));size>=minFontSize;size-=2){
    const lines=balancedLines(copy,size,maxWidth,4);
    if(lines && (lines.length*size*1.2+16)<=safe.height && lines.length>0){chosen={size,lines};break;}
  }
  if(!chosen)throw Object.assign(new Error('Approved advertising copy cannot meet the minimum font size in the verified text region; requires a larger safe text region'),{code:'TYPOGRAPHY_COPY_CANNOT_FIT'});
  const backgroundValues=[];
  for(const frame of backgroundFrames.slice(0,4)){
    // Frames used here are the ones the advertising text will appear over.
    if(frame)backgroundValues.push(...await sampleArea(frame,safe));
  }
  const colors=[[255,255,255],[15,27,46]];
  const scores=colors.map(c=>backgroundValues.length?
    backgroundValues.reduce((sum,b)=>sum+Math.min(8,contrast(lum(...c),b)),0)/backgroundValues.length:0);
  let index=variant%2===1 ? (scores[0]>=scores[1]?1:0) : (scores[0]>=scores[1]?0:1);
  const fill=index===0?'#FFFFFF':'#0F1B2E';
  const outer=index===0?'#101C34':'#FFFFFF';
  const lineHeight=chosen.size*1.2;
  const baseline=safe.top+(safe.height-chosen.lines.length*lineHeight)/2+chosen.size;
  const x=safe.left+safe.width/2;
  const lines=chosen.lines.map((line,i)=>`<text x="${x}" y="${Math.round(baseline+i*lineHeight)}" text-anchor="middle" font-family="${font}" font-size="${chosen.size}" font-weight="${editorial?700:800}" fill="${fill}" stroke="${outer}" stroke-width="${variant%2===0?4:5}" stroke-opacity="0.88" paint-order="stroke fill">${escapeProductSvg(line)}</text>`).join('');
  // No panel, opaque card, generic banner, independent decoration or new logo.
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}">${lines}</svg>`;
  const buffer=await sharp(Buffer.from(svg)).png().toBuffer();
  const {data,info}=await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let minX=info.width,minY=info.height,maxX=-1,maxY=-1;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>40){minX=Math.min(x,minX);maxX=Math.max(x,maxX);minY=Math.min(y,minY);maxY=Math.max(y,maxY);}
  if(maxX<minX || minX<safe.left-4 || maxX>safe.left+safe.width+4 || minY<safe.top-5 || maxY>safe.top+safe.height+5)throw Object.assign(new Error('Readability repair would overflow the verified scene-safe text region'),{code:'TYPOGRAPHY_LAYOUT_OVERFLOW'});
  return {buffer,analysis:{source:'local_art_directed_readability_repair',fontSize:chosen.size,lines:chosen.lines.length,ink:fill,textBounds:{left:minX,top:minY,width:maxX-minX+1,height:maxY-minY+1},box:safe,variant}};
}

export async function repairReviewedAdvertising({error,frames,headline,box,designDirection,brand,verify,renderEndCard,closingLine}) {
  if(!isLocallyRepairableReview(error))throw error;
  let last=error;
  for(let variant=0;variant<2;variant++) {
    const overlay=await renderReadableAdvertisingLettering({text:headline,backgroundFrames:frames,box,designDirection,brand,variant});
    // The CTA is likewise exact, legible vector lettering from the SAME
    // individual creative direction, not a generic preselected layout asset.
    const endCard=await renderEndCard({variant,closingLine,designDirection,brand,issue:last?.review?.issue||null,reason:last?.review?.reason||''});
    try {
      const review=await verify({overlay:overlay.buffer,endCard:endCard.cardBuffer});
      return {overlay:overlay.buffer,endCard,review,repair:overlay.analysis};
    }catch(next){last=next;if(!isLocallyRepairableReview(next))throw next;}
  }
  const blocked=Object.assign(new Error(`Scene-aware local design correction was reviewed and still failed: ${last.message}`),{
    code:'LOCAL_TYPOGRAPHY_REPAIR_REJECTED',cause:last,review:last.review,
  });
  throw blocked;
}

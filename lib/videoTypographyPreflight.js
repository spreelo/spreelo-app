import sharp from 'sharp';
import { renderReadableAdvertisingLettering } from './videoAdvertisingReadabilityRepair.js';

// v144.350: Design bounds are measured on the ACTUAL 1080x1920 alpha
// typography asset after resizing/placement, before any final provider render.
// Keep the AI art if it is already legible. Never silently shrink the copy.
export const REEL_MAIN_MIN_INK_PX = 46;
export const REEL_CTA_MIN_INK_PX = 38;

export function measureStrongInkRows(rowInkCounts, { minInkPerRow = 8, joinGap = 11 } = {}) {
  const bands = [];
  let start = -1, end = -1;
  for (let y = 0; y < rowInkCounts.length; y++) {
    if ((rowInkCounts[y] || 0) < minInkPerRow) continue;
    if (start < 0) { start = y; end = y; continue; }
    if (y - end <= joinGap + 1) { end = y; continue; }
    bands.push({ top: start, height: end - start + 1, inkPixels: Array.from(rowInkCounts.slice(start,end+1)).reduce((a,b)=>a+b,0) });
    start = y; end = y;
  }
  if (start >= 0) bands.push({top: start, height: end - start + 1, inkPixels: Array.from(rowInkCounts.slice(start,end+1)).reduce((a,b)=>a+b,0)});
  // A one-pixel decorative line is not a line of text.
  const candidates=bands.filter(band => band.height >= 12);
  const largestInk=Math.max(0,...candidates.map(b=>b.inkPixels));
  // Detached diacritics and punctuation cannot be treated as a separate
  // miniature headline. A short real subtitle still has substantial ink.
  return candidates.filter(band => band.inkPixels >= largestInk*.07);
}

export async function measureAdvertisingTypography(buffer, { minInkPx = REEL_MAIN_MIN_INK_PX } = {}) {
  const {data,info}=await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(info.width!==1080||info.height!==1920) throw new Error('Typography legibility requires the final 1080x1920 canvas');
  const rows=new Int32Array(info.height);
  for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) if(data[(y*info.width+x)*info.channels+3]>135)rows[y]++;
  const bands=measureStrongInkRows(rows,{minInkPerRow:Math.max(8,Math.round(info.width*.007))});
  const shortest=bands.length ? Math.min(...bands.map(b=>b.height)) : 0;
  return {passed:shortest>=minInkPx,shortestInkHeight:shortest,minInkPx,bands};
}

// v144.353: Compose visually in the ACTUAL scene-safe text box. Ratios are
// relative to the available box, not absolute glyph pixels. A tiny rendered
// AI/text source is expanded from its visible alpha bounds, never from a
// transparent padded atlas. This happens BEFORE provider rendering.
export async function composeCommercialHeadline({overlay,box,text,backgroundFrames=[],designDirection='',brand={},targetWidthRatio=0.77}) {
  const left=Math.max(0,Math.min(1070,Math.round(box?.left ?? 72)));
  const top=Math.max(0,Math.min(1900,Math.round(box?.top ?? 1250)));
  const width=Math.max(1,Math.min(1080-left,Math.round(box?.width ?? 936)));
  const height=Math.max(1,Math.min(1920-top,Math.round(box?.height ?? 330)));
  const {data,info}=await sharp(overlay).resize(1080,1920,{fit:'fill'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let x0=1080,y0=1920,x1=-1,y1=-1,ink=0;
  for(let y=0;y<1920;y++)for(let x=0;x<1080;x++)if(data[(y*1080+x)*info.channels+3]>85){
    x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);ink++;
  }
  const wantWidth=width*Math.max(.55,Math.min(.84,targetWidthRatio));
  const maxHeight=height*.88;
  if(x1>=x0 && ink>170) {
    const actualWidth=x1-x0+1,actualHeight=y1-y0+1;
    if(actualWidth>=width*.45 && actualWidth<=width*.96 && actualHeight>=height*.18 && actualHeight<=height*.94) {
      return {buffer:overlay,locallyRebuilt:false,composition:{method:'existing_art',widthRatio:actualWidth/width}};
    }
    const trimmed=await sharp(overlay).extract({left:x0,top:y0,width:actualWidth,height:actualHeight}).png().toBuffer();
    const factor=Math.min(wantWidth/actualWidth,maxHeight/actualHeight);
    if(Number.isFinite(factor)&&factor>0){
      const rw=Math.max(1,Math.round(actualWidth*factor));
      const rh=Math.max(1,Math.round(actualHeight*factor));
      const scaled=await sharp(trimmed).resize(rw,rh).png().toBuffer();
      const newX=left+Math.round((width-rw)/2),newY=top+Math.round((height-rh)/2);
      if(newX>=0&&newY>=0&&newX+rw<=1080&&newY+rh<=1920&&rw>=width*.42&&rh>=height*.21){
        const buffer=await sharp({create:{width:1080,height:1920,channels:4,background:'#00000000'}})
          .composite([{input:scaled,left:newX,top:newY}]).png().toBuffer();
        return {buffer,locallyRebuilt:true,composition:{method:'visible_artwork_proportional_fit',widthRatio:rw/width}};
      }
    }
  }
  // Deterministic exact-copy design fallback. Never rerun Kling or GPT Image
  // because of letter size. If text cannot be fitted, propagate a true layout
  // issue rather than publish cropped or inaccurate wording.
  const rebuilt=await renderReadableAdvertisingLettering({text,backgroundFrames,box:{left,top,width,height},designDirection,brand,minFontSize:Math.max(36,Math.floor(height*.11))});
  return {buffer:rebuilt.buffer,locallyRebuilt:true,composition:{method:'exact_vector_proportional_fit'},rebuildAnalysis:rebuilt.analysis};
}

export async function ensurePreflightAdvertisingTypography({overlay,backgroundFrames=[],box,text,designDirection='',brand={},minInkPx=REEL_MAIN_MIN_INK_PX}) {
  const fitted=await composeCommercialHeadline({overlay,box,text,backgroundFrames,designDirection,brand});
  // A diagnostic only: this does not create a second subjective rejection gate.
  const measured=await measureAdvertisingTypography(fitted.buffer,{minInkPx});
  return {...fitted,measure:measured};
}

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

export async function ensurePreflightAdvertisingTypography({overlay,backgroundFrames=[],box,text,designDirection='',brand={},minInkPx=REEL_MAIN_MIN_INK_PX}) {
  const measured=await measureAdvertisingTypography(overlay,{minInkPx});
  if(measured.passed) return {buffer:overlay,measure:measured,locallyRebuilt:false};
  const repaired=await renderReadableAdvertisingLettering({text,backgroundFrames,box,designDirection,brand,minFontSize:Math.max(68,Math.ceil(minInkPx*1.5))});
  const checked=await measureAdvertisingTypography(repaired.buffer,{minInkPx});
  if(!checked.passed){const error=new Error(`Typography failed the ${minInkPx}px ink-height contract after local reconstruction`);error.code='TYPOGRAPHY_MINIMUM_NOT_MET';throw error;}
  return {buffer:repaired.buffer,measure:checked,locallyRebuilt:true,rebuildAnalysis:repaired.analysis};
}

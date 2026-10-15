import sharp from "sharp";
import { ensureTypographyContrast } from "./animatedTypographyQuality.js";
import { VIDEO_ART_DIRECTION, videoSenderLabel } from "./videoArtDirection.js";
import { escapeProductSvg } from "./globalProductTypography.js";

export const KLING_END_CARD_SECONDS = 1.5;
export const KLING_END_CARD_TRANSITION_SECONDS = 0.4;
// One paid image request supplies a background and two independent text assets.
// Actual alpha bounds, rather than a blind fixed cut, isolate the background.
export function buildKlingAdvertisingAtlasPrompt({ headline, subheadline, closingLine, designDirection, brand = {}, hasLogo }) {
  const context = JSON.stringify({ name: brand.business_name || "", industry: brand.industry || brand.business_category || "",
    identity: brand.brand_colors || brand.colors || brand.primary_color || brand.visual_identity || "", audience: brand.target_audience || "",
    description: String(brand.brand_description || brand.description || brand.business_description || "").slice(0, 800) });
  return `Create ONE 1536x1024 RGBA production asset atlas for a premium short social product commercial.
References are actual FINISHED video frames and possibly the verified product image. Company context: ${context}.
THREE independent assets, no labels, borders, dividers or artwork crossing between areas:
LEFT x=0..575, y=0..1023: ONLY an opaque vertical 9:16 BACKGROUND, exactly 576x1024. Fill to every edge. Design for THIS business, product, campaign and finished-video mood: relevant restrained tonal shapes, subtle textures or geometry, with variation between posts. No generic default pink waves. Keep the central 80% of the width between y=350..720 calm and uninterrupted for a cohesive CTA group added later. Keep the top-left logo corner calm too. Keep decorative lines and shapes near the outer edges. NO text, letters, stars, emblems, rules, logos, company name, people or products anywhere in this background. No website address, button, price, invented claim. No product-photo freeze frame.
RIGHT TOP x=636..1475, y=70..500: ONLY transparent main-message typography. Exact headline ${JSON.stringify(headline)}. ${subheadline ? `Exact subheadline ${JSON.stringify(subheadline)}.` : "No subheadline."} Act as a senior advertising art director for THIS scene. Make the main phrase visually dominant at its actual mobile-video size: strong letterform character and intentional scale, not a small subtitle or default thin floating font. Give a subordinate lighter line only when supplied. Choose original, scene-appropriate type composition, line-height, palette and restrained accents. Preserve full letters and diacritics; no stray vertical bars, left-edge strokes, decorative dividers, bounding rectangles, drop-shadow slabs or ornaments. Leave the product itself uncovered. Avoid generic extra-bold ALL lines, thick outlines or heavy shadows.
RIGHT BOTTOM x=636..1510, y=660..982: ONLY prominent transparent closing-line typography: ${JSON.stringify(closingLine)}. Individually CENTER every visible line within the text group. Balance one or two lines, intentional spacing, high contrast for the LEFT background. Match the main-message font character; the typography must feel like the same commercial. Confident, deliberately art-directed advertising lettering with a strong CTA hierarchy and clear mobile presence, harmonized with the real headline. No added stars, ornaments, underlines, emblems, surrounding strokes or spurious isolated lines. The compositor will center the actual visible lettering in the final end card; do not place it on the background.
The ENTIRE RIGHT area x=576..1535 must have alpha=0 outside actual letters. Leave the horizontal gap y=520..650 completely transparent. No plates, panels, shadows, haze, glow, checkerboards or background wash. No CTA repeated in the top area or main headline repeated in the bottom area.
${hasLogo ? "Do NOT draw the logo; the authentic logo is added in code." : `Do not render the exact company name ${JSON.stringify(brand.business_name || "")} in any asset; the compositor adds it separately as the sender. Do NOT invent a logo.`}
${VIDEO_ART_DIRECTION}
Art direction: ${designDirection || "Choose a distinctive polished advertising treatment appropriate to this business and product."}
Output this single atlas only. The background is text-free; both lettering groups are independently transparent.`;
}

async function trimLettering(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left=info.width, top=info.height, right=-1, bottom=-1;
  for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) if(data[(y*info.width+x)*4+3]>=28) {
    left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  return right<left ? null : sharp(buffer).extract({left,top,width:right-left+1,height:bottom-top+1}).png().toBuffer();
}

export async function splitKlingAdvertisingAtlas(buffer) {
  const atlas = await sharp(buffer).resize(1536,1024,{fit:"fill"}).ensureAlpha().png().toBuffer();
  const {data}=await sharp(atlas).raw().toBuffer({resolveWithObject:true});
  // Find the contiguous opaque background even if the provider shifts its edge.
  // Transparent gutters must never become pale strips after flattening.
  let bestLeft=0,bestWidth=0,run=-1;
  for(let x=0;x<=768;x++) {
    let count=0;if(x<768) for(let y=0;y<1024;y++) if(data[(y*1536+x)*4+3]>=240) count++;
    if(count>=1024*.7) {if(run<0)run=x;} else if(run>=0) {
      if(x-run>bestWidth){bestLeft=run;bestWidth=x-run;}run=-1;
    }
  }
  // Soft fallback retains existing no-extra-request behavior for opaque output.
  if(bestWidth<200||bestWidth>=740){bestLeft=0;bestWidth=576;}
  let top=1024,bottom=-1;
  for(let y=0;y<1024;y++) {
    let count=0;for(let x=bestLeft;x<bestLeft+bestWidth;x++) if(data[(y*1536+x)*4+3]>=240)count++;
    if(count>=bestWidth*.95){top=Math.min(top,y);bottom=y;}
  }
  if(bottom<top){top=0;bottom=1023;}
  const backgroundBounds={left:bestLeft,top,width:bestWidth,height:bottom-top+1};
  const rightStart=Math.max(576,bestLeft+bestWidth);
  const rightWidth=1536-rightStart;
  // Locate a transparent horizontal gutter close to the intended separator.
  let separator=600,nearest=Infinity;
  for(let y=520;y<=650;y++) {
    let count=0;for(let x=rightStart;x<1536;x++)if(data[(y*1536+x)*4+3]>=28)count++;
    if(count===0 && Math.abs(y-600)<nearest){separator=y;nearest=Math.abs(y-600);}
  }
  return {
    backgroundBounds,
    headline: await sharp(atlas).extract({left:rightStart,top:0,width:rightWidth,height:separator}).png().toBuffer(),
    closingText: await trimLettering(await sharp(atlas).extract({left:rightStart,top:separator,width:rightWidth,height:1024-separator}).png().toBuffer()),
    endCard: await sharp(atlas).extract(backgroundBounds).flatten({background:"#f4f1ed"}).resize(1080,1920,{fit:"cover",position:"centre"}).png().toBuffer(),
  };
}

// Quiet the center using a feathered blur of the SAME background, preserving
// its palette and outer design while preventing strokes beside the real logo.
async function quietEndCardCenter(buffer) {
  const mask=Buffer.from('<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg"><rect x="100" y="350" width="880" height="1120" rx="180" fill="white"/></svg>');
  const alpha=await sharp(mask).blur(55).png().toBuffer();
  const softened=await sharp(buffer).blur(65).ensureAlpha().composite([{input:alpha,blend:"dest-in"}]).png().toBuffer();
  return sharp(buffer).composite([{input:softened}]).png().toBuffer();
}

// Center each actual lettering line, not the padded canvas or only the widest
// line. Merge tiny row gaps so dots/accents remain attached to their letters.
export async function centerClosingLettering(buffer) {
  const trimmed = await trimLettering(buffer);
  if (!trimmed) return null;
  const scaled = await sharp(trimmed).resize({width:930,height:460,fit:"inside"}).png().toBuffer();
  const {data,info} = await sharp(scaled).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const runs=[]; let start=-1;
  for(let y=0;y<=info.height;y++) {
    let visible=false;
    if(y<info.height) for(let x=0;x<info.width;x++) if(data[(y*info.width+x)*4+3]>=28) {visible=true;break;}
    if(visible && start<0) start=y;
    if(!visible && start>=0) {runs.push({top:start,bottom:y-1});start=-1;}
  }
  const bands=[];
  for(const run of runs) {
    const last=bands.at(-1);
    if(last && run.top-last.bottom<=Math.max(8,Math.round(info.height*.025))) last.bottom=run.bottom;
    else bands.push({...run});
  }
  const layers=[];
  for(const band of bands) {
    let left=info.width,right=-1;
    for(let y=band.top;y<=band.bottom;y++) for(let x=0;x<info.width;x++) if(data[(y*info.width+x)*4+3]>=28) {left=Math.min(left,x);right=Math.max(right,x);}
    if(right>=left) layers.push({input:await sharp(scaled).extract({left,top:band.top,width:right-left+1,height:band.bottom-band.top+1}).png().toBuffer(),left:Math.round((930-(right-left+1))/2),top:band.top});
  }
  return sharp({create:{width:930,height:info.height,channels:4,background:'#00000000'}}).composite(layers).png().toBuffer();
}

export async function composeVideoEndCardLayers({background,closingText,closingLine,brand={},logoBuffer=null,hasLogo=Boolean(logoBuffer),language="",preserveDesign=false}) {
  // Keep the art-directed GPT Image background intact. A blanket center blur
  // erased scene-specific detail and reduced every end card to a generic wash.
  const backgroundBuffer=await sharp(background).resize(1080,1920,{fit:"cover"}).png().toBuffer();
  const {data}=await sharp(backgroundBuffer).resize(1,1).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const ink=(.2126*data[0]+.7152*data[1]+.0722*data[2])>165 ? "#171724" : "#ffffff";
  let lettering=closingText;
  if(!lettering) {
    // Legacy Kling recovery only; animation rejects missing AI lettering.
    const words=String(closingLine||"").split(/\s+/).filter(Boolean),lines=[];let line="";
    for(const word of words){if((line+" "+word).trim().length>22&&line){lines.push(line);line=word;}else line=(line+" "+word).trim();}if(line)lines.push(line);
    lettering=await sharp(Buffer.from(`<svg width="960" height="420" xmlns="http://www.w3.org/2000/svg">${lines.slice(0,3).map((v,i)=>`<text x="480" y="${100+i*110}" text-anchor="middle" font-family="DejaVu Sans,sans-serif" font-weight="600" font-size="82" fill="${ink}">${escapeProductSvg(v)}</text>`).join("")}</svg>`)).png().toBuffer();
  }
  const text=await centerClosingLettering(lettering);
  if(!text) throw new Error("End card contains no visible closing message");
  const meta=await sharp(text).metadata();
  // The sender is part of the SAME centered group, close below the CTA.
  // The real logo is a separate persistent corner overlay, never baked here.
  const sender=hasLogo ? "" : videoSenderLabel(brand.business_name,language || brand.content_language || brand.language);
  const senderHeight=sender ? 82 : 0;
  const groupHeight=meta.height+senderHeight;
  const textTop=Math.round(960-groupHeight/2);
  if(meta.width < 300 || meta.height < 65) throw new Error("Advertising closing line is too small for a mobile end card");
  const layers=[{input:text,left:75,top:textTop}];
  if(sender) layers.push({input:Buffer.from(`<svg width="1080" height="82" xmlns="http://www.w3.org/2000/svg"><text x="540" y="58" text-anchor="middle" fill="${ink}" opacity=".76" font-family="DejaVu Sans,sans-serif" font-size="${Math.min(38,1550/Math.max(1,sender.length))}" font-weight="400">${escapeProductSvg(sender)}</text></svg>`),left:0,top:textTop+meta.height+8});
  const rawForeground=await sharp({create:{width:1080,height:1920,channels:4,background:'#00000000'}}).composite(layers).png().toBuffer();
  const {buffer:foregroundBuffer}=await ensureTypographyContrast({overlayBuffer:rawForeground,backgroundBuffers:[backgroundBuffer],textBox:{left:64,top:650,width:952,height:650},preserveDesign});
  return {backgroundBuffer,foregroundBuffer,cardBuffer:await sharp(backgroundBuffer).composite([{input:foregroundBuffer}]).png().toBuffer()};
}
export async function composeKlingAdvertisingEndCard(options) {
  return (await composeVideoEndCardLayers(options)).cardBuffer;
}
// Compatibility helper for callers explicitly producing a standalone still.
export async function composeKlingEndCardLogo(buffer, logoBuffer) {
  if(!logoBuffer) return buffer;
  const logo=await sharp(logoBuffer).rotate().trim({threshold:10}).resize({width:220,height:100,fit:"inside",withoutEnlargement:true}).png().toBuffer();
  return sharp(buffer).composite([{input:logo,left:78,top:207}]).png().toBuffer();
}
export async function buildFallbackKlingEndCardLayers({brand={},closingLine,logoBuffer=null,language=""}) {
  const color=/^#[0-9a-f]{6}$/i.test(String(brand.primary_color||"")) ? brand.primary_color : "#26234c";
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect width="1080" height="1920" fill="${color}"/><path d="M0 1500 Q540 1230 1080 1590 L1080 1920 L0 1920 Z" fill="white" opacity=".05"/></svg>`;
  return composeVideoEndCardLayers({background:await sharp(Buffer.from(svg)).png().toBuffer(),closingLine,brand,logoBuffer,language});
}
export async function buildFallbackKlingEndCard(options) {
  return (await buildFallbackKlingEndCardLayers(options)).cardBuffer;
}

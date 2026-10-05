import sharp from "sharp";
import { escapeProductSvg } from "./globalProductTypography.js";

export const KLING_END_CARD_SECONDS = 1.3;
export const KLING_END_CARD_TRANSITION_SECONDS = 0.3;
// One paid image request supplies a background and two independent text assets.
// Actual alpha bounds, rather than a blind fixed cut, isolate the background.
export function buildKlingAdvertisingAtlasPrompt({ headline, subheadline, closingLine, designDirection, brand = {}, hasLogo }) {
  const context = JSON.stringify({ name: brand.business_name || "", industry: brand.industry || brand.business_category || "",
    identity: brand.brand_colors || brand.colors || brand.primary_color || brand.visual_identity || "", audience: brand.target_audience || "",
    description: String(brand.brand_description || brand.description || brand.business_description || "").slice(0, 800) });
  return `Create ONE 1536x1024 RGBA production asset atlas for a premium short social product commercial.
References are actual FINISHED video frames and possibly the verified product image. Company context: ${context}.
THREE independent assets, no labels, borders, dividers or artwork crossing between areas:
LEFT x=0..575, y=0..1023: ONLY an opaque vertical 9:16 BACKGROUND, exactly 576x1024. Fill to every edge. Design for THIS business, product, campaign and finished-video mood: relevant restrained tonal shapes, subtle textures or geometry, with variation between posts. No generic default pink waves. Keep the central 80% of the width between y=220..820 calm and uninterrupted for a real logo and headline added later. Keep decorative lines and shapes near the outer edges. NO text, letters, stars, emblems, rules, logos, company name, people or products anywhere in this background. No website address, button, price, invented claim. No product-photo freeze frame.
RIGHT TOP x=636..1475, y=70..500: ONLY transparent main-message typography. Exact headline ${JSON.stringify(headline)}. ${subheadline ? `Exact subheadline ${JSON.stringify(subheadline)}.` : "No subheadline."} Choose crisp mobile-readable lettering and contrast for the supplied VIDEO frames.
RIGHT BOTTOM x=636..1475, y=680..940: ONLY transparent closing-line typography: ${JSON.stringify(closingLine)}. Balance one or two lines, intentional spacing, high contrast for the LEFT background. Confident restrained advertising lettering. No added stars, ornaments, underlines, emblems or surrounding strokes. The compositor will center the actual visible lettering in the final end card; do not place it on the background.
The ENTIRE RIGHT area x=576..1535 must have alpha=0 outside actual letters. Leave the horizontal gap y=520..650 completely transparent. No plates, panels, shadows, haze, glow, checkerboards or background wash. No CTA repeated in the top area or main headline repeated in the bottom area.
${hasLogo ? "Do NOT draw the logo; the authentic logo is added in code." : `Do not render the exact company name ${JSON.stringify(brand.business_name || "")} in any asset; the compositor adds it separately as the sender. Do NOT invent a logo.`}
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

export async function composeKlingAdvertisingEndCard({background,closingText,closingLine,brand={},logoBuffer=null}) {
  let card=await quietEndCardCenter(background);
  const {data}=await sharp(card).resize(1,1).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const ink=(.2126*data[0]+.7152*data[1]+.0722*data[2])>165 ? "#171724" : "#ffffff";
  if(!logoBuffer) {
    const name=String(brand.business_name||"").slice(0,80);
    const sender=Buffer.from(`<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg"><text x="540" y="700" text-anchor="middle" fill="${ink}" font-family="DejaVu Sans,sans-serif" font-size="${Math.min(60,1200/Math.max(1,name.length))}">${escapeProductSvg(name)}</text></svg>`);
    card=await sharp(card).composite([{input:sender}]).png().toBuffer();
  }
  let lettering=closingText;
  if(!lettering) {
    // A missing CTA asset gets local typesetting, never another paid request.
    const words=String(closingLine||"").split(/\s+/).filter(Boolean),lines=[];let line="";
    for(const word of words){if((line+" "+word).trim().length>22&&line){lines.push(line);line=word;}else line=(line+" "+word).trim();}if(line)lines.push(line);
    const svg=Buffer.from(`<svg width="960" height="420" xmlns="http://www.w3.org/2000/svg">${lines.slice(0,3).map((v,i)=>`<text x="480" y="${100+i*110}" text-anchor="middle" font-family="DejaVu Sans,sans-serif" font-weight="700" font-size="82" fill="${ink}">${escapeProductSvg(v)}</text>`).join("")}</svg>`);
    lettering=await trimLettering(await sharp(svg).png().toBuffer());
  }
  if(lettering) {
    const trimmed=await trimLettering(lettering);
    if(trimmed){const text=await sharp(trimmed).resize({width:850,height:350,fit:"inside"}).png().toBuffer();
      const meta=await sharp(text).metadata();
      card=await sharp(card).composite([{input:text,left:Math.round((1080-meta.width)/2),top:Math.round(1175-meta.height/2)}]).png().toBuffer();}
  }
  return composeKlingEndCardLogo(card,logoBuffer);
}
export async function composeKlingEndCardLogo(buffer, logoBuffer) {
  if (!logoBuffer) return buffer;
  const logo = await sharp(logoBuffer).rotate().trim({ threshold: 10 })
    .resize({ width: 600, height: 240, fit: "inside" }).png().toBuffer();
  const meta = await sharp(logo).metadata();
  return sharp(buffer).composite([{ input: logo, left: Math.round((1080 - meta.width) / 2), top: Math.round(675 - meta.height / 2) }]).png().toBuffer();
}
// Used only for already-cached legacy text or a failed single image attempt.
// Never submits a second billable image request.
export async function buildFallbackKlingEndCard({ brand = {}, closingLine, logoBuffer = null }) {
  const name = String(brand.business_name || "").slice(0, 80);
  const words = String(closingLine || "").split(/\s+/).filter(Boolean);
  const lines = []; let line = "";
  for (const word of words) { if ((line + " " + word).trim().length > 23 && line) { lines.push(line); line = word; } else line = (line + " " + word).trim(); }
  if (line) lines.push(line);
  const color = /^#[0-9a-f]{6}$/i.test(String(brand.primary_color || "")) ? brand.primary_color : "#26234c";
  const rgb = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16));
  const ink = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) > 165 ? "#171724" : "#ffffff";
  const text = lines.slice(0, 3).map((v, i) => `<text x="540" y="${1050 + i * 112}" text-anchor="middle" fill="${ink}" font-family="DejaVu Sans, sans-serif" font-weight="700" font-size="82">${escapeProductSvg(v)}</text>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect width="1080" height="1920" fill="${color}"/><path d="M0 1500 Q540 1230 1080 1590 L1080 1920 L0 1920 Z" fill="${ink}" opacity=".05"/>${logoBuffer ? "" : `<text x="540" y="700" text-anchor="middle" fill="${ink}" font-family="DejaVu Sans, sans-serif" font-size="${Math.min(56, 800 / Math.max(1,name.length) * 1.5)}">${escapeProductSvg(name)}</text>`}${text}</svg>`;
  return composeKlingEndCardLogo(await sharp(Buffer.from(svg)).png().toBuffer(), logoBuffer);
}

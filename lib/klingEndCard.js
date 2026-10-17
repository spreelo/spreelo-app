import sharp from "sharp";
import { composeDominantEndCard } from './videoEndCardComposition.js';
import { END_CARD_LAYOUT_POLICY } from './videoEndCardBrief.js';
import { distinctProductEyebrow, repeatsAdvertisingMessage } from "./videoAdvertisingHierarchy.js";
import { ensureTypographyContrast } from "./animatedTypographyQuality.js";
import { VIDEO_ART_DIRECTION, videoSenderLabel } from "./videoArtDirection.js";
import { escapeProductSvg } from "./globalProductTypography.js";
import { measureAdvertisingTypography, REEL_CTA_MIN_INK_PX } from "./videoTypographyPreflight.js";
import { renderReadableAdvertisingLettering } from "./videoAdvertisingReadabilityRepair.js";

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

// v144.352: On an end card the closing call-to-action is a PRIMARY element,
// not the same 38px legibility threshold used for a supporting video caption.
// Strip transparent padding BEFORE scaling. Previously centerClosingLettering()
// returned a 930px-wide transparent canvas that made short wording like
// "Upptäck nu" look tiny even after the attempted local repair.
// This is a deterministic layout correction, not a new rejection gate.
export async function fitProminentEndCardCTA(lettering, {closingLine='',backgroundBuffer=null,maxWidth=930,maxHeight=290,targetInkPx=115,minAcceptableInkPx=86}={}) {
  let art=await trimLettering(lettering);
  if(!art) return null;
  const probe=async buffer=>{
    const m=await sharp(buffer).metadata();
    const canvas=await sharp({create:{width:1080,height:1920,channels:4,background:'#00000000'}})
      .composite([{input:buffer,left:Math.round((1080-m.width)/2),top:Math.round((1920-m.height)/2)}]).png().toBuffer();
    return measureAdvertisingTypography(canvas,{minInkPx:minAcceptableInkPx});
  };
  const upscale=async buffer=>{
    const meta=await sharp(buffer).metadata();
    const measure=await probe(buffer);
    const widthFactor=maxWidth/meta.width,heightFactor=maxHeight/meta.height;
    const wanted=Math.max(1,targetInkPx/Math.max(1,measure.shortestInkHeight));
    const factor=Math.min(widthFactor,heightFactor,wanted);
    if(factor<=1.01) return buffer;
    return sharp(buffer).resize({width:Math.round(meta.width*factor),height:Math.round(meta.height*factor),fit:'fill'}).png().toBuffer();
  };
  art=await upscale(art);
  let assessed=await probe(art);
  // If very long or very wide provider typography cannot be enlarged enough,
  // rebuild only this CTA as exact vector text. Keep the existing art otherwise.
  // Never fail an already-finished Kling movie merely because the CTA artwork
  // cannot be enlarged; the independent final composition review still runs.
  if(!assessed.passed && String(closingLine||'').trim() && backgroundBuffer){
    try {
      const rebuilt=await renderReadableAdvertisingLettering({
        text:closingLine,backgroundFrames:[backgroundBuffer],
        box:{left:75,top:735,width:930,height:450},minFontSize:110,
      });
      const trimmed=await trimLettering(rebuilt.buffer);
      if(trimmed){
        const candidate=await upscale(trimmed);
        const check=await probe(candidate);
        if(check.shortestInkHeight>assessed.shortestInkHeight){art=candidate;assessed=check;}
      }
    } catch(error){console.warn('Prominent end-card CTA vector recovery unavailable; keeping previous lettering',{message:error?.message});}
  }
  return {buffer:art,measure:assessed};
}

// v144.351: Same AI-created hero typography and CTA now form a deliberate
// end-card hierarchy (verified product eyebrow / dominant hook / closing line /
// real sender). No extra image request, quality gate, or new failure state.
// Only the final placement changes; all creative artwork stays original.
async function composeHierarchicalEndCardLayers({backgroundBuffer,headlineArtwork,headline,closingText,closingLine,
  productLabel='',brand={},logoBuffer=null,hasLogo=false,language='',preserveDesign=false,includeSender=true}) {
  const heroSource=await trimLettering(headlineArtwork);
  if (!heroSource) return null; // Existing single-CTA compositor remains the fallback.
  const backgroundInk=await sharp(backgroundBuffer).resize(1,1).removeAlpha().raw().toBuffer();
  const dark=(.2126*backgroundInk[0]+.7152*backgroundInk[1]+.0722*backgroundInk[2])>165;
  const primaryInk=dark?'#182136':'#FFFFFF';
  const sender=includeSender?videoSenderLabel(brand?.business_name,language || brand?.content_language || brand?.language):'';
  // A full store catalog title is not a good advertising eyebrow. Omit it
  // instead of shrinking the lettering, truncating a product name or failing.
  const eyebrow=distinctProductEyebrow(productLabel,headline,closingLine);
  const eyebrowH=eyebrow?65:0;
  const footerH=includeSender&&(logoBuffer||sender)?140:0;
  let hero=await sharp(heroSource).resize({width:850,height:430,fit:'inside'}).png().toBuffer();
  let heroMeta=await sharp(hero).metadata();
  const heroProbe=await sharp({create:{width:1080,height:1920,channels:4,background:'#00000000'}})
    .composite([{input:hero,left:Math.round((1080-heroMeta.width)/2),top:Math.round((1920-heroMeta.height)/2)}]).png().toBuffer();
  let heroInk=await measureAdvertisingTypography(heroProbe,{minInkPx:46});
  if(!heroInk.passed && Math.max(0,...heroInk.bands.map(band=>band.height))<46) {
    // Too-small AI typography is reconstructed; a difficult headline is not
    // made into a NEW reason to reject the customer's otherwise-ready film.
    try {
      const rebuilt=await renderReadableAdvertisingLettering({text:headline,backgroundFrames:[backgroundBuffer],
        box:{left:75,top:690,width:930,height:510},minFontSize:68,brand});
      const trimmed=await trimLettering(rebuilt.buffer);
      if(trimmed){hero=await sharp(trimmed).resize({width:850,height:430,fit:'inside'}).png().toBuffer();heroMeta=await sharp(hero).metadata();}
    } catch(error){console.warn('End-card headline recovery unavailable; retaining AI artwork',{message:error?.message});}
  }
  // Hierarchy is measured from visible glyphs, not independent maximum widths.
  const finalHeroProbe=await sharp({create:{width:1080,height:1920,channels:4,background:'#00000000'}})
    .composite([{input:hero,left:Math.round((1080-heroMeta.width)/2),top:Math.round((1920-heroMeta.height)/2)}]).png().toBuffer();
  heroInk=await measureAdvertisingTypography(finalHeroProbe,{minInkPx:46});
  const heroLetterHeight=Math.max(46,...heroInk.bands.map(band=>band.height));
  const ctaWidth=Math.min(740,Math.round(heroMeta.width*.85));
  const ctaHeight=Math.min(160,Math.max(90,Math.round(heroLetterHeight*1.25)));
  let cta=closingText?await centerClosingLettering(closingText):null;
  if (!cta && String(closingLine||'').trim()) {
    // Legacy fallback for cached text assets that are temporarily unavailable.
    const words=String(closingLine).split(/\s+/).filter(Boolean);
    const rows=[];let line='';
    for(const word of words){const next=[line,word].filter(Boolean).join(' '); if(line&&next.length>23){rows.push(line);line=word;}else line=next;}
    if(line)rows.push(line);
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="930" height="320">${rows.slice(0,3).map((row,i)=>`<text x="465" y="${86+i*90}" text-anchor="middle" font-family="DejaVu Sans" font-weight="650" font-size="76" fill="${primaryInk}">${escapeProductSvg(row)}</text>`).join('')}</svg>`;
    cta=await centerClosingLettering(await sharp(Buffer.from(svg)).png().toBuffer());
  }
  if (!cta) return null;
  cta=await sharp(cta).resize({width:ctaWidth,height:ctaHeight,fit:'inside'}).png().toBuffer();
  let ctaMeta=await sharp(cta).metadata();
  // This remains a REPAIR, not a new reason to reject a customer's movie.
  // Rebuild only genuinely miniature CTA glyphs; if that fails keep the AI art.
  const ctaTopProbe=Math.max(0,Math.round((1920-ctaMeta.height)/2));
  const ctaProbe=await sharp({create:{width:1080,height:1920,channels:4,background:'#00000000'}})
    .composite([{input:cta,left:Math.round((1080-ctaMeta.width)/2),top:ctaTopProbe}]).png().toBuffer();
  const ctaInk=await measureAdvertisingTypography(ctaProbe,{minInkPx:REEL_CTA_MIN_INK_PX});
  if(!ctaInk.passed && String(closingLine||'').trim()) {
    try {
      const rebuilt=await renderReadableAdvertisingLettering({text:closingLine,backgroundFrames:[backgroundBuffer],
        box:{left:75,top:805,width:930,height:310},minFontSize:68,brand});
      const centered=await centerClosingLettering(rebuilt.buffer);
      if(centered) {
        cta=await sharp(centered).resize({width:ctaWidth,height:ctaHeight,fit:'inside'}).png().toBuffer();
        ctaMeta=await sharp(cta).metadata();
      }
    } catch(error) {console.warn('End-card CTA layout recovery not available; retaining AI artwork', {message:error?.message});}
  }
  // The design-specific AI artwork remains, but its VISIBLE letters (not an
  // invisible 930px-wide canvas) must have real end-card prominence.
  const promotedCta=await fitProminentEndCardCTA(cta,{closingLine,backgroundBuffer,
    maxWidth:ctaWidth,maxHeight:ctaHeight,targetInkPx:Math.min(76,Math.max(42,heroLetterHeight*.6)),minAcceptableInkPx:38});
  if(promotedCta){cta=promotedCta.buffer;ctaMeta=await sharp(cta).metadata();}
  const maxSupportingInk=Math.min(76,Math.max(42,heroLetterHeight*.6));
  if(promotedCta?.measure?.shortestInkHeight>maxSupportingInk*1.04) {
    const factor=maxSupportingInk/promotedCta.measure.shortestInkHeight;
    cta=await sharp(cta).resize(Math.max(1,Math.round(ctaMeta.width*factor)),Math.max(1,Math.round(ctaMeta.height*factor))).png().toBuffer();
    ctaMeta=await sharp(cta).metadata();
  }
  // The group is sized around the REAL letter bounds, not padded AI canvases.
  const duplicateClosing=repeatsAdvertisingMessage(headline,closingLine);
  if(duplicateClosing) ctaMeta={...ctaMeta,height:0};
  const spacing=duplicateClosing?0:78,footerGap=100,eyebrowGap=32;
  const total=eyebrowH+(eyebrowH?eyebrowGap:0)+heroMeta.height+spacing+ctaMeta.height+
    (footerH?footerGap+footerH:0);
  const start=Math.max(250,Math.round((1920-total)/2));
  let y=start;
  const overlays=[];
  if(eyebrow) {
    const size=Math.min(43,Math.floor(1260/Math.max(1,Array.from(eyebrow).length)));
    const textSvg=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="65"><text x="540" y="48" text-anchor="middle" font-family="DejaVu Sans,Liberation Sans,sans-serif" font-size="${size}" font-weight="500" letter-spacing="3" fill="${primaryInk}" opacity="0.93">${escapeProductSvg(eyebrow)}</text></svg>`;
    overlays.push({input:Buffer.from(textSvg),left:0,top:y});y+=eyebrowH+eyebrowGap;
  }
  const layout={eyebrow:eyebrow||null,headline:{left:Math.round((1080-heroMeta.width)/2),top:y,width:heroMeta.width,height:heroMeta.height,ink:heroLetterHeight},closing:null,sender:null};
  overlays.push({input:hero,left:layout.headline.left,top:y});
  y+=heroMeta.height+spacing;
  if(!duplicateClosing) layout.closing={left:Math.round((1080-ctaMeta.width)/2),top:y,width:ctaMeta.width,height:ctaMeta.height};
  if(!duplicateClosing) overlays.push({input:cta,left:Math.round((1080-ctaMeta.width)/2),top:y});
  y+=ctaMeta.height;
  if(footerH) {
    y+=footerGap;
    let realLogo=null;
    if(logoBuffer) {
      try{realLogo=await sharp(logoBuffer).rotate().trim({threshold:8}).resize({width:320,height:100,fit:'inside'}).png().toBuffer();}
      catch(error){console.warn('End-card logo render unavailable; using verified business name',{message:error?.message});}
    }
    if(realLogo) {
      const lm=await sharp(realLogo).metadata();
      // Preserve the authentic logo colors. A calm local backing protects a
      // dark wordmark on a dark card without replacing or inventing a logo.
      const {data:logoPixels}=await sharp(realLogo).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      let logoLum=0,logoAlpha=0;
      for(let i=0;i<logoPixels.length;i+=4){const alpha=logoPixels[i+3]/255;logoAlpha+=alpha;logoLum+=(.2126*logoPixels[i]+.7152*logoPixels[i+1]+.0722*logoPixels[i+2])*alpha;}
      const logoLight=logoLum/Math.max(1,logoAlpha)>140;
      if(logoLight===dark) {
        const fill=dark?'#15202B':'#FFFFFF';
        const plate=Buffer.from(`<svg width="${lm.width+48}" height="${lm.height+36}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" rx="16" fill="${fill}" fill-opacity=".94"/></svg>`);
        overlays.push({input:plate,left:Math.round((1080-lm.width)/2)-24,top:y-18});
      }
      layout.sender={left:Math.round((1080-lm.width)/2),top:y,width:lm.width,height:lm.height};
      overlays.push({input:realLogo,left:layout.sender.left,top:y});
    } else if(sender) {
      const senderSize=Math.min(54,Math.floor(1550/Math.max(1,Array.from(sender).length)));
      layout.sender={left:0,top:y,width:1080,height:82};
      const sv=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="82"><text x="540" y="58" text-anchor="middle" font-family="DejaVu Sans,Liberation Sans,sans-serif" font-size="${senderSize}" fill="${primaryInk}" font-weight="650">${escapeProductSvg(sender)}</text></svg>`;
      overlays.push({input:Buffer.from(sv),left:0,top:y});
    }
  }
  const rawForeground=await sharp({create:{width:1080,height:1920,channels:4,background:'#00000000'}})
    .composite(overlays).png().toBuffer();
  const {buffer:foregroundBuffer}=await ensureTypographyContrast({overlayBuffer:rawForeground,
    backgroundBuffers:[backgroundBuffer],textBox:{left:56,top:280,width:968,height:1380},preserveDesign});
  return {backgroundBuffer,foregroundBuffer,layout,hasSender:Boolean(layout.sender),cardBuffer:await sharp(backgroundBuffer).composite([{input:foregroundBuffer}]).png().toBuffer()};
}

export async function composeVideoEndCardLayers({background,closingText,closingLine,brand={},logoBuffer=null,hasLogo=Boolean(logoBuffer),language="",preserveDesign=false,headlineArtwork=null,headline="",productLabel="",includeSender=true,layoutPolicy=null,designDirection="",websiteUrl="",emphasisText="",backgroundSource="generated_background"}) {
  // Keep the art-directed GPT Image background intact. A blanket center blur
  // erased scene-specific detail and reduced every end card to a generic wash.
  const backgroundBuffer=await sharp(background).resize(1080,1920,{fit:"cover"}).png().toBuffer();
  if(layoutPolicy===END_CARD_LAYOUT_POLICY && String(headline||'').trim()) {
    return {...await composeDominantEndCard({backgroundBuffer,headline,closingLine,designDirection,brand:{...brand,language:language||brand.language},websiteUrl,emphasisText}),backgroundOrigin:backgroundSource};
  }
  if (headlineArtwork && String(headline||'').trim()) {
    // An unexpected image encoding must never cause a new failed video: the
    // established end card below remains a safe delivery fallback.
    try {
      const hierarchical=await composeHierarchicalEndCardLayers({backgroundBuffer,headlineArtwork,headline,
        closingText,closingLine,productLabel,brand,logoBuffer,hasLogo,language,preserveDesign,includeSender});
      if(hierarchical) return hierarchical;
    } catch(error) {console.warn('End-card hierarchy unavailable; retaining existing validated end card', {message:error?.message});}
  }
  const {data}=await sharp(backgroundBuffer).resize(1,1).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const ink=(.2126*data[0]+.7152*data[1]+.0722*data[2])>165 ? "#171724" : "#ffffff";
  let lettering=closingText;
  if(!lettering) {
    // Legacy Kling recovery only; animation rejects missing AI lettering.
    const words=String(closingLine||"").split(/\s+/).filter(Boolean),lines=[];let line="";
    for(const word of words){if((line+" "+word).trim().length>22&&line){lines.push(line);line=word;}else line=(line+" "+word).trim();}if(line)lines.push(line);
    lettering=await sharp(Buffer.from(`<svg width="960" height="420" xmlns="http://www.w3.org/2000/svg">${lines.slice(0,3).map((v,i)=>`<text x="480" y="${100+i*110}" text-anchor="middle" font-family="DejaVu Sans,sans-serif" font-weight="600" font-size="82" fill="${ink}">${escapeProductSvg(v)}</text>`).join("")}</svg>`)).png().toBuffer();
  }
  let text=await centerClosingLettering(lettering);
  if(!text) throw new Error("End card contains no visible closing message");
  let meta=await sharp(text).metadata();
  // v350: check the ACTUAL placed CTA ink independently from the small sender
  // name. A padded atlas can be large while its actual glyphs are tiny.
  const sender=!includeSender || hasLogo ? "" : videoSenderLabel(brand.business_name,language || brand.content_language || brand.language);
  const senderHeight=sender ? 82 : 0;
  let groupHeight=meta.height+senderHeight;
  let textTop=Math.round(960-groupHeight/2);
  const ctaProbe=await sharp({create:{width:1080,height:1920,channels:4,background:'#00000000'}})
    .composite([{input:text,left:75,top:textTop}]).png().toBuffer();
  const ctaMeasure=await measureAdvertisingTypography(ctaProbe,{minInkPx:REEL_CTA_MIN_INK_PX});
  if(!ctaMeasure.passed && String(closingLine||'').trim()) {
    const replacement=await renderReadableAdvertisingLettering({text:closingLine,
      backgroundFrames:[backgroundBuffer],box:{left:75,top:740,width:930,height:420},
      minFontSize:68,brand});
    const trimmed=await trimLettering(replacement.buffer);
    text=await centerClosingLettering(trimmed);
    if(!text)throw new Error('Verified CTA reconstruction produced no visible lettering');
    meta=await sharp(text).metadata();
    groupHeight=meta.height+senderHeight;
    textTop=Math.round(960-groupHeight/2);
  }
  // Old fallback card also benefits from correct alpha-bound scaling.
  const promotedFallback=await fitProminentEndCardCTA(text,{closingLine,backgroundBuffer,maxHeight:290});
  if(promotedFallback){text=promotedFallback.buffer;meta=await sharp(text).metadata();
    groupHeight=meta.height+senderHeight;textTop=Math.round(960-groupHeight/2);}
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
export async function buildFallbackKlingEndCardLayers({brand={},closingLine,logoBuffer=null,language="",includeSender=true}) {
  const color=/^#[0-9a-f]{6}$/i.test(String(brand.primary_color||"")) ? brand.primary_color : "#26234c";
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect width="1080" height="1920" fill="${color}"/><path d="M0 1500 Q540 1230 1080 1590 L1080 1920 L0 1920 Z" fill="white" opacity=".05"/></svg>`;
  return composeVideoEndCardLayers({background:await sharp(Buffer.from(svg)).png().toBuffer(),closingLine,brand,logoBuffer,language,includeSender});
}
export async function buildFallbackKlingEndCard(options) {
  return (await buildFallbackKlingEndCardLayers(options)).cardBuffer;
}

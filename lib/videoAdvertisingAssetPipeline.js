import { sceneHeadlineTreatment } from './videoSceneHeadline.js';
import sharp from 'sharp';
import { buildEndCardMasterPrompt, fitEndCardMasterArtwork, END_CARD_FRAMING, END_CARD_NATIVE_SIZE, supportsNativeEndCardSize } from './videoEndCardMaster.js';
import { normalizeCommercialConcept } from './videoCommercialConcept.js';
import { createHash } from 'node:crypto';
import { END_CARD_DESIGN_BRIEF } from './videoEndCardBrief.js';
import { getProductTypographyProfile, escapeProductSvg } from './globalProductTypography.js';
import { VIDEO_ART_DIRECTION } from './videoArtDirection.js';
import { repeatsAdvertisingMessage } from './videoAdvertisingHierarchy.js';

// v144.348: Do not ask an image model to pack an opaque background and
// transparent lettering into the same image. The mixed-alpha atlas was the
// direct source of the 2026-10-15 opaque-panel failures.
// Image model is still the bespoke art director/first-choice letterform designer.
// When a KNOWN returned typography bitmap has unusable transparency, an
// AI-brief-directed local vector composition preserves exact words rather
// than failing the customer's entire completed video.
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
const hexColor=value=>/^#[\da-f]{6}$/i.test(String(value||''))?String(value):null;
const xml=value=>escapeProductSvg(String(value||''));

function themeFromDirection(direction='',brand={},backgroundSample=null) {
  const typographyDirection=String(direction||'').split('\nClosing background:')[0];
  const desc=typographyDirection.toLowerCase();
  const rgb=backgroundSample?.rgb || [24,31,52];
  const light=(rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722)>140;
  const primary=hexColor(brand?.primary_color) || (light?'#14263D':'#FFFFFF');
  const requestedColors=typographyDirection.match(/#[\da-f]{6}/gi)||[];
  const accent=hexColor(requestedColors[1]) || hexColor(brand?.secondary_color) || backgroundSample?.accent || primary;
  const robustLight=light?'#142237':'#FFFFFF';
  const requestedColor=hexColor((typographyDirection.match(/#[\da-f]{6}/i)||[])[0]);
  const proposed=requestedColor||primary;
  const rgbHex=/^#[\da-f]{6}$/i.test(proposed)?[1,3,5].map(i=>parseInt(proposed.slice(i,i+2),16)):[255,255,255];
  const contrast=((rgbHex[0]*.2126+rgbHex[1]*.7152+rgbHex[2]*.0722)>140)!==light;
  // Explicit scene colors are a production decision. The later actual-glyph
  // contrast pass, not the average color of a different image, corrects them.
  const color=requestedColor||(contrast?proposed:robustLight);
  const bold=/\b(bold|impact|strong|powerful|dramatic|heavy|kraftfull|tydlig|fet)\b/i.test(desc);
  const sans=/\bsans(?:[ -]serif)?\b/i.test(desc);
  const elegant=!sans && /\b(elegant|editorial|refined|serif|sophisticated|lyxig|elegant)\b/i.test(desc);
  const italic=/\b(italic|kursiv|slanted|editorial)\b/i.test(desc);
  const luminance=values=>values.map(v=>{const n=v/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const toRgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  const aLum=luminance(toRgb(accent)),bLum=luminance(rgb);
  const safeAccent=(requestedColors[1] || (Math.max(aLum,bLum)+.05)/(Math.min(aLum,bLum)+.05)>=4.5)?accent:color;
  return {color,accent:safeAccent,weight:bold?800:elegant?600:700,
    family:elegant?'Liberation Serif, DejaVu Serif, Noto Serif, Noto Sans, serif':'DejaVu Sans, Liberation Sans, Noto Sans, sans-serif',
    italic,spacing:elegant?0.3:0};
}

function balancedLines(text, maxLines = 2, forceWrap = false) {
  const words=String(text||'').trim().split(/\s+/u).filter(Boolean);
  if(words.length<2 || (!forceWrap && Array.from(text).length<19)) return [words.join(' ')];
  const width=line=>Array.from(line).reduce((sum,c)=>sum+(c===' '?.32:/[ilI.,!]/u.test(c)?.3:/[MWmwÅÄÖ]/u.test(c)?.86:/[^\u0000-\u024f]/u.test(c)?1:.59),0);
  let best=null;
  for(let at=1;at<words.length;at++) {
    const lines=[words.slice(0,at).join(' '),words.slice(at).join(' ')];
    const widths=lines.map(width);
    const score=Math.max(...widths)+Math.abs(widths[0]-widths[1])*.45;
    if(!best || score<best.score)best={lines,score};
  }
  return maxLines===1?[words.join(' ')]:best.lines;
}

async function sampleTypographyBackground(backgroundBuffer) {
  if(!backgroundBuffer)return null;
  const {data,info}=await sharp(backgroundBuffer).resize(48,48,{fit:'fill'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const sum=[0,0,0], colors=new Map();
  for(let i=0;i<data.length;i+=info.channels){
    const rgb=Array.from(data.subarray(i,i+3));rgb.forEach((v,k)=>sum[k]+=v);
    const hi=Math.max(...rgb),lo=Math.min(...rgb);
    if(hi<65 || hi>245 || hi-lo<35)continue;
    const key=rgb.map(v=>Math.round(v/32)*32).join(',');
    const entry=colors.get(key)||{count:0,rgb:[0,0,0]};entry.count++;
    rgb.forEach((v,k)=>entry.rgb[k]+=v);colors.set(key,entry);
  }
  const dominant=[...colors.values()].sort((a,b)=>b.count-a.count)[0];
  const accent=dominant?'#'+dominant.rgb.map(v=>Math.round(v/dominant.count).toString(16).padStart(2,'0')).join(''):null;
  return {rgb:sum.map(v=>v/(info.width*info.height)),accent};
}

export async function renderArtDirectedTypography({text,supportingText='',designDirection='',brand={},kind='headline',backgroundBuffer=null,emphasisText='',sceneDesign=false}) {
  const original=String(text||'').trim();
  if(!original || original.length>180) throw new Error('Typography renderer requires complete, concise approved copy');
  const theme=themeFromDirection(designDirection,brand,await sampleTypographyBackground(backgroundBuffer));
  const support=kind==='headline' && !repeatsAdvertisingMessage(original,supportingText)?String(supportingText||'').trim():'';
  const isCta=['cta','endcard_cta','endcard_website'].includes(kind);
  const scene=sceneDesign&&kind==='headline'?sceneHeadlineTreatment(original,designDirection,emphasisText):null;
  const lines=scene?.lines||(scene?.inline?[original]:balancedLines(original,kind==='cta'?1:2,
    Boolean(scene?.stacked)||kind==='endcard_headline' && original.split(/\s+/u).length>=3));
  const weight=isCta?500:theme.weight;
  const fill=kind==='cta'?theme.accent:theme.color;
  const profile=getProductTypographyProfile(original,brand.language||brand.content_language||'');
  // Use fonts actually bundled in production; an unavailable system face must
  // not silently erase the creative director's serif/sans decision.
  const sceneFamily=/\bserif\b/i.test(designDirection)&&!/\bsans(?:[ -]serif)?\b/i.test(designDirection)?'Noto Serif':'Noto Sans';
  const family=profile.script==='global'?(scene?sceneFamily:theme.family):profile.family;
  // Highlight the selected phrase even when it occupies part of a line or
  // crosses the chosen line break. Invalid/old emphasis is simply omitted.
  const phrase=String(emphasisText||'').normalize('NFC').replace(/\s+/gu,' ').trim();
  const escaped=phrase.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=phrase?original.match(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,'iu')):null;
  let offset=0;
  const rows=lines.map(line=>{
    const from=match?Math.max(0,match.index-offset):0,to=match?Math.min(line.length,match.index+match[0].length-offset):0;
    offset+=line.length+1;
    return to>from?`${xml(line.slice(0,from))}<tspan fill="${theme.accent}">${xml(line.slice(from,to))}</tspan>${xml(line.slice(to))}`:xml(line);
  });
  const svgFor=(size)=>{
    const supportSize=size*.46;
    const sizes=lines.map((line,index)=>size*(scene?.scaleForLine(line,index)||1));
    const leading=size*(scene?.leading||1.12);
    const height=scene?sizes.reduce((sum,value)=>sum+value,0)+(lines.length-1)*size*.1+(support?supportSize*1.5+size*.25:0)
      :lines.length*leading+(support?supportSize*1.5+size*.25:0);
    const y=(1024-height)/2+(scene?sizes[0]:size);
    let baseline=y;
    const lettering=rows.map((row,i)=>{if(scene&&i>0)baseline+=sizes[i]+size*.1;return `<text x="700" y="${Math.round(scene?baseline:y+i*leading)}" text-anchor="middle" font-family="${family}" direction="${profile.direction}" font-weight="${weight}" font-size="${scene?sizes[i]:size}" font-style="${theme.italic?'italic':'normal'}" letter-spacing="${theme.spacing}" fill="${fill}">${row}</text>`;}).join('');
    const supporting=support?`<text x="700" y="${Math.round(y+(lines.length-1)*leading+size*.35+supportSize)}" text-anchor="middle" font-family="${family}" direction="${profile.direction}" font-weight="400" font-size="${supportSize}" fill="${theme.color}">${xml(support)}</text>`:'';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1024">${lettering}${supporting}</svg>`;
  };
  // Measure actual font ink on a generous canvas BEFORE fitting to avoid clipping
  // long words or scripts; no approved words are shortened or discarded.
  const initial=isCta?108:156;
  let size=initial;
  const measureSvg=svgFor(initial).replace('width="1400" height="1024"','width="6000" height="3000" viewBox="-2300 -988 6000 3000"');
  // Sharp metadata precedes operations. Read the actual trimmed output dimensions.
  const {info}=await sharp(Buffer.from(measureSvg)).trim({background:'#00000000',threshold:8}).png().toBuffer({resolveWithObject:true});
  size=Math.min(initial,Math.floor(initial*Math.min(1280/info.width,860/info.height)));
  return sharp(Buffer.from(svgFor(Math.max(18,size)))).png().toBuffer();
}

export async function inspectIndependentTypography(buffer) {
  const img=await sharp(buffer).rotate().resize({width:400,height:260,fit:'contain',background:'#00000000'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const {data,info}=img;
  let visible=0,opaque=0,edge=0; const total=info.width*info.height;
  const mask=new Uint8Array(total),seen=new Uint8Array(total),queue=new Int32Array(total);
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
    const i=y*info.width+x,a=data[i*4+3];
    if(a>26){visible++;if(x<8||x>=info.width-8||y<8||y>=info.height-8)edge++;}
    if(a>230)opaque++;
    if(a>=170)mask[i]=1;
  }
  let panel=false, largestRatio=0;
  for(let i=0;i<total;i++) {
    if(!mask[i]||seen[i])continue;
    let head=0,tail=1,left=info.width,top=info.height,right=0,bottom=0;seen[i]=1;queue[0]=i;
    while(head<tail) {
      const at=queue[head++],x=at%info.width,y=Math.floor(at/info.width);
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
      for(const at2 of [x>0?at-1:-1,x<info.width-1?at+1:-1,y>0?at-info.width:-1,y<info.height-1?at+info.width:-1])
        if(at2>=0&&mask[at2]&&!seen[at2]){seen[at2]=1;queue[tail++]=at2;}
    }
    const area=(right-left+1)*(bottom-top+1),fill=tail/Math.max(1,area);
    largestRatio=Math.max(largestRatio,tail/total);
    if(tail/total>.11 && fill>.73)panel=true;
  }
  const coverage=visible/total,edgeRatio=edge/Math.max(1,visible);
  return {valid:coverage>.003&&coverage<.31&&edgeRatio<.085&&!panel,
    coverage,edgeRatio,opaqueRatio:opaque/total,panel,largestRatio};
}

async function makeProviderArtwork({openai,model,referenceFiles,prompt,background='transparent',size='1536x1024',preferGeneration=false}) {
  // No SDK auto retries: a lost response can be billable and must not be re-sent.
  const options={model,prompt,size,quality:'medium',background,output_format:'png'};
  const canGenerate=typeof openai?.images?.generate==='function';
  const useReferences=Array.isArray(referenceFiles) && referenceFiles.length>0 && typeof openai?.images?.edit==='function' && (!preferGeneration||!canGenerate);
  const result=useReferences || !canGenerate
    ? await openai.images.edit({...options,image:referenceFiles},{timeout:75000,maxRetries:0})
    : await openai.images.generate(options,{timeout:75000,maxRetries:0});
  const encoded=result?.data?.[0]?.b64_json;
  if(!encoded) throw Object.assign(new Error('Image provider returned no bitmap'),{code:'IMAGE_PROVIDER_EMPTY_RESPONSE'});
  return Buffer.from(encoded,'base64');
}

function brandBrief(brand){return JSON.stringify({name:brand?.business_name||'',identity:brand?.brand_colors||brand?.primary_color||'',audience:brand?.target_audience||''}).slice(0,650);}

// Branded, deterministic BACKGROUND fallback when image generation is not
// available. Never fake a product image or alter product identity. Deliberately
// simple so it can finish an already paid render instead of failing an ad.
export async function buildOfflineAdvertisingBackdrop({designDirection='',brand={}}={}) {
  const seed=createHash('sha256').update([designDirection,brand.business_name,brand.primary_color].join('|')).digest();
  const h=(i)=>seed[i].toString(16).padStart(2,'0');
  const base=hexColor(brand.primary_color)||`#${h(0)}${h(1)}${h(2)}`;
  const accent=hexColor(brand.secondary_color)||`#${h(3)}${h(4)}${h(5)}`;
  const a=18+(seed[8]%35);
  const offset=80+(seed[9]%160);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0B1021"/><stop offset=".55" stop-color="${base}"/><stop offset="1" stop-color="#091225"/></linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${accent}" stop-opacity=".35"/><stop offset="1" stop-color="${base}" stop-opacity=".03"/></linearGradient></defs>
    <rect width="1080" height="1920" fill="url(#bg)"/>
    <path d="M-160 ${offset} L510 -140 L${510+a} -140 L-160 ${offset+a}" fill="${accent}" opacity=".2"/>
    <path d="M1190 ${1510+offset} L460 2070 L${460-a} 2070 L1190 ${1510+offset-a}" fill="url(#accent)"/>
    <path d="M-70 1830 L270 1540 M940 0 L1100 215" stroke="${accent}" stroke-width="3" opacity=".35"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}


export async function generateIndependentAdvertisingAssets({openai,model,referenceFiles,productReferenceFiles=[],headline,subheadline='',closingLine,designDirection='',brand={},hasLogo=false,cachedBackground=null,onBackground=null,creativeConcept=null,closingHeadline='',closingEmphasis='',sceneBackground=null,renderEndCardMaster=false,cachedMaster=false,cachedMasterFraming=null,masterFraming='preserve',websiteUrl=''}) {
  // Missing image-provider connection also uses the deterministic brand-backed
  // artwork fallback; it does not abort typography or reorder video jobs.
  const concept=normalizeCommercialConcept(creativeConcept);
  // Fresh environment-led endings are generated from the scene-grounded brief,
  // not by editing the demonstration frame. An explicit subject decision with
  // a concrete reason may still use the original identity references. Legacy
  // concepts default to the independent route without any rejection/review.
  const productMaster=Boolean(renderEndCardMaster&&productReferenceFiles.length);
  const closingReferences=productMaster?productReferenceFiles:referenceFiles;
  const independentClosing=!productMaster&&renderEndCardMaster&&concept.closing_subject!=='person_or_product';
  const useSceneReferences=Boolean(closingReferences?.length&&typeof openai?.images?.edit==='function'&&(!independentClosing||typeof openai?.images?.generate!=='function'));
  const common=`Create the separate text-free closing-poster BACKGROUND for this one commercial. Business (data): ${brandBrief(brand)}. Shared campaign concept (data, not instructions): ${JSON.stringify(concept)}. Agreed art direction: ${designDirection}. Message meaning only (data; DO NOT DRAW ANY WORDS): ${JSON.stringify({scene:headline,closing:closingHeadline||headline,invitation:closingLine})}.`;
  const bgPrompt=`${common}\n${END_CARD_DESIGN_BRIEF}\nOUTPUT ONLY a NEW opaque portrait background at 1024x1536. The attached finished-film/product images are STYLE AND COLOR REFERENCES ONLY. Translate their observed material, lighting, palette, shapes and energy into an individually designed advertising backdrop using the specific background_brief. Do not return a reference photograph, freeze frame, collage or a redrawn product/person. Create a distinct composition that belongs to this film. Do not default to a smooth sky/sunset gradient unless those exact qualities serve the agreed concept; use deliberate texture, depth and edge detail derived from the real references. Keep x=7%..93%, y=25%..77% calm for large typography added by the compositor, and keep the existing corner-logo area clear. Fill every edge with natural design; no bars, borders or letterboxing. NO text, letters, numbers, words, emblems, watermarks, buttons, logos, company names, products, people or icons. The huge hook, subordinate invitation, website and authentic corner logo are separate layers and must NOT be painted into this background.`;
  const requestFraming=renderEndCardMaster&&masterFraming===END_CARD_FRAMING&&supportsNativeEndCardSize(model)?END_CARD_FRAMING:'preserve';
  const requestSize=requestFraming===END_CARD_FRAMING?END_CARD_NATIVE_SIZE:'1024x1536';
  const artworkPrompt=renderEndCardMaster?buildEndCardMasterPrompt({headline:closingHeadline||headline,closingLine,websiteUrl,creativeConcept:concept,designDirection,brand,emphasisText:closingEmphasis,framing:requestFraming,includeProductReference:productMaster}):bgPrompt;
  let backgroundIsMaster=Boolean(cachedBackground && cachedMaster);
  let backgroundFraming=cachedBackground?cachedMasterFraming:null;
  let backgroundRaw=cachedBackground;
  let backgroundSource=cachedBackground?'cached_background':'generated_background';
  if(!backgroundRaw){
    try {backgroundRaw=await makeProviderArtwork({openai,model,referenceFiles:closingReferences,prompt:artworkPrompt,background:'opaque',size:requestSize,preferGeneration:independentClosing});backgroundIsMaster=renderEndCardMaster;backgroundFraming=renderEndCardMaster?requestFraming:null;}
    catch(error){
      console.warn('Creative background provider unavailable; using branded design fallback without extra paid image attempts',{
        reason:String(error?.message||error).slice(0,220)});
      backgroundSource='designed_fallback';
      backgroundRaw=await buildOfflineAdvertisingBackdrop({designDirection,brand});
    }
    if(onBackground)await onBackground(backgroundRaw,{isMaster:backgroundIsMaster,framing:backgroundFraming});
  }
  const endCard=backgroundIsMaster ? await fitEndCardMasterArtwork(backgroundRaw,{framing:backgroundFraming})
    : await sharp(backgroundRaw).resize(1080,1920,{fit:'cover'}).removeAlpha().png().toBuffer();
  const supportingText=repeatsAdvertisingMessage(headline,subheadline)?'':subheadline;
  // v144.353 DESIGN-FIRST: the AI creates one bespoke end-card environment,
  // while the already-approved words are typeset deterministically in the
  // SAME art direction. This removes TWO paid image requests per attempt and
  // removes provider misspelling/opaque typography as failure modes.
  // The composited master end card (background+headline+CTA+brand) is built
  // before Shotstack rendering by composeVideoEndCardLayers().
  const localHeadline=await renderArtDirectedTypography({text:headline,supportingText,designDirection:concept.scene_typography||designDirection,emphasisText:concept.scene_emphasis,brand,kind:'headline',sceneDesign:true,backgroundBuffer:sceneBackground||endCard});
  const localClosing=await renderArtDirectedTypography({text:closingLine,designDirection,brand,kind:'cta',backgroundBuffer:endCard});
  return {headline:localHeadline,closingText:localClosing,endCard,backgroundSource,endCardPrompt:artworkPrompt,endCardFraming:backgroundFraming,endCardMaster:backgroundIsMaster?endCard:null,
    backgroundReferenceMode:productMaster?'original_product_complete_master':useSceneReferences?'scene_references':independentClosing?'independent_concept_brief':'brief_only',
    backgroundReferenceCount:useSceneReferences?closingReferences.length:0,
    backgroundBounds:{left:0,top:0,width:1080,height:1920},
    typographyMode:{headline:'art_directed_exact_vector_v353',closing:'art_directed_exact_vector_v353',endCard:backgroundIsMaster?'gpt_image_complete_master_v369':'local_composition'},
    inspections:{headline:{valid:true,reason:'exact_vector'},closing:{valid:true,reason:'exact_vector'}}};

}

// A provider image can have genuine transparency but misspell a Swedish word.
// Repair ONLY a positively identified readback mismatch. An unavailable audit
// model or a transport timeout must not be misclassified as bad design.
export async function ensureExactAdvertisingLettering({assets,verify,headline,subheadline='',closingLine,designDirection='',brand={}}) {
  if(assets?.typographyMode?.headline==='art_directed_exact_vector_v353' &&
     assets?.typographyMode?.closing==='art_directed_exact_vector_v353') {
    // Exact approved strings are escaped into SVG text nodes. A model readback
    // would add cost and may reject valid rendering due to optical OCR errors.
    const supportingText=repeatsAdvertisingMessage(headline,subheadline)?'':subheadline;
    return {assets,audit:{verified:true,method:'deterministic_exact_copy',visibleText:[headline,supportingText,closingLine].filter(Boolean).join(' ')}};
  }
  try {
    const audit=await verify(assets.headline,assets.closingText);
    return {assets,audit};
  }catch(error){
    if(!/typography did not reproduce the exact locked advertising headline/i.test(String(error?.message||''))) throw error;
    const fixed={...assets,
      headline:await renderArtDirectedTypography({text:headline,supportingText:subheadline,designDirection,brand,kind:'headline',backgroundBuffer:assets.endCard}),
      closingText:await renderArtDirectedTypography({text:closingLine,designDirection,brand,kind:'cta',backgroundBuffer:assets.endCard}),
      typographyMode:{headline:'ai_brief_exact_word_recovery',closing:'ai_brief_exact_word_recovery'},
    };
    const audit=await verify(fixed.headline,fixed.closingText);
    return {assets:fixed,audit};
  }
}

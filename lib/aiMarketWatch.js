import { createHash } from 'node:crypto';

// v332: watch providers relevant to Spreelo, never generic SDK release notes.
// The official OpenAI news RSS includes unrelated company/ChatGPT articles;
// classifyNews deliberately discards those unless the headline is model/API-specific.
export const WATCH_SOURCES = [
  {provider:'OpenAI',url:'https://openai.com/news/rss.xml'},
];

function cleanText(input) {
  // Decode HTML entities both before and after dropping HTML, so escaped markup
  // from RSS summaries cannot leak into admin or notification emails.
  let value=String(input||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi,'$1');
  for(let i=0;i<2;i++) {
    value=value.replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"')
      .replace(/&apos;|&#39;/gi,"'").replace(/&amp;/gi,'&')
      .replace(/&#(\d{1,7});/g,(_,code)=>String.fromCodePoint(Math.min(0x10ffff,Number(code))));
    value=value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
      .replace(/<[^>]*>/g,' ');
  }
  return value.replace(/\s+/g,' ').trim();
}
const pick=(s,tag)=>s.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,'i'))?.[1]||'';
const modelName=/\b(?:gpt[ -]?(?:image[ -]?)?\d+(?:\.\d+)?(?:[ -]?(?:flare|sunburst|sol|luna|astra|mini|nano|pro))?|kling[ -]?\d+(?:\.\d+)?)\b/i;
const modelSubject=/\b(?:gpt[ -]?(?:image[ -]?)?\d|kling[ -]?\d|image (?:generation|model)|video (?:generation|model)|api models?)\b/i;
const sdkNoise=/\b(?:sdk|npm|python package|typescript|client library|chatgpt app|chatgpt web|codex cli)\b/i;

export function classifyNews(title,summary='') {
  // Headlines only: incidental words in huge RSS bodies must NOT promote an
  // irrelevant story (or a client SDK patch) into a business-critical alert.
  const headline=cleanText(title);
  if(!headline || sdkNoise.test(headline) || !modelSubject.test(headline))return null;
  if(/\b(?:deprecated?|deprecation|sunset|retir(?:e|ing|ement)|shutdown|discontinued?|removed|end.of.life)\b/i.test(headline))
    return {severity:'important',category:'deprecation'};
  if(/\b(?:pric(?:e|es|ing)|costs?|rates?|billing)\b/i.test(headline))
    return {severity:'important',category:'pricing'};
  if(/\b(?:outage|incident|unavailable|service disruption|api failure)\b/i.test(headline))
    return {severity:'important',category:'api_reliability'};
  if(/\b(?:introduc(?:ing|ed|es)|launch(?:es|ed)?|releas(?:e|ed|es)|new|updat(?:e|ed|es)|announc(?:e|ed|es|ing)|improv(?:e|ed|ements?))\b/i.test(headline))
    return {severity:'info',category:'model_release'};
  return null;
}

export function newsForSpreelo(title,classification,provider='OpenAI') {
  const model=cleanText(title).match(modelName)?.[0]||'AI-modeller';
  const vendor=provider==='Kling'?'Kling':'OpenAI';
  if(classification.category==='deprecation')return {
    title:`Möjlig avveckling: ${model}`,
    summary:`${vendor} har publicerat information som kan beröra en modell. Kontrollera om Spreelo använder den innan du byter något.`,
  };
  if(classification.category==='pricing')return {
    title:`Prisnyhet från ${vendor}: ${model}`,
    summary:'En möjlig prisförändring har annonserats. Jämför verifierade priser i prisdelen innan du fattar beslut.',
  };
  if(classification.category==='api_reliability')return {
    title:`API-information från ${vendor}: ${model}`,
    summary:'Kontrollera om en aktiv Spreelo-funktion kan påverkas. Inga modeller byts automatiskt.',
  };
  return {
    title:`Modellnyhet från ${vendor}: ${model}`,
    summary:'Se om modellen finns och är tekniskt godkänd i modellregistret. Den börjar inte användas förrän du själv väljer den.',
  };
}

export function parseFeed(xml,source) {
  const chunks=[...String(xml||'').matchAll(/<(entry|item)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].slice(0,60);
  return chunks.map(m=>{
    const raw=m[2], headline=cleanText(pick(raw,'title'));
    const atomLink=raw.match(/<link\b[^>]*href=["']([^"']+)["']/i)?.[1];
    const url=cleanText(atomLink||pick(raw,'link'));
    const classification=classifyNews(headline,cleanText(pick(raw,'summary')||pick(raw,'description')));
    if(!classification||!/^https:\/\//i.test(url))return null;
    let domain;try{domain=new URL(url).hostname.toLowerCase();}catch{return null;}
    if(source.provider==='OpenAI' && domain!=='openai.com' && !domain.endsWith('.openai.com'))return null;
    if(source.provider==='Kling' && domain!=='kling.ai' && !domain.endsWith('.kling.ai'))return null;
    const published=cleanText(pick(raw,'published')||pick(raw,'updated')||pick(raw,'pubDate'));
    const date=published&&Number.isFinite(Date.parse(published))?new Date(published).toISOString():null;
    const friendly=newsForSpreelo(headline,classification,source.provider);
    return {id:createHash('sha256').update(url).digest('hex'),provider:source.provider,url,published_at:date,
      ...friendly,...classification};
  }).filter(Boolean);
}

export async function fetchFeed(source){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
  try{
    const r=await fetch(source.url,{headers:{'User-Agent':'Spreelo-AI-Market-Watch/2.0','Accept':'application/atom+xml, application/rss+xml, application/xml'},signal:controller.signal,cache:'no-store'});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    return parseFeed(await r.text(),source);
  }finally{clearTimeout(timeout)}
}

import { createHash } from 'node:crypto';

// Official, low-cost source feeds. Optional extra RSS/Atom sources via environment.
export const WATCH_SOURCES = [
 {provider:'OpenAI SDK',url:'https://github.com/openai/openai-node/releases.atom'},
 {provider:'OpenAI SDK',url:'https://github.com/openai/openai-python/releases.atom'},
 {provider:'Anthropic SDK',url:'https://github.com/anthropics/anthropic-sdk-typescript/releases.atom'},
 {provider:'Google AI SDK',url:'https://github.com/googleapis/js-genai/releases.atom'},
 ...String(process.env.AI_MARKET_EXTRA_FEEDS||'').split(',').map(s=>s.trim()).filter(s=>/^https:\/\//.test(s)).slice(0,8).map(url=>({provider:'Extra feed',url}))
];
const decode = s => String(s||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim();
const pick=(s,tag)=>s.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,'i'))?.[1]||'';
export function classifyNews(title,summary='') {
 const s=`${title} ${summary}`.toLowerCase();
 if(/deprecat|sunset|retire|discontinu|end.of.life|removed|breaking.change|shutdown|security.advisory|critical.vulnerab/.test(s))return {severity:'critical',category:'deprecation'};
 if(/pric|billing|rate.limit|outage|incident|unavailab|migration|api.change/.test(s))return {severity:'important',category:'api_or_price'};
 if(/model|image|video|vision|release|support|version|feature/.test(s))return {severity:'info',category:'model_or_release'};
 return null;
}
export function parseFeed(xml,source){
 const chunks=[...xml.matchAll(/<(entry|item)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].slice(0,30);
 return chunks.map(m=>{
  const raw=m[2]; const title=decode(pick(raw,'title'));
  const atomLink=raw.match(/<link\b[^>]*href=["']([^"']+)["']/i)?.[1];
  const url=decode(atomLink||pick(raw,'link')); const summary=decode(pick(raw,'summary')||pick(raw,'description')||pick(raw,'content')).slice(0,500);
  const published=decode(pick(raw,'published')||pick(raw,'updated')||pick(raw,'pubDate'));
  const classification=classifyNews(title,summary);
  if(!title||!/^https:\/\//.test(url)||!classification)return null;
  const date=published&&Number.isFinite(Date.parse(published))?new Date(published).toISOString():null;
  return {id:createHash('sha256').update(url).digest('hex'),provider:source.provider,title,url,summary,published_at:date,...classification};
 }).filter(Boolean);
}
export async function fetchFeed(source){
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),8000);
 try {const r=await fetch(source.url,{headers:{'User-Agent':'Spreelo-AI-Market-Watch/1.0','Accept':'application/atom+xml, application/rss+xml, application/xml'},signal:controller.signal,cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);return parseFeed(await r.text(),source);}finally{clearTimeout(timeout)}
}

// Local rendering choices for MOVING headlines only. No copy rewriting,
// provider request, layout-position change or approval decision.
export const SCENE_HEADLINE_BRIEF = `Art-direct the MOVING headline as a finished advertisement, not a subtitle. Decide which exact word/phrase carries its distinctive meaning, humor or emotional promise BEFORE assigning size or color. That semantic anchor should dominate; grammatical connectors, qualifications and time phrases should support it, irrespective of whether they come first or last. Do not mistake the longest line or the last line for the main message. Choose expressive letterform character and a restrained foreground/accent palette from the actual film and product. Prefer a purposeful two-color treatment when contrast allows; plain white sans-serif is a deliberate quiet option, not the default for every campaign. Never recolor merely because a line wrapped.
For scene_typography ONLY return a compact JSON STRING (not a new object field) with keys: family (serif or sans), support_family (serif or sans), layout (stacked, inline or balanced), lines (one or two EXACT consecutive groups of the approved moving headline, preserving reading order and every word), dominant_phrase (the EXACT meaningful anchor), accent_phrase (an EXACT phrase to color, or empty for intentional monochrome), primary (foreground #RRGGBB), accent (#RRGGBB), weight (400 or 700), support_scale (0.60–0.85). For stacked type, the semantic anchor is larger wherever it occurs; surrounding words are subordinate. For inline type keep a coherent readable line. Choose serif/sans, hierarchy and colors individually for this business and offer; no product-specific recipes. Keep this JSON concise, within 600 characters. This one field is the explicit exception to inherited instructions asking for one sentence per concept field. scene_emphasis should match accent_phrase. The renderer will preserve the exact wording and use existing safe placement and contrast handling. This changes only moving text art direction; retain the closing design, copy, protected regions and placement decisions.`;

export function sceneHeadlineTreatment(text, direction='', emphasis='') {
  const original=String(text||'').normalize('NFC').replace(/\s+/gu,' ').trim();
  const words=original.split(/\s+/u);
  const clean=value=>typeof value==='string'?value.normalize('NFC').replace(/\s+/gu,' ').trim():'';
  let design=null;
  try {
    const parsed=JSON.parse(String(direction||''));
    if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))design=parsed;
  } catch { /* Old prose plans remain deliverable; this is not a review gate. */ }
  const desc=String(direction||'').toLowerCase();
  const inline=design?design.layout==='inline':/\b(inline|single[ -]line|one[ -]line)\b/.test(desc);
  const equal=design?design.layout==='balanced':/\b(balanced|equal[ -]lines)\b/.test(desc);
  const stacked=design?design.layout==='stacked':!inline&&!equal&&(/\b(stacked|two[ -]line|2[ -]line|display hierarchy)\b/.test(desc)||words.length===2);
  const contains=phrase=>Boolean(phrase&&original.toLocaleLowerCase().includes(phrase.toLocaleLowerCase()));
  const proposedDominant=clean(design?.dominant_phrase)||clean(emphasis);
  const dominant=contains(proposedDominant)?proposedDominant:'';
  const proposedAccent=design?clean(design.accent_phrase):clean(emphasis);
  const accentPhrase=contains(proposedAccent)?proposedAccent:'';
  let lines=null;
  const proposedLines=Array.isArray(design?.lines)?design.lines.map(clean):[];
  // Formatting fallback, never a failed generation. Invalid/missing groups
  // cannot remove, duplicate, reorder or paraphrase any approved word.
  if(!inline&&proposedLines.length>=1&&proposedLines.length<=2&&proposedLines.every(Boolean)&&proposedLines.join(' ')===original)lines=proposedLines;
  if(stacked&&!lines&&dominant&&dominant.length<original.length){
    const lower=original.toLocaleLowerCase(),p=dominant.toLocaleLowerCase();
    if(lower.endsWith(' '+p))lines=[original.slice(0,-dominant.length).trim(),original.slice(-dominant.length)];
    else if(lower.startsWith(p+' '))lines=[original.slice(0,dominant.length),original.slice(dominant.length).trim()];
  }
  if(stacked&&!lines&&words.length===2)lines=words;
  const color=value=>/^#[\da-f]{6}$/i.test(String(value||''))?value:null;
  const palette=design?{primary:color(design.primary),accent:color(design.accent)}:null;
  const supportScale=Math.max(.60,Math.min(.85,Number(design?.support_scale)||.68));
  return {inline,stacked,lines,accentPhrase,palette,
    family:design?.family==='serif'?'Noto Serif':design?.family==='sans'?'Noto Sans':null,
    supportFamily:design?.support_family==='serif'?'Noto Serif':design?.support_family==='sans'?'Noto Sans':null,
    weight:design?.weight===400?400:design?.weight===700?700:null,
    scaleForLine:(line)=>{
      if(!stacked||!lines||!dominant)return 1;
      return line.toLocaleLowerCase().includes(dominant.toLocaleLowerCase())?1:supportScale;
    },
    leading:stacked?1.04:1.12};
}

// Local rendering choices for MOVING headlines only. No copy rewriting,
// provider request, layout-position change or approval decision.
export const SCENE_HEADLINE_BRIEF = 'For scene_typography ONLY, choose a deliberate moving-headline treatment: say stacked for a compact two-line display hierarchy, inline for one continuous line, or balanced for equal lines. Match a bold modern sans-serif or expressive editorial serif to this individual campaign. Identify the exact meaningful scene_emphasis phrase when it deserves a contrasting accent; use two foreground hex colors with strong contrast on the actual film, or one color when more appropriate. State the intended hierarchy, not just white readable text. Do not change the wording, protected regions, placement or closing design to accommodate this treatment.';

export function sceneHeadlineTreatment(text, direction='', emphasis='') {
  const original=String(text||'').normalize('NFC').replace(/\s+/gu,' ').trim();
  const words=original.split(/\s+/u);
  const desc=String(direction||'').toLowerCase();
  const inline=/\b(inline|single[ -]line|one[ -]line)\b/.test(desc);
  const equal=/\b(balanced|equal[ -]lines)\b/.test(desc);
  const stacked=!inline&&!equal&&(/\b(stacked|two[ -]line|2[ -]line|display hierarchy)\b/.test(desc)||words.length===2);
  const phrase=String(emphasis||'').normalize('NFC').replace(/\s+/gu,' ').trim();
  let lines=null;
  // A whole semantic phrase stays together when it is a leading/trailing group.
  if(stacked&&phrase&&phrase.length<original.length){
    const lower=original.toLocaleLowerCase(),p=phrase.toLocaleLowerCase();
    if(lower.endsWith(' '+p))lines=[original.slice(0,-phrase.length).trim(),original.slice(-phrase.length)];
    else if(lower.startsWith(p+' '))lines=[original.slice(0,phrase.length),original.slice(phrase.length).trim()];
  }
  if(stacked&&!lines&&words.length===2)lines=words;
  return {inline,stacked,lines,
    scaleForLine:(line,index)=>{
      if(!stacked||!lines)return 1;
      if(phrase&&line.toLocaleLowerCase()===phrase.toLocaleLowerCase())return 1;
      if(phrase)return .68;
      // Without a planned emphasis, only the short introductory line gets a
      // smaller size. Never invent an accent word or recolor a wrapped line.
      return index===0&&lines[0].length<lines[1].length*.65?.68:1;
    },
    leading:stacked?1.04:1.12};
}

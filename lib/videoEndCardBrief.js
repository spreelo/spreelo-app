// One general brief shared by both copy planners and the background generator.
export const END_CARD_LAYOUT_POLICY = 'dominant_v363';
export const END_CARD_HOLD_SECONDS = 2;
export const END_CARD_DESIGN_BRIEF = `Create a separate full-bleed 9:16 closing advertisement that is understood in two seconds. Derive palette, texture, material feeling, depth and typography character from the verified product, actual film, campaign and company identity. Make a fresh coherent design for this context, never a fixed product-category template or a frozen video frame. Do not redraw the product or people. Keep decorative detail near the edges and a calm central text region on the final 1080x1920 canvas: x=70..1010, y=480..1480, clear of the authentic corner logo and social controls.
The closing hook is the dominant visual element: preferably 2–6 words, at most two intentional lines, filling approximately 75–88% of the visible width. A two-line hook may occupy 22–32% of the frame height. Rewrite long copy before reducing its presence. Express a relevant closing thought rather than automatically repeating the scene headline. No tiny catalogue eyebrow or extra product-name line.
Below it place a clearly subordinate, action-led invitation motivated by this product and campaign: purchase, booking, contact, visit or participation only when supported. Prefer 2–6 words, at most seven. Avoid a generic catalogue label or merely naming the product. Never invent scarcity, discounts, donation claims, product benefits, availability or clickable-video features. Set the verified website domain separately below the invitation. Show the authentic logo only once in its existing corner; do not draw another logo or company-name badge.
Choose an optional exact meaningful phrase within the approved hook for restrained color emphasis, not an automatic tint on the last wrapped line. Preserve exact approved words, language and diacritics. Background, huge hook, invitation and domain must form one polished, optically centered commercial with generous spacing.`;

export function endCardWebsite(value) {
  try {
    const text=String(value||'').trim();
    if(!text)return '';
    const url=new URL(/^https?:\/\//i.test(text)?text:`https://${text}`);
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return '';
    const host=url.hostname.replace(/^www\./i,'');
    return host.length<=45 ? host : '';
  } catch {return '';}
}
export function normalizeEndCardHook(value,fallback='') {
  const text=String(value||'').normalize('NFC').replace(/\s+/gu,' ').trim();
  return text && Array.from(text).length<=48 && text.split(/\s+/u).length<=6 && !/https?:|www\.|#/iu.test(text) ? text : fallback;
}
export function endCardEmphasis(value,headline) {
  const text=String(value||'').normalize('NFC').replace(/\s+/gu,' ').trim();
  return text && String(headline||'').normalize('NFC').toLocaleLowerCase().includes(text.toLocaleLowerCase()) ? text : '';
}

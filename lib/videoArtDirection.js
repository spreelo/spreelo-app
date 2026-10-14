// Shared by animation and the finished Kling advertising pass. These are
// composition rules, not a fixed visual template or product-category preset.
export const VIDEO_DESIGN_VERSION = 342;
export const VIDEO_ART_DIRECTION = `Design the headline, product composition and closing card as ONE coherent commercial for this specific post.
Derive font character, weight, spacing and a restrained accent color from the actual scene, product category, campaign and company identity. A gaming post can use crisp technical typography and restrained RGB-inspired accents; a calm home product calls for quieter, more refined lettering. These are examples, never universal templates.
Make one short, natural customer benefit or relevant invitation the main message. Avoid stiff catalogue prose, literal translations, empty superlatives and invented features. Read the wording as an advertisement in the customer's language before approving it.
Use an intentional hierarchy: one dominant phrase, with any supporting phrase visibly smaller/lighter and closely grouped. When a single locked headline wraps, you may emphasize its main phrase without changing the words or reading order. Do not give every line the same oversized extra-bold weight by default.
Choose a clean, stable negative-space region across all supplied frames. Never cover product details, faces, hands or the action. Keep the type optically connected to the product, not stranded in a distant corner. Preserve ample margins and the real logo's corner space.
Use scene-appropriate light or dark lettering. No permanent outline, thick drop shadow, bevel, extrusion or label effect. A delicate contrast aid is allowed only when the moving scene needs it.
The closing card carries the same palette and typographic character, with a cohesive centered CTA group and ample space. For gaming, favor the principle of confident centered typography with restrained atmospheric light; do not copy an exact gaming mockup onto every post. No standalone company-name headline, duplicate logo or decorative fake logo. The authentic customer logo stays in its existing corner.`;

export function videoSenderLabel(name, language = "") {
  const text = String(name || "").trim().slice(0, 80);
  if (!text) return "";
  const value = String(language).toLowerCase();
  const prefixes = { sv: "Hos", en: "At", da: "Hos", no: "Hos", nb: "Hos", de: "Bei", fr: "Chez", es: "En", it: "Da", pt: "Na", nl: "Bij", fi: "", pl: "W", tr: "", cs: "U" };
  const names = { swedish: "sv", svenska: "sv", english: "en", danish: "da", norwegian: "no", german: "de", french: "fr", spanish: "es", italian: "it", portuguese: "pt", dutch: "nl", finnish: "fi", polish: "pl", turkish: "tr", czech: "cs" };
  const key = names[value] || value.split(/[-_]/)[0];
  return prefixes[key] ? `${prefixes[key]} ${text}` : text;
}

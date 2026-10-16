// Shared by animation and the finished Kling advertising pass. These are
// composition rules, not a fixed visual template or product-category preset.
export const VIDEO_DESIGN_VERSION = 360;
export const VIDEO_ART_DIRECTION = `Design the headline, product composition and closing card as ONE coherent commercial for this specific post.
Derive font character, weight, spacing, contrast treatment and accents uniquely from the verified product image, actual scene, campaign and company identity. Make a fresh, intentional creative decision each time: no product-category lookup tables, reusable visual presets or predetermined typography families.
Make one short, natural customer benefit or relevant invitation the main message. Avoid stiff catalogue prose, literal translations, empty superlatives and invented features. Read the wording as an advertisement in the customer's language before approving it.
Use an intentional hierarchy: one dominant phrase, with any supporting phrase visibly smaller/lighter and closely grouped. When a single locked headline wraps, you may emphasize its main phrase without changing the words or reading order. Do not give every line the same oversized extra-bold weight by default.
Choose a clean, stable negative-space region across all supplied frames. Never cover product details, faces, hands or the action. Keep the type optically connected to the product, not stranded in a distant corner. Preserve ample margins and the real logo's corner space.
Use scene-appropriate light or dark lettering. No permanent outline, thick drop shadow, bevel, extrusion or label effect. A delicate contrast aid is allowed only when the moving scene needs it.
Do not repeat the product name in a small eyebrow when it is already part of the headline. A headline should normally use one or two complete balanced lines; supporting wording must be visibly lighter and smaller. Never automatically tint the final line merely because it wrapped.
The closing card carries the same palette and typographic character, with a cohesive centered group and ample space; the hook is the dominant element, the final invitation is a quieter single line, and the real sender is clearly legible. For gaming, favor the principle of confident centered typography with restrained atmospheric light; do not copy an exact gaming mockup onto every post. No standalone company-name headline, duplicate logo or decorative fake logo. The authentic customer logo stays in its existing corner. Do not default to centered small black sans-serif text on every video. Treat typography as bespoke visual design: vary font personality, scale, leading and emphasis with the real product and scene. Preserve the visual treatment from the chosen image artwork in the final renderer. No detached thin strokes, random rules, or stray decorative marks beside the copy. Mobile-first lettering should remain prominent in the actual 1080x1920 output, with protected subject areas and social UI regions kept clear.`;

export function videoSenderLabel(name, language = "") {
  const text = String(name || "").trim().slice(0, 80);
  if (!text) return "";
  const value = String(language).toLowerCase();
  const prefixes = { sv: "Hos", en: "At", da: "Hos", no: "Hos", nb: "Hos", de: "Bei", fr: "Chez", es: "En", it: "Da", pt: "Na", nl: "Bij", fi: "", pl: "W", tr: "", cs: "U" };
  const names = { swedish: "sv", svenska: "sv", english: "en", danish: "da", norwegian: "no", german: "de", french: "fr", spanish: "es", italian: "it", portuguese: "pt", dutch: "nl", finnish: "fi", polish: "pl", turkish: "tr", czech: "cs" };
  const key = names[value] || value.split(/[-_]/)[0];
  return prefixes[key] ? `${prefixes[key]} ${text}` : text;
}

import sharp from "sharp";
import { escapeProductSvg } from "./globalProductTypography.js";

export const KLING_END_CARD_SECONDS = 1.3;
export const KLING_END_CARD_TRANSITION_SECONDS = 0.3;
// One landscape image request: left is a full 9:16 end card, right is a
// transparent typography working area. Fixed coordinates, no AI OCR gate.
export function buildKlingAdvertisingAtlasPrompt({ headline, subheadline, closingLine, designDirection, brand = {}, hasLogo }) {
  const context = JSON.stringify({ name: brand.business_name || "", industry: brand.industry || brand.business_category || "",
    identity: brand.brand_colors || brand.colors || brand.primary_color || brand.visual_identity || "", audience: brand.target_audience || "",
    description: String(brand.brand_description || brand.description || brand.business_description || "").slice(0, 800) });
  return `Create ONE 1536x1024 RGBA production asset atlas for a premium short social product commercial.
The supplied images are actual FINISHED video frames and possibly the verified product image. Do not reproduce photos, people or products. Company context: ${context}.
The atlas has TWO FIXED areas with NO labels, borders, dividers or artwork crossing between them:
LEFT x=0..575, y=0..1023: an OPAQUE finished vertical 9:16 END CARD, exactly 576x1024. Fill this entire rectangle with a professionally designed background chosen for THIS company, product and video: restrained tonal shapes, subtle relevant textures or geometry. Continue the video's visual mood and the company's identity. Vary the composition between posts; do not default to pink waves or the same template for all businesses. Calm, premium, instant readability. No website address, button, price, invented claim or extra text.
${hasLogo ? "Reserve a completely clean logo placement area x=110..466, y=290..430. Do NOT draw the logo or company name; the authentic logo will be composited here later." : `Render the exact company name '${brand.business_name || ""}' as a clear typographic sender, within x=65..511, y=290..430. Do NOT invent a logo.`}
Render the EXACT closing line '${closingLine}' with prominent art-directed typography within x=55..521, y=480..735, with intentional line breaks. Keep all text out of the top 15% and bottom 20%. Design for a brief 1.3 second advertising finish. No product-photo freeze frame.
RIGHT x=576..1535, y=0..1023: ONLY a generously sized main-message TYPOGRAPHY design on FULLY TRANSPARENT background. Keep all letters and attached small accents inside x=636..1475, y=130..880. Exact headline '${headline}'. ${subheadline ? `Exact subheadline '${subheadline}'.` : "No subheadline."} Choose typography/contrast appropriate across the supplied video frames. Crisp confident mobile-readable lettering. No background wash, plate, panel, rectangle, shadow, haze or glow here. Every non-letter/non-accent pixel in this RIGHT area must have alpha=0. Do not print a checkerboard.
Art direction: ${designDirection || "Choose a distinctive polished advertising composition appropriate to this product and business."}
The left end card may contain opaque background graphics; the right text overlay must remain transparent. Do not add any closing-line group to the right. Output the single atlas only.`;
}
export async function splitKlingAdvertisingAtlas(buffer) {
  const atlas = await sharp(buffer).resize(1536, 1024, { fit: "fill" }).ensureAlpha().png().toBuffer();
  return {
    headline: await sharp(atlas).extract({ left: 576, top: 0, width: 960, height: 1024 }).png().toBuffer(),
    endCard: await sharp(atlas).extract({ left: 0, top: 0, width: 576, height: 1024 })
      .flatten({ background: "#f4f1ed" }).resize(1080, 1920).png().toBuffer(),
  };
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

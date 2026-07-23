import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const root = new URL("../", import.meta.url);
const route = fs.readFileSync(new URL("app/api/cron/run-automations/route.js", root), "utf8");
const nextConfig = fs.readFileSync(new URL("next.config.mjs", root), "utf8");
const packageJson = JSON.parse(fs.readFileSync(new URL("package.json", root), "utf8"));

assert.equal(packageJson.dependencies["@fontsource/inter"], "5.2.8");
assert.match(nextConfig, /node_modules\/@fontsource\/inter\/files\/\*\.woff/);
assert.match(route, /@fontsource\/inter\/files\/inter-latin-ext-700-normal\.woff/);
assert.match(route, /fontfile: getCarouselLabelFontFile\(\)/);
assert.match(route, /Carousel label text rendered with packaged font/);
assert.match(route, /CAROUSEL_LABEL_FONT_UNAVAILABLE/);
assert.doesNotMatch(route, />PREMIUM<\/text>/);

const candidateFonts = [
  process.env.CAROUSEL_LABEL_FONT_FILE,
  "/usr/share/fonts/opentype/inter/Inter-Bold.otf",
  "/usr/share/fonts/fonts-go/Go-Bold.ttf",
].filter(Boolean);
const fontfile = candidateFonts.find((candidate) => fs.existsSync(candidate));
assert.ok(fontfile, "A local test font is required for the Sharp fontfile verification");

const renderText = async ({ text, fontSize, color, width, letterSpacing = 0 }) => {
  const escaped = String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const spacing = letterSpacing > 0 ? ` letter_spacing="${letterSpacing}"` : "";
  return sharp({
    text: {
      text: `<span foreground="${color}"${spacing}>${escaped}</span>`,
      font: `Inter ${fontSize}`,
      fontfile,
      width,
      align: "left",
      wrap: "word-char",
      rgba: true,
      dpi: 96,
    },
  }).png().toBuffer();
};

const cardWidth = 430;
const cardHeight = 166;
const card = Buffer.from(`
  <svg width="${cardWidth}" height="${cardHeight}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.78"/>
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0.58"/>
      </linearGradient>
    </defs>
    <rect width="430" height="166" rx="30" fill="url(#glass)" stroke="#ffffff" stroke-opacity="0.88" stroke-width="2"/>
    <path d="M 28 25 L 33 30 L 28 35 L 23 30 Z" fill="#bd8325"/>
  </svg>
`);
const premium = await renderText({ text: "PREMIUM", fontSize: 14, color: "#a96f16", width: 190, letterSpacing: 950 });
const title = await renderText({ text: "Julgran Enhörningar\nBarn T-shirt", fontSize: 24, color: "#172033", width: 330 });
const preview = await sharp({
  create: { width: 430, height: 166, channels: 4, background: { r: 223, g: 211, b: 194, alpha: 1 } },
})
  .composite([
    { input: card, top: 0, left: 0 },
    { input: premium, top: 17, left: 42 },
    { input: title, top: 58, left: 28 },
  ])
  .png()
  .toBuffer();

const outputPath = path.join(path.dirname(new URL(import.meta.url).pathname), "../label-preview-v125.png");
fs.writeFileSync(outputPath, preview);
const metadata = await sharp(preview).metadata();
assert.equal(metadata.width, 430);
assert.equal(metadata.height, 166);
assert.ok(preview.length > 5000, "Rendered label preview should contain visible text and glass geometry");

console.log("Packaged-font Sharp label rendering invariants passed.");

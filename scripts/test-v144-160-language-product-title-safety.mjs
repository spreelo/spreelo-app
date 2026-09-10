import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { SUPPORTED_CONTENT_LANGUAGES } from "../lib/languageCatalog.js";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const automation = read("app/automation/page.jsx");
const cron = read("app/api/cron/run-automations/route.js");
const social = read("app/social-channels/page.jsx");

assert.equal(SUPPORTED_CONTENT_LANGUAGES.length, 30, "All 30 official languages must remain selectable as content languages");
assert.ok(automation.includes("const [language, setLanguage] = useState(\"English\")"), "Planner must display a real language rather than Auto by default");
assert.ok(automation.includes("SUPPORTED_CONTENT_LANGUAGES.map((item)"), "Planner language choices must come from the shared 30-language catalogue");
assert.ok(!automation.includes('{ value: "Auto"'), "Planner/campaign language dropdown must not expose Automatic");
assert.ok(automation.includes("const brandDefaultPostLanguage = brandProfileData?.content_language"), "Analyzed/brand content language must remain the default shown in the planner");
assert.ok(automation.includes('slot.contentTypeId === "manual_prompt" && !languageExplicitlyChosen'), "Custom posts must retain hidden prompt-language mode until the user explicitly changes language");
assert.ok(automation.includes('? "Auto"\n            : normalizeSingleContentLanguage(language, "English")'), "Only a non-overridden custom post may persist the hidden Auto marker");
assert.ok(automation.includes("setLanguageExplicitlyChosen(true)"), "Changing the visible language must explicitly override prompt-language detection");

assert.ok(cron.includes('String(rule?.content_type_id || "").trim() === "manual_prompt"'), "Runtime must distinguish custom/manual posts");
assert.ok(cron.includes('return { language: "Auto", source: "manual_prompt_language" };'), "Runtime must preserve hidden prompt-language mode for custom posts");
assert.ok(cron.includes("function getRuleLanguageInstruction(rule)"), "All downstream text generation must use one rule-aware language instruction");
assert.ok((cron.match(/\$\{getRuleLanguageInstruction\(rule\)\}/g) || []).length >= 3, "Post and carousel text generation must honor prompt-language mode consistently");
assert.ok(cron.includes("Detect and use the language of the user's instruction"), "Manual custom posts must explicitly detect the prompt language");
assert.ok(cron.includes("Do not switch to the Brand profile language merely because the brand normally publishes in another language"), "Prompt-language mode must not be overridden by the brand default");
assert.ok(cron.includes("function getRuleVisualLanguageContext(rule)"), "AI image generation must also understand hidden prompt-language mode");
assert.ok(cron.includes("Use the same language as the user's instruction and the finished post copy"), "Manual custom-post images must inherit the prompt/post language rather than the word Auto");

for (const placeholder of [
  '"product image"',
  '"product photo"',
  '"main product image"',
  '"produktbild"',
  '"produkt foto"',
  '"tuotekuva"',
]) {
  assert.ok(cron.includes(placeholder), `Generic product-title guard must recognize ${placeholder}`);
}
assert.ok(cron.includes("function isGenericProductTitlePlaceholder(value)"), "Generic product-title detector must exist");
assert.ok(cron.includes("function resolveVerifiedProductTitle({"), "Verified product-title resolver must exist");
assert.ok(cron.includes("extractPrimaryProductHeading(html)"), "Product-title repair must consider the page H1");
assert.ok(cron.includes("metadataTitle"), "Product-title repair must consider page metadata");
assert.ok(cron.includes("deriveProductTitleFromUrl(productUrl)"), "Exact product URL must be a bounded last-resort title source");
assert.ok(cron.includes("const title = resolveVerifiedProductTitle({\n    productName: candidate?.locked_product_title"), "Exact-page product lock must repair generic candidate titles before locking identity");
assert.ok(cron.includes('type.toLowerCase() === "product"\n      ? resolveVerifiedProductTitle({ productName: sanitizedTitle, productUrl: url || resolvedUrl })'), "Generic product titles must be repaired or fail closed during website-item normalization");
assert.ok(cron.includes("Never render placeholder metadata such as \"Product image\""), "Editorial image generator must explicitly ban placeholder product-name copy");
assert.ok(cron.includes("Use exactly ONE visible text role: the editorial headline"), "Image generator must omit the product-name row if no verified title exists");
assert.ok(cron.includes("const productTitle = getVerifiedProductTitleCandidate("), "Other public product overlay copy must also reject generic titles");

// Execute the actual title-safety helper block with small deterministic stubs so
// the Köttfabriken failure mode is tested rather than only matched as source text.
const helperStart = cron.indexOf("function isGenericProductTitlePlaceholder");
const helperEnd = cron.indexOf("\n\nfunction getHostnameFromUrl", helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, "Product-title helper block must be extractable");
const helperSource = cron.slice(helperStart, helperEnd);
const titleSafety = new Function(`
  const decodeHtmlEntities = (value) => String(value || "").replace(/&amp;/g, "&");
  const sanitizeProductTitleForCard = (value) => decodeHtmlEntities(value).replace(/<[^>]+>/g, " ").replace(/\\s+/g, " ").trim();
  const stripHtmlToText = (value) => String(value || "").replace(/<[^>]+>/g, " ").replace(/\\s+/g, " ").trim();
  ${helperSource}
  return { isGenericProductTitlePlaceholder, resolveVerifiedProductTitle };
`)();
assert.equal(titleSafety.isGenericProductTitlePlaceholder("Product image"), true, "Product image must be rejected as a title");
assert.equal(titleSafety.isGenericProductTitlePlaceholder("Fläskkarré benfri Sverige"), false, "A real product title must remain valid");
assert.equal(
  titleSafety.resolveVerifiedProductTitle({
    productName: "Product image",
    html: "<main><h1>Fläskkarré benfri Sverige</h1></main>",
    productUrl: "https://kottfabriken.se/p/flaskkott/karre/flaskkarre-benfri-sverige-4",
  }),
  "Fläskkarré benfri Sverige",
  "A generic image label must be repaired from the exact product-page H1"
);
assert.equal(
  titleSafety.resolveVerifiedProductTitle({
    productName: "Product image",
    productUrl: "https://kottfabriken.se/p/flaskkott/karre/flaskkarre-benfri-sverige-4",
  }),
  "Flaskkarre benfri sverige",
  "Exact product URL slug must provide a bounded fallback instead of Product image"
);

const socialDigest = (await import("node:crypto")).createHash("sha256").update(social).digest("hex");
assert.equal(
  socialDigest,
  "e5ceb52162b981283f11cb34b0345b056157927cade1cf888b72cbd7d0254ee8",
  "Social Channels must remain byte-for-byte identical to the verified v144.159 page"
);

console.log("v144.160 language and product-title safety regression checks passed.");

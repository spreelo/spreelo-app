import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { calculateOpenAICost } from "../lib/generationCostTracking.js";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const route = read("app/api/cron/run-automations/route.js");
const cost = read("lib/generationCostTracking.js");
const social = read("app/social-channels/page.jsx");

assert.match(route, /const EDITORIAL_HEADLINE_MODEL =\s*\n\s*process\.env\.EDITORIAL_HEADLINE_MODEL \|\| "gpt-5\.6-sol";/);
assert.match(route, /async function prepareLockedEditorialHeadline\(/);
assert.match(route, /model: EDITORIAL_HEADLINE_MODEL/);
assert.match(route, /reasoning: \{ effort: "none" \}/);
assert.match(route, /type: "input_image", image_url: imageUrl, detail: "low"/);
assert.match(route, /Do not browse, search the web/);
assert.match(route, /silently proofread the final headline character by character for spelling, accents\/diacritics, grammar and accidental word substitutions/);
assert.match(route, /max_output_tokens: 120/);

const prepareStart = route.indexOf("async function prepareLockedEditorialHeadline");
const promptStart = route.indexOf("function buildWebsiteItemEditorialPostImagePrompt", prepareStart);
assert.ok(prepareStart >= 0 && promptStart > prepareStart);
const prepareBlock = route.slice(prepareStart, promptStart);
assert.ok(!prepareBlock.includes("tools:"), "Headline preparation must not enable web search or other tools");
assert.match(prepareBlock, /source: "gpt-5\.6-sol-proofread"/);
assert.match(prepareBlock, /source: fallbackHeadline \? "post-copy-fallback" : "product-name-only-fallback"/);
assert.match(prepareBlock, /using pre-image text fallback without adding web research/);

const imagePromptStart = promptStart;
const imagePromptEnd = route.indexOf("function buildWebsiteItemEditorialTypographyOverlayPrompt", imagePromptStart);
const imagePromptBlock = route.slice(imagePromptStart, imagePromptEnd);
assert.match(imagePromptBlock, /LOCKED VISIBLE COPY CONTRACT — WORDING WAS FINALIZED BEFORE IMAGE GENERATION/);
assert.match(imagePromptBlock, /Locked headline, exact words:/);
assert.match(imagePromptBlock, /Headline spelling reference:/);
assert.match(imagePromptBlock, /The headline wording is immutable/);
assert.match(imagePromptBlock, /Render the locked headline character-for-character/);
assert.match(imagePromptBlock, /The image model's job is visual design and typography, not copywriting/);
assert.match(imagePromptBlock, /No separate headline was approved before image generation\. Do NOT invent one/);
assert.doesNotMatch(imagePromptBlock, /Headline: create exactly one short unique editorial headline/);
assert.doesNotMatch(imagePromptBlock, /Create one original product-specific headline/);

const generatorStart = route.indexOf("export async function generateWebsiteItemEditorialPostImage");
const generatorEnd = route.indexOf("function websiteTextContainsAny", generatorStart);
const generatorBlock = route.slice(generatorStart, generatorEnd);
const headlineCall = generatorBlock.indexOf("prepareLockedEditorialHeadline");
const firstImageCall = Math.min(
  ...["openai.images.edit", "openai.images.generate"]
    .map((needle) => generatorBlock.indexOf(needle))
    .filter((index) => index >= 0)
);
assert.ok(headlineCall >= 0, "Headline must be prepared inside the editorial product generator");
assert.ok(firstImageCall > headlineCall, "Headline must be finalized before the paid GPT-Image call");
assert.match(generatorBlock, /lockedHeadline: lockedHeadline\.headline/);
assert.match(generatorBlock, /headlineSource: lockedHeadline\.source/);

assert.match(cost, /"gpt-5\.6-sol": \{ input: 4, cachedInput: 0\.4, output: 20/);
assert.match(cost, /normalized\.startsWith\("gpt-5\.6-sol"\) \|\| normalized === "gpt-5\.6"/);
const solCost = calculateOpenAICost({
  operation: "responses.create",
  request: { model: "gpt-5.6-sol" },
  response: {
    id: "resp_test_sol",
    usage: {
      input_tokens: 2000,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 50,
      total_tokens: 2050,
    },
  },
});
assert.equal(solCost.exact, true);
assert.equal(solCost.amount, 0.009, "2k Sol input + 50 output should be exactly $0.009 at pinned pricing");

const socialDigest = crypto.createHash("sha256").update(social).digest("hex");
assert.equal(
  socialDigest,
  "e5ceb52162b981283f11cb34b0345b056157927cade1cf888b72cbd7d0254ee8",
  "Social Channels must remain byte-for-byte identical to the verified baseline"
);

console.log("v144.165 Sol locked editorial headline regression checks passed.");

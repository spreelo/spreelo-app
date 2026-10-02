import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const finalizer = fs.readFileSync(
  path.join(root, "app/api/cron/finalize-kling-videos/route.js"),
  "utf8"
);

assert.match(
  finalizer,
  /Choose the CTA from the actual purpose of THIS post/,
  "Kling CTA planning must be driven by the purpose of the current post."
);
assert.match(
  finalizer,
  /verified product or service type, the campaign goal, the CTA setting and the intended next user action/,
  "CTA planning must use product/service type, goal, CTA setting and intended action."
);
assert.match(
  finalizer,
  /For a product-focused sales post, prefer a concrete product-oriented action/,
  "Product ads must prefer product-oriented CTA language."
);
assert.match(
  finalizer,
  /rather than a vague informational CTA such as 'learn more' or 'read more'/,
  "Product ads must avoid vague informational CTAs unless the post is genuinely informational."
);
assert.match(
  finalizer,
  /Do not choose a generic CTA merely because it is broadly valid/,
  "CTA planner must explicitly reject generic-but-weak CTA choices."
);
assert.match(
  finalizer,
  /CTA ending text: "\$\{creativePlan\.cta \|\| getFallbackKlingCta\(post\)\}"/,
  "The chosen purpose-aware CTA must be sent to the same GPT-Image-2 overlay generation."
);
assert.match(
  finalizer,
  /cta_overlay_provider: "gpt-image-2.5-flare-shared-overlay-split"/,
  "The CTA must still come from the shared GPT-Image-2 render rather than a second image generation."
);

console.log("v144.116 purpose-aware Kling CTA checks passed");

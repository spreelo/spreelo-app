import fs from "node:fs";
import assert from "node:assert/strict";

const src = fs.readFileSync(new URL("../app/api/cron/run-automations/route.js", import.meta.url), "utf8");

assert.match(src, /async function reviewCarouselProductSlideIdentity\(/);
assert.match(src, /IGNORE campaign headlines, supporting text, CTA text, decorative typography/);
assert.match(src, /identity_markings_ok/);
assert.match(src, /Do not count marketing copy placed around the product as a product marking/);
assert.match(src, /const identityReview = await reviewCarouselProductSlideIdentity\(/);
assert.match(src, /async function reviewKlingOpeningSceneIdentity\(/);
assert.match(src, /print_logo_text_match/);
assert.match(src, /Carousel product identity review rejected designed slide/);

const carouselCall = src.indexOf("const identityReview = await reviewCarouselProductSlideIdentity(");
const klingCallAfterCarousel = src.indexOf("const identityReview = await reviewKlingOpeningSceneIdentity(", carouselCall);
assert.equal(klingCallAfterCarousel, -1, "carousel design block must not fall back to Kling reviewer");

console.log("v144.170 carousel identity review regression passed");

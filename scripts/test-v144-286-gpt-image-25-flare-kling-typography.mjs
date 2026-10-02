import fs from "node:fs";

const route = fs.readFileSync("app/api/cron/finalize-kling-videos/route.js", "utf8");
const cost = fs.readFileSync("lib/generationCostTracking.js", "utf8");

function must(condition, message) {
  if (!condition) throw new Error(message);
}

must(route.includes('const KLING_TYPOGRAPHY_MODEL = "gpt-image-2.5-flare";'), "Kling typography must call GPT-Image 2.5 Flare directly");
must(!route.includes('const KLING_TYPOGRAPHY_MODEL = "gpt-image-2";'), "Kling typography must not call GPT-Image 2 first");
must(route.includes('background: "transparent"'), "Flare typography request must explicitly require transparency");
must(route.includes('output_format: "png"'), "Flare typography request must use PNG for alpha transparency");
must(route.includes('gpt-image-2.5-flare-finished-video-shared-overlay'), "Final overlay provider must identify Flare");
must(route.includes('gpt-image-2.5-flare-shared-overlay-split'), "CTA split provider must identify Flare");
must(cost.includes('"gpt-image-2.5-flare": { textInput: 5, cachedTextInput: 1.25, imageInput: 8, cachedImageInput: 2, imageOutput: 30 }'), "Flare cost rates must be pinned separately");
must(cost.includes('normalized.startsWith("gpt-image-2.5-flare")'), "Cost canonicalization must recognize Flare before GPT-Image 2");

console.log("v144.286 GPT-Image 2.5 Flare Kling typography regression test passed");

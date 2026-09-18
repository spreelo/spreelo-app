import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const automation = read("app/automation/page.jsx");
const globals = read("app/globals.css");
const css = read("app/styles/140-v144-202-onboarding-explainer-responsive-reference.css");

assert.match(globals, /140-v144-202-onboarding-explainer-responsive-reference\.css/);
assert.match(automation, /spreelo201-explainer/);
assert.match(automation, /spreelo199-personal-desktop/);
assert.match(automation, /spreelo191-ready-banner/);

for (const asset of [
  "public/onboarding-explainer/website.webp",
  "public/onboarding-explainer/ai-content.webp",
  "public/onboarding-explainer/ready-posts.webp",
]) {
  assert.ok(fs.existsSync(path.join(root, asset)), `Missing explainer asset ${asset}`);
}

// Desktop reference: three complete cards with overlapping zero-width arrow tracks.
assert.match(css, /grid-template-columns:minmax\(0,1fr\) 0 minmax\(0,1fr\) 0 minmax\(0,1fr\)/);
assert.match(css, /min-height:198px/);
assert.match(css, /max-height:118px/);
assert.match(css, /width:42px/);

// Mobile repair: vertical flow, no horizontal carousels, downward arrows.
assert.match(css, /@media \(max-width:720px\)/);
assert.match(css, /flex-direction:column/);
assert.match(css, /grid-template-columns:minmax\(104px,32%\) minmax\(0,1fr\)/);
assert.match(css, /transform:rotate\(90deg\)/);
assert.match(css, /grid-template-columns:1fr/);
assert.match(css, /scroll-snap-type:none/);

console.log("v144.202 onboarding explainer responsive-reference regression checks passed");

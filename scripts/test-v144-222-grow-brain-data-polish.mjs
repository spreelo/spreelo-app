import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = fs.readFileSync(path.join(root, "app/grow-brain/page.jsx"), "utf8");
const css = fs.readFileSync(path.join(root, "app/styles/148-v144-222-grow-brain-data-polish.css"), "utf8");
const globals = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");

assert.match(page, /path \+= ` C\$\{c1x\.toFixed\(1\)\}/);
assert.match(page, /while \(lastMeasuredIndex > 0 && safeNumber\(rawDailySeries\[lastMeasuredIndex\]\?\.posts\) === 0\)/);
assert.match(page, /viewBox="0 0 760 250"/);
assert.match(page, /grow-v222-smooth-line/);
assert.match(page, /learningEventCount >= 12 \? `\$\{learningEventCount\} ✓`/);
assert.match(page, /topPosts\.slice\(0, 6\)\.map/);
assert.match(page, /\/grow-brain\/demo-top-6\.webp/);
assert.doesNotMatch(page, /\/onboarding-preview\/post-1\.png/);
assert.match(page, /return `\$\{format\(numeric \/ 1000\)\}k`/);
assert.match(globals, /148-v144-222-grow-brain-data-polish\.css/);
assert.match(css, /grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
for (let i = 1; i <= 6; i += 1) {
  const asset = path.join(root, `public/grow-brain/demo-top-${i}.webp`);
  assert.ok(fs.existsSync(asset), `missing ${asset}`);
  assert.ok(fs.statSync(asset).size > 3000, `demo asset ${i} is unexpectedly small`);
}
console.log("v144.222 Grow Brain data polish checks passed.");

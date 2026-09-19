import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = fs.readFileSync(path.join(root, "app/grow-brain/page.jsx"), "utf8");

assert.match(page, /function buildGrowBrainDemoData\(\)/);
assert.match(page, /new URLSearchParams\(window\.location\.search\)\.get\("demo"\) === "1"/);
assert.match(page, /const postId = `demo-\$\{platform\}-\$\{itemIndex \+ 1\}`/);
assert.match(page, /PLATFORM_ORDER\.forEach/);
assert.match(page, /facebook: \{ name:/);
assert.match(page, /instagram: \{ name:/);
assert.match(page, /tiktok: \{ name:/);
assert.match(page, /youtube: \{ name:/);
assert.match(page, /pinterest: \{ name:/);
assert.match(page, /threads: \{ name:/);
assert.match(page, /\/onboarding-preview\/post-1\.png/);
assert.match(page, /learning_state: "established"/);
assert.match(page, /source_event_count: 18/);
assert.match(page, /String\(row\.post_id \|\| ""\)\.startsWith\("demo-"\)/);

console.log("v144.221 Grow Brain demo preview checks passed.");

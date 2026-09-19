import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const page = read("app/grow-brain/page.jsx");
const labels = read("lib/i18n/defaultLabels.js");
const globals = read("app/globals.css");
const css = read("app/styles/143-v144-216-grow-brain-premium.css");

assert.match(page, /grow-v216-hero-stage/);
assert.match(page, /grow-v216-kpi-heading/);
assert.match(page, /learningProgressPercent/);
assert.match(page, /coverageWaiting/);
assert.match(page, /getLearningSignalLabel/);
assert.match(page, /grow-v216-top-grid/);
assert.match(page, /backgroundImage: `url\(\$\{imageUrl\}\)`/);
assert.match(page, /<rect key={`bar-/);
assert.match(page, /grow-v216-chart-point/);
assert.match(labels, /"growBrain\.kpiTitle": "Key metrics"/);
assert.match(labels, /"growBrain\.learningMaturity"/);
assert.match(labels, /"growBrain\.coverageWaiting"/);
assert.match(globals, /143-v144-216-grow-brain-premium\.css/);
assert.match(css, /grow-v216-hero-stage/);
assert.match(css, /grow-v216-top-grid/);
assert.match(css, /@media\(max-width:760px\)/);

console.log("v144.216 Grow Brain premium redesign checks passed.");

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const page = read("app/grow-brain/page.jsx");
const layout = read("components/AppLayout.jsx");
const labels = read("lib/i18n/defaultLabels.js");
const globals = read("app/globals.css");
const css = read("app/styles/142-v144-215-grow-brain-dashboard.css");
const tiktok = read("lib/tiktokOAuth.js");

assert.match(layout, /href: "\/grow-brain"/);
assert.match(layout, /labelKey: "layout\.nav\.growBrain"/);
assert.match(page, /post_performance_latest/);
assert.match(page, /post_performance_collection_state/);
assert.match(page, /brand_learning_profiles/);
assert.match(page, /RANGE_OPTIONS = \[7, 30, 90\]/);
assert.match(page, /facebook.*instagram.*tiktok.*youtube.*pinterest.*threads/s);
assert.match(page, /status === "scope_missing"/);
assert.match(page, /Publishing still active|growBrain\.publishingUnaffected/);
assert.match(page, /Top content|growBrain\.topContent/);
assert.match(page, /getInteractionRate/);
assert.match(labels, /"growBrain\.title": "Grow Brain"/);
assert.match(labels, /"growBrain\.observationalNote"/);
assert.match(globals, /142-v144-215-grow-brain-dashboard\.css/);
assert.match(css, /grow-v215-channel-grid/);
assert.match(css, /@media\(max-width:760px\)/);

// TikTok performance permission is opt-in until TikTok approves video.list.
assert.match(tiktok, /TIKTOK_ENABLE_PERFORMANCE_INSIGHTS/);
assert.match(tiktok, /getTikTokRequestedScopes/);
assert.match(tiktok, /isTikTokPerformanceInsightsEnabled/);
assert.match(tiktok, /\? \[\.\.\.TIKTOK_SCOPES, \.\.\.TIKTOK_PERFORMANCE_SCOPES\]/);
assert.match(tiktok, /: \[\.\.\.TIKTOK_SCOPES\]/);

console.log("v144.215 Grow Brain professional dashboard checks passed.");

import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const route = fs.readFileSync(new URL("app/api/cron/run-automations/route.js", root), "utf8");
const nextConfig = fs.readFileSync(new URL("next.config.mjs", root), "utf8");
const packageJson = JSON.parse(fs.readFileSync(new URL("package.json", root), "utf8"));

assert.equal(packageJson.dependencies["@fontsource/inter"], "5.2.8");
assert.match(nextConfig, /node_modules\/@fontsource\/inter\/files\/\*\.woff/);
assert.match(route, /import path from "node:path"/);
assert.match(route, /path\.join\(\s*process\.cwd\(\)/);
assert.match(route, /inter-latin-ext-700-normal\.woff/);
assert.match(route, /fontfile: getCarouselLabelFontFile\(\)/);
assert.match(route, /CAROUSEL_LABEL_FONT_UNAVAILABLE/);
assert.doesNotMatch(
  route,
  /require\.resolve\(["']@fontsource\/inter\/files\/[^"']+\.woff["']\)/,
  "Turbopack must not receive a .woff module specifier from require.resolve",
);
assert.doesNotMatch(route, />PREMIUM<\/text>/);

console.log("Turbopack-safe packaged-font path invariants passed.");

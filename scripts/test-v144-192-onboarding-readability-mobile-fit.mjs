import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const automation = read("app/automation/page.jsx");
const globals = read("app/globals.css");
const css = read("app/styles/131-v144-192-onboarding-readability-mobile-fit.css");

assert.match(globals, /130-v144-191-onboarding-variant5\.css/);
assert.match(globals, /131-v144-192-onboarding-readability-mobile-fit\.css/);

assert.match(automation, /smartOnboardingIntroText/);
assert.match(automation, /smartOnboardingIntroParts/);
assert.match(automation, /spreelo192-brand-highlight/);
assert.match(automation, /tone:\s*index\s*%\s*5/);
assert.match(automation, /spreelo192-post-tone-/);

assert.match(css, /\.spreelo192-brand-highlight[\s\S]*color:\s*#f06445/i);
assert.match(css, /\.spreelo191-hero-copy p[\s\S]*font-size:\s*14\.2px/);
assert.match(css, /\.spreelo191-summary-grid strong[\s\S]*font-size:\s*13\.6px/);
assert.match(css, /\.spreelo191-summary-grid p[\s\S]*font-size:\s*11\.5px/);
assert.match(css, /\.spreelo191-actions \.spreelo191-primary[\s\S]*min-height:\s*68px/);
assert.match(css, /color:\s*#fff\s*!important/);
assert.match(css, /inset:\s*106px 0 0 0/);
assert.match(css, /justify-content:\s*center/);
assert.match(css, /width:\s*calc\(100% - 4px\)/);
assert.match(css, /\.spreelo192-post-tone-0/);
assert.match(css, /\.spreelo192-post-tone-4/);

assert.equal(fs.existsSync(path.join(root, "spreelo-v144.192-SQL.sql")), false, "v144.192 must not add SQL");

console.log("v144.192 onboarding readability/mobile-fit regression checks passed");

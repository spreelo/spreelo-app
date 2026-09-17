import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const globals = read("app/globals.css");
const css = read("app/styles/132-v144-193-mobile-flow-home-plans.css");

assert.match(globals, /132-v144-193-mobile-flow-home-plans\.css/);
assert.match(css, /\.spreelo192-brand-highlight[\s\S]*color:\s*#f06445\s*!important/i);
assert.match(css, /\.spreelo191-modal[\s\S]*max-height:\s*none\s*!important/i);
assert.match(css, /\.spreelo191-body[\s\S]*overflow:\s*visible\s*!important/i);
assert.match(css, /\.spreelo191-actions[\s\S]*position:\s*static\s*!important/i);
assert.match(css, /home-plan-section-head-v153[\s\S]*grid-template-columns:\s*42px minmax\(0, 1fr\)/i);
assert.match(css, /home-plan-overview-copy[\s\S]*display:\s*contents\s*!important/i);
assert.match(css, /home-plan-overview-copy > p[\s\S]*grid-column:\s*1 \/ -1\s*!important/i);
assert.match(css, /home-plan-overview-action[\s\S]*grid-column:\s*1 \/ -1\s*!important/i);
assert.equal(fs.existsSync(path.join(root, "spreelo-v144.193-SQL.sql")), false, "v144.193 must not add SQL");

console.log("v144.193 mobile flow + Home plans regression checks passed");

import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync('app/styles/145-v144-218-grow-brain-studio-surface.css','utf8');
const globals = fs.readFileSync('app/globals.css','utf8');
const hero = fs.statSync('public/grow-brain/grow-brain-hero-bg.png');

assert.match(globals,/145-v144-218-grow-brain-studio-surface\.css/);
assert.match(css,/spreelo-background-v97\.png/);
assert.match(css,/grow-brain\/grow-brain-hero-bg\.png/);
assert.match(css,/background-size:100% 100%,cover/);
assert.match(css,/backdrop-filter:blur\(19px\)/);
assert.match(css,/\.grow-v215-learning-panel\{[\s\S]*user-select:none/);
assert.match(css,/\.grow-v215-progress-track span\{[\s\S]*linear-gradient\(90deg,#a482ff/);
assert.ok(hero.size > 500_000,'hero asset unexpectedly small');
console.log('v144.218 Grow Brain studio-surface checks passed');

import fs from 'node:fs';

function read(path){ return fs.readFileSync(path, 'utf8'); }
function assert(condition, message){ if(!condition){ throw new Error(message); } }
const css = read('app/styles/144-v144-217-grow-brain-hero-typography.css');
const globals = read('app/globals.css');
assert(fs.existsSync('public/grow-brain/grow-brain-hero-bg.png'), 'hero asset missing');
assert(css.includes("url('/grow-brain/grow-brain-hero-bg.png')"), 'hero asset is not wired into CSS');
assert(css.includes('.grow-v216-hero-stage{display:none!important}'), 'old hero stage is not disabled');
assert(css.includes('font-size:13.5px'), 'readability baseline missing');
assert(css.includes('.grow-v215-panel-head h2{font-size:15.5px}'), 'panel heading size missing');
assert(globals.includes('144-v144-217-grow-brain-hero-typography.css'), 'v144.217 stylesheet is not imported');
console.log('v144.217 Grow Brain hero + typography checks passed');

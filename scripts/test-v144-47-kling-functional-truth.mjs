import fs from 'node:fs';
import assert from 'node:assert/strict';

const route = fs.readFileSync(new URL('../app/api/cron/run-automations/route.js', import.meta.url), 'utf8');

assert.match(route, /FUNCTIONAL TRUTH SAFETY:/, 'Kling prompt must contain an explicit functional-truth safety section.');
assert.match(route, /a fully visible product is NOT the same as a functionally verified product/i, 'Visual completeness must not imply function knowledge.');
assert.match(route, /never invent a button, pump, sprayer, dispenser/i, 'Prompt must forbid invented product mechanisms.');
assert.match(route, /perfume\/cosmetic bottles may be held and presented, but do not press the cap\/top, spray, pump, dispense, open or remove parts/i, 'Ambiguous perfume/cosmetic operation must be blocked.');
assert.match(route, /LIGHT AND EFFECT LOCK:/, 'The product lock must explicitly forbid fabricated lights and illuminated logos.');
assert.match(route, /universally self-evident direct physical use/i, 'Obvious physical use must remain possible.');
assert.doesNotMatch(route, /handheld items held\/operated, tools used, appliances operated/, 'Kling must no longer be forced to operate arbitrary products.');
assert.doesNotMatch(route, /have a person naturally hold\/use the exact product/, 'Opening-frame generation must not force ambiguous handheld products into unverified operation.');
assert.match(route, /Perfume\/cosmetic bottles may be held and presented but must not be pressed, sprayed, pumped, dispensed, opened or have parts removed/i, 'Opening-frame generation must also block invented perfume/cosmetic mechanisms.');

console.log('v144.47 Kling functional-truth regression checks passed');

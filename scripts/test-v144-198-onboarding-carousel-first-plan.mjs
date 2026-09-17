import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const page = read('app/automation/page.jsx');
const labels = read('lib/i18n/defaultLabels.js');
const globals = read('app/globals.css');
const css = read('app/styles/137-v144-198-onboarding-carousel-interaction.css');

assert.match(globals, /137-v144-198-onboarding-carousel-interaction\.css/);
assert.ok(!page.includes('onClick={dismissSmartOnboarding}>{t("automation.onboardingV191.showMore")}'), 'Show more must not dismiss onboarding');
assert.match(page, /onPointerDown=\{handleSmartOnboardingPreviewPointerDown\}/);
assert.match(page, /onPointerMove=\{handleSmartOnboardingPreviewPointerMove\}/);
assert.match(page, /onWheel=\{handleSmartOnboardingPreviewWheel\}/);
assert.match(page, /event\.preventDefault\(\);\s*scroller\.scrollLeft \+= delta/);
assert.match(css, /cursor:grab/);
assert.match(css, /cursor:grabbing/);
assert.match(labels, /"automation\.onboardingV198\.chooseSettings": "Choose your own settings"/);
assert.match(labels, /"automation\.onboardingV198\.untilFirstPlanNote": "This setup will keep appearing until you activate your first plan\./);
assert.match(page, /t\("automation\.onboardingV198\.chooseSettings"\)/);
assert.match(page, /t\("automation\.onboardingV198\.untilFirstPlanNote"\)/);

// Customer onboarding remains eligible until there is a real saved plan / successful activation.
assert.match(page, /if \(!isInternalTester && hasCompletedFirstPlan\) return;/);
assert.match(page, /setHasCompletedFirstPlan\(Boolean\(\s*sortedRules\.length > 0 \|\|/s);
assert.match(page, /spreelo_first_plan_activated: true/);
assert.match(page, /setHasCompletedFirstPlan\(true\)/);

console.log('v144.198 onboarding carousel + first-plan persistence checks passed');

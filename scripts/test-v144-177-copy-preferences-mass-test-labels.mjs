import fs from 'node:fs';
import assert from 'node:assert/strict';

const automation = fs.readFileSync(new URL('../app/automation/page.jsx', import.meta.url), 'utf8');
const cron = fs.readFileSync(new URL('../app/api/cron/run-automations/route.js', import.meta.url), 'utf8');
const mass = fs.readFileSync(new URL('../lib/adminMassTest.js', import.meta.url), 'utf8');
const formats = fs.readFileSync(new URL('../lib/contentFormatLibrary.js', import.meta.url), 'utf8');
const labels = fs.readFileSync(new URL('../lib/i18n/defaultLabels.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../app/styles/123-v144-177-copy-preferences.css', import.meta.url), 'utf8');

assert.match(automation, /includeEmojis:\s*typeof overrides\.includeEmojis === "boolean"[\s\S]*?: true,/);
assert.match(automation, /includeHashtags:\s*typeof overrides\.includeHashtags === "boolean"[\s\S]*?: true,/);
assert.match(automation, /automationRuleId: overrides\.automationRuleId \|\| null/);
assert.match(automation, /updateSlotTextPreference\(slot, "includeEmojis", !slot\.includeEmojis\)/);
assert.match(automation, /updateSlotTextPreference\(slot, "includeHashtags", !slot\.includeHashtags\)/);
assert.match(automation, /\.from\("automation_rules"\)[\s\S]*?\.update\(\{ \[column\]: nextValue/);
assert.match(automation, /className="plan-v144177-copy-settings"/);
assert.match(automation, /automationRuleId: null,[\s\S]*?originalUploadedImageStoragePath/);
assert.doesNotMatch(automation, /Show five verified products plus one AI-designed closing campaign image/);

assert.match(cron, /Include emojis: \$\{rule\.include_emojis !== false \? "Yes" : "No"\}/);
assert.match(cron, /Include hashtags: \$\{rule\.include_hashtags !== false \? "Yes" : "No"\}/);
assert.match(cron, /Emoji preference: \$\{carouselIncludeEmojis/);
assert.match(cron, /Hashtag preference: \$\{carouselIncludeHashtags/);
assert.match(cron, /hashtags: \{[\s\S]*?minItems: carouselIncludeHashtags \? 3 : 0/);
assert.match(cron, /required: \["caption", "design_brief", "hashtags", "slides"\]/);
assert.match(cron, /applyCarouselCaptionPreferences/);
assert.match(cron, /include_emojis: rule\.include_emojis !== false/);
assert.match(cron, /include_hashtags: rule\.include_hashtags !== false/);

assert.match(mass, /AI-designed carousel – 5 products/);
assert.match(formats, /default_label: "AI-designed carousel – 5 products"/);
assert.match(labels, /"automation\.textSettings": "Text settings"/);
assert.match(labels, /"automation\.on": "On"/);
assert.match(labels, /"automation\.off": "Off"/);

assert.match(css, /@media \(max-width: 900px\)/);
assert.match(css, /@media \(max-width: 620px\)/);
assert.match(css, /@media \(max-width: 390px\)/);
assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);

console.log('v144.177 copy preferences + carousel naming regression checks passed');

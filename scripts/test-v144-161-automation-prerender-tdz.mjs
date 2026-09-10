import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../app/automation/page.jsx', import.meta.url), 'utf8');
const plannerIndex = source.indexOf('const plannerUiCopy = {');
const languageStateIndex = source.indexOf('const [language, setLanguage] = useState(');
assert.ok(plannerIndex >= 0, 'plannerUiCopy not found');
assert.ok(languageStateIndex > plannerIndex, 'expected language state to remain after plannerUiCopy in current component structure');
const earlyRegion = source.slice(plannerIndex, languageStateIndex);
assert.ok(!/getLanguageDisplayLabel\s*\(\s*language\s*\)/.test(earlyRegion), 'language state is read before initialization in planner setup');
assert.ok(!/\blanguageExplicitlyChosen\b/.test(earlyRegion), 'languageExplicitlyChosen is read before initialization');
console.log('v144.161 automation prerender TDZ regression test passed');

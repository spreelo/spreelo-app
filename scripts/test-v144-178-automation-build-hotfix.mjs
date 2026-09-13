import fs from 'node:fs';
import assert from 'node:assert/strict';

const automation = fs.readFileSync(new URL('../app/automation/page.jsx', import.meta.url), 'utf8');
const start = automation.indexOf('function loadExistingAutomationRuleGroupIntoPlanner');
const end = automation.indexOf('function loadExistingAutomationRuleIntoPlanner', start);
assert.ok(start >= 0 && end > start, 'automation planner group loader functions must exist');
const groupLoader = automation.slice(start, end);
const matches = groupLoader.match(/const preparedSlots = groupedRules\.map\(\(rule\) => \{/g) || [];
assert.equal(matches.length, 1, 'group loader must contain exactly one preparedSlots map block');
assert.match(groupLoader, /automationRuleId: rule\.id/);
assert.match(groupLoader, /setSlots\(preparedSlots\)/);
console.log('v144.178 automation build hotfix structural regression check passed');

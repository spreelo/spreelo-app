import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseWeeklyVariation, isoWeekDateForLocalNight, localWeeklySlotUtc,
  getWeeklyCycle, chooseWeeklyVariant, lockWeeklyVariant,
} from '../lib/weeklyVariationPlanner.js';

const variants = [
  { contentTypeId:'website_item', creditCost:2 },
  { contentTypeId:'tips', creditCost:1 },
  { contentTypeId:'faq', creditCost:1 },
];
const config = {enabled:true, selectionMode:'history_balanced', goalId:'build_trust',
  baseStartDate:'2026-10-19',slotIndex:0,slotCount:3,variants};
const rule = {schedule_type:'weekly', weekday:'Monday', publish_time:'09:00',timezone:'Europe/Stockholm',
  strategy_notes:'Existing human-edited strategy notes\nSPREELO_ADAPTIVE_V1:'+JSON.stringify(config)+'\nManual note remains',content_type_id:'tips'};
assert.deepEqual(parseWeeklyVariation(rule),config);
assert.equal(parseWeeklyVariation({...rule,schedule_type:'once'}),null);
assert.equal(parseWeeklyVariation({...rule,strategy_notes:'Customer manual notes'}),null);
assert.equal(isoWeekDateForLocalNight(new Date('2026-10-25T21:00:00Z'),'Europe/Stockholm'),'2026-10-26');
assert.equal(isoWeekDateForLocalNight(new Date('2026-10-26T00:00:00Z'),'Europe/Stockholm'),'2026-10-26');
assert.equal(isoWeekDateForLocalNight(new Date('2026-10-25T11:00:00Z'),'Europe/Stockholm'),null);
assert.equal(isoWeekDateForLocalNight(new Date('2026-10-26T03:00:00Z'),'America/Los_Angeles'),'2026-10-26');
assert.equal(isoWeekDateForLocalNight(new Date('2026-10-25T13:00:00Z'),'Asia/Tokyo'),'2026-10-26');
assert.equal(localWeeklySlotUtc('2026-10-26','Monday','09:00','Europe/Stockholm'),'2026-10-26T08:00:00.000Z');
assert.equal(localWeeklySlotUtc('2026-10-26','Monday','09:00','America/Los_Angeles'),'2026-10-26T16:00:00.000Z');
const monday = localWeeklySlotUtc('2026-10-26','Monday','09:00','Europe/Stockholm');
const cycle = getWeeklyCycle(rule,config,monday);
assert.equal(cycle,1);
const first = chooseWeeklyVariant({rule,config,cycle,recentTypes:['website_item','website_item','tips']});
const withVariety = chooseWeeklyVariant({rule,config,cycle,recentTypes:['website_item','website_item','tips'],selectedThisWeek:new Set([variants[first].contentTypeId])});
assert.notEqual(variants[first].contentTypeId,variants[withVariety].contentTypeId);
const locked = lockWeeklyVariant(rule,config,cycle,first);
assert.ok(locked.startsWith('Existing human-edited strategy notes\n'));
assert.ok(locked.endsWith('\nManual note remains'));
assert.equal(parseWeeklyVariation({...rule,strategy_notes:locked}).lockedVariantCycle,1);
assert.equal(parseWeeklyVariation({...rule,strategy_notes:locked}).lockedVariantIndex,first);
assert.equal(lockWeeklyVariant({...rule,strategy_notes:locked},parseWeeklyVariation({...rule,strategy_notes:locked}),cycle,first),locked);
const ui = readFileSync(new URL('../app/automation/page.jsx',import.meta.url),'utf8');
const clientFunction = ui.slice(ui.indexOf('async function applyDynamicAutoPlan('),ui.indexOf('async function changeAutoPlanGoal('));
assert.ok(clientFunction.includes('createRecommendedSlots'));
assert.ok(!clientFunction.includes('fetch('),'Settings must never trigger paid AI');
assert.ok(!clientFunction.includes('localStorage'),'Draft edits must not rely on stale recommendation caches');
const cron = readFileSync(new URL('../app/api/cron/weekly-variation-planning/route.js',import.meta.url),'utf8');
assert.ok(!cron.includes('new OpenAI'));
assert.ok(cron.includes('lockWeeklyVariant'));
assert.ok(cron.includes('.eq("strategy_notes", rule.strategy_notes)'),'Manual edits must be protected by CAS');
const sql = readFileSync(new URL('../supabase/v144_393_weekly_variation_planning.sql',import.meta.url),'utf8');
assert.ok(sql.includes('primary key (brand_profile_id, week_start)'));
assert.ok(sql.includes('auth.role()'));
assert.ok(sql.includes('service_role'));
const costs = readFileSync(new URL('../app/api/plan-content/route.js',import.meta.url),'utf8');
assert.ok(costs.includes('tracker.recordOpenAI("content_plan.responses.create"'));
console.log('PASS v144.393: AI-free draft, timezone/week boundary, diversity, locks, edit safety, idempotence and cost ledger');

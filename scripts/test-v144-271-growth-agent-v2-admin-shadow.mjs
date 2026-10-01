import assert from 'node:assert/strict';import fs from 'node:fs';
const growth=fs.readFileSync(new URL('../lib/growthAgent.js',import.meta.url),'utf8');
const plan=fs.readFileSync(new URL('../app/api/plan-content/route.js',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../app/api/admin/customers/[id]/route.js',import.meta.url),'utf8');
const page=fs.readFileSync(new URL('../app/admin/customers/[id]/page.jsx',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/v144_271_growth_agent_v2_admin_shadow.sql',import.meta.url),'utf8');
assert.match(growth,/loadGrowthAgentMode/);assert.match(plan,/saveGrowthAgentShadowRun/);assert.match(plan,/shadowCandidatePlan/);assert.match(api,/set_growth_agent_mode/);assert.match(api,/growth_agent_shadow_runs/);assert.match(page,/setGrowthAgentMode/);assert.match(sql,/growth_agent_settings/);assert.match(sql,/growth_agent_shadow_runs/);console.log('v144.271 Growth Agent V2 admin/shadow tests passed');

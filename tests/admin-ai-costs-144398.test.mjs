import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/v144_398_admin_ai_cost_overview.sql',import.meta.url),'utf8');
const api=readFileSync(new URL('../app/api/admin/ai-costs/route.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../app/admin/ai-costs/page.jsx',import.meta.url),'utf8');
const admin=readFileSync(new URL('../app/admin/page.jsx',import.meta.url),'utf8');

test('aggregate is service-role restricted and existing ledger is read only',()=>{
 assert.match(sql,/security invoker/i);
 assert.match(sql,/revoke all on function public\.spreelo_admin_ai_cost_overview[\s\S]*from public, anon, authenticated;/i);
 assert.match(sql,/grant execute on function public\.spreelo_admin_ai_cost_overview[\s\S]*to service_role;/i);
 assert.doesNotMatch(sql,/\b(delete|truncate|update)\s+public\.post_generation_cost_events\b/i);
 assert.match(sql,/\bcreated_at\s*>?=\s*p_start/);
 assert.match(sql,/created_at\s*<\s*p_end/);
});

test('summary is computed for all records in database, not truncated event page',()=>{
 assert.match(api,/getAdminContext\(request\)/);
 assert.match(api,/ctx\.admin\.rpc\('spreelo_admin_ai_cost_overview'/);
 assert.match(api,/PAGE_SIZE\s*=\s*75/);
 assert.match(api,/MAX_DAYS\s*=\s*31/);
 assert.match(sql,/from public\.post_generation_cost_events/);
 assert.match(sql,/post_id is not null/);
 assert.match(sql,/post_id is null/);
 assert.match(sql,/amount is null/);
 assert.match(sql,/currency = 'USD'/);
 assert.match(sql,/limit 100\s*\)/i);
});

test('cost summary distinguishes unpriced events and does not invent per-request billing',()=>{
 assert.match(ui,/Missing a usable price/);
 assert.match(ui,/Other AI costs/);
 assert.match(ui,/The previous OpenAI balance change cannot be attributed/);
 assert.match(ui,/Open billing reconciliation/);
 assert.match(ui,/7 days/);
 assert.match(ui,/30 days/);
 assert.match(ui,/Individual cost events/);
 assert.match(ui,/Usage based/); // explanatory price handling
});

test('admin links to new cost overview without removing existing formats overview',()=>{
 assert.match(admin,/<QuickLink href="\/admin\/ai-costs"/);
 assert.match(admin,/<section className="admin156-section" id="costs">/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
test('daily reconciliation writes a project-scoped comparison but never a per-post invoice claim',()=>{
  const run=spawnSync(process.execPath,['--import','./tests/mock-openai-reconcile.mjs','scripts/reconcile-openai-costs.mjs'],{
    cwd:process.cwd(), encoding:'utf8', env:{...process.env,SPREELO_SUPABASE_URL:'https://example.supabase.co',SPREELO_SUPABASE_SERVICE_ROLE_KEY:'test-key',OPENAI_ADMIN_KEY:'test-key',OPENAI_SPREELO_PROJECT_ID:'proj_spreelo_testing'},timeout:10000});
  assert.equal(run.status,0,run.stderr);
  const output=JSON.parse(run.stdout.trim());
  assert.equal(output.status,'comparable');assert.equal(output.unpriced,0);
});
test('billing reconciliation fails closed without credentials',()=>{
  const env={...process.env,SPREELO_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_URL:'',SPREELO_SUPABASE_SERVICE_ROLE_KEY:'',SUPABASE_SERVICE_ROLE_KEY:'',OPENAI_ADMIN_KEY:'',OPENAI_SPREELO_PROJECT_ID:''};
  const run=spawnSync(process.execPath,['scripts/reconcile-openai-costs.mjs'],{cwd:process.cwd(),encoding:'utf8',env,timeout:10000});
  assert.equal(run.status,2);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
try {
  await db.exec(`
    create table automation_rules (
      id uuid primary key,is_active boolean,queue_locked_until timestamptz,retry_not_before timestamptz,
      product_retry_attempt integer,product_retry_reason text,last_error text,generation_occurrence_status text,
      generation_finished_at timestamptz,generation_failure_code text,generation_failure_message text,
      generation_customer_message text,generation_failure_stage text,generation_refunded_credits integer,
      generation_notification_status text,updated_at timestamptz
    );
    create table automation_occurrences (
      id uuid primary key,automation_rule_id uuid,status text,retry_count integer,retry_not_before timestamptz,
      last_rate_limited_at timestamptz,failure_code text,failure_stage text,failure_message_internal text,
      failure_message_customer text,notification_status text,metadata jsonb,updated_at timestamptz
    );
    create function normalize_website_domain(text) returns text language sql immutable as $$select lower($1)$$;
  `);
  const sql=fs.readFileSync('supabase/v141_domain_cooldown_resumable_product_jobs.sql','utf8');
  const start=sql.indexOf('create or replace function public.defer_automation_occurrence_for_website_rate_limit(');
  const end=sql.indexOf('\n$$;',start)+4;
  assert(start>=0&&end>start);await db.exec(sql.slice(start,end));
  const rule='00000000-0000-0000-0000-000000000001',occurrence='00000000-0000-0000-0000-000000000002';
  await db.query("insert into automation_rules(id,is_active,product_retry_attempt) values($1,true,0)",[rule]);
  await db.query("insert into automation_occurrences(id,automation_rule_id,status,retry_count,metadata) values($1,$2,'running',0,'{}')",[occurrence,rule]);
  for(let i=1;i<=8;i++) {
    const result=(await db.query('select defer_automation_occurrence_for_website_rate_limit($1,$2,$3,$4,$5,$6) as result',
      [occurrence,'pressit.se',900000,'Verified site temporarily rate limited','website_domain_cooldown_preflight',JSON.stringify({historical_success:true})])).rows[0].result;
    assert.equal(result.handled,true);assert.equal(result.status,'retry_pending');assert.equal(result.retry_count,i);
    assert(result.retry_after_ms>=900000);assert(result.retry_after_ms<=7200000);
  }
  assert.equal((await db.query('select count(*) as n from automation_occurrences')).rows[0].n,1);
  const row=(await db.query('select * from automation_occurrences')).rows[0];
  assert.equal(row.metadata.historical_success,true);assert.equal(row.metadata.website_domain,'pressit.se');
  assert.equal((await db.query('select is_active from automation_rules')).rows[0].is_active,true);
  const long=(await db.query('select defer_automation_occurrence_for_website_rate_limit($1,$2,$3) as result',[occurrence,'pressit.se',6*3600_000])).rows[0].result;
  assert.equal(long.retry_after_ms,7200000,'RPC wakeup is bounded; shared domain cooldown must enforce longer Retry-After');
  await db.query("update automation_occurrences set status='failed_terminal'");
  const stopped=(await db.query('select defer_automation_occurrence_for_website_rate_limit($1,$2,$3) as result',[occurrence,'pressit.se',900000])).rows[0].result;
  assert.equal(stopped.handled,false);assert.equal(stopped.status,'failed_terminal');
  console.log('PASS v141 PostgreSQL: same occurrence deferred beyond two attempts, active rule retained, metadata preserved, delay bounded and terminal job not restarted');
} finally {await db.close();}

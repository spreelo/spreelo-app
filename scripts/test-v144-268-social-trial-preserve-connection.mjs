import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql = fs.readFileSync(new URL('../supabase/v144_268_social_trial_preserve_connection.sql', import.meta.url), 'utf8');

assert.match(sql, /create or replace function public\.claim_spreelo_social_trial\(/);
assert.match(sql, /trial_social_account_used/);
assert.match(sql, /trial_account_already_used/);
assert.match(sql, /trial_business_already_used/);
assert.match(sql, /trial_activated/);
assert.match(sql, /Verified social connection must be saved before trial activation/);

// A denied free trial must not undo a valid provider connection or destroy tokens.
assert.doesNotMatch(sql, /update public\.social_connections[\s\S]*?set status='disconnected'/i);
assert.doesNotMatch(sql, /page_access_token\s*=\s*null/i);
assert.doesNotMatch(sql, /refresh_token\s*=\s*null/i);

console.log('v144.268 social-trial connection preservation checks passed.');

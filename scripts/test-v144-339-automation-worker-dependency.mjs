import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const src = fs.readFileSync('app/api/cron/run-automations/route.js', 'utf8');
const helperStart = src.indexOf('function isSupabaseProjectRoutingUnavailable(');
const helperEnd = src.indexOf('function isDedicatedAutomationWorkerName(', helperStart);
assert(helperStart >= 0 && helperEnd > helperStart, 'Worker failure helpers not present');
const context = vm.createContext({crypto});
vm.runInContext(src.slice(helperStart, helperEnd), context);
const classify = (msg) => vm.runInContext('isSupabaseProjectRoutingUnavailable(message)', vm.createContext({message:msg}));
// Test actual helper in the same context where both functions are declared.
context.errorText = 'Project not specified.';
assert.equal(vm.runInContext('isSupabaseProjectRoutingUnavailable(errorText)', context), true);
context.errorText = {message:'Project not specified.'};
assert.equal(vm.runInContext('isSupabaseProjectRoutingUnavailable(errorText)', context), true);
context.errorText = 'Customer ran out of credits.';
assert.equal(vm.runInContext('isSupabaseProjectRoutingUnavailable(errorText)', context), false);
function key(workerName, phase, message) {
  context.parameters = {workerName, phase, error:{name:'Error',message}};
  return vm.runInContext('buildAutomationWorkerFailureDedupeKey(parameters)',context);
}
assert.equal(key('worker-4', 'queue_rule_scan', 'Project not specified.'), key('worker-4', 'queue_rule_scan','Project not specified.'));
assert.notEqual(key('worker-4', 'queue_rule_scan', 'Project not specified.'), key('worker-4', 'queue_rule_scan', 'Another unrelated error'));
assert.notEqual(key('worker-4', 'queue_rule_scan', 'Project not specified.'), key('worker-4', 'publish_queue_scan', 'Project not specified.'));
assert.notEqual(key('worker-4', 'queue_rule_scan', 'Project not specified.'), key('worker-2', 'queue_rule_scan', 'Project not specified.'));
assert(key('worker-4','queue_rule_scan','Project not specified.').length < 500);
assert(src.includes('runtimePhase = "queue_rule_scan";'));
assert(src.includes('runtimePhase = "publish_queue_scan";'));
assert(src.includes('runtimePhase = "stale_occurrence_sweep";'));
assert(src.includes('if (isSupabaseProjectRoutingUnavailable(error)) {\n      throw error;'));
assert(src.includes('social_publish_queue_unavailable'));
assert(src.includes('status: supabaseGatewayUnreachable ? 503 : 500'));
assert(src.includes('"Retry-After": "60"'));
assert(src.includes('"Worker phase", incidentMetadata.worker_phase'));
console.log('v144.339 worker dependency, failure grouping and diagnostic regression checks passed');

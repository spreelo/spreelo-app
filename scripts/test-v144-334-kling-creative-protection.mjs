// v144.337 supersedes the former text-only director. Keep this regression entry
// point and exercise the evidence-aware director and independent preflight.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(p, 'utf8');
const { motionPlanIsSupported } = await import(`data:text/javascript,${encodeURIComponent(read('lib/klingVideoIntelligence.js'))}`);
const { validateKlingCreativeDirection } = await import(`data:text/javascript,${encodeURIComponent(read('lib/klingCreativeSafety.js'))}`);
for (const action of ['The person walks in the front-facing garment.', 'The wheeled product rolls straight in its source view.', 'A hand presents the verified object without operating its parts.']) {
  const evidence = { confidence: 0.98, verified_actions: [{ id: 'a', action, source_evidence: 'Verified source pixels', preserves_source_view: true, confidence: 0.98 }] };
  assert(motionPlanIsSupported({ mode: 'verified_use', risk: 'low', action_ids: ['a'], motion_prompt: action }, evidence));
  assert(!motionPlanIsSupported({ mode: 'verified_use', risk: 'low', action_ids: ['invented'], motion_prompt: action }, evidence));
}
for (const prompt of ['Orbit around the product to show its reverse.', 'Flip the phone to display the back.', 'Introduce another phone and hold both devices.']) assert(!validateKlingCreativeDirection(prompt).ok);
const retry = read('app/api/admin/post-approvals/retry-kling/route.js');
assert.match(retry, /Keep the exact product mechanically passive/);
assert.doesNotMatch(retry, /const creative = review.ok \? originalCreative/);
console.log('PASS: verified natural use across products, unsupported operation ids rejected and rejected actions never blindly reused on admin retry');

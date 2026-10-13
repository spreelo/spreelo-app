// v144.337 supersedes the former text-only director. Keep this regression entry
// point and exercise the evidence-aware director and independent preflight.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(p, 'utf8');
const { motionPlanIsSupported } = await import(`data:text/javascript,${encodeURIComponent(read('lib/klingVideoIntelligence.js'))}`);
const { validateKlingCreativeDirection } = await import(`data:text/javascript,${encodeURIComponent(read('lib/klingCreativeSafety.js'))}`);
for (const kind of ['walk_same_view', 'roll_straight', 'carry_straight']) {
  const evidence = { physical_subject: { kind: 'physical_product', name: 'Subject', visible_surfaces: ['front'] }, confidence: 0.98,
    verified_actions: [{ id: 'a', kind, target_component: 'Subject', evidence_type: 'visible_geometry', source_evidence: 'Verified source pixels and physical contact', physical_motion_supported: true, preserves_source_view: true, confidence: 0.98 }] };
  const plan = { mode: 'verified_use', risk: 'low', action_id: 'a', camera_mode: 'locked', environment_motion: 'none', product_pose: 'source_locked', shot_count: 1, finish_seconds: 5, initial_conditions: [], stationary_objects: [] };
  assert(motionPlanIsSupported(plan, evidence));
  assert(!motionPlanIsSupported({ ...plan, action_id: 'invented' }, evidence));
}
for (const prompt of ['Orbit around the product to show its reverse.', 'Flip the phone to display the back.', 'Introduce another phone and hold both devices.']) assert(!validateKlingCreativeDirection(prompt).ok);
const retry = read('app/api/admin/post-approvals/retry-kling/route.js');
assert.match(retry, /Keep the exact product mechanically passive/);
assert.doesNotMatch(retry, /const creative = review.ok \? originalCreative/);
console.log('PASS: verified natural use across products, unsupported operation ids rejected and rejected actions never blindly reused on admin retry');

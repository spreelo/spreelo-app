import fs from 'node:fs';

const social = fs.readFileSync('app/social-channels/page.jsx', 'utf8');
const patch = fs.readFileSync('PATCH_V144_264.md', 'utf8');

const failures = [];
function check(name, condition) {
  if (!condition) failures.push(name);
  console.log(`${condition ? '✓' : '✗'} ${name}`);
}

check('Closed OAuth popup starts reconciliation instead of immediate fallback',
  social.includes('void reconcileClosedOAuth(platform);') &&
  !social.includes('? { ...current, popupClosed: true }\n              : current);'));
check('Reconciliation has a bounded five-second grace window',
  social.includes('const timeoutMs = 5000;'));
check('Reconciliation checks the current user brand and platform',
  social.includes('.eq("user_id", currentUser.id)') &&
  social.includes('.eq("brand_profile_id", currentBrand.id)') &&
  social.includes('.eq("platform", platform.key)') &&
  social.includes('.eq("status", "connected")'));
check('Successful reconciliation refreshes the UI and success state',
  social.includes('await loadConnectionsRef.current?.();') &&
  social.includes('setConnectionSuccess({'));
check('Fallback is shown only after reconciliation expires',
  social.includes('popupClosed: true, reconciling: false'));
check('A real postMessage cancels stale reconciliation',
  social.includes('oauthReconcileTokenRef.current += 1;'));
check('Reconciliation state prevents duplicate Continue clicks',
  social.includes('disabled={Boolean(oauthFlow.reconciling)}'));
check('Patch notes document the race-condition fix',
  patch.includes('5-second reconciliation window'));

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll v144.264 OAuth popup reconciliation checks passed.');

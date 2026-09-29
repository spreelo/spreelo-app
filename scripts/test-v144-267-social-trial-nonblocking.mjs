import fs from 'node:fs';

function read(path){ return fs.readFileSync(path,'utf8'); }
function expect(cond,msg){ if(!cond) throw new Error(msg); }

const trial = read('lib/freeTrial.js');
expect(trial.includes('return { allowed: false, reason, trialRestricted: true'), 'trial restrictions must return non-blocking result');
expect(trial.includes('authorize:trial_restricted'), 'authorize restriction diagnostic missing');
expect(!trial.includes('if (result.allowed === false) {\n    throw createTrialRestrictionError'), 'authorize must not throw for trial-only restriction');

const meta = read('app/api/meta/page-selection/route.js');
expect(meta.indexOf('saveFacebookConnection') < meta.indexOf('const trialResult = await authorizeSocialConnectionForTrial'), 'facebook connection must save before trial authorization');
expect(meta.includes('trialNotice: trialResult?.trialRestricted'), 'facebook must return trial notice');

for (const [platform,path] of [
  ['instagram','app/api/auth/instagram/callback/route.js'],
  ['tiktok','app/api/auth/tiktok/callback/route.js'],
  ['youtube','app/api/auth/youtube/callback/route.js'],
  ['threads','app/api/auth/threads/callback/route.js'],
]) {
  const src = read(path);
  expect(src.includes('const trialResult = await authorizeSocialConnectionForTrial'), `${platform}: trial result missing`);
  expect(src.includes(`connected: "${platform}", trialNotice:`), `${platform}: connected redirect must carry trial notice`);
}

const oauth = read('app/social-channels/oauth-complete/page.jsx');
expect(oauth.includes('trial_notice'), 'oauth complete must preserve trial notice');
expect(oauth.includes('trialNotice,'), 'oauth popup payload must include trial notice');

const social = read('app/social-channels/page.jsx');
expect(social.includes('const [trialNotice, setTrialNotice]'), 'social page trial notice state missing');
expect(social.includes('social.trialNoticeSocialUsedText'), 'social-used notice text missing');
expect(social.includes('social.trialNoticeAccountUsedText'), 'account-used notice text missing');
expect(social.includes('social.trialNoticeBusinessUsedText'), 'business-used notice text missing');

const labels = read('lib/i18n/defaultLabels.js');
expect(labels.includes('100 free credits were not added'), 'explicit 100-credit notice copy missing');

console.log('v144.267 social trial non-blocking checks passed');

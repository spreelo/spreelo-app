import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const checks = [];
const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });

const pinterest = read('lib/pinterestOAuth.js');
const callback = read('app/api/auth/pinterest/callback/route.js');
const boards = read('app/api/pinterest/boards/route.js');
const social = read('app/social-channels/page.jsx');
const labels = read('lib/i18n/defaultLabels.js');
const alerts = read('lib/socialConnectionAlerts.js');
const vercel = read('vercel.json');
const migration = read('supabase/v143_45_pinterest_connection_reliability.sql');
const cron = read('app/api/cron/refresh-pinterest-tokens/route.js');

check('Pinterest migration exists', exists('supabase/v143_45_pinterest_connection_reliability.sql'));
check('Migration allows Pinterest platform', migration.includes("'pinterest'") && migration.includes('social_connections_platform_check'));
check('Migration adds refresh token storage', migration.includes('add column if not exists refresh_token text') && migration.includes('refresh_token_expires_at'));
check('OAuth callback stores initial refresh token', callback.includes('refreshToken: token.refresh_token') && callback.includes('refreshTokenExpiresIn: token.refresh_token_expires_in'));
check('Pending Pinterest row no longer uses unsupported pending status', pinterest.includes('status: "disconnected"') && !pinterest.includes('status: "pending"'));
check('Existing working board is not disconnected during OAuth callback', !pinterest.includes('disconnectError') && pinterest.includes('does not disconnect a previously working Pinterest board'));
check('Pinterest refresh grant implemented', pinterest.includes('grant_type: "refresh_token"') && pinterest.includes('refreshPinterestAccessToken'));
check('Refresh response rotates refresh token', pinterest.includes('refreshed.refresh_token || connection.refresh_token'));
check('Access token refresh happens before expiry', pinterest.includes('PINTEREST_ACCESS_REFRESH_WINDOW_DAYS = 7'));
check('Refresh token safety window is monitored', pinterest.includes('PINTEREST_REFRESH_TOKEN_SAFETY_WINDOW_DAYS = 14'));
check('Board API auto-refreshes and retries auth failure', boards.includes('loadBoardsWithAutomaticRefresh') && boards.includes('forceRefresh: true'));
check('Old working Pinterest board is retired only after new board validation', boards.indexOf('const selected = boards.find') < boards.indexOf('disconnectOldError'));
check('Pinterest daily health cron exists', exists('app/api/cron/refresh-pinterest-tokens/route.js') && cron.includes('fetchPinterestUserAccount'));
check('Pinterest health cron is scheduled', vercel.includes('/api/cron/refresh-pinterest-tokens') && vercel.includes('15 3 * * *'));
check('Broken auth marks reconnect and alerts admin', cron.includes('markConnectionExpiredAndAlert') && cron.includes('reauth_required_at'));
check('Transient provider errors do not immediately disconnect customers', cron.includes('recordTransientFailure') && cron.includes('transientFailures'));
check('Pinterest is named in social connection alerts', alerts.includes('normalized === "pinterest"') && alerts.includes('return "Pinterest"'));
check('Schema migration failure has actionable UI message', callback.includes('pinterest_schema_missing') && social.includes('social.errorPinterestSchemaMissing') && labels.includes('v143_45_pinterest_connection_reliability.sql'));
check('Connected Pinterest UI promises automatic renewal', social.includes('social.pinterestAutoRefreshActive') && labels.includes('social.pinterestAutoRefreshActive'));

const failed = checks.filter((item) => !item.ok);
for (const item of checks) console.log(`${item.ok ? '✓' : '✗'} ${item.name}`);
if (failed.length) {
  console.error(`\n${failed.length} v143.45 Pinterest reliability checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${checks.length} v143.45 Pinterest reliability checks passed.`);

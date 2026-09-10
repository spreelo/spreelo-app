import fs from 'node:fs';
import crypto from 'node:crypto';

const page = fs.readFileSync(new URL('../app/social-channels/page.jsx', import.meta.url), 'utf8');

const checks = [
  [page.includes('const { t } = useUiText(["social"]);'), 'Social Channels uses the established social translation namespace'],
  [page.includes('function ChannelCard({'), 'ChannelCard is present'],
  [page.includes('const expiresText = formatTokenExpiry(connection?.token_expires_at, t, platform.key);'), 'ChannelCard no longer references an out-of-scope locale variable'],
  [!page.includes('formatTokenExpiry(connection?.token_expires_at, t, platform.key, locale)'), 'regressed locale call is absent'],
  [page.includes('selectedPlatforms.map((platform) => ('), 'platform cards still render through the existing map flow'],
  [page.includes('onConnectStart={handleConnect}'), 'connect handler wiring is intact'],
  [page.includes('onDisconnect={handleDisconnect}'), 'disconnect handler wiring is intact'],
];

let failed = 0;
for (const [ok, label] of checks) {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) failed += 1;
}

if (failed) {
  console.error(`\n${failed} v144.158 Social Channels regression check(s) failed.`);
  process.exit(1);
}

const digest = crypto.createHash('sha256').update(page).digest('hex');
console.log(`\n✓ v144.158 Social Channels regression fix passed (${digest.slice(0, 12)}…)`);

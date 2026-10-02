import fs from 'node:fs';

const social = fs.readFileSync('app/social-channels/page.jsx', 'utf8');
const layout = fs.readFileSync('components/AppLayout.jsx', 'utf8');

function assert(ok, msg) {
  if (!ok) throw new Error(msg);
}

assert(social.includes('spreelo-social-connections-changed'), 'Social page must dispatch shared connection change event');
assert(social.includes('connectedChannelCount: connectedCountForBrand'), 'Social event must include connected count');
assert(social.includes('brandProfileId: selectedBrand.id'), 'Social event must scope refresh to selected brand');
assert(layout.includes('window.addEventListener("spreelo-social-connections-changed"'), 'AppLayout must listen for social connection changes');
assert(layout.includes('setConnectedChannelCount(nextCount)'), 'AppLayout must update channel gate count immediately');
assert(layout.includes('eventBrandId !== String(currentBrandId || "")'), 'AppLayout must ignore events for other brands');

console.log('v144.282 social unlock live refresh checks passed');

import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {buildProductPushEdit} from '../lib/shotstack.js';
import {calculateAnimatedProductLayout} from '../lib/animatedProductLayout.js';
for(const [w,h] of [[1800,600],[400,1500],[800,950]]) {
 const edit=buildProductPushEdit({backgroundVideoUrl:'bg',productDataUri:'data:image/png;base64,AA',animationLayout:calculateAnimatedProductLayout(w,h),durationSeconds:5,closingHoldSeconds:2,closingBackgroundUrl:'last-frame',textOverlayUrl:'text',logoOverlayUrl:'logo',musicUrl:'audio',musicDurationSeconds:20,musicTrimStartSeconds:13});
 const clips=edit.timeline.tracks.flatMap(t=>t.clips);
 assert.equal(Math.max(...clips.map(c=>c.start+c.length)),7);
 for(const src of ['text','logo','audio']){const c=clips.find(c=>c.asset.src===src);assert.equal(c.start+c.length,7);}
 const audio=clips.find(c=>c.asset.type==='audio');assert.equal(audio.asset.effect,'fadeOut');assert.equal(audio.asset.trim,13);
 const bg=clips.find(c=>c.asset.src==='bg'),end=clips.find(c=>c.asset.src==='last-frame');assert.equal(bg.length,5);assert.equal(end.start,5);assert.equal(end.length,2);
 const product=clips.find(c=>c.asset.type==='html5');assert.equal(product.length,7);
 assert.ok(product.asset.js.includes('scale:1.065')); 
 let animationTime=0;
 const tl={from(_selector,args){animationTime+=args.duration;return this;},to(_selector,args){animationTime+=args.duration;return this;}};
 vm.runInNewContext(product.asset.js,{gsap:{timeline:()=>tl}});
 assert.ok(animationTime<=5,'Product motion must finish before closing hold');
}
const legacy=buildProductPushEdit({backgroundVideoUrl:'bg',productDataUri:'data:AA'});
assert.equal(Math.max(...legacy.timeline.tracks.flatMap(t=>t.clips).map(c=>c.start+c.length)),5);
const src=fs.readFileSync('app/api/cron/run-automations/route.js','utf8');
assert.ok(src.includes('video_duration_seconds:ANIMATED_VIDEO_DURATION_SECONDS'));
assert.ok(src.includes('targetDurationSeconds: ANIMATED_VIDEO_DURATION_SECONDS'));
console.log('v144.306: five seconds motion + two seconds held product/text/logo/background, seven seconds audio with fade-out; legacy default unchanged.');

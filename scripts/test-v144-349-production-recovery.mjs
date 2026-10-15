import assert from 'node:assert/strict';
import fs from 'node:fs';
import {verifyExplicitCollectionMembership,collectionIncludesHandle} from '../lib/verifiedCollectionMembership.js';
import {nextFinalizationControl,finalizationJobGate} from '../lib/videoProductionController.js';

const products=[{handle:'tshirt-gron'}, {handle:'tshirt-bla'}];
const calls=[];
const fetcher=async url=>{calls.push(url);return {ok:true,json:async()=>({products})};};
const params={sourceUrl:'https://pressit.se/collections/t-shirts',fetcher};
assert.equal((await verifyExplicitCollectionMembership({...params,productUrl:'https://pressit.se/products/tshirt-gron'})).verified,true);
assert.equal((await verifyExplicitCollectionMembership({...params,productUrl:'https://pressit.se/products/petposter'})).verified,false);
assert.equal((await verifyExplicitCollectionMembership({...params,productUrl:'https://outsider.com/products/tshirt-gron'})).verified,false);
assert.equal(calls.length,1,'collection membership index cached, no repeated requests');
assert.equal(collectionIncludesHandle(['tshirt-gron'],'https://pressit.se/products/tshirt-gron'),true);
const fail=new Error('Local design correction did not pass the final visual review');
fail.code='LOCAL_TYPOGRAPHY_REPAIR_REJECTED';
const state=nextFinalizationControl({current:{attempts:0},error:fail,selection:{text_overlay_status:'failed'}});
assert.equal(state.terminal,true,'known creative failures must never retry forever');
assert.equal(finalizationJobGate({video_background_selection:{finalization_control:state.control}}).action,'review');
const animation=fs.readFileSync(new URL('../app/api/cron/run-automations/route.js',import.meta.url),'utf8');
const kling=fs.readFileSync(new URL('../app/api/cron/finalize-kling-videos/route.js',import.meta.url),'utf8');
const repair=fs.readFileSync(new URL('../lib/videoAdvertisingReadabilityRepair.js',import.meta.url),'utf8');
assert.match(animation,/verifyExplicitCollectionMembership/);
assert.match(animation,/repairReviewedAdvertising/);
assert.match(kling,/repairReviewedAdvertising/);
assert.match(kling,/sendTerminalVideoAdminAlert/);
assert.match(repair,/verify\(\{overlay:overlay.buffer,endCard:endCard.cardBuffer\}\)/,
  'local corrections must be externally re-reviewed');
console.log('PASS v144.349: collection membership boundaries, bounded finalizer, repair integration, post-repair review wiring');

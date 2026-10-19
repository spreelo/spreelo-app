import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {VIDEO_MUSIC_LIBRARY, VIDEO_MUSIC_CATALOG_VERSION, normalizeVideoMusicCatalog, selectBestVideoMusicFromTracks} from '../lib/videoMusicLibrary.js';
import {excludeDeletedVideoMusic} from '../lib/videoMusicDeletions.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const originals=[
'Wait for the Drop','Bouncy Bluebirds 03','Neon Pulse 02','Neon Pulse 03','Neon Pulse 04','Neon Pulse 05','Neon Pulse 06','Neon Pulse 07',
'Soft Morning Light 01','Soft Morning Light 02','Soft Morning Light 03','Soft Morning Light 06',
'Sunshine 01','Sunshine 02','Sunshine 03','Sunshine 04','Sunshine 05','The Final Push','Velvet Horizon 01'];
assert.equal(VIDEO_MUSIC_CATALOG_VERSION,3);
assert.equal(VIDEO_MUSIC_LIBRARY.length,36);
const existing=VIDEO_MUSIC_LIBRARY.filter(t=>!t.id.startsWith('suno-beat-'));
const news=VIDEO_MUSIC_LIBRARY.filter(t=>t.id.startsWith('suno-beat-'));
assert.equal(existing.length,19);
assert.equal(news.length,17);
assert.deepEqual(existing.map(t=>t.name).sort(),originals.sort());
assert.equal(existing.find(t=>t.name==='Neon Pulse 07').active,false);
assert.equal(new Set(VIDEO_MUSIC_LIBRARY.map(t=>t.id)).size,36);
assert.equal(new Set(VIDEO_MUSIC_LIBRARY.map(t=>t.public_path)).size,36);
const presentWavs=fs.readdirSync(path.join(root,'public/audio-library')).filter(n=>n.endsWith('.wav'));
assert.equal(presentWavs.length,36);
for(const tr of VIDEO_MUSIC_LIBRARY){
 const name=tr.public_path.split('/').at(-1);
 const file=fs.readFileSync(path.join(root,'public/audio-library',name));
 assert.equal(file.toString('ascii',0,4),'RIFF');
 assert.equal(file.toString('ascii',8,12),'WAVE');
 assert(file.length>100_000);
 assert.equal(tr.source_kind,'bundled');
 assert(tr.duration_seconds>=6.5 && tr.duration_seconds<=60);
 assert(tr.volume>=0 && tr.volume<=1);
 assert(tr.formats.includes('animated_video'));
 assert(tr.formats.includes('ai_product_video'));
 assert(tr.categories.length>=2 && tr.moods.length>=2 && tr.industries.length>=2);
 if(tr.id.startsWith('suno-beat-')){
   assert.equal(file.readUInt16LE(22),2,'new WAV stays stereo');
   assert.equal(file.readUInt32LE(24),48000,'new WAV stays 48kHz');
 }
}
const adminTracks=existing.map(t=>({...t}));
adminTracks[0]={...adminTracks[0],priority:-7,volume:0.18,name:'My edited name'};
adminTracks.find(t=>t.id==='neon-pulse-07-v1').active=false;
adminTracks.push({id:'manual-upload-1',name:'Personal Audio',source_kind:'uploaded',public_url:'https://cdn.example.com/a.wav',storage_path:'tracks/manual-upload-1.wav',duration_seconds:10,active:true,volume:.3,priority:8,categories:['premium'],moods:['warm'],industries:['fashion'],formats:['animated_video'],keywords:['product'],energy:'medium'});
const upgraded=normalizeVideoMusicCatalog({version:2,tracks:adminTracks});
assert.equal(upgraded.version,3);
assert.equal(upgraded.tracks.length,37);
assert.equal(upgraded.tracks[0].name,'My edited name');
assert.equal(upgraded.tracks[0].volume,.18);
assert.equal(upgraded.tracks[0].priority,-7);
assert.equal(upgraded.tracks.find(t=>t.id==='neon-pulse-07-v1').active,false);
assert.equal(upgraded.tracks.find(t=>t.id==='manual-upload-1').source_kind,'uploaded');
assert.deepEqual(upgraded.tracks.filter(t=>t.id.startsWith('suno-beat-')).map(t=>t.id).sort(),news.map(t=>t.id).sort());
assert.equal(upgraded.tracks.filter(t=>!t.id.startsWith('suno-beat-') && t.id!=='manual-upload-1').length,19);
assert.equal(normalizeVideoMusicCatalog(upgraded).tracks.length,37,'repeat migration must not duplicate music');
const deleted=excludeDeletedVideoMusic(upgraded,new Set(['suno-beat-08-v1','neon-pulse-04-v1']));
assert.equal(deleted.tracks.length,35,'deleted markers exclude future and legacy tracks');
assert(!deleted.tracks.some(t=>t.id==='suno-beat-08-v1'));
const preview=selectBestVideoMusicFromTracks({tracks:upgraded.tracks.filter(t=>t.id.startsWith('suno-beat-')),targetDurationSeconds:6.5,appUrl:'https://app.spreelo.com',context:{content_format:'animated_video', industry:'tech',product_category:'electronics', copy:'dynamic electronic digital launch'}});
assert(preview?.id.startsWith('suno-beat-'));
assert(preview.url.includes('/audio-library/suno-beat-'));
assert(preview.trimStartSeconds>0);
assert.equal(selectBestVideoMusicFromTracks({tracks:existing.filter(t=>t.name==='Neon Pulse 07'),targetDurationSeconds:6.5,appUrl:'https://app.spreelo.com'}),null,'inactive old track cannot be selected');
console.log('v144.376 integration passed: 19 retained old, 19 removed old, 17 new, 36 WAVs, admin settings, one-time v2->v3 migration, no resurrection, selection and end alignment.');

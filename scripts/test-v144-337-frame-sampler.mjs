import fs from 'node:fs';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { sampleRemoteVideoFrames } from '../lib/videoFrameSampler.js';
import { klingQualitySampleTimes } from '../lib/klingVideoIntelligence.js';
if (!process.argv[2]) throw new Error('Pass a 6-second changing H.264 MP4 fixture path as the first argument');
const bytes = fs.readFileSync(process.argv[2]);
const server = http.createServer((req,res) => {
  const match = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
  if (match) { const start = Number(match[1]); const end = match[2] ? Number(match[2]) : bytes.length - 1;
    res.writeHead(206, { 'Content-Type':'video/mp4', 'Content-Range':`bytes ${start}-${end}/${bytes.length}`, 'Content-Length':end-start+1, 'Accept-Ranges':'bytes' }); res.end(bytes.subarray(start,end+1));
  } else { res.writeHead(200, { 'Content-Type':'video/mp4', 'Content-Length':bytes.length, 'Accept-Ranges':'bytes' }); res.end(bytes); }
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
try {
  const frames = await sampleRemoteVideoFrames({ videoUrl:`http://127.0.0.1:${server.address().port}/fixture.mp4`, durationSeconds:6, timesSeconds:klingQualitySampleTimes(6,0.15) });
  assert.equal(frames.length,17);
  assert(frames.every(f => f.buffer.length > 2000));
  const hashes = frames.map(f => crypto.createHash('sha256').update(f.buffer).digest('hex'));
  assert.equal(new Set(hashes).size,17,'Every requested moment must be decoded as a distinct frame');
  console.log('PASS: real Chromium decoded 17 distinct MP4 frames including early neighbours and final frame');
} finally { server.close(); }

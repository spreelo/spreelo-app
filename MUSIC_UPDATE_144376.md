# Spreelo 144.376 – Suno music library update

Source: user-supplied Spreelo-144.375-full.zip. No changes to Kling, music selection algorithm, Shotstack, UI or unrelated code.

## Outcome
- Kept the 19 historical tracks shown in Admin (18 active + Neon Pulse 07 inactive by default). Existing Admin edits take precedence.
- Removed 19 historical bundled WAV files that had already been deleted in Admin, and removed their bundled seed definitions.
- Added 17 original user-supplied WAVs under `public/audio-library/suno-beat-01.wav` through `suno-beat-17.wav`, retaining their 48 kHz stereo PCM samples.
- Catalog v3 adds ONLY `suno-beat-*` entries to existing version-2 catalogs, preserving existing statuses, titles, volume, priorities and deletion tombstones. Existing uploaded tracks are untouched.
- 36 bundled tracks are available in this ZIP. For the shown Admin library, after deployment the expected total is 36 (35 active and one inactive), PROVIDED the current catalog remains unchanged and no new deletion markers exist for these IDs.
- This is a source deployment, not a live Supabase modification. No archived track was physically removed from Supabase by this package; previous Admin deletion of user-uploaded tracks already removes those uploaded files, but deletion of bundled assets affects files hosted by the app only.
- Style/industry metadata is a provisional measurement-based pass; acoustic algorithms cannot conclusively identify instruments, genres, emotional character or brand fit. Review each clip by ear in Admin before relying on commercial selection; 17 tracks are active by default as requested.

## Deploy
1. Keep an untouched backup of the current deployed code and music catalog. Compare this source against any newer live modifications before deployment.
2. Deploy as a normal Spreelo application update. No SQL migration or storage-wide deletion required.
3. On the first authenticated visit to `/admin/music-library`, the version-2 Supabase catalog is upgraded to v3 atomically through the existing API read/write path, adding the new Suno tracks while leaving deleted legacy entries excluded.
4. Confirm 36 tracks / 35 active on the exact instance shown in the screenshot, and verify the inactive Neon Pulse 07 remains inactive and previously deleted songs remain absent.
5. Play several tracks in Admin, regenerate one test product video, and verify the selected `musicAssetId` can identify a `suno-beat-*` track and the end-align timing is correct.
6. Check WAV MIME delivery by your hosting provider and your Suno commercial usage permissions.

## Compatibility
Existing Supabase upload audio is NOT modified. The prior deletion marker system is intact. The original video/music selection logic and end alignment are unchanged.

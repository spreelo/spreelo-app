# Spreelo video music library

From v144.49 the video music library is managed from **Admin → Video music library** (`/admin/music-library`).

## Admin workflow

An administrator can:

- upload WAV, MP3, M4A or AAC;
- listen to every track in the browser;
- edit name, categories, moods, industries, formats, keywords and energy;
- set selection priority and final video volume;
- enable or disable a track without deleting it;
- delete tracks;
- search and filter the library.

The audio duration is read automatically in the browser before upload.

## Storage

The protected `/api/video-music` API maintains a Supabase Storage bucket named `video-music-library`.

- catalog: `catalog/library.json`
- administrator uploads: `tracks/<uuid>.<extension>`

The bucket is created/configured automatically by the service-role API. No SQL migration is required.

`Wait for the Drop` plus 37 additional curated tracks are bundled under `public/audio-library/`. A brand-new deployment starts with all 38 tracks. Existing version-1 managed catalogs are upgraded once to catalog version 2: missing bundled tracks are appended while existing Admin edits are preserved. After the migration, deleting a bundled track in Admin remains intentional and it is not re-added automatically.

## Selection

Selection is deterministic and does not create an extra AI request. Spreelo already knows the video/product context and scores active tracks against the track metadata.

Matching fields are categories, moods, industries, formats, keywords, energy and priority. A track shorter than the finished video is never eligible.

## Playback rule

The real musical ending is protected. For a track of `A` seconds and a finished video of `V` seconds:

`musicTrimStart = A - V`

The final `V` seconds of the audio are used, so the track's real ending lands on the video's final frame.

Spreelo does not loop, stretch or synthesize a fade to make a music track fit. If no eligible track is long enough, the video remains silent and still completes normally.


## v144.55 curated pack

The 37 new supplied WAV files are renamed to stable kebab-case asset names and categorized by style, mood, industry, video format, keywords and energy. Per-track video volume is balanced from measured loudness so the library stays reasonably consistent without modifying the source audio.

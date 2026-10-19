import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  VIDEO_MUSIC_CATALOG_VERSION,
  VIDEO_MUSIC_LIBRARY,
  normalizeVideoMusicCatalog,
  selectBestVideoMusicFromTracks,
} from "../lib/videoMusicLibrary.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

assert.equal(VIDEO_MUSIC_CATALOG_VERSION, 3, "The managed music catalog now uses version 3");
assert.equal(VIDEO_MUSIC_LIBRARY.length, 36, "19 retained original tracks and 17 Suno tracks should ship together");

const ids = new Set();
const paths = new Set();
for (const track of VIDEO_MUSIC_LIBRARY) {
  assert.ok(track.id && !ids.has(track.id), `Track id must be unique: ${track.id}`);
  ids.add(track.id);
  assert.ok(track.public_path && !paths.has(track.public_path), `Bundled path must be unique: ${track.public_path}`);
  paths.add(track.public_path);
  assert.ok(track.duration_seconds >= 1 && track.duration_seconds <= 60, `${track.name} must have a supported duration`);
  assert.ok(track.volume >= 0 && track.volume <= 1, `${track.name} must have a valid video volume`);
  assert.ok(["low", "medium", "high"].includes(track.energy), `${track.name} must have a valid energy value`);
  assert.ok(track.categories.length >= 2, `${track.name} should have useful categories`);
  assert.ok(track.moods.length >= 2, `${track.name} should have useful moods`);
  assert.ok(track.industries.length >= 2, `${track.name} should have useful industries`);
  assert.ok(track.formats.includes("animated_video"), `${track.name} must support animated videos`);

  const localPath = path.join(root, "public", track.public_path.replace(/^\/+/, ""));
  assert.ok(fs.existsSync(localPath), `Bundled audio file must exist: ${track.public_path}`);
}

const existingEditedSeed = {
  ...VIDEO_MUSIC_LIBRARY[0],
  name: "Wait for the Drop - edited in Admin",
  priority: 3,
};
const migrated = normalizeVideoMusicCatalog({ version: 1, tracks: [existingEditedSeed] });
assert.equal(migrated.tracks.length, 36, "A version-1 catalog must receive the retained seeds and new Suno tracks");
assert.equal(migrated.tracks[0].name, existingEditedSeed.name, "Existing Admin edits must survive the v1 -> v2 merge");
assert.equal(migrated.tracks[0].priority, 3, "Existing Admin metadata must not be overwritten during migration");

const intentionallyDeleted = normalizeVideoMusicCatalog({
  version: VIDEO_MUSIC_CATALOG_VERSION,
  tracks: VIDEO_MUSIC_LIBRARY.slice(0, 4),
});
assert.equal(intentionallyDeleted.tracks.length, 4, "A current catalog must not resurrect intentionally deleted bundled tracks");

const scenarios = [
  {
    label: "premium fragrance",
    context: { content_format: "animated_video", industry: "beauty", product_category: "fragrance", post_copy: "Elegant premium luxury fragrance" },
    allowedPrefixes: ["Velvet Horizon", "Wait for the Drop", "Suno"],
  },
  {
    label: "children and family",
    context: { content_format: "animated_video", industry: "kids", product_category: "toys", post_copy: "Playful fun product for children and family" },
    allowedPrefixes: ["Bouncy Bluebirds", "Suno"],
  },
  {
    label: "baby and comfort",
    context: { content_format: "animated_video", industry: "baby", product_category: "stroller", post_copy: "Soft comfort for baby and family" },
    allowedPrefixes: ["Soft Morning Light"],
  },
  {
    label: "sport performance",
    context: { content_format: "animated_video", industry: "sport", product_category: "fitness", post_copy: "Performance challenge motivation" },
    allowedPrefixes: ["The Final Push", "Neon", "Wait for the Drop"],
  },
  {
    label: "summer travel",
    context: { content_format: "animated_video", industry: "travel", product_category: "outdoor", post_copy: "Summer sunshine travel outdoors" },
    allowedPrefixes: ["Sunshine", "Golden Hour"],
  },
];

for (const scenario of scenarios) {
  const selected = selectBestVideoMusicFromTracks({
    tracks: VIDEO_MUSIC_LIBRARY,
    context: scenario.context,
    targetDurationSeconds: 6.75,
    appUrl: "https://app.spreelo.com",
  });
  assert.ok(selected, `${scenario.label} should select a bundled track`);
  assert.ok(
    scenario.allowedPrefixes.some((prefix) => selected.name.startsWith(prefix)),
    `${scenario.label} selected an unexpected track: ${selected.name}`
  );
}

console.log("v144.55 expanded video music library tests passed");

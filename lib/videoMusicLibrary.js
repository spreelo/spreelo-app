import { isMissingMusicCatalog, loadVideoMusicDeletedIds, excludeDeletedVideoMusic } from "./videoMusicDeletions.js";
const DEFAULT_APP_URL = "https://app.spreelo.com";

export const VIDEO_MUSIC_BUCKET = "video-music-library";
export const VIDEO_MUSIC_CATALOG_PATH = "catalog/library.json";
export const VIDEO_MUSIC_CATALOG_VERSION = 3;

// Bundled music catalog: 19 currently retained original assets + 17 new Suno assets.
// Catalog v3 appends only these new Suno IDs to existing Admin catalogs.
// Admin changes/deletions are never overwritten or resurrected.
// Bundled tracks remain available through the app static-file hosting.
export const VIDEO_MUSIC_LIBRARY = Object.freeze([
  Object.freeze({
  "id": "wait-for-the-drop-v1",
  "name": "Wait for the Drop",
  "source_kind": "bundled",
  "public_path": "/audio-library/wait-for-the-drop.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 7.2,
  "active": true,
  "priority": 10,
  "volume": 0.5,
  "categories": [
    "premium",
    "modern",
    "dynamic"
  ],
  "moods": [
    "energetic",
    "modern",
    "confident",
    "premium",
    "dynamic"
  ],
  "industries": [
    "beauty",
    "fashion",
    "fragrance",
    "lifestyle",
    "retail",
    "sport",
    "tech",
    "ecommerce"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "product",
    "launch",
    "premium",
    "modern",
    "energy",
    "dynamic",
    "fashion",
    "beauty",
    "fragrance",
    "sport",
    "tech",
    "reel",
    "video"
  ],
  "energy": "medium",
  "notes": "First Spreelo music-library track. End-align the real musical ending with the finished video.",
  "created_at": "2026-08-25T00:00:00.000Z",
  "updated_at": "2026-08-25T00:00:00.000Z"
}),
  Object.freeze({
  "id": "bouncy-bluebirds-03-v1",
  "name": "Bouncy Bluebirds 03",
  "source_kind": "bundled",
  "public_path": "/audio-library/bouncy-bluebirds-03.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 10.44,
  "active": true,
  "priority": 6,
  "volume": 0.48,
  "categories": [
    "playful",
    "bright",
    "friendly",
    "organic"
  ],
  "moods": [
    "cheerful",
    "lighthearted",
    "bouncy",
    "optimistic",
    "groovy",
    "relaxed"
  ],
  "industries": [
    "family",
    "kids",
    "pets",
    "food",
    "retail",
    "lifestyle",
    "ecommerce"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "playful",
    "happy",
    "friendly",
    "cute",
    "family",
    "children",
    "pets",
    "food",
    "summer",
    "social",
    "product",
    "reel",
    "video",
    "groovy",
    "relaxed"
  ],
  "energy": "medium",
  "notes": "Curated from the supplied Spreelo audio pack. Measured 95 BPM, -18.7 LUFS; background volume balanced for short product videos.",
  "created_at": "2026-08-26T21:30:00.000Z",
  "updated_at": "2026-08-26T21:30:00.000Z"
}),
  Object.freeze({
  "id": "neon-pulse-02-v1",
  "name": "Neon Pulse 02",
  "source_kind": "bundled",
  "public_path": "/audio-library/neon-pulse-02.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 9.92,
  "active": true,
  "priority": 7,
  "volume": 0.57,
  "categories": [
    "modern",
    "electronic",
    "dynamic",
    "energetic"
  ],
  "moods": [
    "energetic",
    "confident",
    "bold",
    "driving",
    "clean"
  ],
  "industries": [
    "tech",
    "automotive",
    "gaming",
    "sport",
    "electronics",
    "fashion",
    "industrial",
    "retail",
    "ecommerce"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "neon",
    "pulse",
    "modern",
    "tech",
    "digital",
    "electric",
    "automotive",
    "gaming",
    "sport",
    "launch",
    "performance",
    "product",
    "reel",
    "video",
    "driving",
    "clean"
  ],
  "energy": "medium",
  "notes": "Curated from the supplied Spreelo audio pack. Measured 102 BPM, -20.1 LUFS; background volume balanced for short product videos.",
  "created_at": "2026-08-26T21:30:00.000Z",
  "updated_at": "2026-08-26T21:30:00.000Z"
}),
  Object.freeze({
  "id": "neon-pulse-03-v1",
  "name": "Neon Pulse 03",
  "source_kind": "bundled",
  "public_path": "/audio-library/neon-pulse-03.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 10,
  "active": true,
  "priority": 7,
  "volume": 0.48,
  "categories": [
    "modern",
    "electronic",
    "dynamic",
    "energetic"
  ],
  "moods": [
    "energetic",
    "confident",
    "bold",
    "driving",
    "fast",
    "intense"
  ],
  "industries": [
    "tech",
    "automotive",
    "gaming",
    "sport",
    "electronics",
    "fashion",
    "industrial",
    "retail",
    "ecommerce"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "neon",
    "pulse",
    "modern",
    "tech",
    "digital",
    "electric",
    "automotive",
    "gaming",
    "sport",
    "launch",
    "performance",
    "product",
    "reel",
    "video",
    "fast",
    "intense",
    "sparse"
  ],
  "energy": "high",
  "notes": "Curated from the supplied Spreelo audio pack. Measured 181 BPM, -18.6 LUFS; background volume balanced for short product videos.",
  "created_at": "2026-08-26T21:30:00.000Z",
  "updated_at": "2026-08-26T21:30:00.000Z"
}),
  Object.freeze({
  "id": "neon-pulse-04-v1",
  "name": "Neon Pulse 04",
  "source_kind": "bundled",
  "public_path": "/audio-library/neon-pulse-04.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 9.84,
  "active": true,
  "priority": 7,
  "volume": 0.55,
  "categories": [
    "modern",
    "electronic",
    "dynamic",
    "energetic"
  ],
  "moods": [
    "energetic",
    "confident",
    "bold",
    "driving",
    "edgy",
    "crisp"
  ],
  "industries": [
    "tech",
    "automotive",
    "gaming",
    "sport",
    "electronics",
    "fashion",
    "industrial",
    "retail",
    "ecommerce"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "neon",
    "pulse",
    "modern",
    "tech",
    "digital",
    "electric",
    "automotive",
    "gaming",
    "sport",
    "launch",
    "performance",
    "product",
    "reel",
    "video",
    "edgy",
    "crisp",
    "bright"
  ],
  "energy": "high",
  "notes": "Curated from the supplied Spreelo audio pack. Measured 110 BPM, -19.8 LUFS; background volume balanced for short product videos.",
  "created_at": "2026-08-26T21:30:00.000Z",
  "updated_at": "2026-08-26T21:30:00.000Z"
}),
  Object.freeze({
  "id": "neon-pulse-05-v1",
  "name": "Neon Pulse 05",
  "source_kind": "bundled",
  "public_path": "/audio-library/neon-pulse-05.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 9.6,
  "active": true,
  "priority": 7,
  "volume": 0.46,
  "categories": [
    "modern",
    "electronic",
    "dynamic",
    "energetic",
    "cinematic"
  ],
  "moods": [
    "energetic",
    "confident",
    "bold",
    "driving",
    "punchy",
    "cinematic"
  ],
  "industries": [
    "tech",
    "automotive",
    "gaming",
    "sport",
    "electronics",
    "fashion",
    "industrial",
    "retail",
    "ecommerce"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "neon",
    "pulse",
    "modern",
    "tech",
    "digital",
    "electric",
    "automotive",
    "gaming",
    "sport",
    "launch",
    "performance",
    "product",
    "reel",
    "video",
    "punchy",
    "cinematic",
    "dynamic"
  ],
  "energy": "medium",
  "notes": "Curated from the supplied Spreelo audio pack. Measured 99 BPM, -18.3 LUFS; background volume balanced for short product videos.",
  "created_at": "2026-08-26T21:30:00.000Z",
  "updated_at": "2026-08-26T21:30:00.000Z"
}),
  Object.freeze({
  "id": "neon-pulse-06-v1",
  "name": "Neon Pulse 06",
  "source_kind": "bundled",
  "public_path": "/audio-library/neon-pulse-06.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 9.76,
  "active": true,
  "priority": 7,
  "volume": 0.64,
  "categories": [
    "modern",
    "electronic",
    "dynamic",
    "energetic"
  ],
  "moods": [
    "energetic",
    "confident",
    "bold",
    "driving",
    "build"
  ],
  "industries": [
    "tech",
    "automotive",
    "gaming",
    "sport",
    "electronics",
    "fashion",
    "industrial",
    "retail",
    "ecommerce"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "neon",
    "pulse",
    "modern",
    "tech",
    "digital",
    "electric",
    "automotive",
    "gaming",
    "sport",
    "launch",
    "performance",
    "product",
    "reel",
    "video",
    "energetic",
    "build",
    "dynamic"
  ],
  "energy": "high",
  "notes": "Curated from the supplied Spreelo audio pack. Measured 125 BPM, -21.2 LUFS; background volume balanced for short product videos.",
  "created_at": "2026-08-26T21:30:00.000Z",
  "updated_at": "2026-08-26T21:30:00.000Z"
}),
  Object.freeze({
  "id": "neon-pulse-07-v1",
  "name": "Neon Pulse 07",
  "source_kind": "bundled",
  "public_path": "/audio-library/neon-pulse-07.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 10.36,
  "active": false,
  "priority": 7,
  "volume": 0.46,
  "categories": [
    "modern",
    "electronic",
    "dynamic",
    "energetic"
  ],
  "moods": [
    "energetic",
    "confident",
    "bold",
    "driving"
  ],
  "industries": [
    "tech",
    "automotive",
    "gaming",
    "sport",
    "electronics",
    "fashion",
    "industrial",
    "retail",
    "ecommerce"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "neon",
    "pulse",
    "modern",
    "tech",
    "digital",
    "electric",
    "automotive",
    "gaming",
    "sport",
    "launch",
    "performance",
    "product",
    "reel",
    "video",
    "bold",
    "driving",
    "relaxed",
    "dynamic"
  ],
  "energy": "high",
  "notes": "Curated from the supplied Spreelo audio pack. Measured 92 BPM, -18.3 LUFS; background volume balanced for short product videos.",
  "created_at": "2026-08-26T21:30:00.000Z",
  "updated_at": "2026-08-26T21:30:00.000Z"
}),
  Object.freeze({
  "id": "soft-morning-light-01-v1",
  "name": "Soft Morning Light 01",
  "source_kind": "bundled",
  "public_path": "/audio-library/soft-morning-light-01.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 10.24,
  "active": true,
  "priority": 8,
  "volume": 0.54,
  "categories": [
    "soft",
    "minimal",
    "warm",
    "organic"
  ],
  "moods": [
    "calm",
    "gentle",
    "comforting",
    "peaceful",
    "warm"
  ],
  "industries": [
    "beauty",
    "wellness",
    "baby",
    "family",
    "home",
    "lifestyle",
    "hospitality",
    "food",
    "retail",
    "ecommerce"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "soft",
    "morning",
    "calm",
    "gentle",
    "baby",
    "home",
    "wellness",
    "skincare",
    "comfort",
    "cozy",
    "product",
    "reel",
    "video",
    "warm"
  ],
  "energy": "low",
  "notes": "Curated from the supplied Spreelo audio pack. Measured 134 BPM, -19.7 LUFS; background volume balanced for short product videos.",
  "created_at": "2026-08-26T21:30:00.000Z",
  "updated_at": "2026-08-26T21:30:00.000Z"
}),
  Object.freeze({
  "id": "soft-morning-light-02-v1",
  "name": "Soft Morning Light 02",
  "source_kind": "bundled",
  "public_path": "/audio-library/soft-morning-light-02.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 22.52,
  "active": true,
  "priority": 8,
  "volume": 0.52,
  "categories": [
    "soft",
    "minimal",
    "warm",
    "organic"
  ],
  "moods": [
    "calm",
    "gentle",
    "comforting",
    "peaceful",
    "extended",
    "storytelling"
  ],
  "industries": [
    "beauty",
    "wellness",
    "baby",
    "family",
    "home",
    "lifestyle",
    "hospitality",
    "food",
    "retail",
    "ecommerce"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "soft",
    "morning",
    "calm",
    "gentle",
    "baby",
    "home",
    "wellness",
    "skincare",
    "comfort",
    "cozy",
    "product",
    "reel",
    "video",
    "extended",
    "storytelling"
  ],
  "energy": "low",
  "notes": "Curated from the supplied Spreelo audio pack. Measured 104 BPM, -19.3 LUFS; background volume balanced for short product videos.",
  "created_at": "2026-08-26T21:30:00.000Z",
  "updated_at": "2026-08-26T21:30:00.000Z"
}),
  Object.freeze({
  "id": "soft-morning-light-03-v1",
  "name": "Soft Morning Light 03",
  "source_kind": "bundled",
  "public_path": "/audio-library/soft-morning-light-03.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 9.92,
  "active": true,
  "priority": 8,
  "volume": 0.53,
  "categories": [
    "soft",
    "minimal",
    "warm",
    "organic"
  ],
  "moods": [
    "calm",
    "gentle",
    "comforting",
    "peaceful",
    "minimal",
    "quiet"
  ],
  "industries": [
    "beauty",
    "wellness",
    "baby",
    "family",
    "home",
    "lifestyle",
    "hospitality",
    "food",
    "retail",
    "ecommerce"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "soft",
    "morning",
    "calm",
    "gentle",
    "baby",
    "home",
    "wellness",
    "skincare",
    "comfort",
    "cozy",
    "product",
    "reel",
    "video",
    "minimal",
    "quiet",
    "relaxed",
    "warm",
    "sparse"
  ],
  "energy": "low",
  "notes": "Curated from the supplied Spreelo audio pack. Measured 89 BPM, -19.4 LUFS; background volume balanced for short product videos.",
  "created_at": "2026-08-26T21:30:00.000Z",
  "updated_at": "2026-08-26T21:30:00.000Z"
}),
  Object.freeze({
  "id": "soft-morning-light-06-v1",
  "name": "Soft Morning Light 06",
  "source_kind": "bundled",
  "public_path": "/audio-library/soft-morning-light-06.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 9.68,
  "active": true,
  "priority": 8,
  "volume": 0.47,
  "categories": [
    "soft",
    "minimal",
    "warm",
    "organic"
  ],
  "moods": [
    "calm",
    "gentle",
    "comforting",
    "peaceful",
    "textured",
    "organic"
  ],
  "industries": [
    "beauty",
    "wellness",
    "baby",
    "family",
    "home",
    "lifestyle",
    "hospitality",
    "food",
    "retail",
    "ecommerce"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "soft",
    "morning",
    "calm",
    "gentle",
    "baby",
    "home",
    "wellness",
    "skincare",
    "comfort",
    "cozy",
    "product",
    "reel",
    "video",
    "textured",
    "organic",
    "bright",
    "dynamic"
  ],
  "energy": "medium",
  "notes": "Curated from the supplied Spreelo audio pack. Measured 125 BPM, -18.5 LUFS; background volume balanced for short product videos.",
  "created_at": "2026-08-26T21:30:00.000Z",
  "updated_at": "2026-08-26T21:30:00.000Z"
}),
  Object.freeze({
  "id": "sunshine-01-v1",
  "name": "Sunshine 01",
  "source_kind": "bundled",
  "public_path": "/audio-library/sunshine-01.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 9.36,
  "active": true,
  "priority": 7,
  "volume": 0.54,
  "categories": [
    "bright",
    "upbeat",
    "feel_good",
    "lifestyle"
  ],
  "moods": [
    "cheerful",
    "optimistic",
    "sunny",
    "energetic",
    "fast"
  ],
  "industries": [
    "travel",
    "food",
    "beverage",
    "family",
    "lifestyle",
    "retail",
    "outdoor",
    "fashion",
    "hospitality",
    "ecommerce"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "sunshine",
    "summer",
    "happy",
    "travel",
    "outdoor",
    "food",
    "beverage",
    "family",
    "fashion",
    "holiday",
    "product",
    "reel",
    "video",
    "sunny",
    "fast"
  ],
  "energy": "high",
  "notes": "Curated from the supplied Spreelo audio pack. Measured 141 BPM, -19.6 LUFS; background volume balanced for short product videos.",
  "created_at": "2026-08-26T21:30:00.000Z",
  "updated_at": "2026-08-26T21:30:00.000Z"
}),
  Object.freeze({
  "id": "sunshine-02-v1",
  "name": "Sunshine 02",
  "source_kind": "bundled",
  "public_path": "/audio-library/sunshine-02.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 8.36,
  "active": true,
  "priority": 7,
  "volume": 0.41,
  "categories": [
    "bright",
    "upbeat",
    "feel_good",
    "lifestyle"
  ],
  "moods": [
    "cheerful",
    "optimistic",
    "sunny",
    "energetic",
    "carefree",
    "upbeat"
  ],
  "industries": [
    "travel",
    "food",
    "beverage",
    "family",
    "lifestyle",
    "retail",
    "outdoor",
    "fashion",
    "hospitality",
    "ecommerce"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "sunshine",
    "summer",
    "happy",
    "travel",
    "outdoor",
    "food",
    "beverage",
    "family",
    "fashion",
    "holiday",
    "product",
    "reel",
    "video",
    "carefree",
    "upbeat"
  ],
  "energy": "high",
  "notes": "Curated from the supplied Spreelo audio pack. Measured 125 BPM, -17.2 LUFS; background volume balanced for short product videos.",
  "created_at": "2026-08-26T21:30:00.000Z",
  "updated_at": "2026-08-26T21:30:00.000Z"
}),
  Object.freeze({
  "id": "sunshine-03-v1",
  "name": "Sunshine 03",
  "source_kind": "bundled",
  "public_path": "/audio-library/sunshine-03.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 9.2,
  "active": true,
  "priority": 7,
  "volume": 0.52,
  "categories": [
    "bright",
    "upbeat",
    "feel_good",
    "lifestyle"
  ],
  "moods": [
    "cheerful",
    "optimistic",
    "sunny",
    "energetic",
    "bright",
    "quick"
  ],
  "industries": [
    "travel",
    "food",
    "beverage",
    "family",
    "lifestyle",
    "retail",
    "outdoor",
    "fashion",
    "hospitality",
    "ecommerce"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "sunshine",
    "summer",
    "happy",
    "travel",
    "outdoor",
    "food",
    "beverage",
    "family",
    "fashion",
    "holiday",
    "product",
    "reel",
    "video",
    "bright",
    "quick",
    "fast"
  ],
  "energy": "high",
  "notes": "Curated from the supplied Spreelo audio pack. Measured 148 BPM, -19.3 LUFS; background volume balanced for short product videos.",
  "created_at": "2026-08-26T21:30:00.000Z",
  "updated_at": "2026-08-26T21:30:00.000Z"
}),
  Object.freeze({
  "id": "sunshine-04-v1",
  "name": "Sunshine 04",
  "source_kind": "bundled",
  "public_path": "/audio-library/sunshine-04.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 9.4,
  "active": true,
  "priority": 7,
  "volume": 0.5,
  "categories": [
    "bright",
    "upbeat",
    "feel_good",
    "lifestyle"
  ],
  "moods": [
    "cheerful",
    "optimistic",
    "sunny",
    "energetic",
    "happy",
    "warm"
  ],
  "industries": [
    "travel",
    "food",
    "beverage",
    "family",
    "lifestyle",
    "retail",
    "outdoor",
    "fashion",
    "hospitality",
    "ecommerce"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "sunshine",
    "summer",
    "happy",
    "travel",
    "outdoor",
    "food",
    "beverage",
    "family",
    "fashion",
    "holiday",
    "product",
    "reel",
    "video",
    "warm"
  ],
  "energy": "high",
  "notes": "Curated from the supplied Spreelo audio pack. Measured 125 BPM, -19.0 LUFS; background volume balanced for short product videos.",
  "created_at": "2026-08-26T21:30:00.000Z",
  "updated_at": "2026-08-26T21:30:00.000Z"
}),
  Object.freeze({
  "id": "sunshine-05-v1",
  "name": "Sunshine 05",
  "source_kind": "bundled",
  "public_path": "/audio-library/sunshine-05.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 10.04,
  "active": true,
  "priority": 7,
  "volume": 0.47,
  "categories": [
    "bright",
    "upbeat",
    "feel_good",
    "lifestyle"
  ],
  "moods": [
    "cheerful",
    "optimistic",
    "sunny",
    "energetic",
    "moving",
    "travel"
  ],
  "industries": [
    "travel",
    "food",
    "beverage",
    "family",
    "lifestyle",
    "retail",
    "outdoor",
    "fashion",
    "hospitality",
    "ecommerce"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "sunshine",
    "summer",
    "happy",
    "travel",
    "outdoor",
    "food",
    "beverage",
    "family",
    "fashion",
    "holiday",
    "product",
    "reel",
    "video",
    "moving"
  ],
  "energy": "high",
  "notes": "Curated from the supplied Spreelo audio pack. Measured 122 BPM, -18.4 LUFS; background volume balanced for short product videos.",
  "created_at": "2026-08-26T21:30:00.000Z",
  "updated_at": "2026-08-26T21:30:00.000Z"
}),
  Object.freeze({
  "id": "the-final-push-v1",
  "name": "The Final Push",
  "source_kind": "bundled",
  "public_path": "/audio-library/the-final-push.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 10,
  "active": true,
  "priority": 8,
  "volume": 0.66,
  "categories": [
    "motivational",
    "cinematic",
    "driving",
    "dynamic"
  ],
  "moods": [
    "determined",
    "confident",
    "uplifting",
    "energetic",
    "build"
  ],
  "industries": [
    "sport",
    "fitness",
    "automotive",
    "tech",
    "outdoor",
    "construction",
    "industrial",
    "tools",
    "retail",
    "ecommerce"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "motivation",
    "finish",
    "push",
    "performance",
    "sport",
    "fitness",
    "challenge",
    "automotive",
    "construction",
    "tools",
    "launch",
    "product",
    "reel",
    "video",
    "determined",
    "build",
    "warm"
  ],
  "energy": "high",
  "notes": "Curated from the supplied Spreelo audio pack. Measured 97 BPM, -22.7 LUFS; background volume balanced for short product videos.",
  "created_at": "2026-08-26T21:30:00.000Z",
  "updated_at": "2026-08-26T21:30:00.000Z"
}),
  Object.freeze({
  "id": "velvet-horizon-01-v1",
  "name": "Velvet Horizon 01",
  "source_kind": "bundled",
  "public_path": "/audio-library/velvet-horizon-01.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 10,
  "active": true,
  "priority": 9,
  "volume": 0.66,
  "categories": [
    "premium",
    "cinematic",
    "elegant",
    "modern"
  ],
  "moods": [
    "luxurious",
    "sophisticated",
    "calm",
    "confident",
    "smooth"
  ],
  "industries": [
    "beauty",
    "fashion",
    "fragrance",
    "automotive",
    "jewelry",
    "lifestyle",
    "hospitality",
    "retail",
    "ecommerce"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "velvet",
    "luxury",
    "premium",
    "elegant",
    "fashion",
    "beauty",
    "fragrance",
    "jewelry",
    "automotive",
    "product",
    "reel",
    "video",
    "luxurious",
    "smooth",
    "warm"
  ],
  "energy": "medium",
  "notes": "Curated from the supplied Spreelo audio pack. Measured 125 BPM, -21.9 LUFS; background volume balanced for short product videos.",
  "created_at": "2026-08-26T21:30:00.000Z",
  "updated_at": "2026-08-26T21:30:00.000Z"
}),
  Object.freeze({
  "id": "suno-beat-01-v1",
  "name": "Suno Warm Steps 01",
  "source_kind": "bundled",
  "public_path": "/audio-library/suno-beat-01.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 10.0,
  "active": true,
  "priority": 3,
  "volume": 0.51,
  "categories": [
    "warm",
    "rhythmic",
    "organic",
    "lifestyle"
  ],
  "moods": [
    "friendly",
    "relaxed",
    "grounded",
    "easygoing"
  ],
  "industries": [
    "home",
    "lifestyle",
    "food",
    "retail",
    "family",
    "ecommerce"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "warm",
    "comfort",
    "everyday",
    "home",
    "casual",
    "groove",
    "product",
    "video",
    "social_media",
    "reel"
  ],
  "energy": "medium",
  "notes": "Suno source: Catchy Random Bea.wav. Automatic signal analysis: approx. 99 BPM, -15.7 LUFS integrated; original 48 kHz stereo WAV preserved. Classification is provisional based on acoustic measurements; audition in Admin for subjective genre/mood confirmation.",
  "created_at": "2026-10-19T00:00:00.000Z",
  "updated_at": "2026-10-19T00:00:00.000Z"
}),
  Object.freeze({
  "id": "suno-beat-02-v1",
  "name": "Suno Digital Spark 02",
  "source_kind": "bundled",
  "public_path": "/audio-library/suno-beat-02.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 10.4,
  "active": true,
  "priority": 4,
  "volume": 0.61,
  "categories": [
    "modern",
    "rhythmic",
    "bright",
    "digital"
  ],
  "moods": [
    "energetic",
    "playful",
    "dynamic",
    "crisp"
  ],
  "industries": [
    "tech",
    "electronics",
    "gaming",
    "sport",
    "ecommerce",
    "retail"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "tech",
    "digital",
    "launch",
    "electronics",
    "gaming",
    "fast",
    "bright",
    "product",
    "video",
    "social_media",
    "reel"
  ],
  "energy": "high",
  "notes": "Suno source: Catchy Random Beat.wav. Automatic signal analysis: approx. 112 BPM, -17.2 LUFS integrated; original 48 kHz stereo WAV preserved. Classification is provisional based on acoustic measurements; audition in Admin for subjective genre/mood confirmation.",
  "created_at": "2026-10-19T00:00:00.000Z",
  "updated_at": "2026-10-19T00:00:00.000Z"
}),
  Object.freeze({
  "id": "suno-beat-03-v1",
  "name": "Suno Momentum Drive 03",
  "source_kind": "bundled",
  "public_path": "/audio-library/suno-beat-03.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 10.36,
  "active": true,
  "priority": 5,
  "volume": 0.47,
  "categories": [
    "driving",
    "bold",
    "rhythmic",
    "dynamic"
  ],
  "moods": [
    "confident",
    "energetic",
    "motivational",
    "bold"
  ],
  "industries": [
    "sport",
    "fitness",
    "automotive",
    "fashion",
    "tech",
    "retail"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "action",
    "sport",
    "fitness",
    "performance",
    "motion",
    "launch",
    "product",
    "video",
    "social_media",
    "reel"
  ],
  "energy": "high",
  "notes": "Suno source: Catchy Random Beat(1).wav. Automatic signal analysis: approx. 129 BPM, -14.9 LUFS integrated; original 48 kHz stereo WAV preserved. Classification is provisional based on acoustic measurements; audition in Admin for subjective genre/mood confirmation.",
  "created_at": "2026-10-19T00:00:00.000Z",
  "updated_at": "2026-10-19T00:00:00.000Z"
}),
  Object.freeze({
  "id": "suno-beat-04-v1",
  "name": "Suno Urban Ease 04",
  "source_kind": "bundled",
  "public_path": "/audio-library/suno-beat-04.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 11.6,
  "active": true,
  "priority": 4,
  "volume": 0.52,
  "categories": [
    "warm",
    "rhythmic",
    "urban",
    "minimal"
  ],
  "moods": [
    "relaxed",
    "cool",
    "stylish",
    "smooth"
  ],
  "industries": [
    "fashion",
    "lifestyle",
    "home",
    "beauty",
    "retail",
    "ecommerce"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "casual",
    "streetwear",
    "fashion",
    "home",
    "city",
    "everyday",
    "product",
    "video",
    "social_media",
    "reel"
  ],
  "energy": "medium",
  "notes": "Suno source: Catchy Random Beat(2).wav. Automatic signal analysis: approx. 92 BPM, -15.9 LUFS integrated; original 48 kHz stereo WAV preserved. Classification is provisional based on acoustic measurements; audition in Admin for subjective genre/mood confirmation.",
  "created_at": "2026-10-19T00:00:00.000Z",
  "updated_at": "2026-10-19T00:00:00.000Z"
}),
  Object.freeze({
  "id": "suno-beat-05-v1",
  "name": "Suno City Rhythm 05",
  "source_kind": "bundled",
  "public_path": "/audio-library/suno-beat-05.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 11.36,
  "active": true,
  "priority": 4,
  "volume": 0.51,
  "categories": [
    "modern",
    "rhythmic",
    "lifestyle",
    "clean"
  ],
  "moods": [
    "upbeat",
    "confident",
    "friendly",
    "contemporary"
  ],
  "industries": [
    "fashion",
    "retail",
    "lifestyle",
    "travel",
    "food",
    "ecommerce"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "street",
    "shop",
    "product",
    "city",
    "everyday",
    "reel",
    "video",
    "social_media"
  ],
  "energy": "medium",
  "notes": "Suno source: Catchy Random Beat(3).wav. Automatic signal analysis: approx. 108 BPM, -15.6 LUFS integrated; original 48 kHz stereo WAV preserved. Classification is provisional based on acoustic measurements; audition in Admin for subjective genre/mood confirmation.",
  "created_at": "2026-10-19T00:00:00.000Z",
  "updated_at": "2026-10-19T00:00:00.000Z"
}),
  Object.freeze({
  "id": "suno-beat-06-v1",
  "name": "Suno Easy Swing 06",
  "source_kind": "bundled",
  "public_path": "/audio-library/suno-beat-06.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 10.0,
  "active": true,
  "priority": 3,
  "volume": 0.48,
  "categories": [
    "warm",
    "groovy",
    "friendly",
    "rhythmic"
  ],
  "moods": [
    "cheerful",
    "relaxed",
    "playful",
    "easygoing"
  ],
  "industries": [
    "food",
    "retail",
    "family",
    "lifestyle",
    "pets",
    "ecommerce"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "fun",
    "friendly",
    "family",
    "casual",
    "food",
    "groove",
    "product",
    "video",
    "social_media",
    "reel"
  ],
  "energy": "medium",
  "notes": "Suno source: Catchy Random Beat(4).wav. Automatic signal analysis: approx. 99 BPM, -15.1 LUFS integrated; original 48 kHz stereo WAV preserved. Classification is provisional based on acoustic measurements; audition in Admin for subjective genre/mood confirmation.",
  "created_at": "2026-10-19T00:00:00.000Z",
  "updated_at": "2026-10-19T00:00:00.000Z"
}),
  Object.freeze({
  "id": "suno-beat-07-v1",
  "name": "Suno Smooth Current 07",
  "source_kind": "bundled",
  "public_path": "/audio-library/suno-beat-07.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 9.6,
  "active": true,
  "priority": 4,
  "volume": 0.49,
  "categories": [
    "polished",
    "minimal",
    "rhythmic",
    "modern"
  ],
  "moods": [
    "confident",
    "smooth",
    "clean",
    "calm"
  ],
  "industries": [
    "beauty",
    "wellness",
    "home",
    "fashion",
    "tech",
    "ecommerce"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "sleek",
    "minimal",
    "design",
    "beauty",
    "product",
    "modern",
    "video",
    "social_media",
    "reel"
  ],
  "energy": "medium",
  "notes": "Suno source: Catchy Random Beat(5).wav. Automatic signal analysis: approx. 112 BPM, -15.4 LUFS integrated; original 48 kHz stereo WAV preserved. Classification is provisional based on acoustic measurements; audition in Admin for subjective genre/mood confirmation.",
  "created_at": "2026-10-19T00:00:00.000Z",
  "updated_at": "2026-10-19T00:00:00.000Z"
}),
  Object.freeze({
  "id": "suno-beat-08-v1",
  "name": "Suno Rising Horizon 08",
  "source_kind": "bundled",
  "public_path": "/audio-library/suno-beat-08.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 13.16,
  "active": true,
  "priority": 5,
  "volume": 0.6,
  "categories": [
    "cinematic",
    "dynamic",
    "rhythmic",
    "modern"
  ],
  "moods": [
    "inspiring",
    "steady",
    "confident",
    "building"
  ],
  "industries": [
    "travel",
    "automotive",
    "sport",
    "outdoor",
    "tech",
    "retail"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "journey",
    "adventure",
    "outdoor",
    "reveal",
    "motion",
    "horizon",
    "product",
    "video",
    "social_media",
    "reel"
  ],
  "energy": "medium",
  "notes": "Suno source: Catchy Random Beat(6).wav. Automatic signal analysis: approx. 112 BPM, -17.1 LUFS integrated; original 48 kHz stereo WAV preserved. Classification is provisional based on acoustic measurements; audition in Admin for subjective genre/mood confirmation.",
  "created_at": "2026-10-19T00:00:00.000Z",
  "updated_at": "2026-10-19T00:00:00.000Z"
}),
  Object.freeze({
  "id": "suno-beat-09-v1",
  "name": "Suno Rolling Motion 09",
  "source_kind": "bundled",
  "public_path": "/audio-library/suno-beat-09.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 11.28,
  "active": true,
  "priority": 3,
  "volume": 0.54,
  "categories": [
    "dynamic",
    "rhythmic",
    "sporty",
    "lifestyle"
  ],
  "moods": [
    "upbeat",
    "forward",
    "energetic",
    "confident"
  ],
  "industries": [
    "sport",
    "automotive",
    "travel",
    "fashion",
    "retail",
    "ecommerce"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "motion",
    "driving",
    "outdoors",
    "product",
    "active",
    "moving",
    "video",
    "social_media",
    "reel"
  ],
  "energy": "medium",
  "notes": "Suno source: Catchy Random Beat(7).wav. Automatic signal analysis: approx. 99 BPM, -16.1 LUFS integrated; original 48 kHz stereo WAV preserved. Classification is provisional based on acoustic measurements; audition in Admin for subjective genre/mood confirmation.",
  "created_at": "2026-10-19T00:00:00.000Z",
  "updated_at": "2026-10-19T00:00:00.000Z"
}),
  Object.freeze({
  "id": "suno-beat-10-v1",
  "name": "Suno Minimal Flow 10",
  "source_kind": "bundled",
  "public_path": "/audio-library/suno-beat-10.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 9.96,
  "active": true,
  "priority": 4,
  "volume": 0.52,
  "categories": [
    "minimal",
    "warm",
    "premium",
    "rhythmic"
  ],
  "moods": [
    "elegant",
    "smooth",
    "restrained",
    "modern"
  ],
  "industries": [
    "beauty",
    "jewelry",
    "fashion",
    "home",
    "wellness",
    "ecommerce"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "refined",
    "premium",
    "beauty",
    "design",
    "elegance",
    "minimal",
    "product",
    "video",
    "social_media",
    "reel"
  ],
  "energy": "medium",
  "notes": "Suno source: Catchy Random Beat(8).wav. Automatic signal analysis: approx. 117 BPM, -15.8 LUFS integrated; original 48 kHz stereo WAV preserved. Classification is provisional based on acoustic measurements; audition in Admin for subjective genre/mood confirmation.",
  "created_at": "2026-10-19T00:00:00.000Z",
  "updated_at": "2026-10-19T00:00:00.000Z"
}),
  Object.freeze({
  "id": "suno-beat-11-v1",
  "name": "Suno Quick Finish 11",
  "source_kind": "bundled",
  "public_path": "/audio-library/suno-beat-11.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 9.6,
  "active": true,
  "priority": 5,
  "volume": 0.51,
  "categories": [
    "rhythmic",
    "dynamic",
    "energetic",
    "modern"
  ],
  "moods": [
    "punchy",
    "bold",
    "motivational",
    "confident"
  ],
  "industries": [
    "fitness",
    "sport",
    "tech",
    "gaming",
    "automotive",
    "retail"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "short",
    "reveal",
    "punchy",
    "sport",
    "quick",
    "energetic",
    "product",
    "video",
    "social_media",
    "reel"
  ],
  "energy": "high",
  "notes": "Suno source: Catchy Random Beat(9).wav. Automatic signal analysis: approx. 129 BPM, -15.7 LUFS integrated; original 48 kHz stereo WAV preserved. Classification is provisional based on acoustic measurements; audition in Admin for subjective genre/mood confirmation.",
  "created_at": "2026-10-19T00:00:00.000Z",
  "updated_at": "2026-10-19T00:00:00.000Z"
}),
  Object.freeze({
  "id": "suno-beat-12-v1",
  "name": "Suno Bright Circuit 12",
  "source_kind": "bundled",
  "public_path": "/audio-library/suno-beat-12.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 10.4,
  "active": true,
  "priority": 5,
  "volume": 0.6,
  "categories": [
    "bright",
    "digital",
    "modern",
    "rhythmic"
  ],
  "moods": [
    "playful",
    "energetic",
    "crisp",
    "upbeat"
  ],
  "industries": [
    "tech",
    "gaming",
    "electronics",
    "automotive",
    "sport",
    "ecommerce"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "gaming",
    "tech",
    "digital",
    "bright",
    "product",
    "launch",
    "video",
    "social_media",
    "reel"
  ],
  "energy": "high",
  "notes": "Suno source: Catchy Random Beat(10).wav. Automatic signal analysis: approx. 117 BPM, -17.0 LUFS integrated; original 48 kHz stereo WAV preserved. Classification is provisional based on acoustic measurements; audition in Admin for subjective genre/mood confirmation.",
  "created_at": "2026-10-19T00:00:00.000Z",
  "updated_at": "2026-10-19T00:00:00.000Z"
}),
  Object.freeze({
  "id": "suno-beat-13-v1",
  "name": "Suno Gentle Pause 13",
  "source_kind": "bundled",
  "public_path": "/audio-library/suno-beat-13.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 10.4,
  "active": true,
  "priority": 3,
  "volume": 0.67,
  "categories": [
    "soft",
    "warm",
    "minimal",
    "organic"
  ],
  "moods": [
    "gentle",
    "calm",
    "understated",
    "peaceful"
  ],
  "industries": [
    "wellness",
    "home",
    "baby",
    "family",
    "beauty",
    "lifestyle"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "calm",
    "gentle",
    "wellbeing",
    "comfort",
    "home",
    "relax",
    "product",
    "video",
    "social_media",
    "reel"
  ],
  "energy": "low",
  "notes": "Suno source: Catchy Random Beat(11).wav. Automatic signal analysis: approx. 99 BPM, -18.0 LUFS integrated; original 48 kHz stereo WAV preserved. Classification is provisional based on acoustic measurements; audition in Admin for subjective genre/mood confirmation.",
  "created_at": "2026-10-19T00:00:00.000Z",
  "updated_at": "2026-10-19T00:00:00.000Z"
}),
  Object.freeze({
  "id": "suno-beat-14-v1",
  "name": "Suno Playful Parade 14",
  "source_kind": "bundled",
  "public_path": "/audio-library/suno-beat-14.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 12.8,
  "active": true,
  "priority": 5,
  "volume": 0.5,
  "categories": [
    "playful",
    "rhythmic",
    "bright",
    "friendly"
  ],
  "moods": [
    "cheerful",
    "upbeat",
    "lighthearted",
    "fun"
  ],
  "industries": [
    "kids",
    "family",
    "pets",
    "food",
    "retail",
    "toys"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "kids",
    "toys",
    "playful",
    "fun",
    "family",
    "pet",
    "product",
    "video",
    "social_media",
    "reel"
  ],
  "energy": "high",
  "notes": "Suno source: Catchy Random Beat(12).wav. Automatic signal analysis: approx. 112 BPM, -15.5 LUFS integrated; original 48 kHz stereo WAV preserved. Classification is provisional based on acoustic measurements; audition in Admin for subjective genre/mood confirmation.",
  "created_at": "2026-10-19T00:00:00.000Z",
  "updated_at": "2026-10-19T00:00:00.000Z"
}),
  Object.freeze({
  "id": "suno-beat-15-v1",
  "name": "Suno Everyday Bounce 15",
  "source_kind": "bundled",
  "public_path": "/audio-library/suno-beat-15.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 10.6,
  "active": true,
  "priority": 4,
  "volume": 0.61,
  "categories": [
    "lifestyle",
    "rhythmic",
    "modern",
    "polished"
  ],
  "moods": [
    "friendly",
    "confident",
    "uplifting",
    "easygoing"
  ],
  "industries": [
    "retail",
    "fashion",
    "food",
    "home",
    "lifestyle",
    "ecommerce"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "everyday",
    "shop",
    "friendly",
    "lifestyle",
    "product",
    "home",
    "video",
    "social_media",
    "reel"
  ],
  "energy": "medium",
  "notes": "Suno source: Catchy Random Beat(13).wav. Automatic signal analysis: approx. 103 BPM, -17.2 LUFS integrated; original 48 kHz stereo WAV preserved. Classification is provisional based on acoustic measurements; audition in Admin for subjective genre/mood confirmation.",
  "created_at": "2026-10-19T00:00:00.000Z",
  "updated_at": "2026-10-19T00:00:00.000Z"
}),
  Object.freeze({
  "id": "suno-beat-16-v1",
  "name": "Suno Forward Motion 16",
  "source_kind": "bundled",
  "public_path": "/audio-library/suno-beat-16.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 10.76,
  "active": true,
  "priority": 4,
  "volume": 0.57,
  "categories": [
    "dynamic",
    "bright",
    "rhythmic",
    "modern"
  ],
  "moods": [
    "energetic",
    "bold",
    "adventurous",
    "confident"
  ],
  "industries": [
    "sport",
    "automotive",
    "travel",
    "outdoor",
    "tech",
    "fashion"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "speed",
    "travel",
    "performance",
    "motion",
    "outdoors",
    "action",
    "product",
    "video",
    "social_media",
    "reel"
  ],
  "energy": "high",
  "notes": "Suno source: Catchy Random Beat(14).wav. Automatic signal analysis: approx. 108 BPM, -16.7 LUFS integrated; original 48 kHz stereo WAV preserved. Classification is provisional based on acoustic measurements; audition in Admin for subjective genre/mood confirmation.",
  "created_at": "2026-10-19T00:00:00.000Z",
  "updated_at": "2026-10-19T00:00:00.000Z"
}),
  Object.freeze({
  "id": "suno-beat-17-v1",
  "name": "Suno Electric Rise 17",
  "source_kind": "bundled",
  "public_path": "/audio-library/suno-beat-17.wav",
  "public_url": null,
  "storage_path": null,
  "duration_seconds": 12.4,
  "active": true,
  "priority": 5,
  "volume": 0.61,
  "categories": [
    "electronic",
    "modern",
    "dynamic",
    "bright"
  ],
  "moods": [
    "energetic",
    "exciting",
    "confident",
    "futuristic"
  ],
  "industries": [
    "tech",
    "gaming",
    "electronics",
    "automotive",
    "sport",
    "ecommerce"
  ],
  "formats": [
    "animated_video",
    "ai_product_video",
    "reel",
    "short_form"
  ],
  "keywords": [
    "digital",
    "launch",
    "energy",
    "gaming",
    "tech",
    "product",
    "video",
    "social_media",
    "reel"
  ],
  "energy": "high",
  "notes": "Suno source: Catchy Random Beat(15).wav. Automatic signal analysis: approx. 129 BPM, -17.2 LUFS integrated; original 48 kHz stereo WAV preserved. Classification is provisional based on acoustic measurements; audition in Admin for subjective genre/mood confirmation.",
  "created_at": "2026-10-19T00:00:00.000Z",
  "updated_at": "2026-10-19T00:00:00.000Z"
})
]);

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTag(value) {
  return normalizeText(value).replace(/\s+/g, "_");
}

function normalizeTagList(value, limit = 40) {
  const items = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(items.map(normalizeTag).filter(Boolean))].slice(0, limit);
}

function normalizeChoice(value, allowed, fallback) {
  const normalized = normalizeTag(value);
  return allowed.includes(normalized) ? normalized : fallback;
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

export function normalizeVideoMusicTrack(raw = {}) {
  const id = String(raw?.id || "").trim();
  if (!id) return null;

  const durationSeconds = clamp(
    raw?.duration_seconds ?? raw?.durationSeconds,
    0,
    60 * 60,
    0
  );
  const publicPath = String(raw?.public_path || raw?.publicPath || "").trim() || null;
  const publicUrl = String(raw?.public_url || raw?.publicUrl || "").trim() || null;
  const storagePath = String(raw?.storage_path || raw?.storagePath || "").trim() || null;

  return {
    id,
    name: String(raw?.name || "Untitled track").replace(/\s+/g, " ").trim().slice(0, 140),
    source_kind: raw?.source_kind === "uploaded" ? "uploaded" : "bundled",
    public_path: publicPath,
    public_url: publicUrl,
    storage_path: storagePath,
    duration_seconds: durationSeconds,
    active: raw?.active !== false,
    priority: Math.round(clamp(raw?.priority, -100, 100, 0)),
    volume: clamp(raw?.volume, 0, 1, 0.5),
    categories: normalizeTagList(raw?.categories),
    moods: normalizeTagList(raw?.moods),
    industries: normalizeTagList(raw?.industries),
    formats: normalizeTagList(raw?.formats),
    keywords: normalizeTagList(raw?.keywords, 80),
    energy: normalizeChoice(raw?.energy, ["low", "medium", "high"], "medium"),
    notes: String(raw?.notes || "").replace(/\s+/g, " ").trim().slice(0, 1200),
    created_at: String(raw?.created_at || raw?.createdAt || new Date().toISOString()),
    updated_at: String(raw?.updated_at || raw?.updatedAt || new Date().toISOString()),
  };
}

export function buildDefaultVideoMusicCatalog() {
  return {
    version: VIDEO_MUSIC_CATALOG_VERSION,
    updated_at: new Date().toISOString(),
    tracks: VIDEO_MUSIC_LIBRARY.map((track) => ({ ...track })),
  };
}

export function normalizeVideoMusicCatalog(raw) {
  const hasExplicitTrackList = Array.isArray(raw?.tracks);
  const sourceVersion = Number(raw?.version || 1);
  let sourceTracks = hasExplicitTrackList ? [...raw.tracks] : [...VIDEO_MUSIC_LIBRARY];

  // v3 adds 17 Suno tracks to managed version-2 catalogs WITHOUT re-seeding
  // older bundled music deleted in Admin. v1 catalogs may also receive the
  // retained legacy seeds (but never the 19 removed/deleted old assets).
  // Independently stored deletion tombstones are applied in the API on read
  // and write, including for stale/concurrent catalog updates.
  if (hasExplicitTrackList && sourceVersion < VIDEO_MUSIC_CATALOG_VERSION) {
    const existingIds = new Set(
      sourceTracks.map((track) => String(track?.id || "").trim()).filter(Boolean)
    );
    const additions = sourceVersion < 2
      ? VIDEO_MUSIC_LIBRARY
      : VIDEO_MUSIC_LIBRARY.filter((track) => track.id.startsWith("suno-beat-"));
    for (const bundledTrack of additions) {
      if (existingIds.has(bundledTrack.id)) continue;
      sourceTracks.push({ ...bundledTrack });
      existingIds.add(bundledTrack.id);
    }
  }

  const tracks = sourceTracks.map(normalizeVideoMusicTrack).filter(Boolean);
  return {
    version: VIDEO_MUSIC_CATALOG_VERSION,
    updated_at: String(raw?.updated_at || new Date().toISOString()),
    tracks,
  };
}

function buildContextText(context = {}) {
  const values = [];
  const visit = (value) => {
    if (value == null) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === "object") {
      Object.values(value).forEach(visit);
      return;
    }
    values.push(String(value));
  };
  visit(context);
  return normalizeText(values.join(" "));
}

function scoreTerms(contextText, terms, weight) {
  let score = 0;
  const matches = [];
  const haystack = ` ${contextText} `;
  for (const rawTerm of terms || []) {
    const term = normalizeText(rawTerm);
    if (!term || !haystack.includes(` ${term} `)) continue;
    score += weight;
    matches.push(rawTerm);
  }
  return { score, matches };
}

export function getVideoMusicPublicUrl(trackOrPath, appUrl = null) {
  const configuredBase = String(
    appUrl || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || DEFAULT_APP_URL
  )
    .trim()
    .replace(/\/$/, "");

  if (trackOrPath && typeof trackOrPath === "object") {
    const absoluteUrl = String(trackOrPath.public_url || trackOrPath.publicUrl || "").trim();
    if (/^https?:\/\//i.test(absoluteUrl)) return absoluteUrl;
    const relative = absoluteUrl || trackOrPath.public_path || trackOrPath.publicPath || "";
    if (!relative) return null;
    return `${configuredBase || DEFAULT_APP_URL}/${String(relative).replace(/^\/+/, "")}`;
  }

  const raw = String(trackOrPath || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${configuredBase || DEFAULT_APP_URL}/${raw.replace(/^\/+/, "")}`;
}

export async function loadManagedVideoMusicCatalog({ supabase } = {}) {
  if (!supabase?.storage) return { ...buildDefaultVideoMusicCatalog(), tracks: [] };
  try {
    const storage = supabase.storage.from(VIDEO_MUSIC_BUCKET);
    const { data, error } = await storage.download(VIDEO_MUSIC_CATALOG_PATH);
    if (error && !isMissingMusicCatalog(error)) throw error;
    const catalog = isMissingMusicCatalog(error)
      ? buildDefaultVideoMusicCatalog()
      : normalizeVideoMusicCatalog(JSON.parse(await data.text()));
    return excludeDeletedVideoMusic(catalog, await loadVideoMusicDeletedIds(storage));
  } catch (error) {
    console.warn("Music catalog unavailable; skipping music instead of restoring deleted tracks", { message: error?.message || String(error) });
    return { ...buildDefaultVideoMusicCatalog(), tracks: [] };
  }
}

function normalizeMusicTrackFamilyId(trackId) {
  return String(trackId || "")
    .toLowerCase()
    .replace(/-v\d+$/u, "")
    .replace(/-\d+$/u, "")
    .trim();
}

function stableMusicSelectionHash(value) {
  const source = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getRecentMusicPenalty(trackId, recentTrackIds) {
  const normalizedId = String(trackId || "").trim();
  if (!normalizedId) return { penalty: 0, exactIndex: -1, familyIndex: -1 };

  const recent = (Array.isArray(recentTrackIds) ? recentTrackIds : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean);
  const exactIndex = recent.indexOf(normalizedId);
  const family = normalizeMusicTrackFamilyId(normalizedId);
  const familyIndex = family
    ? recent.findIndex(
        (id) =>
          id !== normalizedId &&
          normalizeMusicTrackFamilyId(id) === family
      )
    : -1;

  const exactPenalties = [42, 30, 22, 16, 12, 9, 7, 5];
  const familyPenalties = [16, 12, 9, 7, 5, 4, 3, 2];
  const exactPenalty =
    exactIndex >= 0
      ? exactPenalties[Math.min(exactIndex, exactPenalties.length - 1)]
      : 0;
  const familyPenalty =
    familyIndex >= 0
      ? familyPenalties[Math.min(familyIndex, familyPenalties.length - 1)]
      : 0;

  return {
    penalty: Math.max(exactPenalty, familyPenalty),
    exactIndex,
    familyIndex,
  };
}

export async function loadRecentVideoMusicTrackIds({
  supabase = null,
  userId = null,
  brandProfileId = null,
  excludePostId = null,
  limit = 10,
} = {}) {
  if (!supabase?.from || (!userId && !brandProfileId)) return [];

  try {
    let query = supabase
      .from("posts")
      .select("id, video_background_selection, updated_at");

    if (brandProfileId) {
      query = query.eq("brand_profile_id", brandProfileId);
    } else if (userId) {
      query = query.eq("user_id", userId);
    }

    if (excludePostId) {
      query = query.neq("id", excludePostId);
    }

    const { data, error } = await query
      .order("updated_at", { ascending: false })
      .limit(Math.max(12, Math.min(50, Number(limit || 10) * 4)));

    if (error) {
      console.warn("Recent video music usage could not be loaded; selecting without history", {
        brandProfileId: brandProfileId || null,
        userId: userId || null,
        message: error.message || String(error),
      });
      return [];
    }

    const ids = [];
    for (const post of data || []) {
      const selection =
        post?.video_background_selection &&
        typeof post.video_background_selection === "object" &&
        !Array.isArray(post.video_background_selection)
          ? post.video_background_selection
          : null;
      const musicAssetId = String(selection?.music_asset_id || "").trim();
      if (!musicAssetId || ids.includes(musicAssetId)) continue;
      ids.push(musicAssetId);
      if (ids.length >= Math.max(1, Number(limit || 10))) break;
    }
    return ids;
  } catch (error) {
    console.warn("Recent video music usage lookup failed open", {
      brandProfileId: brandProfileId || null,
      userId: userId || null,
      message: error?.message || String(error),
    });
    return [];
  }
}

export function selectBestVideoMusicFromTracks({
  tracks,
  context = {},
  targetDurationSeconds,
  appUrl = null,
  recentTrackIds = [],
  selectionSeed = "",
} = {}) {
  const targetDuration = Math.max(0, Number(targetDurationSeconds) || 0);
  if (!targetDuration) return null;

  const contextText = buildContextText(context);
  const eligible = (Array.isArray(tracks) ? tracks : [])
    .map(normalizeVideoMusicTrack)
    .filter((track) => {
      if (!track?.active) return false;
      if (!getVideoMusicPublicUrl(track, appUrl)) return false;
      return Number(track.duration_seconds || 0) >= targetDuration;
    });

  if (!eligible.length) return null;

  const ranked = eligible
    .map((track) => {
      // Matching remains the main quality signal. Recent-use penalties stop one
      // broad high-priority track from winning every similar Reel, while a
      // small deterministic per-post bonus gives near-equal suitable tracks a
      // fair chance without random/non-reproducible selection.
      let score = Number(track.priority) || 0;
      const reasons = [];
      for (const [terms, weight, label] of [
        [track.categories, 10, "category"],
        [track.moods, 8, "mood"],
        [track.industries, 7, "industry"],
        [track.formats, 6, "format"],
        [track.keywords, 4, "keyword"],
      ]) {
        const result = scoreTerms(contextText, terms, weight);
        score += result.score;
        if (result.matches.length) reasons.push(`${label}:${result.matches.join(",")}`);
      }

      const normalizedContext = ` ${contextText} `;
      if (track.energy && normalizedContext.includes(` ${normalizeText(track.energy)} `)) {
        score += 5;
        reasons.push(`energy:${track.energy}`);
      }

      const recentUse = getRecentMusicPenalty(track.id, recentTrackIds);
      if (recentUse.penalty > 0) {
        score -= recentUse.penalty;
        reasons.push(
          recentUse.exactIndex >= 0
            ? `recent-track-penalty:${recentUse.penalty}`
            : `recent-family-penalty:${recentUse.penalty}`
        );
      }

      const varietyBonus = selectionSeed
        ? (stableMusicSelectionHash(`${selectionSeed}|${track.id}`) % 451) / 100
        : 0;
      if (varietyBonus > 0) {
        score += varietyBonus;
        reasons.push(`variety:${varietyBonus.toFixed(2)}`);
      }

      return {
        track,
        score,
        reasons,
        recentUsePenalty: recentUse.penalty,
        varietyBonus,
      };
    })
    .sort((a, b) =>
      b.score - a.score ||
      b.track.priority - a.track.priority ||
      String(a.track.id).localeCompare(String(b.track.id))
    );

  const winner = ranked[0];
  const durationSeconds = Number(winner.track.duration_seconds);
  const trimStartSeconds = Math.max(0, durationSeconds - targetDuration);

  return {
    id: winner.track.id,
    name: winner.track.name,
    url: getVideoMusicPublicUrl(winner.track, appUrl),
    publicPath: winner.track.public_path || null,
    storagePath: winner.track.storage_path || null,
    durationSeconds,
    targetDurationSeconds: targetDuration,
    trimStartSeconds: Number(trimStartSeconds.toFixed(3)),
    volume: Math.max(0, Math.min(1, Number(winner.track.volume) || 0.5)),
    score: Number(winner.score.toFixed(3)),
    reasons: winner.reasons,
    sourceKind: winner.track.source_kind,
    recentUsePenalty: winner.recentUsePenalty,
    varietyBonus: Number(winner.varietyBonus.toFixed(2)),
    eligibleTrackCount: eligible.length,
  };
}

export async function selectBestVideoMusic({
  supabase = null,
  context = {},
  targetDurationSeconds,
  appUrl = null,
  userId = null,
  brandProfileId = null,
  excludePostId = null,
  selectionSeed = "",
  recentTrackIds = null,
} = {}) {
  const catalog = await loadManagedVideoMusicCatalog({ supabase });
  const recentIds = Array.isArray(recentTrackIds)
    ? recentTrackIds
    : await loadRecentVideoMusicTrackIds({
        supabase,
        userId,
        brandProfileId,
        excludePostId,
      });

  return selectBestVideoMusicFromTracks({
    tracks: catalog.tracks,
    context,
    targetDurationSeconds,
    appUrl,
    recentTrackIds: recentIds,
    selectionSeed,
  });
}

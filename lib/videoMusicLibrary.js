import { isMissingMusicCatalog, loadVideoMusicDeletedIds, excludeDeletedVideoMusic } from "./videoMusicDeletions.js";
const DEFAULT_APP_URL = "https://app.spreelo.com";

export const VIDEO_MUSIC_BUCKET = "video-music-library";
export const VIDEO_MUSIC_CATALOG_PATH = "catalog/library.json";
export const VIDEO_MUSIC_CATALOG_VERSION = 2;

// Bundled music catalog. Existing version-1 managed catalogs are upgraded once
// to include the 37 new curated tracks while preserving any Admin edits already
// made to the original seed. Keeping the assets bundled also means video music
// remains available if Supabase Storage is temporarily unavailable.
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
      "id": "bouncy-bluebirds-01-v1",
      "name": "Bouncy Bluebirds 01",
      "source_kind": "bundled",
      "public_path": "/audio-library/bouncy-bluebirds-01.wav",
      "public_url": null,
      "storage_path": null,
      "duration_seconds": 9.44,
      "active": true,
      "priority": 6,
      "volume": 0.47,
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
          "whimsical",
          "quick"
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
          "whimsical",
          "quick"
      ],
      "energy": "high",
      "notes": "Curated from the supplied Spreelo audio pack. Measured 134 BPM, -18.5 LUFS; background volume balanced for short product videos.",
      "created_at": "2026-08-26T21:30:00.000Z",
      "updated_at": "2026-08-26T21:30:00.000Z"
  }),
  Object.freeze({
      "id": "bouncy-bluebirds-02-v1",
      "name": "Bouncy Bluebirds 02",
      "source_kind": "bundled",
      "public_path": "/audio-library/bouncy-bluebirds-02.wav",
      "public_url": null,
      "storage_path": null,
      "duration_seconds": 9.72,
      "active": true,
      "priority": 6,
      "volume": 0.51,
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
          "sparkly",
          "crisp"
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
          "sparkly",
          "crisp",
          "bright"
      ],
      "energy": "high",
      "notes": "Curated from the supplied Spreelo audio pack. Measured 128 BPM, -19.2 LUFS; background volume balanced for short product videos.",
      "created_at": "2026-08-26T21:30:00.000Z",
      "updated_at": "2026-08-26T21:30:00.000Z"
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
      "id": "bouncy-bunny-blues-01-v1",
      "name": "Bouncy Bunny Blues 01",
      "source_kind": "bundled",
      "public_path": "/audio-library/bouncy-bunny-blues-01.wav",
      "public_url": null,
      "storage_path": null,
      "duration_seconds": 9.96,
      "active": true,
      "priority": 6,
      "volume": 0.58,
      "categories": [
          "playful",
          "quirky",
          "friendly",
          "retro"
      ],
      "moods": [
          "cheerful",
          "fun",
          "bouncy",
          "casual",
          "bluesy",
          "laid_back"
      ],
      "industries": [
          "family",
          "kids",
          "pets",
          "food",
          "beverage",
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
          "quirky",
          "fun",
          "cute",
          "family",
          "children",
          "pets",
          "snack",
          "food",
          "beverage",
          "social",
          "product",
          "reel",
          "video",
          "bluesy",
          "laid_back"
      ],
      "energy": "medium",
      "notes": "Curated from the supplied Spreelo audio pack. Measured 100 BPM, -20.3 LUFS; background volume balanced for short product videos.",
      "created_at": "2026-08-26T21:30:00.000Z",
      "updated_at": "2026-08-26T21:30:00.000Z"
  }),
  Object.freeze({
      "id": "bouncy-bunny-blues-02-v1",
      "name": "Bouncy Bunny Blues 02",
      "source_kind": "bundled",
      "public_path": "/audio-library/bouncy-bunny-blues-02.wav",
      "public_url": null,
      "storage_path": null,
      "duration_seconds": 9.0,
      "active": true,
      "priority": 6,
      "volume": 0.52,
      "categories": [
          "playful",
          "quirky",
          "friendly",
          "retro"
      ],
      "moods": [
          "cheerful",
          "fun",
          "bouncy",
          "casual",
          "swinging",
          "warm"
      ],
      "industries": [
          "family",
          "kids",
          "pets",
          "food",
          "beverage",
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
          "quirky",
          "fun",
          "cute",
          "family",
          "children",
          "pets",
          "snack",
          "food",
          "beverage",
          "social",
          "product",
          "reel",
          "video",
          "swinging",
          "warm"
      ],
      "energy": "medium",
      "notes": "Curated from the supplied Spreelo audio pack. Measured 95 BPM, -19.3 LUFS; background volume balanced for short product videos.",
      "created_at": "2026-08-26T21:30:00.000Z",
      "updated_at": "2026-08-26T21:30:00.000Z"
  }),
  Object.freeze({
      "id": "bouncy-bunny-blues-03-v1",
      "name": "Bouncy Bunny Blues 03",
      "source_kind": "bundled",
      "public_path": "/audio-library/bouncy-bunny-blues-03.wav",
      "public_url": null,
      "storage_path": null,
      "duration_seconds": 10.52,
      "active": true,
      "priority": 6,
      "volume": 0.46,
      "categories": [
          "playful",
          "quirky",
          "friendly",
          "retro"
      ],
      "moods": [
          "cheerful",
          "fun",
          "bouncy",
          "casual",
          "punchy",
          "upbeat"
      ],
      "industries": [
          "family",
          "kids",
          "pets",
          "food",
          "beverage",
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
          "quirky",
          "fun",
          "cute",
          "family",
          "children",
          "pets",
          "snack",
          "food",
          "beverage",
          "social",
          "product",
          "reel",
          "video",
          "punchy",
          "upbeat"
      ],
      "energy": "high",
      "notes": "Curated from the supplied Spreelo audio pack. Measured 125 BPM, -18.3 LUFS; background volume balanced for short product videos.",
      "created_at": "2026-08-26T21:30:00.000Z",
      "updated_at": "2026-08-26T21:30:00.000Z"
  }),
  Object.freeze({
      "id": "golden-hour-01-v1",
      "name": "Golden Hour 01",
      "source_kind": "bundled",
      "public_path": "/audio-library/golden-hour-01.wav",
      "public_url": null,
      "storage_path": null,
      "duration_seconds": 10.64,
      "active": true,
      "priority": 8,
      "volume": 0.5,
      "categories": [
          "premium",
          "warm",
          "cinematic",
          "lifestyle"
      ],
      "moods": [
          "warm",
          "uplifting",
          "elegant",
          "aspirational",
          "calm",
          "glow",
          "polished"
      ],
      "industries": [
          "beauty",
          "fashion",
          "fragrance",
          "lifestyle",
          "travel",
          "hospitality",
          "home",
          "food",
          "beverage",
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
          "golden",
          "sunset",
          "warm",
          "premium",
          "luxury",
          "lifestyle",
          "travel",
          "beauty",
          "fashion",
          "home",
          "food",
          "beverage",
          "product",
          "reel",
          "video",
          "glow",
          "polished",
          "dynamic"
      ],
      "energy": "medium",
      "notes": "Curated from the supplied Spreelo audio pack. Measured 95 BPM, -19.0 LUFS; background volume balanced for short product videos.",
      "created_at": "2026-08-26T21:30:00.000Z",
      "updated_at": "2026-08-26T21:30:00.000Z"
  }),
  Object.freeze({
      "id": "golden-hour-02-v1",
      "name": "Golden Hour 02",
      "source_kind": "bundled",
      "public_path": "/audio-library/golden-hour-02.wav",
      "public_url": null,
      "storage_path": null,
      "duration_seconds": 10.28,
      "active": true,
      "priority": 8,
      "volume": 0.46,
      "categories": [
          "premium",
          "warm",
          "cinematic",
          "lifestyle"
      ],
      "moods": [
          "warm",
          "uplifting",
          "elegant",
          "aspirational",
          "calm",
          "cinematic",
          "emotional"
      ],
      "industries": [
          "beauty",
          "fashion",
          "fragrance",
          "lifestyle",
          "travel",
          "hospitality",
          "home",
          "food",
          "beverage",
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
          "golden",
          "sunset",
          "warm",
          "premium",
          "luxury",
          "lifestyle",
          "travel",
          "beauty",
          "fashion",
          "home",
          "food",
          "beverage",
          "product",
          "reel",
          "video",
          "cinematic",
          "emotional",
          "relaxed"
      ],
      "energy": "medium",
      "notes": "Curated from the supplied Spreelo audio pack. Measured 94 BPM, -18.3 LUFS; background volume balanced for short product videos.",
      "created_at": "2026-08-26T21:30:00.000Z",
      "updated_at": "2026-08-26T21:30:00.000Z"
  }),
  Object.freeze({
      "id": "golden-hour-03-v1",
      "name": "Golden Hour 03",
      "source_kind": "bundled",
      "public_path": "/audio-library/golden-hour-03.wav",
      "public_url": null,
      "storage_path": null,
      "duration_seconds": 10.48,
      "active": true,
      "priority": 8,
      "volume": 0.63,
      "categories": [
          "premium",
          "warm",
          "cinematic",
          "lifestyle",
          "soft"
      ],
      "moods": [
          "warm",
          "uplifting",
          "elegant",
          "aspirational",
          "calm",
          "gentle",
          "soft"
      ],
      "industries": [
          "beauty",
          "fashion",
          "fragrance",
          "lifestyle",
          "travel",
          "hospitality",
          "home",
          "food",
          "beverage",
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
          "golden",
          "sunset",
          "warm",
          "premium",
          "luxury",
          "lifestyle",
          "travel",
          "beauty",
          "fashion",
          "home",
          "food",
          "beverage",
          "product",
          "reel",
          "video",
          "gentle",
          "soft",
          "rhythmic"
      ],
      "energy": "low",
      "notes": "Curated from the supplied Spreelo audio pack. Measured 95 BPM, -21.0 LUFS; background volume balanced for short product videos.",
      "created_at": "2026-08-26T21:30:00.000Z",
      "updated_at": "2026-08-26T21:30:00.000Z"
  }),
  Object.freeze({
      "id": "morning-light-01-v1",
      "name": "Morning Light 01",
      "source_kind": "bundled",
      "public_path": "/audio-library/morning-light-01.wav",
      "public_url": null,
      "storage_path": null,
      "duration_seconds": 10.48,
      "active": true,
      "priority": 7,
      "volume": 0.62,
      "categories": [
          "fresh",
          "clean",
          "uplifting",
          "lifestyle"
      ],
      "moods": [
          "optimistic",
          "fresh",
          "gentle",
          "positive",
          "clean",
          "balanced"
      ],
      "industries": [
          "beauty",
          "wellness",
          "home",
          "food",
          "family",
          "lifestyle",
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
          "morning",
          "fresh",
          "clean",
          "bright",
          "wellness",
          "beauty",
          "home",
          "breakfast",
          "family",
          "product",
          "reel",
          "video",
          "balanced",
          "warm",
          "rhythmic"
      ],
      "energy": "medium",
      "notes": "Curated from the supplied Spreelo audio pack. Measured 100 BPM, -20.9 LUFS; background volume balanced for short product videos.",
      "created_at": "2026-08-26T21:30:00.000Z",
      "updated_at": "2026-08-26T21:30:00.000Z"
  }),
  Object.freeze({
      "id": "morning-light-02-v1",
      "name": "Morning Light 02",
      "source_kind": "bundled",
      "public_path": "/audio-library/morning-light-02.wav",
      "public_url": null,
      "storage_path": null,
      "duration_seconds": 10.6,
      "active": true,
      "priority": 7,
      "volume": 0.49,
      "categories": [
          "fresh",
          "clean",
          "uplifting",
          "lifestyle",
          "rhythmic"
      ],
      "moods": [
          "optimistic",
          "fresh",
          "gentle",
          "positive",
          "rhythmic"
      ],
      "industries": [
          "beauty",
          "wellness",
          "home",
          "food",
          "family",
          "lifestyle",
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
          "morning",
          "fresh",
          "clean",
          "bright",
          "wellness",
          "beauty",
          "home",
          "breakfast",
          "family",
          "product",
          "reel",
          "video",
          "rhythmic",
          "warm"
      ],
      "energy": "medium",
      "notes": "Curated from the supplied Spreelo audio pack. Measured 97 BPM, -18.9 LUFS; background volume balanced for short product videos.",
      "created_at": "2026-08-26T21:30:00.000Z",
      "updated_at": "2026-08-26T21:30:00.000Z"
  }),
  Object.freeze({
      "id": "morning-light-03-v1",
      "name": "Morning Light 03",
      "source_kind": "bundled",
      "public_path": "/audio-library/morning-light-03.wav",
      "public_url": null,
      "storage_path": null,
      "duration_seconds": 10.08,
      "active": true,
      "priority": 7,
      "volume": 0.63,
      "categories": [
          "fresh",
          "clean",
          "uplifting",
          "lifestyle"
      ],
      "moods": [
          "optimistic",
          "fresh",
          "gentle",
          "positive",
          "airy",
          "light"
      ],
      "industries": [
          "beauty",
          "wellness",
          "home",
          "food",
          "family",
          "lifestyle",
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
          "morning",
          "fresh",
          "clean",
          "bright",
          "wellness",
          "beauty",
          "home",
          "breakfast",
          "family",
          "product",
          "reel",
          "video",
          "airy",
          "light"
      ],
      "energy": "medium",
      "notes": "Curated from the supplied Spreelo audio pack. Measured 134 BPM, -21.0 LUFS; background volume balanced for short product videos.",
      "created_at": "2026-08-26T21:30:00.000Z",
      "updated_at": "2026-08-26T21:30:00.000Z"
  }),
  Object.freeze({
      "id": "neon-horizon-v1",
      "name": "Neon Horizon",
      "source_kind": "bundled",
      "public_path": "/audio-library/neon-horizon.wav",
      "public_url": null,
      "storage_path": null,
      "duration_seconds": 9.92,
      "active": true,
      "priority": 8,
      "volume": 0.55,
      "categories": [
          "modern",
          "electronic",
          "futuristic",
          "dynamic"
      ],
      "moods": [
          "confident",
          "energetic",
          "sleek",
          "driving",
          "futuristic",
          "crisp",
          "fast"
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
          "future",
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
          "futuristic",
          "crisp",
          "fast",
          "bright",
          "rhythmic"
      ],
      "energy": "high",
      "notes": "Curated from the supplied Spreelo audio pack. Measured 117 BPM, -19.8 LUFS; background volume balanced for short product videos.",
      "created_at": "2026-08-26T21:30:00.000Z",
      "updated_at": "2026-08-26T21:30:00.000Z"
  }),
  Object.freeze({
      "id": "neon-pulse-01-v1",
      "name": "Neon Pulse 01",
      "source_kind": "bundled",
      "public_path": "/audio-library/neon-pulse-01.wav",
      "public_url": null,
      "storage_path": null,
      "duration_seconds": 9.92,
      "active": true,
      "priority": 7,
      "volume": 0.53,
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
          "sleek",
          "moody"
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
          "sleek",
          "moody",
          "relaxed"
      ],
      "energy": "medium",
      "notes": "Curated from the supplied Spreelo audio pack. Measured 63 BPM, -19.5 LUFS; background volume balanced for short product videos.",
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
      "duration_seconds": 10.0,
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
      "active": true,
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
      "id": "soft-morning-light-04-v1",
      "name": "Soft Morning Light 04",
      "source_kind": "bundled",
      "public_path": "/audio-library/soft-morning-light-04.wav",
      "public_url": null,
      "storage_path": null,
      "duration_seconds": 10.52,
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
          "airy",
          "flowing"
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
          "airy",
          "flowing",
          "fast",
          "dynamic"
      ],
      "energy": "medium",
      "notes": "Curated from the supplied Spreelo audio pack. Measured 181 BPM, -19.5 LUFS; background volume balanced for short product videos.",
      "created_at": "2026-08-26T21:30:00.000Z",
      "updated_at": "2026-08-26T21:30:00.000Z"
  }),
  Object.freeze({
      "id": "soft-morning-light-05-v1",
      "name": "Soft Morning Light 05",
      "source_kind": "bundled",
      "public_path": "/audio-library/soft-morning-light-05.wav",
      "public_url": null,
      "storage_path": null,
      "duration_seconds": 10.44,
      "active": true,
      "priority": 8,
      "volume": 0.62,
      "categories": [
          "soft",
          "minimal",
          "warm",
          "organic",
          "bright"
      ],
      "moods": [
          "calm",
          "gentle",
          "comforting",
          "peaceful",
          "bright",
          "soft"
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
          "bright",
          "fast"
      ],
      "energy": "medium",
      "notes": "Curated from the supplied Spreelo audio pack. Measured 148 BPM, -20.9 LUFS; background volume balanced for short product videos.",
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
      "id": "soft-morning-light-07-v1",
      "name": "Soft Morning Light 07",
      "source_kind": "bundled",
      "public_path": "/audio-library/soft-morning-light-07.wav",
      "public_url": null,
      "storage_path": null,
      "duration_seconds": 10.76,
      "active": true,
      "priority": 8,
      "volume": 0.43,
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
          "warm",
          "comforting",
          "relaxed"
      ],
      "energy": "low",
      "notes": "Curated from the supplied Spreelo audio pack. Measured 91 BPM, -17.7 LUFS; background volume balanced for short product videos.",
      "created_at": "2026-08-26T21:30:00.000Z",
      "updated_at": "2026-08-26T21:30:00.000Z"
  }),
  Object.freeze({
      "id": "soft-static-01-v1",
      "name": "Soft Static 01",
      "source_kind": "bundled",
      "public_path": "/audio-library/soft-static-01.wav",
      "public_url": null,
      "storage_path": null,
      "duration_seconds": 10.44,
      "active": true,
      "priority": 7,
      "volume": 0.49,
      "categories": [
          "minimal",
          "ambient",
          "modern",
          "clean"
      ],
      "moods": [
          "calm",
          "focused",
          "sleek",
          "understated",
          "subtle",
          "clean"
      ],
      "industries": [
          "tech",
          "beauty",
          "wellness",
          "home",
          "design",
          "construction",
          "industrial",
          "electronics",
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
          "minimal",
          "ambient",
          "clean",
          "modern",
          "subtle",
          "design",
          "tech",
          "beauty",
          "construction",
          "b2b",
          "product",
          "reel",
          "video",
          "warm",
          "rhythmic"
      ],
      "energy": "medium",
      "notes": "Curated from the supplied Spreelo audio pack. Measured 117 BPM, -18.8 LUFS; background volume balanced for short product videos.",
      "created_at": "2026-08-26T21:30:00.000Z",
      "updated_at": "2026-08-26T21:30:00.000Z"
  }),
  Object.freeze({
      "id": "soft-static-02-v1",
      "name": "Soft Static 02",
      "source_kind": "bundled",
      "public_path": "/audio-library/soft-static-02.wav",
      "public_url": null,
      "storage_path": null,
      "duration_seconds": 10.0,
      "active": true,
      "priority": 7,
      "volume": 0.54,
      "categories": [
          "minimal",
          "ambient",
          "modern",
          "clean",
          "rhythmic"
      ],
      "moods": [
          "calm",
          "focused",
          "sleek",
          "understated",
          "rhythmic",
          "minimal"
      ],
      "industries": [
          "tech",
          "beauty",
          "wellness",
          "home",
          "design",
          "construction",
          "industrial",
          "electronics",
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
          "minimal",
          "ambient",
          "clean",
          "modern",
          "subtle",
          "design",
          "tech",
          "beauty",
          "construction",
          "b2b",
          "product",
          "reel",
          "video",
          "rhythmic",
          "warm"
      ],
      "energy": "medium",
      "notes": "Curated from the supplied Spreelo audio pack. Measured 128 BPM, -19.6 LUFS; background volume balanced for short product videos.",
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
      "duration_seconds": 10.0,
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
      "duration_seconds": 10.0,
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
      "id": "velvet-horizon-02-v1",
      "name": "Velvet Horizon 02",
      "source_kind": "bundled",
      "public_path": "/audio-library/velvet-horizon-02.wav",
      "public_url": null,
      "storage_path": null,
      "duration_seconds": 9.92,
      "active": true,
      "priority": 9,
      "volume": 0.56,
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
          "polished",
          "modern"
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
          "polished",
          "modern"
      ],
      "energy": "medium",
      "notes": "Curated from the supplied Spreelo audio pack. Measured 125 BPM, -19.9 LUFS; background volume balanced for short product videos.",
      "created_at": "2026-08-26T21:30:00.000Z",
      "updated_at": "2026-08-26T21:30:00.000Z"
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

  // v144.55 expands the bundled library from one track to 38 tracks. Existing
  // managed catalogs are version 1, so merge only the missing bundled assets
  // during this one-time migration. Once the catalog is version 2, intentional
  // admin deletions stay deleted and are never silently resurrected.
  if (hasExplicitTrackList && sourceVersion < VIDEO_MUSIC_CATALOG_VERSION) {
    const existingIds = new Set(
      sourceTracks.map((track) => String(track?.id || "").trim()).filter(Boolean)
    );
    for (const bundledTrack of VIDEO_MUSIC_LIBRARY) {
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

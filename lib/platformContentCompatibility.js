const CONTENT_MEDIA_KIND = {
  website_item: "single_image",
  website_item_text_ad: "single_image",
  animated_website_item: "animated_video",
  ai_product_video: "animated_video",
  carousel_website_item: "carousel",
  problem_solution: "single_image",
  tips: "single_image",
  mistakes: "single_image",
  faq: "single_image",
  guide_choice: "single_image",
  engagement_humor: "single_image",
  checklist: "single_image",
  service_focus: "single_image",
  myth_fact: "single_image",
  seasonal: "single_image",
  giveaway: "single_image",
  mini_guide: "single_image",
  manual_prompt: "single_image",
};

export const SPREELO_PLATFORM_ORDER = [
  "facebook",
  "instagram",
  "tiktok",
  "linkedin",
  "pinterest",
  "youtube",
  "threads",
  "snapchat",
  "weibo",
];

export const SPREELO_PLATFORM_PROFILES = {
  facebook: {
    label: "Facebook",
    media: {
      single_image: { mode: "native" },
      carousel: { mode: "native" },
      animated_video: { mode: "native" },
    },
  },
  instagram: {
    label: "Instagram",
    media: {
      single_image: { mode: "native" },
      carousel: { mode: "native" },
      animated_video: { mode: "native" },
    },
  },
  tiktok: {
    label: "TikTok",
    media: {
      single_image: { mode: "adapt", adapter: "photo_post" },
      carousel: { mode: "adapt", adapter: "photo_post" },
      animated_video: { mode: "native" },
    },
  },
  linkedin: {
    label: "LinkedIn",
    media: {
      single_image: { mode: "native" },
      carousel: { mode: "adapt", adapter: "multi_image_post" },
      animated_video: { mode: "native" },
    },
  },
  pinterest: {
    label: "Pinterest",
    media: {
      single_image: { mode: "native" },
      carousel: { mode: "adapt", adapter: "multi_image_pin_max_5" },
      // v144.26 uploads rendered MP4 media through Pinterest's native media
      // registration flow and publishes it with a required cover image.
      animated_video: { mode: "native" },
    },
  },
  youtube: {
    label: "YouTube",
    contentOverrides: {
      // v143.98 enables native YouTube Shorts publishing for already-rendered
      // vertical videos. Image-to-Short adapters are intentionally marked not
      // ready until they are implemented end-to-end in the generator.
      problem_solution: { mode: "adapt", adapter: "short_video_from_master", spreeloReady: false },
      tips: { mode: "adapt", adapter: "short_video_from_master", spreeloReady: false },
      mistakes: { mode: "adapt", adapter: "short_video_from_master", spreeloReady: false },
      faq: { mode: "adapt", adapter: "short_video_from_master", spreeloReady: false },
      guide_choice: { mode: "adapt", adapter: "short_video_from_master", spreeloReady: false },
      engagement_humor: { mode: "adapt", adapter: "short_video_from_master", spreeloReady: false },
      checklist: { mode: "adapt", adapter: "short_video_from_master", spreeloReady: false },
      service_focus: { mode: "adapt", adapter: "short_video_from_master", spreeloReady: false },
      myth_fact: { mode: "adapt", adapter: "short_video_from_master", spreeloReady: false },
      seasonal: { mode: "adapt", adapter: "short_video_from_master", spreeloReady: false },
      mini_guide: { mode: "adapt", adapter: "short_video_from_master", spreeloReady: false },
    },
    media: {
      single_image: {
        mode: "exclusive_adapt",
        adapter: "short_video_from_master",
        spreeloReady: false,
      },
      carousel: {
        mode: "exclusive_adapt",
        adapter: "slideshow_short_from_master",
        spreeloReady: false,
      },
      animated_video: { mode: "native" },
    },
  },
  threads: {
    label: "Threads",
    media: {
      single_image: { mode: "native" },
      carousel: { mode: "native" },
      animated_video: { mode: "native" },
    },
  },
  snapchat: {
    label: "Snapchat",
    media: {
      single_image: { mode: "adapt", adapter: "story_snap" },
      carousel: { mode: "adapt", adapter: "story_sequence" },
      animated_video: { mode: "native" },
    },
  },
  weibo: {
    label: "Weibo",
    media: {
      single_image: { mode: "native" },
      carousel: { mode: "adapt", adapter: "multi_image_post" },
      animated_video: { mode: "adapt", adapter: "video_post" },
    },
  },
};

export function normalizeSpreeloPlatformKey(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.includes("facebook")) return "facebook";
  if (raw.includes("instagram")) return "instagram";
  if (raw.includes("tiktok") || raw.includes("tik tok")) return "tiktok";
  if (raw.includes("linkedin") || raw.includes("linked in")) return "linkedin";
  if (raw.includes("pinterest")) return "pinterest";
  if (raw.includes("youtube")) return "youtube";
  if (raw.includes("threads")) return "threads";
  if (raw.includes("snapchat") || raw === "snap") return "snapchat";
  if (raw.includes("weibo")) return "weibo";
  return raw.replace(/[^a-z0-9_-]+/g, "_");
}

export function normalizeSpreeloPlatformList(values) {
  const source = Array.isArray(values)
    ? values
    : String(values || "")
        .replaceAll("&", "+")
        .replaceAll(",", "+")
        .split("+");
  const seen = new Set();
  const normalized = [];

  for (const value of source) {
    const key = normalizeSpreeloPlatformKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    normalized.push(key);
  }

  return SPREELO_PLATFORM_ORDER.filter((key) => seen.has(key)).concat(
    normalized.filter((key) => !SPREELO_PLATFORM_ORDER.includes(key))
  );
}

export function getContentMediaKind(contentTypeId, contentFormat = "") {
  const explicitFormat = String(contentFormat || "").trim().toLowerCase();
  if (explicitFormat === "animated_video") return "animated_video";
  if (explicitFormat === "carousel") return "carousel";
  if (explicitFormat === "single_image") return "single_image";
  return CONTENT_MEDIA_KIND[String(contentTypeId || "").trim()] || "single_image";
}

export function getPlatformDeliveryRule({
  platform,
  contentTypeId,
  contentFormat = "",
  selectedPlatforms = [],
}) {
  const platformKey = normalizeSpreeloPlatformKey(platform);
  const profile = SPREELO_PLATFORM_PROFILES[platformKey];
  const normalizedContentTypeId = String(contentTypeId || "").trim();
  const mediaKind = getContentMediaKind(normalizedContentTypeId, contentFormat);
  const rule =
    profile?.contentOverrides?.[normalizedContentTypeId] ||
    profile?.media?.[mediaKind] ||
    { mode: "skip" };
  const selected = normalizeSpreeloPlatformList(selectedPlatforms);
  const selectedCount = selected.length || 1;
  const ready = rule.spreeloReady !== false;
  const shouldPublish =
    ready &&
    (rule.mode === "native" ||
      rule.mode === "adapt" ||
      (rule.mode === "exclusive_adapt" && selectedCount === 1));

  return {
    platform: platformKey,
    label: profile?.label || platformKey,
    mediaKind,
    mode: rule.mode || "skip",
    adapter: rule.adapter || null,
    spreeloReady: ready,
    shouldPublish,
  };
}

export function getContentTypeDestinationPlatforms({
  contentTypeId,
  contentFormat = "",
  selectedPlatforms = [],
}) {
  const selected = normalizeSpreeloPlatformList(selectedPlatforms);
  return selected.filter((platform) =>
    getPlatformDeliveryRule({
      platform,
      contentTypeId,
      contentFormat,
      selectedPlatforms: selected,
    }).shouldPublish
  );
}

export function getContentTypePlatformAdaptations({
  contentTypeId,
  contentFormat = "",
  selectedPlatforms = [],
}) {
  const selected = normalizeSpreeloPlatformList(selectedPlatforms);
  return selected
    .map((platform) =>
      getPlatformDeliveryRule({
        platform,
        contentTypeId,
        contentFormat,
        selectedPlatforms: selected,
      })
    )
    .filter((item) => item.shouldPublish)
    .reduce((result, item) => {
      result[item.platform] = {
        mode: item.mode,
        adapter: item.adapter,
        mediaKind: item.mediaKind,
      };
      return result;
    }, {});
}

export function getContentTypeCoverageScore({
  contentTypeId,
  contentFormat = "",
  selectedPlatforms = [],
}) {
  const selected = normalizeSpreeloPlatformList(selectedPlatforms);
  if (!selected.length) return 0;

  return selected.reduce((score, platform) => {
    const rule = getPlatformDeliveryRule({
      platform,
      contentTypeId,
      contentFormat,
      selectedPlatforms: selected,
    });
    if (!rule.shouldPublish) return score;
    if (rule.mode === "native") return score + 3;
    if (rule.mode === "adapt") return score + 2;
    if (rule.mode === "exclusive_adapt") return score + 1;
    return score;
  }, 0);
}

export function describeContentTypeDestinations({
  contentTypeId,
  contentFormat = "",
  selectedPlatforms = [],
}) {
  const selected = normalizeSpreeloPlatformList(selectedPlatforms);
  const destinations = getContentTypeDestinationPlatforms({
    contentTypeId,
    contentFormat,
    selectedPlatforms: selected,
  });
  const adaptations = getContentTypePlatformAdaptations({
    contentTypeId,
    contentFormat,
    selectedPlatforms: selected,
  });

  return destinations.map((platform) => {
    const profile = SPREELO_PLATFORM_PROFILES[platform];
    const adaptation = adaptations[platform];
    const suffix = adaptation?.mode === "native"
      ? "native"
      : adaptation?.adapter
      ? `adapt:${adaptation.adapter}`
      : "adapt";
    return `${profile?.label || platform} (${suffix})`;
  });
}

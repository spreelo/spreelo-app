function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTags(values) {
  return (Array.isArray(values) ? values : [])
    .map((value) => normalizeText(value).replace(/\s+/g, "_"))
    .filter(Boolean);
}

function textHasAny(text, values) {
  const normalized = normalizeText(text);
  return values.some((value) => normalized.includes(normalizeText(value)));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function inferCampaigns(text) {
  const rules = [
    ["halloween", ["halloween", "spooky", "scary", "pumpkin", "ghost", "costume", "maskerad"]],
    ["black_friday", ["black friday", "cyber monday"]],
    ["christmas", ["christmas", "xmas", "jul", "holiday gift", "julklapp"]],
    ["valentines", ["valentine", "alla hjartans", "love campaign"]],
    ["mothers_day", ["mother's day", "mothers day", "mors dag"]],
    ["fathers_day", ["father's day", "fathers day", "fars dag"]],
    ["summer", ["summer", "sommar", "beach", "festival"]],
    ["winter", ["winter", "vinter", "snow", "cozy"]],
    ["launch", ["launch", "new collection", "new product", "lansering", "nyhet"]],
    ["sale", ["sale", "discount", "offer", "rea", "rabatt", "kampanjpris"]],
  ];

  const matched = rules
    .filter(([, terms]) => textHasAny(text, terms))
    .map(([campaign]) => campaign);

  return unique([...matched, "product"]);
}

function inferMoods(text) {
  const rules = [
    ["premium", ["premium", "luxury", "elegant", "exclusive", "lyx", "sofistikerad"]],
    ["playful", ["playful", "fun", "kids", "toy", "candy", "lekfull", "barn", "godis"]],
    ["energetic", ["energetic", "bold", "sport", "fitness", "action", "energisk"]],
    ["natural", ["natural", "organic", "nature", "eco", "naturlig", "ekologisk"]],
    ["dark", ["dark", "mysterious", "night", "moody", "mork", "mystisk"]],
    ["minimal", ["minimal", "clean", "simple", "ren", "avskalad"]],
    ["warm", ["warm", "cozy", "friendly", "varm", "mysig"]],
    ["calm", ["calm", "soft", "gentle", "lugn", "mjuk"]],
  ];

  const matched = rules
    .filter(([, terms]) => textHasAny(text, terms))
    .map(([mood]) => mood);

  return matched.length ? unique(matched) : ["premium", "calm"];
}

function inferIndustries(text) {
  const rules = [
    ["beauty", ["beauty", "skincare", "cosmetic", "makeup", "serum", "hudvard", "smink"]],
    ["fashion", ["fashion", "clothing", "apparel", "dress", "shirt", "hoodie", "bag", "shoe", "mode", "klader", "vaska", "sko"]],
    ["jewelry", ["jewelry", "jewellery", "watch", "ring", "necklace", "smycke", "klocka"]],
    ["food", ["food", "snack", "candy", "coffee", "tea", "chocolate", "chips", "mat", "godis", "kaffe"]],
    ["home", ["home", "interior", "decor", "furniture", "kitchen", "hem", "inredning", "mobel"]],
    ["kids", ["kids", "children", "baby", "toy", "barn", "bebis", "leksak"]],
    ["fitness", ["fitness", "sport", "gym", "training", "traning"]],
    ["technology", ["technology", "electronics", "computer", "phone", "tech", "elektronik"]],
    ["pets", ["pet", "dog", "cat", "animal", "hund", "katt", "husdjur"]],
  ];

  return unique(
    rules
      .filter(([, terms]) => textHasAny(text, terms))
      .map(([industry]) => industry)
  );
}

function inferSeason(campaigns) {
  const priority = [
    "halloween",
    "christmas",
    "valentines",
    "mothers_day",
    "fathers_day",
    "black_friday",
    "summer",
    "winter",
  ];

  return priority.find((item) => campaigns.includes(item)) || "all";
}

export function rgbToColorTag(rgb) {
  const r = Math.max(0, Math.min(255, Number(rgb?.r) || 0));
  const g = Math.max(0, Math.min(255, Number(rgb?.g) || 0));
  const b = Math.max(0, Math.min(255, Number(rgb?.b) || 0));
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const brightness = (r + g + b) / 3;

  if (brightness > 225 && max - min < 25) return "white";
  if (brightness < 45) return "black";
  if (max - min < 18) return brightness > 150 ? "light_gray" : "gray";
  if (r > 180 && g > 115 && b > 125 && r > g && b > g * 0.9) return "pink";
  if (r > g * 1.22 && r > b * 1.22) return r > 190 && g > 90 ? "orange" : "red";
  if (g > r * 1.18 && g > b * 1.12) return "green";
  if (b > r * 1.18 && b > g * 1.12) return "blue";
  if (r > 150 && b > 120 && g < Math.min(r, b) * 0.82) return "purple";
  if (r > 180 && g > 150 && b < 120) return "gold";
  if (r > 145 && g > 115 && b < 105) return "brown";
  return "multicolor";
}

export function buildVideoBackgroundProfile({ rule, dominantColor, productBrightness }) {
  const brand = rule?.brand_profile || {};
  const item = rule?.website_item || {};
  const combinedText = [
    brand.business_name,
    brand.industry,
    brand.target_audience,
    brand.brand_description,
    item.title,
    item.description,
    rule?.prompt,
    rule?.image_prompt,
    rule?.content_type_label,
    rule?.campaign_title,
    rule?.campaign_context,
    rule?.tone,
  ]
    .filter(Boolean)
    .join(" ");

  const campaigns = inferCampaigns(combinedText);
  const moods = inferMoods(combinedText);
  const industries = unique([
    ...inferIndustries(combinedText),
    ...normalizeTags([brand.industry]),
  ]);

  return {
    campaigns,
    moods,
    industries,
    season: inferSeason(campaigns),
    productColor: rgbToColorTag(dominantColor),
    productBrightness: productBrightness || "medium",
    combinedText: normalizeText(combinedText),
  };
}

function overlapCount(left, right) {
  const rightSet = new Set(normalizeTags(right));
  return normalizeTags(left).filter((item) => rightSet.has(item)).length;
}

function addReason(reasons, label, value) {
  if (!value) return 0;
  reasons.push({ label, value });
  return value;
}

export function scoreVideoBackground(asset, profile, recentUsage = []) {
  const reasons = [];
  let score = Number(asset?.priority || 0);
  const assetCampaigns = normalizeTags(asset?.campaigns);
  const assetMoods = normalizeTags(asset?.moods);
  const assetIndustries = normalizeTags(asset?.industries);
  const assetColors = normalizeTags(asset?.colors);
  const season = normalizeText(asset?.season || "all").replace(/\s+/g, "_");

  if (profile.season !== "all" && season === profile.season) {
    score += addReason(reasons, "exact season", 70);
  } else if (season === "all") {
    score += addReason(reasons, "all-season", 4);
  } else if (profile.season !== "all" && season !== "all") {
    score += addReason(reasons, "wrong season", -45);
  }

  const campaignMatches = overlapCount(assetCampaigns, profile.campaigns);
  if (campaignMatches) score += addReason(reasons, "campaign match", 45 + (campaignMatches - 1) * 8);

  const industryMatches = overlapCount(assetIndustries, profile.industries);
  if (industryMatches) score += addReason(reasons, "industry match", 24 + (industryMatches - 1) * 5);

  const moodMatches = overlapCount(assetMoods, profile.moods);
  if (moodMatches) score += addReason(reasons, "mood match", 18 + (moodMatches - 1) * 4);

  const brightness = normalizeText(asset?.brightness || "medium");
  if (profile.productBrightness === "light" && brightness === "dark") {
    score += addReason(reasons, "light product contrast", 16);
  } else if (profile.productBrightness === "dark" && brightness === "light") {
    score += addReason(reasons, "dark product contrast", 16);
  } else if (profile.productBrightness === "medium" && brightness !== "medium") {
    score += addReason(reasons, "balanced contrast", 8);
  } else if (profile.productBrightness === brightness) {
    score += addReason(reasons, "low contrast", -10);
  }

  if (assetColors.includes(profile.productColor)) {
    score += addReason(reasons, "color harmony", 7);
  }

  if (assetColors.some((color) => ["cream", "beige", "white", "gray", "neutral"].includes(color))) {
    score += addReason(reasons, "neutral flexibility", 5);
  }

  if (asset?.text_safe) score += addReason(reasons, "text safe", 6);
  if (asset?.logo_safe) score += addReason(reasons, "logo safe", 4);
  if (asset?.is_fallback) score += addReason(reasons, "fallback reliability", 2);

  const assetId = String(asset?.id || "");
  const recentIds = recentUsage.map((item) => String(item?.video_background_asset_id || ""));
  const recentFamilies = recentUsage.slice(0, 3).map((item) => normalizeText(item?.video_background_family));
  const usageIndex = recentIds.indexOf(assetId);

  if (usageIndex === 0) score += addReason(reasons, "same as previous", -100);
  else if (usageIndex > 0 && usageIndex < 4) score += addReason(reasons, "recently used", -35);

  if (recentFamilies.includes(normalizeText(asset?.family))) {
    score += addReason(reasons, "recent family", -14);
  }

  return { score, reasons };
}

export function chooseVideoBackground({ assets, profile, recentUsage = [] }) {
  const activeAssets = (assets || []).filter((asset) => asset?.active !== false && asset?.public_url);

  if (!activeAssets.length) return null;

  const ranked = activeAssets
    .map((asset) => ({
      asset,
      ...scoreVideoBackground(asset, profile, recentUsage),
    }))
    .sort((left, right) => right.score - left.score);

  const best = ranked[0];

  if (best.score < 0) {
    const fallback = ranked.find((item) => item.asset?.is_fallback);
    if (fallback) return { ...fallback, usedFallback: true, ranked };
  }

  return { ...best, usedFallback: Boolean(best.asset?.is_fallback), ranked };
}

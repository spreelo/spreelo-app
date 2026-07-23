import { buildVideoBackgroundProfile } from './videoBackgroundSelection.js';

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTags(values) {
  return (Array.isArray(values) ? values : [])
    .map((value) => normalizeText(value).replace(/\s+/g, '_'))
    .filter(Boolean);
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

export function buildImageBackgroundProfile({ rule, dominantColor, productBrightness }) {
  return buildVideoBackgroundProfile({ rule, dominantColor, productBrightness });
}

export function scoreImageBackground(asset, profile) {
  const reasons = [];
  let score = Number(asset?.priority || 0);
  const assetCampaigns = normalizeTags(asset?.campaigns);
  const assetMoods = normalizeTags(asset?.moods);
  const assetIndustries = normalizeTags(asset?.industries);
  const assetColors = normalizeTags(asset?.colors);
  const season = normalizeText(asset?.season || 'all').replace(/\s+/g, '_');
  const brightness = normalizeText(asset?.brightness || 'medium');

  if (profile.season !== 'all' && season === profile.season) {
    score += addReason(reasons, 'exact season', 70);
  } else if (season === 'all') {
    score += addReason(reasons, 'all-season', 4);
  } else if (profile.season !== 'all' && season !== 'all') {
    score += addReason(reasons, 'wrong season', -45);
  }

  const campaignMatches = overlapCount(assetCampaigns, profile.campaigns);
  if (campaignMatches) score += addReason(reasons, 'campaign match', 45 + (campaignMatches - 1) * 8);

  const industryMatches = overlapCount(assetIndustries, profile.industries);
  if (industryMatches) score += addReason(reasons, 'industry match', 24 + (industryMatches - 1) * 5);

  const moodMatches = overlapCount(assetMoods, profile.moods);
  if (moodMatches) score += addReason(reasons, 'mood match', 18 + (moodMatches - 1) * 4);

  if (profile.productBrightness === 'light' && brightness === 'dark') {
    score += addReason(reasons, 'light product contrast', 16);
  } else if (profile.productBrightness === 'dark' && brightness === 'light') {
    score += addReason(reasons, 'dark product contrast', 16);
  } else if (profile.productBrightness === 'medium' && brightness !== 'medium') {
    score += addReason(reasons, 'balanced contrast', 8);
  } else if (profile.productBrightness === brightness) {
    score += addReason(reasons, 'low contrast', -10);
  }

  if (assetColors.includes(profile.productColor)) {
    score += addReason(reasons, 'color harmony', 7);
  }

  if (assetColors.some((color) => ['cream', 'beige', 'white', 'gray', 'neutral'].includes(color))) {
    score += addReason(reasons, 'neutral flexibility', 5);
  }

  if (asset?.text_safe) score += addReason(reasons, 'text safe', 6);
  if (asset?.label_safe) score += addReason(reasons, 'label safe', 8);
  if (asset?.crop_safe_1x1) score += addReason(reasons, 'square safe', 8);
  if (asset?.is_fallback) score += addReason(reasons, 'fallback reliability', 2);

  return { score, reasons };
}

export function chooseImageBackground({ assets, profile }) {
  const activeAssets = (assets || []).filter(
    (asset) => asset?.active !== false && asset?.public_url && asset?.crop_safe_1x1 !== false
  );
  if (!activeAssets.length) return null;

  const ranked = activeAssets
    .map((asset) => ({ asset, ...scoreImageBackground(asset, profile) }))
    .sort((left, right) => right.score - left.score);

  const best = ranked[0];
  if (!best) return null;

  if (best.score < 0) {
    const fallback = ranked.find((item) => item.asset?.is_fallback);
    if (fallback) return { ...fallback, usedFallback: true, ranked };
  }

  return { ...best, usedFallback: Boolean(best.asset?.is_fallback), ranked };
}

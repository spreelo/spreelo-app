const PRODUCT_CAMPAIGN_MODES = new Set([
  "website_product",
  "website_product_ad",
  "website_reel",
  "website_ai_video",
  "website_carousel",
]);

const SUPPORTING_CAMPAIGN_MODES = [
  "problem_solution",
  "tips",
  "faq",
  "guide_choice",
  "engagement_humor",
];

const MODE_COPY = {
  website_product: [
    "Relevant product",
    "Present one campaign-relevant product and connect it to the customer's current need.",
  ],
  website_product_ad: [
    "AI product ad",
    "Create a visually strong AI-designed product advertisement for one verified campaign-relevant product.",
  ],
  website_reel: [
    "Animated product Reel",
    "Use motion only when the selected product image and campaign idea genuinely benefit from the format.",
  ],
  website_ai_video: [
    "AI product video",
    "Use a verified product image for generative video only when motion materially strengthens the campaign idea.",
  ],
  website_carousel: [
    "Curated product selection",
    "Show five distinct campaign-relevant product families around one clear theme.",
  ],
  problem_solution: [
    "Problem → solution",
    "Start from a real seasonal or campaign-related need and show a useful way forward.",
  ],
  tips: [
    "Useful campaign tip",
    "Give practical advice that strengthens the campaign without becoming a pure advertisement.",
  ],
  faq: [
    "Campaign FAQ",
    "Answer a grounded question that can reduce hesitation before the customer acts.",
  ],
  guide_choice: [
    "Guide & decision help",
    "Help the audience choose, prepare or act with a clear practical guide.",
  ],
  engagement_humor: [
    "Engagement & humour",
    "Create a natural conversation, reaction or share-worthy campaign moment that fits the brand.",
  ],
  checklist: [
    "Campaign checklist",
    "Create a practical list the audience can save and use.",
  ],
  mistakes: [
    "Common mistake",
    "Help the audience avoid a relevant mistake connected to the campaign.",
  ],
  myth_fact: [
    "Myth vs fact",
    "Clarify a relevant misconception and strengthen confidence.",
  ],
  mini_guide: [
    "Mini-guide",
    "Teach the audience how to choose, prepare or act in relation to the campaign.",
  ],
  seasonal: [
    "Seasonal relevance",
    "Connect the business naturally to the campaign season or occasion.",
  ],
};

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeTermList(value) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,;|]+/g)
      : [];

  return [...new Set(raw.map((item) => String(item || "").trim()).filter(Boolean))];
}

function getCampaignPolicyText(campaign = {}) {
  return [
    campaign?.title,
    campaign?.description,
    campaign?.event_type,
    campaign?.campaign_category,
    campaign?.campaign_goal,
    campaign?.target_customer_need,
    campaign?.website_content_fit,
    campaign?.website_content_strategy,
    campaign?.product_selection_guidance,
    campaign?.website_product_selection_hint,
    campaign?.industry,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function campaignHasDirectProductCapability(campaign = {}) {
  const fit = normalizeText(campaign?.website_content_fit);
  const strategy = normalizeText(campaign?.website_content_strategy);

  return fit !== "weak" && ["product", "support"].includes(strategy);
}

export function campaignSupportsDirectAnimatedReel(campaign = {}) {
  if (!campaignHasDirectProductCapability(campaign)) return false;

  const text = getCampaignPolicyText(campaign);
  const weakSignals =
    /weak|limited imagery|no usable image|text only|information only|documentation|legal|policy/.test(
      text,
    );

  if (weakSignals) return false;

  return /fashion|clothing|apparel|beauty|cosmetic|jewelry|jewellery|food|drink|candy|toy|gift|home decor|interior|sports|outdoor|tech|electronics|launch|new product|collection|look|style|visual|video|motion|reel|mode|kläder|skönhet|smycke|mat|dryck|godis|leksak|present|inredning|sport|teknik|lansering|nyhet|kollektion|stil|visuell/.test(
    text,
  );
}

export function campaignSupportsDirectAiProductVideo(campaign = {}) {
  return campaignSupportsDirectAnimatedReel(campaign);
}

export function getDirectProductCampaignCountBounds(postCount) {
  const count = Math.max(1, Number(postCount || 1));

  if (count <= 2) return { minimum: 1, maximum: 1 };

  const minimum = Math.max(1, Math.ceil(count * 0.65));
  const maximum = Math.max(minimum, Math.floor(count * 0.8));

  return { minimum, maximum };
}

function getCampaignVariationSeed(campaign = {}) {
  const source = [
    campaign?.id,
    campaign?.title,
    campaign?.event_date,
    campaign?.start_date,
    campaign?.campaign_goal,
  ]
    .filter(Boolean)
    .join("|");

  return Array.from(source).reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );
}

function chooseSupportingCampaignMode(campaign = {}, index = 0) {
  const text = getCampaignPolicyText(campaign);
  const preferred = [];

  if (/question|uncertainty|hesitat|faq|fråga|osäker|tvekan/.test(text)) {
    preferred.push("faq");
  }
  if (/guide|choose|compare|how to|så väljer|hur du|guide/.test(text)) {
    preferred.push("guide_choice");
  }
  if (/check|prepare|remember|lista|förbered|kom ihåg/.test(text)) {
    preferred.push("guide_choice");
  }
  if (/mistake|avoid|misstag|undvik/.test(text)) preferred.push("tips");
  if (/myth|misconception|myt|missuppfattning/.test(text)) {
    preferred.push("tips");
  }
  // Seasonality is contextual input, not a forced content-type preference.

  preferred.push(
    "problem_solution",
    "tips",
    "guide_choice",
    "faq",
    "engagement_humor",
  );

  const unique = [
    ...new Set(preferred.filter((mode) => SUPPORTING_CAMPAIGN_MODES.includes(mode))),
  ];

  return (
    unique[(getCampaignVariationSeed(campaign) + index) % unique.length] || "tips"
  );
}

function getModeCopy(mode) {
  return MODE_COPY[mode] || ["Campaign post", "Create one useful campaign post."];
}

function getCampaignTermValue(campaign, key) {
  const aliases = {
    product_match_terms: [
      "product_match_terms",
      "campaign_match_terms",
      "website_product_match_terms",
    ],
    product_search_queries: [
      "product_search_queries",
      "campaign_search_queries",
      "website_product_search_queries",
    ],
    product_avoid_terms: [
      "product_avoid_terms",
      "avoid_terms",
      "campaign_avoid_terms",
    ],
  };

  for (const alias of aliases[key] || [key]) {
    const normalized = normalizeTermList(campaign?.[alias]);
    if (normalized.length) return normalized;
  }

  return [];
}

function applyCampaignModeToItem(item, mode, campaign, index) {
  const previousMode = normalizeText(item?.content_source_mode);
  const [role, purpose] = getModeCopy(mode);
  const isProduct = PRODUCT_CAMPAIGN_MODES.has(mode);
  const isAd = mode === "website_product_ad";
  const isCarousel = mode === "website_carousel";
  const existingMatchTerms = normalizeTermList(item?.product_match_terms);
  const existingSearchQueries = normalizeTermList(item?.product_search_queries);
  const existingAvoidTerms = normalizeTermList(
    item?.product_avoid_terms || item?.avoid_terms,
  );
  const productMatchTerms = existingMatchTerms.length
    ? existingMatchTerms
    : getCampaignTermValue(campaign, "product_match_terms");
  const productSearchQueries = existingSearchQueries.length
    ? existingSearchQueries
    : getCampaignTermValue(campaign, "product_search_queries");
  const productAvoidTerms = existingAvoidTerms.length
    ? existingAvoidTerms
    : getCampaignTermValue(campaign, "product_avoid_terms");
  const productSearchIntent = String(
    item?.product_search_intent || campaign?.product_search_intent || "",
  ).trim();

  return {
    ...item,
    role: mode === previousMode && item?.role ? item.role : role,
    purpose: mode === previousMode && item?.purpose ? item.purpose : purpose,
    strategic_reason:
      mode === previousMode && item?.strategic_reason
        ? item.strategic_reason
        : purpose,
    marketing_angle: isProduct
      ? isCarousel
        ? "product_discovery"
        : "product_push"
      : ["offer", "urgency", "product_push", "product_discovery"].includes(
            normalizeText(item?.marketing_angle),
          )
        ? "trust"
        : item?.marketing_angle || "engagement",
    customer_stage: isProduct
      ? index > 0
        ? "warm"
        : "cold"
      : item?.customer_stage || "warm",
    cta_strength: isProduct
      ? isAd
        ? "strong"
        : "medium"
      : item?.cta_strength || "soft",
    content_source_mode: mode,
    product_match_terms: isProduct ? productMatchTerms : [],
    product_search_queries: isProduct ? productSearchQueries : [],
    product_avoid_terms: isProduct ? productAvoidTerms : [],
    avoid_terms: isProduct ? productAvoidTerms : [],
    product_search_intent: isProduct ? productSearchIntent : "",
    product_selection_guidance: isProduct
      ? item?.product_selection_guidance ||
        campaign?.product_selection_guidance ||
        campaign?.website_product_selection_hint ||
        "Choose a verified, campaign-relevant product with a usable visual."
      : "",
  };
}

function getSupportConversionPriority(item) {
  const mode = normalizeText(item?.content_source_mode);
  const modePriority = {
    tips: 0,
    problem_solution: 1,
    guide_choice: 2,
    faq: 3,
    engagement_humor: 4,
  };

  return modePriority[mode] ?? 20;
}

function getProductReductionPriority(item) {
  const mode = normalizeText(item?.content_source_mode);
  const modePriority = {
    // When the campaign contains more product-led posts than the strategic
    // maximum, reduce premium motion first. The planner may still keep AI
    // video/Reel when the campaign is within the allowed mix and motion is
    // genuinely useful.
    website_ai_video: -2,
    website_reel: -1,
    website_product: 0,
    website_carousel: 2,
    website_product_ad: 99,
  };

  return modePriority[mode] ?? 50;
}

export function enforceDirectCalendarCampaignPolicy(items, campaign = {}) {
  const normalized = Array.isArray(items)
    ? items.map((item) => ({ ...item }))
    : [];

  if (!normalized.length || !campaignHasDirectProductCapability(campaign)) {
    return normalized;
  }

  const { minimum, maximum } = getDirectProductCampaignCountBounds(
    normalized.length,
  );
  const reelAllowed = campaignSupportsDirectAnimatedReel(campaign);
  const aiVideoAllowed = campaignSupportsDirectAiProductVideo(campaign);
  const maxMotionFormats = normalized.length >= 6 ? 2 : 1;
  let carouselSeen = false;
  let aiVideoSeen = false;
  let motionFormatCount = 0;

  for (let index = 0; index < normalized.length; index += 1) {
    const mode = normalizeText(normalized[index]?.content_source_mode);

    if (mode === "website_carousel") {
      if (carouselSeen) {
        normalized[index] = applyCampaignModeToItem(
          normalized[index],
          "website_product",
          campaign,
          index,
        );
      } else {
        carouselSeen = true;
      }
    }

    const currentMode = normalizeText(normalized[index]?.content_source_mode);
    if (currentMode === "website_reel") {
      if (!reelAllowed || motionFormatCount >= maxMotionFormats) {
        normalized[index] = applyCampaignModeToItem(
          normalized[index],
          "website_product",
          campaign,
          index,
        );
      } else {
        motionFormatCount += 1;
      }
    }

    if (normalizeText(normalized[index]?.content_source_mode) === "website_ai_video") {
      if (!aiVideoAllowed || aiVideoSeen || motionFormatCount >= maxMotionFormats) {
        normalized[index] = applyCampaignModeToItem(
          normalized[index],
          "website_product",
          campaign,
          index,
        );
      } else {
        aiVideoSeen = true;
        motionFormatCount += 1;
      }
    }
  }

  if (
    !normalized.some(
      (item) => normalizeText(item?.content_source_mode) === "website_product_ad",
    )
  ) {
    const preferredIndex = normalized.findIndex((item) =>
      ["website_product", "website_reel", "website_ai_video"].includes(
        normalizeText(item?.content_source_mode),
      ),
    );
    const replacementIndex =
      preferredIndex >= 0
        ? preferredIndex
        : Math.max(
            0,
            Math.min(normalized.length - 1, Math.floor(normalized.length * 0.6)),
          );

    normalized[replacementIndex] = applyCampaignModeToItem(
      normalized[replacementIndex],
      "website_product_ad",
      campaign,
      replacementIndex,
    );
  }

  let productCount = normalized.filter((item) =>
    PRODUCT_CAMPAIGN_MODES.has(normalizeText(item?.content_source_mode)),
  ).length;

  const reductionCandidates = normalized
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item }) =>
        PRODUCT_CAMPAIGN_MODES.has(normalizeText(item?.content_source_mode)) &&
        normalizeText(item?.content_source_mode) !== "website_product_ad",
    )
    .sort((left, right) => {
      const priorityDifference =
        getProductReductionPriority(left.item) -
        getProductReductionPriority(right.item);

      if (priorityDifference !== 0) return priorityDifference;
      return right.index - left.index;
    });

  for (const candidate of reductionCandidates) {
    if (productCount <= maximum) break;

    normalized[candidate.index] = applyCampaignModeToItem(
      normalized[candidate.index],
      chooseSupportingCampaignMode(campaign, candidate.index),
      campaign,
      candidate.index,
    );
    productCount -= 1;
  }

  const supportCandidates = normalized
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item }) =>
        !PRODUCT_CAMPAIGN_MODES.has(normalizeText(item?.content_source_mode)),
    )
    .sort((left, right) => {
      const priorityDifference =
        getSupportConversionPriority(left.item) -
        getSupportConversionPriority(right.item);

      if (priorityDifference !== 0) return priorityDifference;
      return left.index - right.index;
    });

  for (const candidate of supportCandidates) {
    if (productCount >= minimum) break;

    normalized[candidate.index] = applyCampaignModeToItem(
      normalized[candidate.index],
      "website_product",
      campaign,
      candidate.index,
    );
    productCount += 1;
  }

  return normalized;
}

export function directCalendarPlanSatisfiesPolicy(items, campaign = {}) {
  const normalized = Array.isArray(items) ? items : [];

  if (!normalized.length) return false;
  if (!campaignHasDirectProductCapability(campaign)) return true;

  const { minimum, maximum } = getDirectProductCampaignCountBounds(
    normalized.length,
  );
  const productCount = normalized.filter((item) =>
    PRODUCT_CAMPAIGN_MODES.has(normalizeText(item?.content_source_mode)),
  ).length;
  const carouselCount = normalized.filter(
    (item) => normalizeText(item?.content_source_mode) === "website_carousel",
  ).length;
  const adCount = normalized.filter(
    (item) => normalizeText(item?.content_source_mode) === "website_product_ad",
  ).length;
  const reelCount = normalized.filter(
    (item) => normalizeText(item?.content_source_mode) === "website_reel",
  ).length;
  const aiVideoCount = normalized.filter(
    (item) => normalizeText(item?.content_source_mode) === "website_ai_video",
  ).length;
  const motionFormatCount = reelCount + aiVideoCount;
  const maxMotionFormats = normalized.length >= 6 ? 2 : 1;

  return (
    productCount >= minimum &&
    productCount <= maximum &&
    carouselCount <= 1 &&
    adCount >= 1 &&
    aiVideoCount <= 1 &&
    motionFormatCount <= maxMotionFormats &&
    (reelCount === 0 || campaignSupportsDirectAnimatedReel(campaign)) &&
    (aiVideoCount === 0 || campaignSupportsDirectAiProductVideo(campaign))
  );
}

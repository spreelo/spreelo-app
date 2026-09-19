const PROFILE_VERSION = 1;
const EVENT_WINDOW_LIMIT = 400;

const REJECTION_WEIGHTS = Object.freeze({
  incorrect_information: Object.freeze({ contentType: 0.15, contentFormat: 0.15 }),
  wrong_product_or_service: Object.freeze({ contentType: 0.2, contentFormat: 0.1 }),
  tone_or_wording: Object.freeze({ contentType: 0.2, contentFormat: 0.1 }),
  image_or_video: Object.freeze({ contentType: 0.35, contentFormat: 1 }),
  timing_or_campaign: Object.freeze({ contentType: 0.1, contentFormat: 0.1 }),
  other: Object.freeze({ contentType: 0.35, contentFormat: 0.35 }),
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function normalizeText(value, maxLength = 500) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}…` : text;
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePlatformList(value) {
  const values = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[,;+|]/g)
        .map((item) => item.trim());
  return [...new Set(values.map((item) => normalizeKey(item)).filter(Boolean))].slice(0, 12);
}

function getRejectionWeight(category, dimension) {
  const normalizedCategory = normalizeKey(category);
  const configured = REJECTION_WEIGHTS[normalizedCategory] || REJECTION_WEIGHTS.other;
  return Number(configured?.[dimension] ?? 0.25);
}

function createSignalBucket() {
  return {
    approvals: 0,
    rejections: 0,
    positive_weight: 0,
    negative_weight: 0,
  };
}

function updateSignalBucket(bucket, eventType, rejectionWeight = 0.25) {
  if (eventType === "approved") {
    bucket.approvals += 1;
    bucket.positive_weight += 1;
  } else if (eventType === "rejected") {
    bucket.rejections += 1;
    bucket.negative_weight += clamp(rejectionWeight, 0.05, 1.5);
  }
}

function finalizeSignalBucket(bucket) {
  const approvals = Number(bucket?.approvals || 0);
  const rejections = Number(bucket?.rejections || 0);
  const observations = approvals + rejections;
  const positiveWeight = Number(bucket?.positive_weight || 0);
  const negativeWeight = Number(bucket?.negative_weight || 0);
  const weightedTotal = positiveWeight + negativeWeight;
  const smoothedScore = weightedTotal > 0
    ? ((positiveWeight - negativeWeight) / (weightedTotal + 2.5)) * 100
    : 0;

  return {
    approvals,
    rejections,
    observations,
    score: Math.round(clamp(smoothedScore, -100, 100)),
    confidence: Number(clamp(observations / 8, 0, 1).toFixed(2)),
  };
}

function finalizeSignalMap(map) {
  return Object.fromEntries(
    [...map.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, bucket]) => [key, finalizeSignalBucket(bucket)])
  );
}

export function unwrapBrandLearningProfile(profile) {
  if (!profile || typeof profile !== "object") return null;
  if (profile.profile_json && typeof profile.profile_json === "object") {
    return profile.profile_json;
  }
  return profile;
}

export function getBrandLearningContentTypeAdjustment(
  profile,
  contentTypeId,
  { minObservations = 3, maxAdjustment = 10 } = {}
) {
  const root = unwrapBrandLearningProfile(profile);
  const key = normalizeKey(contentTypeId);
  const signal = root?.content_types?.[key];
  const observations = Number(signal?.observations || 0);
  if (!key || observations < minObservations) return 0;

  const score = clamp(Number(signal?.score || 0), -100, 100) / 100;
  const confidence = clamp(Number(signal?.confidence || observations / 8), 0, 1);
  return Number(clamp(score * confidence * maxAdjustment, -maxAdjustment, maxAdjustment).toFixed(2));
}

export function buildBrandLearningPlannerContext(profile) {
  const root = unwrapBrandLearningProfile(profile);
  if (!root || Number(root.event_count || 0) < 3) return null;

  const contentTypeSignals = Object.entries(root.content_types || {})
    .map(([contentTypeId, signal]) => ({
      content_type_id: contentTypeId,
      observations: Number(signal?.observations || 0),
      score: Number(signal?.score || 0),
      confidence: Number(signal?.confidence || 0),
    }))
    .filter((signal) => signal.observations >= 3 && Math.abs(signal.score) >= 8)
    .sort((left, right) => {
      const rightStrength = Math.abs(right.score) * right.confidence;
      const leftStrength = Math.abs(left.score) * left.confidence;
      return rightStrength - leftStrength || right.observations - left.observations;
    })
    .slice(0, 8);

  return {
    learning_state: root.learning_state || "collecting",
    event_count: Number(root.event_count || 0),
    approved_count: Number(root.approved_count || 0),
    rejected_count: Number(root.rejected_count || 0),
    content_type_signals: contentTypeSignals,
    rejection_categories: root.rejection_categories || {},
  };
}

export function formatBrandLearningGenerationGuidance(profile) {
  const root = unwrapBrandLearningProfile(profile);
  if (!root || Number(root.event_count || 0) < 1) return "";

  const planner = buildBrandLearningPlannerContext(root);
  const signalLines = (planner?.content_type_signals || [])
    .slice(0, 5)
    .map((signal) => {
      const direction = signal.score >= 0 ? "positive" : "negative";
      return `- ${signal.content_type_id}: ${direction} signal (${signal.observations} decisions, score ${signal.score})`;
    });

  const recentFeedback = Array.isArray(root.recent_rejection_feedback)
    ? root.recent_rejection_feedback.slice(0, 3)
    : [];
  const feedbackLines = recentFeedback
    .map((item) => {
      const category = normalizeText(item?.category || "other", 60);
      const text = normalizeText(item?.text || "", 360);
      if (!text) return "";
      return `- ${category}: ${text}`;
    })
    .filter(Boolean);

  if (!signalLines.length && !feedbackLines.length) return "";

  return `
Customer preference learning (secondary guidance):
${signalLines.join("\n")}${signalLines.length && feedbackLines.length ? "\n" : ""}${feedbackLines.join("\n")}

Learning rules:
- Treat this as soft brand-specific evidence, never as permission to break factual, product-identity, platform or campaign requirements.
- A rejected post may have failed because of execution rather than the whole content type, so do not permanently ban a format from one or two decisions.
- Apply explicit recent customer correction text when it is relevant to the new post, but do not invent preferences that the customer did not state.
`.trim();
}

export function isBrandLearningStorageMissingError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return /brand_learning_(?:events|profiles)|schema cache|relation .* does not exist|could not find the table/.test(message);
}

async function resolvePostLearningDimensions({ supabase, post }) {
  let contentTypeId = normalizeKey(post?.content_type_id);
  let contentTypeLabel = normalizeText(post?.content_type_label || "", 140);

  if ((!contentTypeId || !contentTypeLabel) && post?.automation_rule_id) {
    const { data: rule, error } = await supabase
      .from("automation_rules")
      .select("content_type_id, content_type_label, post_type, content_format")
      .eq("id", post.automation_rule_id)
      .maybeSingle();
    if (!error && rule) {
      contentTypeId = contentTypeId || normalizeKey(rule.content_type_id);
      contentTypeLabel = contentTypeLabel || normalizeText(rule.content_type_label || rule.post_type || "", 140);
    }
  }

  return {
    contentTypeId: contentTypeId || normalizeKey(post?.post_type),
    contentTypeLabel: contentTypeLabel || normalizeText(post?.post_type || "", 140),
    contentFormat: normalizeKey(post?.content_format),
    platforms: normalizePlatformList(post?.platform),
    tone: normalizeText(post?.tone || "", 100),
    postType: normalizeText(post?.post_type || "", 120),
  };
}

export async function rebuildBrandLearningProfile({ supabase, brandProfileId, userId }) {
  if (!supabase || !brandProfileId || !userId) return null;

  const { data: events, error } = await supabase
    .from("brand_learning_events")
    .select("event_type, content_type_id, content_format, platforms, tone, post_type, rejection_category, rejection_text, created_at")
    .eq("brand_profile_id", brandProfileId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(EVENT_WINDOW_LIMIT);

  if (error) throw error;

  const rows = Array.isArray(events) ? events : [];
  const contentTypes = new Map();
  const contentFormats = new Map();
  const rejectionCategories = {};
  const recentRejectionFeedback = [];
  let approvedCount = 0;
  let rejectedCount = 0;

  for (const event of rows) {
    const eventType = normalizeKey(event?.event_type);
    if (eventType === "approved") approvedCount += 1;
    if (eventType === "rejected") rejectedCount += 1;

    const contentTypeId = normalizeKey(event?.content_type_id);
    if (contentTypeId) {
      const bucket = contentTypes.get(contentTypeId) || createSignalBucket();
      updateSignalBucket(
        bucket,
        eventType,
        getRejectionWeight(event?.rejection_category, "contentType")
      );
      contentTypes.set(contentTypeId, bucket);
    }

    const contentFormat = normalizeKey(event?.content_format);
    if (contentFormat) {
      const bucket = contentFormats.get(contentFormat) || createSignalBucket();
      updateSignalBucket(
        bucket,
        eventType,
        getRejectionWeight(event?.rejection_category, "contentFormat")
      );
      contentFormats.set(contentFormat, bucket);
    }

    if (eventType === "rejected") {
      const category = normalizeKey(event?.rejection_category) || "other";
      rejectionCategories[category] = Number(rejectionCategories[category] || 0) + 1;
      if (recentRejectionFeedback.length < 5 && event?.rejection_text) {
        recentRejectionFeedback.push({
          category,
          text: normalizeText(event.rejection_text, 420),
          content_type_id: contentTypeId || null,
          content_format: contentFormat || null,
          at: event.created_at || null,
        });
      }
    }
  }

  const eventCount = rows.length;
  const learningState = eventCount >= 12 ? "established" : eventCount >= 4 ? "early" : "collecting";
  const profileJson = {
    version: PROFILE_VERSION,
    learning_state: learningState,
    event_count: eventCount,
    approved_count: approvedCount,
    rejected_count: rejectedCount,
    content_types: finalizeSignalMap(contentTypes),
    content_formats: finalizeSignalMap(contentFormats),
    rejection_categories: rejectionCategories,
    recent_rejection_feedback: recentRejectionFeedback,
    last_event_at: rows[0]?.created_at || null,
  };
  const now = new Date().toISOString();

  const { error: profileError } = await supabase
    .from("brand_learning_profiles")
    .upsert(
      {
        brand_profile_id: brandProfileId,
        user_id: userId,
        profile_version: PROFILE_VERSION,
        learning_state: learningState,
        source_event_count: eventCount,
        approved_count: approvedCount,
        rejected_count: rejectedCount,
        profile_json: profileJson,
        last_event_at: rows[0]?.created_at || null,
        updated_at: now,
      },
      { onConflict: "brand_profile_id" }
    );

  if (profileError) throw profileError;
  return profileJson;
}

export async function recordBrandLearningEvent({
  supabase,
  post,
  eventType,
  rejectionCategory = null,
  rejectionText = null,
}) {
  if (!supabase || !post?.id || !post?.user_id || !post?.brand_profile_id) {
    return { recorded: false, reason: "missing_context" };
  }

  const normalizedEventType = normalizeKey(eventType);
  if (!["approved", "rejected"].includes(normalizedEventType)) {
    return { recorded: false, reason: "unsupported_event" };
  }

  try {
    const dimensions = await resolvePostLearningDimensions({ supabase, post });
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("brand_learning_events")
      .upsert(
        {
          post_id: post.id,
          user_id: post.user_id,
          brand_profile_id: post.brand_profile_id,
          event_type: normalizedEventType,
          content_type_id: dimensions.contentTypeId || null,
          content_type_label: dimensions.contentTypeLabel || null,
          content_format: dimensions.contentFormat || null,
          platforms: dimensions.platforms,
          tone: dimensions.tone || null,
          post_type: dimensions.postType || null,
          rejection_category: normalizedEventType === "rejected" ? normalizeKey(rejectionCategory) || "other" : null,
          rejection_text: normalizedEventType === "rejected" ? normalizeText(rejectionText, 3000) || null : null,
          updated_at: now,
        },
        { onConflict: "post_id,event_type" }
      );

    if (error) throw error;

    const profile = await rebuildBrandLearningProfile({
      supabase,
      brandProfileId: post.brand_profile_id,
      userId: post.user_id,
    });

    return { recorded: true, profile };
  } catch (error) {
    console.warn("Brand learning event could not be recorded without blocking the customer flow", {
      postId: post?.id || null,
      brandProfileId: post?.brand_profile_id || null,
      eventType: normalizedEventType,
      storageMissing: isBrandLearningStorageMissingError(error),
      message: error?.message || String(error),
    });
    return { recorded: false, reason: "storage_error", error };
  }
}

export async function loadBrandLearningProfile({ supabase, brandProfileId, userId = null }) {
  if (!supabase || !brandProfileId) return null;
  try {
    let query = supabase
      .from("brand_learning_profiles")
      .select("brand_profile_id, user_id, profile_version, learning_state, source_event_count, approved_count, rejected_count, profile_json, last_event_at, updated_at")
      .eq("brand_profile_id", brandProfileId);
    if (userId) query = query.eq("user_id", userId);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data || null;
  } catch (error) {
    if (!isBrandLearningStorageMissingError(error)) {
      console.warn("Brand learning profile could not be loaded", {
        brandProfileId,
        message: error?.message || String(error),
      });
    }
    return null;
  }
}

export const BRAND_LEARNING_PROFILE_VERSION = PROFILE_VERSION;

import { createClient } from "@supabase/supabase-js";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import {
  getKlingImageToVideoTask,
  isKlingTaskFailed,
  isKlingTaskSuccessful,
} from "../../../../lib/kling.js";
import { normalizeVideoDurationSeconds } from "../../../../lib/videoDuration.js";
import {
  createGenerationCostTracker,
  wrapOpenAIForCostTracking,
} from "../../../../lib/generationCostTracking.js";
import {
  buildVideoOverlayEdit,
  queueShotstackRender,
  waitForShotstackRender,
} from "../../../../lib/shotstack.js";
import { sampleRemoteVideoFrames } from "../../../../lib/videoFrameSampler.js";
import { selectBestVideoMusic } from "../../../../lib/videoMusicLibrary.js";
import {
  escapeProductSvg,
  getProductTypographyProfile,
  wrapProductTitle,
} from "../../../../lib/globalProductTypography.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const POST_VIDEOS_BUCKET = "post-videos";
const POST_IMAGES_BUCKET = "post-images";
const KLING_TYPOGRAPHY_MODEL = "gpt-image-2";
const KLING_PRODUCT_IDENTITY_AUDIT_MODEL = "gpt-4.1-mini";
const KLING_CLOSING_HERO_HOLD_SECONDS = 0.9;
const DEFAULT_MAX_PENDING_HOURS = 6;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const KLING_FINALIZATION_LEASE_MS = 6 * 60 * 1000;
const KLING_FINALIZATION_RETRY_BACKOFF_MS = 5 * 60 * 1000;
const KLING_PROVIDER_PENDING_STATUSES = ["submitting", "submitted", "created", "queued", "pending", "processing", "rendering"];


function truncate(value, maxLength = 1200) {
  const text = String(value || "").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

// v144.114: finished-video copy and typography are planned against real
// delivered frames. The model chooses only among these conservative regions;
// the generated artwork is then deterministically cropped and placed inside the
// chosen box so GPT Image cannot drift back over the product.
const KLING_FINISHED_TYPOGRAPHY_PLACEMENTS = {
  top_left: { left: 64, top: 190, width: 440, height: 300 },
  top_right: { left: 576, top: 190, width: 440, height: 300 },
  middle_left: { left: 64, top: 620, width: 420, height: 320 },
  middle_right: { left: 596, top: 620, width: 420, height: 320 },
  lower_left: { left: 64, top: 1080, width: 420, height: 300 },
  lower_right: { left: 596, top: 1080, width: 420, height: 300 },
};

function normalizeKlingCreativeLine(value, { maxWords = 7, maxChars = 52 } = {}) {
  const cleaned = String(value || "")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/www\.\S+/gi, " ")
    .replace(/#[\p{L}\p{N}_-]+/gu, " ")
    .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, " ")
    .replace(/^[\s\-–—:|•·]+|[\s\-–—:|•·]+$/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?]+$/g, "")
    .trim();
  if (!cleaned) return "";
  if (cleaned.split(/\s+/).filter(Boolean).length > maxWords) return "";
  if (Array.from(cleaned).length > maxChars) return "";
  return cleaned;
}

function getFallbackKlingCta(post) {
  const language = String(post?.language || "").toLowerCase();
  const swedish = language.includes("swedish") || language.includes("svenska") || language === "sv";
  const raw = String(post?.cta_type || "").toLowerCase();
  if (swedish) {
    if (raw.includes("contact")) return "Kontakta oss";
    if (raw.includes("book")) return "Boka nu";
    if (raw.includes("visit")) return "Visit website";
    if (raw.includes("shop")) return "Se produkten";
    return "Learn more";
  }
  if (raw.includes("contact")) return "Contact us";
  if (raw.includes("book")) return "Book now";
  if (raw.includes("visit")) return "Visit website";
  if (raw.includes("shop")) return "View product";
  return "Learn more";
}

function getKlingPlacementBox(name, fallback = "top_left") {
  return KLING_FINISHED_TYPOGRAPHY_PLACEMENTS[name] || KLING_FINISHED_TYPOGRAPHY_PLACEMENTS[fallback];
}


function getMaxPendingHours() {
  return Math.max(
    1,
    Math.min(
      48,
      Number(process.env.KLING_MAX_PENDING_HOURS || DEFAULT_MAX_PENDING_HOURS) ||
        DEFAULT_MAX_PENDING_HOURS
    )
  );
}

function isAuthorized(request) {
  const cronSecret = String(process.env.CRON_SECRET || "");
  if (!cronSecret) return false;
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

function createSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase admin environment variables are missing");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getCachedKlingSource(post) {
  const selection = post?.video_background_selection;
  if (!selection || typeof selection !== "object" || Array.isArray(selection)) return null;
  const videoUrl = String(selection.kling_source_url || "").trim();
  if (!videoUrl) return null;
  return {
    status: String(post?.kling_task_status || selection.kling_source_status || "succeeded"),
    videoUrl,
    durationSeconds: normalizeVideoDurationSeconds(
      selection.kling_source_duration_seconds,
      post?.video_duration_seconds,
      6
    ),
    cached: true,
  };
}

function finalizationLeaseIsFresh(post, nowMs = Date.now()) {
  if (String(post?.video_status || "") !== "finalizing") return false;
  const claimedAt = new Date(post?.kling_last_polled_at || 0).getTime();
  return Number.isFinite(claimedAt) && claimedAt > 0 && nowMs - claimedAt < KLING_FINALIZATION_LEASE_MS;
}

function finalizationRetryBackoffIsFresh(post, nowMs = Date.now()) {
  if (String(post?.video_status || "") !== "finalization_retry") return false;
  const failedAt = new Date(post?.kling_last_polled_at || 0).getTime();
  return Number.isFinite(failedAt) && failedAt > 0 && nowMs - failedAt < KLING_FINALIZATION_RETRY_BACKOFF_MS;
}

function hasRecoverableTypographyFailure(post) {
  const selection = post?.video_background_selection;
  if (!selection || typeof selection !== "object" || Array.isArray(selection)) return false;
  const status = String(selection.text_overlay_status || "").trim();
  if (status === "failed") return true;
  if (status !== "generating") return false;
  const startedAt = new Date(selection.text_overlay_generation_started_at || 0).getTime();
  return !Number.isFinite(startedAt) || startedAt <= 0 || Date.now() - startedAt >= KLING_FINALIZATION_LEASE_MS;
}

async function claimKlingFinalization(supabase, post) {
  if (finalizationLeaseIsFresh(post)) return false;
  const nowIso = new Date().toISOString();
  let query = supabase
    .from("posts")
    .update({
      video_status: "finalizing",
      kling_last_polled_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", post.id)
    .eq("video_provider", "kling")
    .eq("kling_task_id", post.kling_task_id);

  if (post.updated_at == null) query = query.is("updated_at", null);
  else query = query.eq("updated_at", post.updated_at);

  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw new Error(`Could not claim Kling finalization lease: ${error.message}`);
  return Boolean(data?.id);
}

async function persistKlingSourceCache(supabase, post, task) {
  const existing =
    post?.video_background_selection &&
    typeof post.video_background_selection === "object" &&
    !Array.isArray(post.video_background_selection)
      ? post.video_background_selection
      : {};
  if (String(existing.kling_source_url || "").trim()) return existing;

  const nextSelection = {
    ...existing,
    kling_source_url: task.videoUrl,
    kling_source_status: String(task.status || "succeeded"),
    kling_source_duration_seconds: normalizeVideoDurationSeconds(
      task.durationSeconds,
      post.video_duration_seconds,
      6
    ),
    kling_source_cached_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("posts")
    .update({
      video_background_selection: nextSelection,
      kling_task_status: String(task.status || "succeeded").toLowerCase(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", post.id)
    .eq("video_provider", "kling")
    .eq("kling_task_id", post.kling_task_id);
  if (error) throw new Error(`Could not cache completed Kling source: ${error.message}`);
  post.video_background_selection = nextSelection;
  return nextSelection;
}

async function setReviewCaseFailure(supabase, postId, stage, message, failureCode = null) {
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("admin_review_cases")
    .update({
      status: "needs_repair",
      needs_review: true,
      failure_code: failureCode || (stage === "kling_finished_product_identity" ? "KLING_FINISHED_PRODUCT_IDENTITY_REJECTED" : null),
      failure_stage: stage,
      failure_message: truncate(message, 2000),
      updated_at: nowIso,
    })
    .eq("post_id", postId);

  if (error) {
    console.warn("Kling finalizer could not update admin review failure", {
      postId,
      stage,
      message: error.message,
    });
  }
}

async function setReviewCaseReady(supabase, postId) {
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("admin_review_cases")
    .update({
      status: "awaiting_spreelo",
      needs_review: true,
      failure_code: null,
      failure_stage: null,
      failure_message: null,
      updated_at: nowIso,
    })
    .eq("post_id", postId);

  if (error) {
    console.warn("Kling finalizer could not mark admin review ready", {
      postId,
      message: error.message,
    });
  }
}

async function markKlingPostFailed(supabase, post, stage, message) {
  const nowIso = new Date().toISOString();
  const safeMessage = truncate(message, 2000);
  const { error } = await supabase
    .from("posts")
    .update({
      status: "failed",
      admin_review_status: "needs_repair",
      video_status: "failed",
      kling_task_status: "failed",
      kling_last_polled_at: nowIso,
      video_error: safeMessage,
      updated_at: nowIso,
    })
    .eq("id", post.id)
    .eq("video_provider", "kling");

  if (error) throw error;
  await setReviewCaseFailure(supabase, post.id, stage, safeMessage);
}

async function downloadKlingVideo(videoUrl) {
  const response = await fetch(videoUrl, {
    method: "GET",
    redirect: "follow",
    headers: {
      Accept: "video/mp4,video/*;q=0.9,*/*;q=0.5",
      "User-Agent": "Spreelo-Kling-Finalizer/144.25",
    },
  });

  if (!response.ok) {
    throw new Error(`Kling output download failed (${response.status})`);
  }

  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_VIDEO_BYTES) {
    throw new Error("Kling output exceeded Spreelo's 100 MB safety limit");
  }

  const arrayBuffer = await response.arrayBuffer();
  if (!arrayBuffer.byteLength) {
    throw new Error("Kling returned an empty video file");
  }
  if (arrayBuffer.byteLength > MAX_VIDEO_BYTES) {
    throw new Error("Kling output exceeded Spreelo's 100 MB safety limit");
  }

  return Buffer.from(arrayBuffer);
}

async function fetchKlingVerifiedProductReferenceDataUrl(url) {
  if (!url) throw new Error("Verified product reference URL is missing");
  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5",
      "User-Agent": "Spreelo-Kling-Identity-Audit/144.42",
    },
  });
  if (!response.ok) {
    throw new Error(`Verified product reference fetch failed (${response.status})`);
  }
  const source = Buffer.from(await response.arrayBuffer());
  if (!source.length) throw new Error("Verified product reference was empty");

  // Normalize retailer/CDN formats before the vision request. This avoids a
  // URL/content-type mismatch turning a product-integrity check into a false
  // provider error.
  const normalized = await sharp(source)
    .rotate()
    .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return `data:image/png;base64,${normalized.toString("base64")}`;
}

function getKlingDeliveredAuditFractions(selection, durationSeconds) {
  const duration = Math.max(2, Number(durationSeconds || 0) || 6);
  const trimStart = Math.max(
    0,
    Math.min(duration - 0.4, Number(selection?.scene_trim_start_seconds || 0) || 0)
  );
  const deliveredDuration = Math.max(0.4, duration - trimStart);
  return [0.08, 0.30, 0.52, 0.74, 0.94].map((deliveredFraction) => {
    const time = trimStart + deliveredDuration * deliveredFraction;
    return Math.max(0.01, Math.min(0.99, time / duration));
  });
}

function getOpenAiTextOutput(response) {
  const direct = String(response?.output_text || "").trim();
  if (direct) return direct;
  return (response?.output || [])
    .flatMap((item) => item?.content || [])
    .map((item) => String(item?.text || ""))
    .join("")
    .trim();
}

async function planFinishedKlingAdvertisingCreative({ openai, post, selection, frames }) {
  const fallbackCopy = selection?.text_overlay_copy || {};
  const fallbackHeadline =
    normalizeKlingCreativeLine(fallbackCopy?.headline, { maxWords: 7, maxChars: 52 }) ||
    normalizeKlingCreativeLine(selection?.verified_product_title, { maxWords: 9, maxChars: 62 }) ||
    "Featured product";
  const fallbackSubheadline = normalizeKlingCreativeLine(fallbackCopy?.subheadline, { maxWords: 5, maxChars: 38 });
  const fallbackCta = normalizeKlingCreativeLine(getFallbackKlingCta(post), { maxWords: 4, maxChars: 28 }) || "Learn more";
  const fallbackPlan = {
    headline: fallbackHeadline,
    subheadline: fallbackSubheadline,
    cta: fallbackCta,
    main_placement: "top_left",
    cta_placement: "lower_left",
    main_text_tone: "light",
    cta_text_tone: "light",
    placement_confidence: 0,
    source: "deterministic_fallback",
  };
  if (!openai || !Array.isArray(frames) || frames.length === 0) return fallbackPlan;

  const productTitle = String(selection?.verified_product_title || "verified product").trim();
  const context = selection?.music_context || {};
  const postCopy = String(post?.content || context?.post_copy || "").slice(0, 1200);
  const content = [{
    type: "input_text",
    text:
      `Plan the on-video advertising copy and placement for the finished 9:16 product commercial for "${productTitle}". ` +
      `The supplied frames come from the FINISHED delivered video. Existing social caption: ${JSON.stringify(postCopy)}. ` +
      `CTA setting: ${JSON.stringify(post?.cta_type || "Learn more")}. Campaign goal: ${JSON.stringify(context?.goal || "")}. ` +
      `Product category: ${JSON.stringify(context?.product_category || "")}. Existing draft headline: ${JSON.stringify(fallbackHeadline)}. ` +
      "Write all visible copy in the same language as the social caption. The headline must be 3-6 words, max 48 characters, semantically complete, and specifically connected to the verified product, its explicit motif/theme, category or supplied campaign angle. " +
      "Reject empty generic advertising language such as 'classic comfort for every occasion', 'quality for every day', 'made for every moment', or equivalents unless the supplied product facts genuinely support it. " +
      "Do not invent material, comfort, durability, fit, performance, reviews, scarcity, prices, discounts or other claims. For graphic apparel, you may use the printed theme/motif only when it is explicit in the product title or caption. " +
      "The subheadline is OPTIONAL and should usually be empty. Return an empty string unless a short 2-5 word line adds clear advertising value beyond the headline. Never use filler, product-category labels, gender labels, material facts or catalogue descriptors as the subheadline. " +
      "Choose the CTA from the actual purpose of THIS post, the verified product or service type, the campaign goal, the CTA setting and the intended next user action. The CTA must be 1-4 words, max 24 characters, natural in the same language and specifically useful for what the viewer should do next. " +
      "For a product-focused sales post, prefer a concrete product-oriented action such as viewing, discovering or shopping the product rather than a vague informational CTA such as 'learn more' or 'read more' (or equivalents in the post language), unless the post is genuinely educational or information-led. For booking, contact or service-led posts, choose the corresponding booking, contact or service action. Do not choose a generic CTA merely because it is broadly valid. " +
      "Choose main_placement from top_left, top_right, middle_left, middle_right, lower_left, lower_right so the headline avoids the advertised product and especially its print/design, plus faces, hands and the main action ACROSS ALL supplied frames. " +
      "Choose cta_placement independently for the final frame, and prefer a different safe region from the main placement whenever possible. Prefer clear negative space and avoid the right-edge social UI zone and the lowest 20% of the frame. Return strict JSON only.",
  }];
  for (const frame of frames) {
    content.push({
      type: "input_image",
      image_url: `data:image/jpeg;base64,${frame.buffer.toString("base64")}`,
      detail: "high",
    });
  }
  try {
    const response = await openai.responses.create({
      model: KLING_PRODUCT_IDENTITY_AUDIT_MODEL,
      input: [{ role: "user", content }],
      max_output_tokens: 500,
      text: {
        format: {
          type: "json_schema",
          name: "kling_finished_ad_creative_plan",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              headline: { type: "string" },
              subheadline: { type: "string" },
              cta: { type: "string" },
              main_placement: { type: "string", enum: Object.keys(KLING_FINISHED_TYPOGRAPHY_PLACEMENTS) },
              cta_placement: { type: "string", enum: Object.keys(KLING_FINISHED_TYPOGRAPHY_PLACEMENTS) },
              main_text_tone: { type: "string", enum: ["light", "dark"] },
              cta_text_tone: { type: "string", enum: ["light", "dark"] },
              placement_confidence: { type: "number", minimum: 0, maximum: 1 },
            },
            required: [
              "headline", "subheadline", "cta", "main_placement", "cta_placement",
              "main_text_tone", "cta_text_tone", "placement_confidence"
            ],
          },
        },
      },
    }, { timeout: 24_000, maxRetries: 0 });
    const parsed = JSON.parse(getOpenAiTextOutput(response));
    const headline = normalizeKlingCreativeLine(parsed?.headline, { maxWords: 6, maxChars: 48 }) || fallbackHeadline;
    const subheadline = normalizeKlingCreativeLine(parsed?.subheadline, { maxWords: 5, maxChars: 36 });
    const cta = normalizeKlingCreativeLine(parsed?.cta, { maxWords: 4, maxChars: 24 }) || fallbackCta;
    return {
      headline,
      subheadline,
      cta,
      main_placement: KLING_FINISHED_TYPOGRAPHY_PLACEMENTS[parsed?.main_placement] ? parsed.main_placement : fallbackPlan.main_placement,
      cta_placement: KLING_FINISHED_TYPOGRAPHY_PLACEMENTS[parsed?.cta_placement] ? parsed.cta_placement : fallbackPlan.cta_placement,
      main_text_tone: parsed?.main_text_tone === "dark" ? "dark" : "light",
      cta_text_tone: parsed?.cta_text_tone === "dark" ? "dark" : "light",
      placement_confidence: Math.max(0, Math.min(1, Number(parsed?.placement_confidence) || 0)),
      source: "gpt-4.1-mini-finished-video-creative-plan",
    };
  } catch (error) {
    console.warn("Kling finished-video creative planning unavailable; using safe fallback copy/placement", {
      postId: post?.id || null,
      message: truncate(error?.message || String(error), 500),
    });
    return fallbackPlan;
  }
}


async function validateFinishedKlingProductIdentity({ openai, supabase, post, task }) {
  const selection = post?.video_background_selection;
  if (!selection || typeof selection !== "object" || Array.isArray(selection)) {
    throw new Error("Kling finished-video product identity metadata is missing");
  }

  const existing = selection?.product_video_validation;
  if (existing?.status === "passed") {
    return { passed: true, cached: true, validation: existing };
  }

  const productImageUrl = String(selection?.verified_product_image_url || "").trim();
  const productTitle = String(selection?.verified_product_title || "verified product").trim();
  const viewLock = selection?.reference_safety?.verifiedViewLock || null;
  if (!productImageUrl || !viewLock) {
    throw new Error("Kling finished-video product identity prerequisites are missing");
  }

  const durationSeconds = normalizeVideoDurationSeconds(
    task.durationSeconds,
    post.video_duration_seconds,
    6
  );
  const fractions = getKlingDeliveredAuditFractions(selection, durationSeconds);
  const [referenceDataUrl, frames] = await Promise.all([
    fetchKlingVerifiedProductReferenceDataUrl(productImageUrl),
    sampleRemoteVideoFrames({
      videoUrl: task.videoUrl,
      durationSeconds,
      fractions,
    }),
  ]);
  if (!frames?.length) {
    throw new Error("Kling finished-video product identity audit produced no sampled frames");
  }

  const content = [
    {
      type: "input_text",
      text:
        `Audit the finished Kling product video for the ecommerce product "${productTitle}". ` +
        "The first image is the ONLY authoritative retailer product reference. The following images are sampled from the part of the Kling video that will actually be delivered after any setup trim. " +
        `Verified view lock: ${String(viewLock?.verifiedView || "same source view only")}. ` +
        `${String(viewLock?.visibleSurfaceSummary || "Only source-visible surfaces are verified.")} ` +
        `${String(viewLock?.motionConstraint || "Never expose an unseen product surface.")} ` +
        "The PRODUCT DESIGN may not change. The shot must also preserve real-world scene continuity: treat the sampled frames as moments from one continuous physical set, not independent regenerated images. Static environmental objects, furniture, benches, signs, lamps, vegetation, architecture, paths, ground features and background structures must remain spatially persistent. A static object may become newly visible only if camera movement naturally reveals an area that was previously outside frame; reject a bench/object that materializes in a region previously visible and empty, or any static object that disappears, morphs, relocates or is replaced without a physically plausible occlusion/camera explanation. Moving people, animals, vehicles and props may enter/exit only through continuous motion or motivated occlusion; reject unexplained pop-in, pop-out, teleporting, duplication or disappearance. Compare visible identity details whenever the product is visible. " +
        "For rigid products, explicitly compare the number, position, shape and size of visible buttons, switches, controls, openings, seams, joints and distinctive hardware; compare material boundaries, surface finish/texture, color blocking, silhouette/proportions, logos and printed design. " +
        "Reject if any frame visibly adds a button/control/detail, removes or relocates one, changes material or color regions, changes the visible geometry, substitutes a similar product, or exposes an unverified product side/surface. " +
        "Do NOT fail merely because a real detail is temporarily occluded by a hand, motion blur, perspective, glare or is too small to judge. Fail only for a visible contradiction/addition/redesign, or an unverified surface exposure. " +
        "A plausible invented detail is still a failure. Every boolean must agree with the written reason: never set unverified_surface_exposed=true if the reason says no unverified surface was exposed; never set object_materialized_or_disappeared=true if every newly visible object is naturally explained by camera reveal/continuous entry; and never set a preservation field=true if the reason describes that property as changed. Return strict JSON only.",
    },
    { type: "input_text", text: "AUTHORITATIVE RETAILER PRODUCT REFERENCE" },
    { type: "input_image", image_url: referenceDataUrl, detail: "high" },
  ];
  for (const frame of frames) {
    content.push({
      type: "input_text",
      text: `DELIVERED VIDEO FRAME at ${Number(frame.time).toFixed(2)} seconds`,
    });
    content.push({
      type: "input_image",
      image_url: `data:image/jpeg;base64,${frame.buffer.toString("base64")}`,
      detail: "high",
    });
  }

  const response = await openai.responses.create(
    {
      model: KLING_PRODUCT_IDENTITY_AUDIT_MODEL,
      input: [{ role: "user", content }],
      max_output_tokens: 650,
      text: {
        format: {
          type: "json_schema",
          name: "kling_finished_product_identity_audit",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              same_product_all_auditable_frames: { type: "boolean" },
              verified_view_preserved: { type: "boolean" },
              unverified_surface_exposed: { type: "boolean" },
              visible_controls_hardware_preserved: { type: "boolean" },
              visible_material_color_design_preserved: { type: "boolean" },
              invented_or_moved_identity_detail: { type: "boolean" },
              scene_continuity_preserved: { type: "boolean" },
              static_environment_geometry_preserved: { type: "boolean" },
              object_materialized_or_disappeared: { type: "boolean" },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              reason: { type: "string" },
            },
            required: [
              "same_product_all_auditable_frames",
              "verified_view_preserved",
              "unverified_surface_exposed",
              "visible_controls_hardware_preserved",
              "visible_material_color_design_preserved",
              "invented_or_moved_identity_detail",
              "scene_continuity_preserved",
              "static_environment_geometry_preserved",
              "object_materialized_or_disappeared",
              "confidence",
              "reason",
            ],
          },
        },
      },
    },
    { timeout: 28_000, maxRetries: 0 }
  );

  let parsed = null;
  try {
    parsed = JSON.parse(getOpenAiTextOutput(response));
  } catch {
    parsed = null;
  }
  if (!parsed) {
    throw new Error("Kling finished-video product identity audit returned invalid JSON");
  }

  const confidence = Number(parsed?.confidence || 0);
  const passed = Boolean(
    parsed?.same_product_all_auditable_frames === true &&
      parsed?.verified_view_preserved === true &&
      parsed?.unverified_surface_exposed !== true &&
      parsed?.visible_controls_hardware_preserved === true &&
      parsed?.visible_material_color_design_preserved === true &&
      parsed?.invented_or_moved_identity_detail !== true &&
      parsed?.scene_continuity_preserved === true &&
      parsed?.static_environment_geometry_preserved === true &&
      parsed?.object_materialized_or_disappeared !== true &&
      confidence >= 0.9
  );
  const violationCodes = [];
  if (parsed?.same_product_all_auditable_frames !== true) violationCodes.push("product_identity_changed");
  if (parsed?.verified_view_preserved !== true || parsed?.unverified_surface_exposed === true) violationCodes.push("verified_view_or_surface_changed");
  if (parsed?.visible_controls_hardware_preserved !== true) violationCodes.push("controls_or_hardware_changed");
  if (parsed?.visible_material_color_design_preserved !== true) violationCodes.push("material_color_or_print_changed");
  if (parsed?.invented_or_moved_identity_detail === true) violationCodes.push("invented_or_moved_identity_detail");
  if (parsed?.scene_continuity_preserved !== true) violationCodes.push("scene_continuity_broken");
  if (parsed?.static_environment_geometry_preserved !== true) violationCodes.push("environment_geometry_changed");
  if (parsed?.object_materialized_or_disappeared === true) violationCodes.push("object_appeared_or_disappeared");
  if (!passed && !violationCodes.length) violationCodes.push("identity_audit_uncertain");

  const validation = {
    status: passed ? "passed" : "failed",
    checked_at: new Date().toISOString(),
    model: KLING_PRODUCT_IDENTITY_AUDIT_MODEL,
    sampled_frames: frames.map((frame) => Number(frame.time.toFixed(2))),
    confidence,
    same_product_all_auditable_frames: parsed?.same_product_all_auditable_frames === true,
    verified_view_preserved: parsed?.verified_view_preserved === true,
    unverified_surface_exposed: parsed?.unverified_surface_exposed === true,
    visible_controls_hardware_preserved: parsed?.visible_controls_hardware_preserved === true,
    visible_material_color_design_preserved: parsed?.visible_material_color_design_preserved === true,
    invented_or_moved_identity_detail: parsed?.invented_or_moved_identity_detail === true,
    scene_continuity_preserved: parsed?.scene_continuity_preserved === true,
    static_environment_geometry_preserved: parsed?.static_environment_geometry_preserved === true,
    object_materialized_or_disappeared: parsed?.object_materialized_or_disappeared === true,
    violation_codes: violationCodes,
    reason: String(parsed?.reason || (passed ? "verified" : "product_identity_mismatch")).trim(),
  };
  const nextSelection = { ...selection, product_video_validation: validation };
  const { error } = await supabase
    .from("posts")
    .update({ video_background_selection: nextSelection, updated_at: new Date().toISOString() })
    .eq("id", post.id)
    .eq("video_provider", "kling");
  if (error) {
    throw new Error(`Could not persist Kling finished-video identity audit: ${error.message}`);
  }
  post.video_background_selection = nextSelection;

  console.info("Kling finished-video product identity audit completed", {
    postId: post.id,
    taskId: post.kling_task_id,
    productTitle,
    passed,
    confidence,
    sampledFrames: validation.sampled_frames,
    controlsHardwarePreserved: validation.visible_controls_hardware_preserved,
    materialColorDesignPreserved: validation.visible_material_color_design_preserved,
    inventedOrMovedIdentityDetail: validation.invented_or_moved_identity_detail,
    unverifiedSurfaceExposed: validation.unverified_surface_exposed,
    sceneContinuityPreserved: validation.scene_continuity_preserved,
    staticEnvironmentGeometryPreserved: validation.static_environment_geometry_preserved,
    objectMaterializedOrDisappeared: validation.object_materialized_or_disappeared,
    violationCodes: validation.violation_codes,
    reason: truncate(validation.reason, 700),
  });

  return { passed, cached: false, validation };
}

// v144.42: product identity is constrained before the paid Kling generation and
// audited once on the finished paid result before customer delivery. This audit
// never submits another Kling generation. A provider/audit outage retries only
// local finalization from the cached Kling source; a confirmed redesign fails
// closed rather than showing a customer the wrong product.

async function uploadKlingTypographyOverlay({ supabase, post, buffer }) {
  const storagePath = `${post.user_id}/${post.id}-kling-text-overlay.png`;
  const { error: uploadError } = await supabase.storage
    .from(POST_IMAGES_BUCKET)
    .upload(storagePath, buffer, { contentType: "image/png", upsert: true });
  if (uploadError) throw new Error(uploadError.message || "Could not store Kling typography overlay");
  const { data } = supabase.storage.from(POST_IMAGES_BUCKET).getPublicUrl(storagePath);
  const imageUrl = data?.publicUrl || null;
  if (!imageUrl) throw new Error("Could not create public URL for Kling typography overlay");
  return { imageUrl, storagePath };
}

async function uploadKlingCtaOverlay({ supabase, post, buffer }) {
  const storagePath = `${post.user_id}/${post.id}-kling-cta-overlay.png`;
  const { error: uploadError } = await supabase.storage
    .from(POST_IMAGES_BUCKET)
    .upload(storagePath, buffer, { contentType: "image/png", upsert: true });
  if (uploadError) throw new Error(uploadError.message || "Could not store Kling CTA overlay");
  const { data } = supabase.storage.from(POST_IMAGES_BUCKET).getPublicUrl(storagePath);
  const imageUrl = data?.publicUrl || null;
  if (!imageUrl) throw new Error("Could not create public URL for Kling CTA overlay");
  return { imageUrl, storagePath };
}


async function uploadKlingClosingHeroFrame({ supabase, post, buffer }) {
  const storagePath = `${post.user_id}/${post.id}-kling-closing-hero.jpg`;
  const { error: uploadError } = await supabase.storage
    .from(POST_IMAGES_BUCKET)
    .upload(storagePath, buffer, { contentType: "image/jpeg", upsert: true });
  if (uploadError) throw new Error(uploadError.message || "Could not store Kling closing hero frame");
  const { data } = supabase.storage.from(POST_IMAGES_BUCKET).getPublicUrl(storagePath);
  const imageUrl = data?.publicUrl || null;
  if (!imageUrl) throw new Error("Could not create public URL for Kling closing hero frame");
  return { imageUrl, storagePath };
}

async function uploadRejectedKlingTypographyOverlay({ supabase, post, buffer }) {
  const storagePath = `${post.user_id}/${post.id}-kling-text-overlay-rejected.png`;
  const { error: uploadError } = await supabase.storage
    .from(POST_IMAGES_BUCKET)
    .upload(storagePath, buffer, { contentType: "image/png", upsert: true });
  if (uploadError) throw new Error(uploadError.message || "Could not store rejected Kling typography overlay");
  const { data } = supabase.storage.from(POST_IMAGES_BUCKET).getPublicUrl(storagePath);
  const imageUrl = data?.publicUrl || null;
  if (!imageUrl) throw new Error("Could not create public URL for rejected Kling typography overlay");
  return { imageUrl, storagePath };
}

function throwKlingTypographyValidationError(message, buffer, analysis) {
  const error = new Error(message);
  error.typographyDebugBuffer = buffer;
  error.typographyAnalysis = analysis;
  throw error;
}

async function normalizeFinishedKlingTypography(buffer) {
  // GPT-Image-2 currently returns a portrait canvas that is not exactly 9:16.
  // Preserve the artwork's geometry and place it on a transparent 1080x1920
  // canvas instead of stretching the lettering/decorations with fit: "fill".
  const normalized = await sharp(buffer)
    .rotate()
    .resize({
      width: 1080,
      height: 1920,
      fit: "contain",
      position: "centre",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .ensureAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();
  const { data, info } = await sharp(normalized).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let visible = 0;
  let strong = 0;
  let lowAlpha = 0;
  let edgeVisible = 0;
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + 3];
      if (alpha > 0 && alpha < 24) lowAlpha += 1;
      if (alpha < 24) continue;
      visible += 1;
      if (alpha >= 150) strong += 1;
      if (x < 18 || x >= info.width - 18 || y < 18 || y >= info.height - 18) edgeVisible += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const pixels = Math.max(1, info.width * info.height);
  const visibleRatio = visible / pixels;
  const strongRatio = strong / pixels;
  const lowAlphaRatio = lowAlpha / pixels;
  const edgeRatio = edgeVisible / Math.max(1, visible);
  const bboxWidth = maxX >= minX ? maxX - minX + 1 : 0;
  const bboxHeight = maxY >= minY ? maxY - minY + 1 : 0;
  const bboxArea = Math.max(1, bboxWidth * bboxHeight);
  const bboxWidthRatio = bboxWidth / Math.max(1, info.width);
  const bboxHeightRatio = bboxHeight / Math.max(1, info.height);
  const bboxAreaRatio = bboxArea / pixels;
  const bboxFillRatio = visible / bboxArea;
  const analysis = {
    visibleRatio,
    strongRatio,
    lowAlphaRatio,
    edgeRatio,
    bboxWidthRatio,
    bboxHeightRatio,
    bboxAreaRatio,
    bboxFillRatio,
  };

  if (visibleRatio < 0.0025 || strongRatio < 0.0009) {
    throwKlingTypographyValidationError("GPT-Image-2 Kling typography was visually empty", normalized, analysis);
  }
  // A transparent overlay may legitimately contain a headline plus a compact
  // underline/brush/flourish. Do not reject that just because it crosses the
  // old 22% occupancy threshold. Reject only clear background-like output.
  if (visibleRatio > 0.42) {
    throwKlingTypographyValidationError("GPT-Image-2 Kling typography contained a background-sized opaque area", normalized, analysis);
  }
  if (bboxAreaRatio > 0.18 && bboxFillRatio > 0.72) {
    throwKlingTypographyValidationError("GPT-Image-2 Kling typography contained a large opaque panel-like area", normalized, analysis);
  }
  if (lowAlphaRatio > 0.18) {
    throwKlingTypographyValidationError("GPT-Image-2 Kling typography contained excessive translucent haze", normalized, analysis);
  }
  if (edgeRatio > 0.12) {
    throwKlingTypographyValidationError("GPT-Image-2 Kling typography touched the canvas edge", normalized, analysis);
  }
  return { buffer: normalized, ...analysis };
}


async function placeFinishedKlingTypographyInSafeArea(buffer, placement) {
  const box = getKlingPlacementBox(placement);
  const trimmed = await sharp(buffer)
    .rotate()
    .ensureAlpha()
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const artwork = await sharp(trimmed)
    .resize({
      width: Math.max(120, Math.round(box.width * 0.92)),
      height: Math.max(100, Math.round(box.height * 0.88)),
      fit: "inside",
      withoutEnlargement: false,
      kernel: sharp.kernel.lanczos3,
    })
    .ensureAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();
  const metadata = await sharp(artwork).metadata();
  const width = Number(metadata.width || 1);
  const height = Number(metadata.height || 1);
  const left = Math.max(0, Math.round(box.left + (box.width - width) / 2));
  const top = Math.max(0, Math.round(box.top + (box.height - height) / 2));
  const canvas = await sharp({
    create: {
      width: 1080,
      height: 1920,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: artwork, left, top }])
    .png({ compressionLevel: 9 })
    .toBuffer();
  return normalizeFinishedKlingTypography(canvas);
}

async function extractVisibleTypographyBand(buffer, band, padding = 24) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const topBound = Math.max(0, Math.floor(Number(band?.top) || 0));
  const bottomBound = Math.min(info.height - 1, Math.ceil(Number(band?.bottom) || 0));
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = topBound; y <= bottomBound; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + 3];
      if (alpha < 24) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error("Combined Kling overlay split could not locate visible typography bounds");
  }

  const left = Math.max(0, minX - padding);
  const top = Math.max(0, minY - padding);
  const right = Math.min(info.width - 1, maxX + padding);
  const bottom = Math.min(info.height - 1, maxY + padding);
  return sharp(buffer)
    .extract({
      left,
      top,
      width: Math.max(1, right - left + 1),
      height: Math.max(1, bottom - top + 1),
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function splitCombinedKlingTypographyOverlay(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const visibleRows = [];
  for (let y = 0; y < info.height; y += 1) {
    let count = 0;
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + 3];
      if (alpha >= 24) count += 1;
    }
    if (count >= 10) visibleRows.push(y);
  }

  if (!visibleRows.length) {
    throw new Error("Combined Kling overlay split found no visible typography rows");
  }

  const bands = [];
  let start = visibleRows[0];
  let prev = visibleRows[0];
  for (let index = 1; index < visibleRows.length; index += 1) {
    const row = visibleRows[index];
    if (row - prev <= 120) {
      prev = row;
      continue;
    }
    bands.push({ top: start, bottom: prev });
    start = row;
    prev = row;
  }
  bands.push({ top: start, bottom: prev });

  if (bands.length < 2) {
    throw new Error("Combined Kling overlay split did not detect a separate CTA group");
  }

  const headlineBand = {
    top: bands[0].top,
    bottom: bands[Math.max(0, bands.length - 2)].bottom,
  };
  const ctaBand = bands[bands.length - 1];
  return {
    headline: await extractVisibleTypographyBand(buffer, headlineBand, 28),
    cta: await extractVisibleTypographyBand(buffer, ctaBand, 24),
  };
}

async function createKlingCtaOverlay({ supabase, post, selection, creativePlan, sourceBuffer = null }) {
  if (String(selection?.cta_overlay_url || "").trim()) return selection;
  const cta =
    normalizeKlingCreativeLine(creativePlan?.cta, { maxWords: 4, maxChars: 24 }) ||
    normalizeKlingCreativeLine(getFallbackKlingCta(post), { maxWords: 4, maxChars: 28 });
  if (!cta) return selection;
  const placement = creativePlan?.cta_placement || "lower_left";
  const box = getKlingPlacementBox(placement, "lower_left");

  if (sourceBuffer) {
    const normalized = await placeFinishedKlingTypographyInSafeArea(sourceBuffer, placement);
    const uploaded = await uploadKlingCtaOverlay({ supabase, post, buffer: normalized.buffer });
    return {
      ...selection,
      cta_overlay_url: uploaded.imageUrl,
      cta_overlay_storage_path: uploaded.storagePath,
      cta_overlay_provider: "gpt-image-2-shared-overlay-split",
      cta_overlay_copy: cta,
      cta_overlay_placement: placement,
      cta_overlay_created_at: new Date().toISOString(),
      cta_overlay_analysis: {
        visible_ratio: Number(normalized.visibleRatio.toFixed(4)),
        strong_ratio: Number(normalized.strongRatio.toFixed(4)),
        low_alpha_ratio: Number((normalized.lowAlphaRatio || 0).toFixed(4)),
        edge_ratio: Number((normalized.edgeRatio || 0).toFixed(4)),
        bbox_width_ratio: Number((normalized.bboxWidthRatio || 0).toFixed(4)),
        bbox_height_ratio: Number((normalized.bboxHeightRatio || 0).toFixed(4)),
        bbox_area_ratio: Number((normalized.bboxAreaRatio || 0).toFixed(4)),
        bbox_fill_ratio: Number((normalized.bboxFillRatio || 0).toFixed(4)),
      },
    };
  }

  const profile = getProductTypographyProfile(cta);
  const family = escapeProductSvg(profile?.family || "Noto Sans");
  const direction = profile?.direction === "rtl" ? "rtl" : "ltr";
  const fontSize = Array.from(cta).length > 18 ? 38 : Array.from(cta).length > 12 ? 42 : 46;
  const estimatedTextWidth = Math.round(Array.from(cta).length * fontSize * 0.58);
  const pillWidth = Math.max(230, Math.min(box.width - 12, estimatedTextWidth + 120));
  const pillHeight = 96;
  const x = Math.round(box.left + (box.width - pillWidth) / 2);
  const y = Math.round(box.top + (box.height - pillHeight) / 2);
  const lightText = creativePlan?.cta_text_tone === "light";
  const fill = lightText ? "#111827" : "#FFFFFF";
  const textFill = lightText ? "#FFFFFF" : "#111827";
  const border = lightText ? "#FFFFFF" : "#111827";
  const textX = x + Math.round(pillWidth / 2) - 14;
  const textY = y + 61;
  const arrowX = x + pillWidth - 38;
  const svg = `<svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
    <rect x="${x}" y="${y}" width="${pillWidth}" height="${pillHeight}" rx="48" fill="${fill}" fill-opacity="0.92" stroke="${border}" stroke-opacity="0.7" stroke-width="2"/>
    <text x="${textX}" y="${textY}" text-anchor="middle" font-family="${family}, Noto Sans, sans-serif" font-size="${fontSize}" font-weight="800" fill="${textFill}" direction="${direction}" unicode-bidi="plaintext">${escapeProductSvg(cta)}</text>
    <text x="${arrowX}" y="${textY}" text-anchor="middle" font-family="Noto Sans, sans-serif" font-size="42" font-weight="800" fill="${textFill}">→</text>
  </svg>`;
  const buffer = await sharp(Buffer.from(svg)).ensureAlpha().png({ compressionLevel: 9 }).toBuffer();
  const uploaded = await uploadKlingCtaOverlay({ supabase, post, buffer });
  return {
    ...selection,
    cta_overlay_url: uploaded.imageUrl,
    cta_overlay_storage_path: uploaded.storagePath,
    cta_overlay_provider: "deterministic-scene-aware-cta",
    cta_overlay_copy: cta,
    cta_overlay_placement: placement,
    cta_overlay_created_at: new Date().toISOString(),
  };
}

function layoutDeterministicTypography(value, { maxWidth, maxLines, sizes }) {
  const text = String(value || "").replace(/\s+/gu, " ").trim();
  const profile = getProductTypographyProfile(text);
  for (const fontSize of sizes) {
    const wrapped = wrapProductTitle(text, {
      fontSize,
      maxWidth,
      maxLines,
      languageHint: "und",
    });
    if (wrapped.complete && wrapped.lines.length <= maxLines) {
      return { ...wrapped, fontSize, lineHeight: Math.round(fontSize * 1.16) };
    }
  }
  const fontSize = sizes[sizes.length - 1];
  const wrapped = wrapProductTitle(text, {
    fontSize,
    maxWidth,
    maxLines,
    languageHint: "und",
  });
  return { ...wrapped, fontSize, lineHeight: Math.round(fontSize * 1.16), profile };
}

function renderDeterministicTypographyLines(layout, firstBaseline, { strokeWidth = 7, opacity = 1 } = {}) {
  if (!layout?.lines?.length) return "";
  const family = escapeProductSvg(layout.profile?.family || "Noto Sans");
  const direction = layout.profile?.direction === "rtl" ? "rtl" : "ltr";
  return layout.lines.map((line, index) => {
    const y = firstBaseline + index * layout.lineHeight;
    return `<text x="540" y="${y}" text-anchor="middle" font-family="${family}, Noto Sans, sans-serif" font-size="${layout.fontSize}" font-weight="900" letter-spacing="0.4" fill="#ffffff" fill-opacity="${opacity}" stroke="#111827" stroke-opacity="0.78" stroke-width="${strokeWidth}" paint-order="stroke fill" stroke-linejoin="round" direction="${direction}" unicode-bidi="plaintext">${escapeProductSvg(line)}</text>`;
  }).join("");
}

async function createDeterministicKlingTypographyFallback({ supabase, post, selection, reason }) {
  if (selection?.text_overlay_url) return selection;
  const copy = selection?.text_overlay_copy || {};
  const headline = String(copy?.headline || "").trim();
  const subheadline = String(copy?.subheadline || "").trim();
  if (!headline) throw new Error("Kling typography exact headline is missing");

  const headlineLayout = layoutDeterministicTypography(headline, {
    maxWidth: 900,
    maxLines: 3,
    sizes: [96, 88, 80, 72, 64, 56],
  });
  const subLayout = subheadline
    ? layoutDeterministicTypography(subheadline, {
        maxWidth: 860,
        maxLines: 2,
        sizes: [50, 46, 42, 38, 34],
      })
    : null;

  const headlineHeight = Math.max(1, headlineLayout.lines.length) * headlineLayout.lineHeight;
  const subHeight = subLayout ? Math.max(1, subLayout.lines.length) * subLayout.lineHeight : 0;
  const totalHeight = headlineHeight + (subLayout ? 34 + subHeight : 0);
  // Place the fallback in the upper safe area. It is deliberately simple,
  // exact and transparent; it is used only when the one paid AI typography
  // generation failed or was abandoned.
  const groupTop = Math.max(250, Math.min(470, 410 - Math.round(totalHeight / 2)));
  const headlineBaseline = groupTop + headlineLayout.fontSize;
  const subBaseline = subLayout
    ? headlineBaseline + (headlineLayout.lines.length - 1) * headlineLayout.lineHeight + 34 + subLayout.fontSize
    : 0;

  const svg = `<svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#000000" flood-opacity="0.34"/>
    </filter>
  </defs>
  <g filter="url(#shadow)">
    ${renderDeterministicTypographyLines(headlineLayout, headlineBaseline, { strokeWidth: 8 })}
    ${subLayout ? renderDeterministicTypographyLines(subLayout, subBaseline, { strokeWidth: 5, opacity: 0.96 }) : ""}
  </g>
</svg>`;

  const rendered = await sharp(Buffer.from(svg))
    .ensureAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();
  const creativePlan = selection?.ad_creative_plan || {
    headline,
    subheadline,
    cta: getFallbackKlingCta(post),
    main_placement: "top_left",
    cta_placement: "lower_left",
    main_text_tone: "light",
    cta_text_tone: "light",
    placement_confidence: 0,
    source: "fallback_without_scene_plan",
  };
  const normalized = await placeFinishedKlingTypographyInSafeArea(
    rendered,
    creativePlan.main_placement
  );
  const uploaded = await uploadKlingTypographyOverlay({ supabase, post, buffer: normalized.buffer });
  let completedSelection = {
    ...selection,
    ad_creative_plan: creativePlan,
    text_overlay_url: uploaded.imageUrl,
    text_overlay_storage_path: uploaded.storagePath,
    text_overlay_provider: "deterministic-svg-transparent-fallback",
    text_overlay_status: "ready",
    text_overlay_generated_at: new Date().toISOString(),
    text_overlay_fallback_reason: truncate(reason || "AI typography unavailable", 900),
    text_overlay_analysis: {
      visible_ratio: Number(normalized.visibleRatio.toFixed(4)),
      strong_ratio: Number(normalized.strongRatio.toFixed(4)),
      edge_ratio: Number(normalized.edgeRatio.toFixed(4)),
    },
  };
  completedSelection = await createKlingCtaOverlay({
    supabase,
    post,
    selection: completedSelection,
    creativePlan,
  });
  const { error: persistError } = await supabase
    .from("posts")
    .update({ video_background_selection: completedSelection, updated_at: new Date().toISOString() })
    .eq("id", post.id)
    .eq("video_provider", "kling");
  if (persistError) throw new Error(`Could not persist deterministic Kling typography fallback: ${persistError.message}`);

  console.warn("Kling typography AI unavailable; deterministic transparent fallback created", {
    postId: post.id,
    taskId: post.kling_task_id,
    reason: truncate(reason || "AI typography unavailable", 500),
  });
  return completedSelection;
}

async function createFinishedKlingTypographyOnce({ openai, supabase, post, task, selection }) {
  if (selection?.text_overlay_url) return selection;
  const status = String(selection?.text_overlay_status || "").trim();
  if (status === "generating") {
    const startedAt = new Date(selection?.text_overlay_generation_started_at || 0).getTime();
    const stale = !Number.isFinite(startedAt) || startedAt <= 0 || Date.now() - startedAt >= KLING_FINALIZATION_LEASE_MS;
    if (!stale) {
      throw new Error("Kling typography generation is still inside its active finalization lease.");
    }
    return createDeterministicKlingTypographyFallback({
      supabase,
      post,
      selection,
      reason: "The original GPT-Image-2 typography claim became stale before completion.",
    });
  }
  if (status === "failed") {
    return createDeterministicKlingTypographyFallback({
      supabase,
      post,
      selection,
      reason: selection?.text_overlay_error || "The one allowed GPT-Image-2 typography generation previously failed.",
    });
  }
  const copy = selection?.text_overlay_copy || {};
  const fallbackHeadline = String(copy?.headline || "").trim();
  const fallbackSubheadline = String(copy?.subheadline || "").trim();
  if (!fallbackHeadline) throw new Error("Kling typography exact headline is missing");

  const claimedSelection = {
    ...selection,
    text_overlay_status: "generating",
    text_overlay_generation_started_at: new Date().toISOString(),
    text_overlay_generation_attempts: 1,
  };
  let workingSelection = claimedSelection;
  const { error: claimError } = await supabase
    .from("posts")
    .update({ video_background_selection: claimedSelection, updated_at: new Date().toISOString() })
    .eq("id", post.id)
    .eq("video_provider", "kling");
  if (claimError) throw new Error(`Could not claim the single GPT-Image-2 typography generation: ${claimError.message}`);

  try {
    const durationSeconds = normalizeVideoDurationSeconds(task.durationSeconds, post.video_duration_seconds, 6);
    const frames = await sampleRemoteVideoFrames({
      videoUrl: task.videoUrl,
      durationSeconds,
      // Two representative frames art-direct the typography. The closing hero
      // frame is sampled separately from the exact delivered end of motion.
      fractions: [0.28, 0.72],
    });
    const closingFrames = await sampleRemoteVideoFrames({
      videoUrl: task.videoUrl,
      durationSeconds,
      timesSeconds: [Math.max(0.05, durationSeconds - 0.02)],
    });
    const closingFrame = closingFrames[0] || null;
    if (closingFrame?.buffer) frames.push(closingFrame);
    if (closingFrame?.buffer) {
      const closingHeroBuffer = await sharp(closingFrame.buffer)
        .resize({ width: 1080, height: 1920, fit: "cover" })
        .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
        .toBuffer();
      const closingHero = await uploadKlingClosingHeroFrame({
        supabase,
        post,
        buffer: closingHeroBuffer,
      });
      workingSelection = {
        ...workingSelection,
        closing_hero_frame_url: closingHero.imageUrl,
        closing_hero_frame_storage_path: closingHero.storagePath,
        closing_hero_source_time_seconds: Number(closingFrame.time.toFixed(3)),
        closing_hero_hold_seconds: KLING_CLOSING_HERO_HOLD_SECONDS,
      };
    }

    const creativePlan = await planFinishedKlingAdvertisingCreative({
      openai,
      post,
      selection: {
        ...workingSelection,
        text_overlay_copy: { headline: fallbackHeadline, subheadline: fallbackSubheadline },
      },
      frames,
    });
    const headline = creativePlan.headline || fallbackHeadline;
    const subheadline = creativePlan.subheadline || "";
    workingSelection = {
      ...workingSelection,
      ad_creative_plan: creativePlan,
      text_overlay_copy: { headline, subheadline },
    };
    const { error: creativePlanPersistError } = await supabase
      .from("posts")
      .update({ video_background_selection: workingSelection, updated_at: new Date().toISOString() })
      .eq("id", post.id)
      .eq("video_provider", "kling");
    if (creativePlanPersistError) {
      throw new Error(`Could not persist Kling finished-video creative plan: ${creativePlanPersistError.message}`);
    }

    const referenceFiles = [];
    for (let index = 0; index < frames.length; index += 1) {
      const frame = await sharp(frames[index].buffer)
        .resize({ width: 768, height: 1365, fit: "cover" })
        .jpeg({ quality: 88 })
        .toBuffer();
      referenceFiles.push(await toFile(frame, `finished-video-frame-${index + 1}.jpg`, { type: "image/jpeg" }));
    }
    const productImageUrl = String(selection?.verified_product_image_url || "").trim();
    if (productImageUrl) {
      const response = await fetch(productImageUrl, { headers: { Accept: "image/*" }, redirect: "follow" });
      if (response.ok) {
        const product = await sharp(Buffer.from(await response.arrayBuffer()))
          .rotate().resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true })
          .png().toBuffer();
        referenceFiles.push(await toFile(product, "verified-product-reference.png", { type: "image/png" }));
      }
    }
    const prompt = `
Create ONLY a finished transparent typography overlay for this premium vertical social-media product commercial.
The supplied images are real frames from the FINISHED video, followed optionally by the authoritative ecommerce product image. Use them only to understand the video content, mood, lighting and where typography can sit safely. Do not reproduce any photo, person, product or background.

EXACT VISIBLE TEXT — render exactly these words, with exact spelling and language:
Main headline: "${headline}"
${subheadline ? `Subheadline: "${subheadline}"` : "No subheadline."}
CTA ending text: "${creativePlan.cta || getFallbackKlingCta(post)}"

DESIGN:
- Make the typography feel specifically art-directed for the finished video and product, as a professional short commercial rather than generic system text.
- Strong, confident mobile readability; polished hierarchy, kerning and scale.
- Choose a typography character that fits the actual content: e.g. urban, premium, technical, playful, elegant or energetic only when supported by the references.
- Mostly light/white or dark high-contrast lettering as the frames require.
- You MAY make the typography more alive with a restrained accent color, a compact underline, a SMALL brush stroke, a SMALL crown/flourish, or another SMALL graphic accent when it genuinely suits the content.
- Decorative accents must stay visually attached to the lettering and close to the text. They are part of the typography design, never a background.
- Create TWO separate compact text groups on the same transparent canvas: (1) one grouped main-message design containing the headline and optional subheadline, and (2) one smaller grouped CTA design that feels art-directed in the same visual language.
- Keep a LARGE transparent gap between the main-message group and the CTA group so Spreelo can separate them into timed layers after this single generation.
- The CTA design may be plain text or a compact bespoke accent shape if it genuinely suits the ad, but NEVER a generic app-style button.
- Keep the overall composition compact. Spreelo will crop the main-message group and the CTA group separately and place them deterministically inside scene-safe regions chosen from the supplied finished frames. Do not try to fill the canvas.
- NO large card, panel, sticker base, banner, rectangle or opaque plate behind the text. A small CTA accent shape is allowed only when it is tightly fitted to the CTA lettering.
- NO shadow of any kind (including drop shadow, soft shadow or long shadow), no glow, haze, mist, blur or atmospheric halo. Use crisp lettering and crisp decorative accents instead.

TRANSPARENCY / LAYER RULE — CRITICAL:
- This artwork is NOT a standalone poster or image. It is a FOREGROUND OVERLAY LAYER that will be composited directly on top of an existing video.
- Create ONLY the typography design itself: exact letters plus the small decorative accents described above.
- EVERY pixel that is not part of a letter or a small, tightly attached decorative accent must be fully transparent with alpha = 0.
- The area surrounding the complete design must remain completely transparent so the underlying video is fully visible.
- Do not create a translucent wash, tint, vignette or painted area around/behind the design.
- Anti-aliased edge pixels belonging directly to letters or decorative accents may use partial alpha; unrelated surrounding pixels must be alpha = 0.

OUTPUT RULES:
- Transparent RGBA PNG portrait overlay intended for a final 9:16 video composition.
- No black/white/colored background, no checkerboard, no scene, no photo, no clothing, no person, no product, no mockup, no logo recreation, no watermark.
- Do not invent or rewrite any words. Render only the exact headline, optional subheadline and CTA text provided above. Do not add a price, offer, extra slogan or hashtag.
- Return ONLY the transparent typography overlay layer and nothing else.
`.trim();
    const response = await openai.images.edit({
      model: KLING_TYPOGRAPHY_MODEL,
      image: referenceFiles,
      prompt,
      size: "1024x1536",
      quality: "medium",
      background: "transparent",
      output_format: "png",
    }, { timeout: 75_000, maxRetries: 0 });
    const base64 = response?.data?.[0]?.b64_json;
    if (!base64) throw new Error("GPT-Image-2 returned no transparent Kling typography image");
    const combinedOverlay = await normalizeFinishedKlingTypography(
      Buffer.from(base64, "base64")
    );
    const splitOverlay = await splitCombinedKlingTypographyOverlay(combinedOverlay.buffer);
    const normalized = await placeFinishedKlingTypographyInSafeArea(
      splitOverlay.headline,
      creativePlan.main_placement
    );
    const uploaded = await uploadKlingTypographyOverlay({ supabase, post, buffer: normalized.buffer });
    let completedSelection = {
      ...workingSelection,
      text_overlay_url: uploaded.imageUrl,
      text_overlay_storage_path: uploaded.storagePath,
      text_overlay_provider: "gpt-image-2-finished-video-shared-overlay",
      text_overlay_prompt: prompt,
      text_overlay_status: "ready",
      text_overlay_generated_at: new Date().toISOString(),
      text_overlay_analysis: {
        visible_ratio: Number(normalized.visibleRatio.toFixed(4)),
        strong_ratio: Number(normalized.strongRatio.toFixed(4)),
        low_alpha_ratio: Number((normalized.lowAlphaRatio || 0).toFixed(4)),
        edge_ratio: Number((normalized.edgeRatio || 0).toFixed(4)),
        bbox_width_ratio: Number((normalized.bboxWidthRatio || 0).toFixed(4)),
        bbox_height_ratio: Number((normalized.bboxHeightRatio || 0).toFixed(4)),
        bbox_area_ratio: Number((normalized.bboxAreaRatio || 0).toFixed(4)),
        bbox_fill_ratio: Number((normalized.bboxFillRatio || 0).toFixed(4)),
        shared_overlay_visible_ratio: Number(combinedOverlay.visibleRatio.toFixed(4)),
        shared_overlay_bbox_area_ratio: Number((combinedOverlay.bboxAreaRatio || 0).toFixed(4)),
      },
    };
    completedSelection = await createKlingCtaOverlay({
      supabase,
      post,
      selection: completedSelection,
      creativePlan,
      sourceBuffer: splitOverlay.cta,
    });
    const { error: persistError } = await supabase
      .from("posts")
      .update({ video_background_selection: completedSelection, updated_at: new Date().toISOString() })
      .eq("id", post.id)
      .eq("video_provider", "kling");
    if (persistError) throw new Error(`Could not persist finished Kling typography: ${persistError.message}`);
    console.info("GPT-Image-2 finished-video transparent typography created in one generation", {
      postId: post.id,
      headline,
      hasSubheadline: Boolean(subheadline),
      cta: completedSelection.cta_overlay_copy || null,
      mainPlacement: creativePlan.main_placement,
      ctaPlacement: creativePlan.cta_placement,
      placementConfidence: creativePlan.placement_confidence,
      referenceFrames: frames.length,
      provider: completedSelection.text_overlay_provider,
      sharedOverlay: completedSelection.cta_overlay_provider === "gpt-image-2-shared-overlay-split",
    });
    return completedSelection;
  } catch (error) {
    let rejectedOverlay = null;
    if (error?.typographyDebugBuffer) {
      try {
        rejectedOverlay = await uploadRejectedKlingTypographyOverlay({
          supabase,
          post,
          buffer: error.typographyDebugBuffer,
        });
        console.warn("Rejected GPT-Image-2 Kling typography saved for diagnostics", {
          postId: post.id,
          taskId: post.kling_task_id,
          reason: truncate(error?.message || String(error), 500),
          rejectedOverlayUrl: rejectedOverlay.imageUrl,
          analysis: error?.typographyAnalysis || null,
        });
      } catch (debugError) {
        console.warn("Could not save rejected GPT-Image-2 Kling typography diagnostic", {
          postId: post.id,
          taskId: post.kling_task_id,
          message: truncate(debugError?.message || String(debugError), 500),
        });
      }
    }
    const failedSelection = {
      ...workingSelection,
      text_overlay_status: "failed",
      text_overlay_failed_at: new Date().toISOString(),
      text_overlay_error: truncate(error?.message || String(error), 900),
      ...(rejectedOverlay?.imageUrl
        ? {
            text_overlay_rejected_url: rejectedOverlay.imageUrl,
            text_overlay_rejected_storage_path: rejectedOverlay.storagePath,
          }
        : {}),
      ...(error?.typographyAnalysis
        ? {
            text_overlay_rejected_analysis: Object.fromEntries(
              Object.entries(error.typographyAnalysis).map(([key, value]) => [
                key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
                Number(Number(value || 0).toFixed(4)),
              ])
            ),
          }
        : {}),
    };
    await supabase.from("posts").update({ video_background_selection: failedSelection, updated_at: new Date().toISOString() }).eq("id", post.id).eq("video_provider", "kling");
    return createDeterministicKlingTypographyFallback({
      supabase,
      post,
      selection: failedSelection,
      reason: error?.message || String(error),
    });
  }
}

async function ensureKlingClosingHeroFrame({ supabase, post, task, selection, durationSeconds: durationOverride = null, sourceTimeSeconds = null }) {
  if (String(selection?.closing_hero_frame_url || "").trim()) return selection;

  const durationSeconds = normalizeVideoDurationSeconds(
    durationOverride,
    task.durationSeconds,
    post.video_duration_seconds,
    6
  );
  const targetTimeSeconds = Math.max(
    0.05,
    Math.min(durationSeconds - 0.02, Number(sourceTimeSeconds) || durationSeconds - 0.02)
  );
  const frames = await sampleRemoteVideoFrames({
    videoUrl: task.videoUrl,
    durationSeconds,
    timesSeconds: [targetTimeSeconds],
  });
  const closingFrame = frames[0];
  if (!closingFrame?.buffer) throw new Error("Could not sample Kling closing hero frame");
  const closingHeroBuffer = await sharp(closingFrame.buffer)
    .resize({ width: 1080, height: 1920, fit: "cover" })
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
  const uploaded = await uploadKlingClosingHeroFrame({
    supabase,
    post,
    buffer: closingHeroBuffer,
  });
  const nextSelection = {
    ...selection,
    closing_hero_frame_url: uploaded.imageUrl,
    closing_hero_frame_storage_path: uploaded.storagePath,
    closing_hero_source_time_seconds: Number(closingFrame.time.toFixed(3)),
    closing_hero_hold_seconds: KLING_CLOSING_HERO_HOLD_SECONDS,
  };
  const { error } = await supabase
    .from("posts")
    .update({ video_background_selection: nextSelection, updated_at: new Date().toISOString() })
    .eq("id", post.id)
    .eq("video_provider", "kling");
  if (error) throw new Error(`Could not persist Kling closing hero frame: ${error.message}`);
  post.video_background_selection = nextSelection;
  return nextSelection;
}

function getKlingAdvertisingPostprocess(post) {
  const selection = post?.video_background_selection;
  if (!selection || typeof selection !== "object" || Array.isArray(selection)) return null;
  if (String(selection.mode || "") !== "kling_professional_advertising_postprocess") return null;
  return selection;
}

async function getKlingFinalVideoSource({ openai, supabase, post, task, costTracker }) {
  let postprocess = getKlingAdvertisingPostprocess(post);
  if (!postprocess) {
    return {
      videoUrl: task.videoUrl,
      postprocessApplied: false,
      postprocessRenderId: null,
      durationSeconds: normalizeVideoDurationSeconds(task.durationSeconds, post.video_duration_seconds, 6),
    };
  }

  postprocess = await createFinishedKlingTypographyOnce({
    openai,
    supabase,
    post,
    task,
    selection: postprocess,
  });

  const durationSeconds = normalizeVideoDurationSeconds(
    task.durationSeconds,
    post.video_duration_seconds,
    6
  );
  const trimStartSeconds = Math.max(
    0,
    Math.min(
      Math.max(0.2, durationSeconds - 1.2),
      Number(postprocess.scene_trim_start_seconds ?? 1.9) || 1.9
    )
  );
  const overlayStartSeconds = Math.max(
    0.6,
    Math.min(
      Math.max(0.8, durationSeconds - trimStartSeconds - 0.8),
      Number(postprocess.overlay_start_seconds ?? 2.0) || 2.0
    )
  );
  let renderId = String(postprocess.shotstack_render_id || "").trim() || null;
  let nextSelection = postprocess;

  if (!renderId) {
    postprocess = await ensureKlingClosingHeroFrame({
      supabase,
      post,
      task,
      selection: postprocess,
      durationSeconds,
      sourceTimeSeconds: Math.max(0.05, durationSeconds - 0.02),
    });
    const closingHoldSeconds = String(postprocess.closing_hero_frame_url || "").trim()
      ? Math.max(0.6, Math.min(1.5, Number(postprocess.closing_hero_hold_seconds) || KLING_CLOSING_HERO_HOLD_SECONDS))
      : 0;
    const deliveredMotionDurationSeconds = Math.max(2.5, durationSeconds - trimStartSeconds);
    const deliveredDurationSeconds = deliveredMotionDurationSeconds + closingHoldSeconds;
    const musicSelection = await selectBestVideoMusic({
      supabase,
      context: postprocess.music_context || {
        content_format: "animated_video",
        product_title: postprocess.verified_product_title || null,
        headline: postprocess.text_overlay_copy?.headline || null,
        subheadline: postprocess.text_overlay_copy?.subheadline || null,
      },
      targetDurationSeconds: deliveredDurationSeconds,
      userId: post.user_id || null,
      brandProfileId: post.brand_profile_id || null,
      excludePostId: post.id,
      selectionSeed: post.id,
    });
    const edit = buildVideoOverlayEdit({
      videoUrl: task.videoUrl,
      textOverlayUrl: postprocess.text_overlay_url,
      ctaOverlayUrl: postprocess.cta_overlay_url || null,
      closingFrameUrl: postprocess.closing_hero_frame_url,
      durationSeconds,
      overlayStartSeconds,
      trimStartSeconds,
      closingHoldSeconds,
      musicUrl: musicSelection?.url || null,
      musicDurationSeconds: musicSelection?.durationSeconds || null,
      musicTrimStartSeconds: musicSelection?.trimStartSeconds || null,
      musicVolume: musicSelection?.volume ?? 0.5,
    });
    renderId = await queueShotstackRender(edit);
    nextSelection = {
      ...postprocess,
      scene_trim_start_seconds: trimStartSeconds,
      overlay_start_seconds: overlayStartSeconds,
      closing_hero_hold_seconds: closingHoldSeconds,
      delivered_duration_seconds: Number(deliveredDurationSeconds.toFixed(3)),
      music_applied: Boolean(musicSelection),
      music_asset_id: musicSelection?.id || null,
      music_asset_name: musicSelection?.name || null,
      music_source_url: musicSelection?.url || null,
      music_asset_duration_seconds: musicSelection?.durationSeconds || null,
      music_trim_start_seconds: musicSelection?.trimStartSeconds ?? null,
      music_volume: musicSelection?.volume ?? null,
      music_selection_score: musicSelection?.score ?? null,
      music_selection_reasons: musicSelection?.reasons || [],
      music_recent_use_penalty: musicSelection?.recentUsePenalty ?? null,
      music_variety_bonus: musicSelection?.varietyBonus ?? null,
      music_eligible_track_count: musicSelection?.eligibleTrackCount ?? null,
      shotstack_closing_hero_applied: Boolean(postprocess.closing_hero_frame_url),
      shotstack_cta_overlay_applied: Boolean(postprocess.cta_overlay_url),
      shotstack_render_id: renderId,
      shotstack_status: "rendering",
      shotstack_started_at: new Date().toISOString(),
    };
    const { error: persistError } = await supabase
      .from("posts")
      .update({
        video_background_selection: nextSelection,
        updated_at: new Date().toISOString(),
      })
      .eq("id", post.id)
      .eq("video_provider", "kling");
    if (persistError) {
      throw new Error(
        `Professional Kling typography render ${renderId} was queued but its id could not be saved: ${persistError.message || "unknown database error"}`
      );
    }
    console.info("Kling professional advertising typography render queued", {
      postId: post.id,
      klingTaskId: post.kling_task_id,
      shotstackRenderId: renderId,
      overlayProvider: postprocess.text_overlay_provider || null,
      ctaOverlayProvider: postprocess.cta_overlay_provider || null,
      ctaCopy: postprocess.cta_overlay_copy || null,
      musicAssetId: musicSelection?.id || null,
      musicAssetName: musicSelection?.name || null,
      musicTrimStartSeconds: musicSelection?.trimStartSeconds ?? null,
      musicSelectionScore: musicSelection?.score ?? null,
      recentUsePenalty: musicSelection?.recentUsePenalty ?? null,
      varietyBonus: musicSelection?.varietyBonus ?? null,
      eligibleTrackCount: musicSelection?.eligibleTrackCount ?? null,
      musicSelectionReasons: musicSelection?.reasons || [],
    });
  }

  const render = await waitForShotstackRender({
    renderId,
    maxAttempts: 70,
    delayMs: 2500,
  });

  if (costTracker?.recordShotstack) {
    try {
      await costTracker.recordShotstack({
        renderId,
        billableSeconds: render.billableSeconds,
        plan: render.plan,
        environment: render.environment,
      });
    } catch (costError) {
      console.warn("Kling typography post-process cost tracking failed without affecting finalization", {
        postId: post.id,
        renderId,
        message: costError?.message || String(costError),
      });
    }
  }

  const completedSelection = {
    ...nextSelection,
    shotstack_render_id: renderId,
    shotstack_status: "done",
    shotstack_completed_at: new Date().toISOString(),
  };
  await supabase
    .from("posts")
    .update({
      video_background_selection: completedSelection,
      updated_at: new Date().toISOString(),
    })
    .eq("id", post.id)
    .eq("video_provider", "kling");

  console.info("Kling professional advertising typography applied", {
    postId: post.id,
    klingTaskId: post.kling_task_id,
    shotstackRenderId: renderId,
    overlayProvider: postprocess.text_overlay_provider || null,
  });

  return {
    videoUrl: render.url,
    postprocessApplied: true,
    postprocessRenderId: renderId,
    durationSeconds: Number(
      nextSelection.delivered_duration_seconds ||
        Math.max(2.5, durationSeconds - trimStartSeconds)
    ),
  };
}

async function finalizeReadyTask(
  supabase,
  post,
  task,
  finalVideoUrl = task.videoUrl,
  finalDurationSeconds = null
) {
  const videoBuffer = await downloadKlingVideo(finalVideoUrl);
  const storagePath = `${post.user_id}/${post.id}-kling.mp4`;
  const { error: uploadError } = await supabase.storage
    .from(POST_VIDEOS_BUCKET)
    .upload(storagePath, videoBuffer, {
      contentType: "video/mp4",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(uploadError.message || "Could not save Kling video to Spreelo storage");
  }

  const { data: publicUrlData } = supabase.storage
    .from(POST_VIDEOS_BUCKET)
    .getPublicUrl(storagePath);
  const publicUrl = publicUrlData?.publicUrl || null;
  if (!publicUrl) throw new Error("Could not create a public URL for the Kling video");

  const nowIso = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("posts")
    .update({
      video_url: publicUrl,
      video_storage_path: storagePath,
      video_status: "ready",
      video_render_id: post.kling_task_id,
      kling_task_status: task.status || "succeeded",
      kling_completed_at: nowIso,
      kling_last_polled_at: nowIso,
      // posts.video_duration_seconds is an INTEGER column. Keep the exact
      // post-processed duration in video_background_selection.delivered_duration_seconds,
      // but normalize the summary column to a whole second before persistence.
      video_duration_seconds: normalizeVideoDurationSeconds(
        finalDurationSeconds,
        task.durationSeconds,
        post.video_duration_seconds,
        6
      ),
      video_error: null,
      status: "pending_approval",
      updated_at: nowIso,
    })
    .eq("id", post.id)
    .eq("video_provider", "kling")
    .eq("kling_task_id", post.kling_task_id);

  if (updateError) throw updateError;
  await setReviewCaseReady(supabase, post.id);
  return publicUrl;
}

export async function GET(request) {
  if (!isAuthorized(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const summary = {
    checked: 0,
    pending: 0,
    completed: 0,
    failed: 0,
    timed_out: 0,
    poll_errors: 0,
    locked: 0,
    provider_cache_hits: 0,
    deferred: 0,
    product_identity_rejected: 0,
  };

  try {
    const supabase = createSupabaseAdmin();
    const maxPendingHours = getMaxPendingHours();
    const pendingStatuses = [...KLING_PROVIDER_PENDING_STATUSES, "finalizing", "finalization_retry"];
    const { data: posts, error } = await supabase
      .from("posts")
      .select(
        "id, user_id, brand_profile_id, status, content, cta_type, language, website_url, video_provider, video_status, video_duration_seconds, video_error, video_background_selection, kling_generation_count, kling_task_id, kling_task_status, kling_submitted_at, kling_last_polled_at, kling_model, kling_resolution, kling_audio, updated_at"
      )
      .eq("video_provider", "kling")
      .in("video_status", pendingStatuses)
      .not("kling_task_id", "is", null)
      .order("kling_submitted_at", { ascending: true, nullsFirst: true })
      .limit(10);

    if (error) throw error;

    for (const post of posts || []) {
      summary.checked += 1;

      // Local post-processing retries are intentionally slower than the cron.
      // A transient Shotstack/storage/etc. problem must not be hammered every
      // minute. Successful Kling output is already cached at this point.
      if (finalizationRetryBackoffIsFresh(post) && !hasRecoverableTypographyFailure(post)) {
        summary.deferred += 1;
        continue;
      }

      // A cron invocation can run longer than the one-minute schedule. Claim the
      // row atomically using updated_at as a compare-and-swap token so the next
      // invocation cannot process the same post concurrently. A crashed claim is
      // recoverable after the six-minute lease window without any schema change.
      const claimed = await claimKlingFinalization(supabase, post);
      if (!claimed) {
        summary.locked += 1;
        continue;
      }

      const now = new Date();
      const submittedAtMs = new Date(post.kling_submitted_at || 0).getTime();
      const ageHours = Number.isFinite(submittedAtMs)
        ? (now.getTime() - submittedAtMs) / 3_600_000
        : 0;

      if (submittedAtMs > 0 && ageHours > maxPendingHours) {
        const message = `Kling generation did not finish within ${maxPendingHours} hours. No automatic retry was made; this post has already used its one allowed Kling generation.`;
        await markKlingPostFailed(supabase, post, "kling_video_timeout", message);
        summary.failed += 1;
        summary.timed_out += 1;
        continue;
      }

      let task = getCachedKlingSource(post);
      if (task) {
        summary.provider_cache_hits += 1;
      } else try {
        // Poll only until Kling has returned the successful source once. The
        // source URL is then cached on the post, so post-processing retries never
        // keep hitting Kling for an already-completed task.
        task = await getKlingImageToVideoTask(post.kling_task_id);
      } catch (pollError) {
        console.warn("Kling task polling failed; existing task will be polled again", {
          postId: post.id,
          taskId: post.kling_task_id,
          message: pollError?.message || String(pollError),
        });
        await supabase.from("posts").update({
          video_status: KLING_PROVIDER_PENDING_STATUSES.includes(String(post.kling_task_status || "").toLowerCase())
            ? String(post.kling_task_status).toLowerCase()
            : "processing",
          kling_last_polled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", post.id);
        summary.poll_errors += 1;
        continue;
      }

      const providerStatus = String(task?.status || "unknown").toLowerCase();
      const nowIso = new Date().toISOString();
      await supabase.from("posts").update({
        kling_task_status: providerStatus,
        kling_last_polled_at: nowIso,
        video_status:
          KLING_PROVIDER_PENDING_STATUSES.includes(providerStatus)
            ? providerStatus
            : isKlingTaskSuccessful(providerStatus)
              ? "finalizing"
              : post.video_status,
        updated_at: nowIso,
      }).eq("id", post.id);

      if (isKlingTaskFailed(providerStatus)) {
        const message = `Kling generation failed${task?.message ? `: ${truncate(task.message, 900)}` : "."} No automatic retry was made.`;
        await markKlingPostFailed(supabase, post, "kling_video_generation", message);
        summary.failed += 1;
        continue;
      }

      if (!isKlingTaskSuccessful(providerStatus)) {
        summary.pending += 1;
        continue;
      }

      if (!task?.videoUrl) {
        const message =
          "Kling reported a successful generation but returned no downloadable video URL. No automatic retry was made.";
        await markKlingPostFailed(supabase, post, "kling_video_result", message);
        summary.failed += 1;
        continue;
      }

      if (!task.cached) {
        await persistKlingSourceCache(supabase, post, task);
      }

      const costTracker = createGenerationCostTracker({ supabase, postId: post.id });
      const rawOpenai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const openai = wrapOpenAIForCostTracking(rawOpenai, () => costTracker);
      try {
        await costTracker.recordKling({
          model: post.kling_model || "kling-3.0",
          durationSeconds: normalizeVideoDurationSeconds(
            task.durationSeconds,
            post.video_duration_seconds,
            6
          ),
          resolution: post.kling_resolution || "720p",
          audio: post.kling_audio || "off",
          taskId: post.kling_task_id,
          billingAt: post.kling_submitted_at || null,
          succeeded: true,
        });
      } catch (costError) {
        console.warn("Kling generation cost tracking failed without affecting finalization", {
          postId: post.id,
          taskId: post.kling_task_id,
          message: costError?.message || String(costError),
        });
      }

      try {
        const productIdentity = await validateFinishedKlingProductIdentity({
          openai,
          supabase,
          post,
          task,
        });
        if (!productIdentity.passed) {
          const reason =
            productIdentity?.validation?.reason ||
            "The finished Kling video visibly changed the verified product design.";
          await markKlingPostFailed(
            supabase,
            post,
            "kling_finished_product_identity",
            `Kling video rejected before delivery because the verified product changed: ${reason}`
          );
          summary.failed += 1;
          summary.product_identity_rejected += 1;
          continue;
        }

        const finalVideo = await getKlingFinalVideoSource({
          openai,
          supabase,
          post,
          task,
          costTracker,
        });
        await finalizeReadyTask(
          supabase,
          post,
          task,
          finalVideo.videoUrl,
          finalVideo.durationSeconds
        );
        summary.completed += 1;
        if (finalVideo.postprocessApplied) {
          summary.professional_typography_applied =
            Number(summary.professional_typography_applied || 0) + 1;
        }
      } catch (finalizeError) {
        // Do not fail the paid Kling generation just because local post-processing
        // had a temporary error. The successful Kling source was cached before
        // post-processing, so retries do not keep polling the provider.
        console.warn("Kling video finalization failed; cached result will retry after backoff", {
          postId: post.id,
          taskId: post.kling_task_id,
          message: finalizeError?.message || String(finalizeError),
        });
        await supabase.from("posts").update({
          video_status: "finalization_retry",
          video_error: truncate(
            `Kling video is ready but Spreelo has not copied it yet: ${finalizeError?.message || "finalization error"}`,
            1600
          ),
          kling_last_polled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", post.id);
        summary.poll_errors += 1;
      }
    }

    return Response.json({
      ok: true,
      mode: "kling_cached_source_identity_audit_single_finalizer_with_transparent_typography",
      max_pending_hours: maxPendingHours,
      summary,
    });
  } catch (error) {
    console.error("Kling finalizer cron failed", error);
    return Response.json(
      { ok: false, error: error?.message || "Could not finalize Kling videos", summary },
      { status: 500 }
    );
  }
}

import { markKlingProviderTaskTerminal } from "../../../../lib/klingCapacityQueue.js";
import { SCENE_HEADLINE_BRIEF } from '../../../../lib/videoSceneHeadline.js';
import { creativePlanningFailure, CREATIVE_PLAN_TIMEOUT_MS } from '../../../../lib/videoCreativePlanning.js';
import { activeAiModel, withRuntimeAiModels } from '../../../../lib/aiModelControl.js';
import { END_CARD_FRAMING } from '../../../../lib/videoEndCardMaster.js';
import { COMMERCIAL_CONCEPT_VERSION, COMMERCIAL_CONCEPT_BRIEF, COMMERCIAL_CONCEPT_SCHEMA, normalizeCommercialConcept, commercialConceptDirection, separateCommercialWebsite } from '../../../../lib/videoCommercialConcept.js';
import { END_CARD_DESIGN_BRIEF, END_CARD_LAYOUT_POLICY, END_CARD_HOLD_SECONDS, normalizeEndCardHook, endCardEmphasis } from "../../../../lib/videoEndCardBrief.js";
import { inspectVideoComposition, choosePlannedVideoTextBox, adaptVideoTextContrast, adaptEndCardComposition, emptyVideoTypography } from '../../../../lib/videoAdaptiveLayout.js';
import { COMMERCIAL_COPY_HIERARCHY, repeatsAdvertisingMessage, isProductLabelHeadline } from "../../../../lib/videoAdvertisingHierarchy.js";
import { deferKlingRenderContinuation, completedVideoSelection } from "../../../../lib/videoJobSafety.js";
import { videoFailureDetails } from "../../../../lib/videoFailureDiagnostics.js";
import { isKlingCreativeOnlyReview } from "../../../../lib/klingCreativeReview.js";
import { VIDEO_ART_DIRECTION, VIDEO_DESIGN_VERSION } from "../../../../lib/videoArtDirection.js";
import { generateIndependentAdvertisingAssets, ensureExactAdvertisingLettering, buildOfflineAdvertisingBackdrop } from "../../../../lib/videoAdvertisingAssetPipeline.js";
import { CREATIVE_DIRECTOR_BRIEF, creativeCorrectionInstruction } from "../../../../lib/videoCreativeDirector.js";
import { finalizationJobGate, nextFinalizationControl, canRegenerateTypographyAfterKnownRejection } from "../../../../lib/videoProductionController.js";
import { ensureTypographyContrast } from "../../../../lib/animatedTypographyQuality.js";
import { composedAdvertisingSceneFrames, reviewAdvertisingComposition, reviewRenderedAdvertisingVideo, isRecoverableAestheticRejection } from "../../../../lib/videoAdvertisingReview.js";
import { renderReadableAdvertisingLettering, repairReviewedAdvertising, isLocallyRepairableReview } from "../../../../lib/videoAdvertisingReadabilityRepair.js";
import { ensurePreflightAdvertisingTypography } from "../../../../lib/videoTypographyPreflight.js";
import { sendTerminalVideoAdminAlert } from "../../../../lib/videoTerminalAdminAlert.js";
import { verifyAnimatedAdvertisingTypography } from "../../../../lib/animatedAdvertisingCopy.js";
import { KLING_FINALIZER_POST_SELECT, klingAuditReferences, assertKlingAuditReferences, recoverableKlingReferenceFailure, restoreKlingLegacyViewLock } from "../../../../lib/klingAuditReferences.js";
import { KLING_QUALITY_VERSION, klingQualitySampleTimes, inspectKlingVideoQuality, decideKlingVideoQuality } from "../../../../lib/klingVideoIntelligence.js";
import { buildKlingPixelPreservingEdit } from "../../../../lib/klingQualityFallback.js";
import { buildKlingAdvertisingAtlasPrompt, splitKlingAdvertisingAtlas, composeKlingAdvertisingEndCard, composeVideoEndCardLayers, buildFallbackKlingEndCard, buildFallbackKlingEndCardLayers, KLING_END_CARD_SECONDS, KLING_END_CARD_TRANSITION_SECONDS } from "../../../../lib/klingEndCard.js";
import { completeShotstackDeliveryForPost, fetchBrandLogoBufferForOverlay } from "../run-automations/route.js";
import { normalizeKlingLayout, sceneSafeKlingLayout, klingTypographyGeometry, getKlingTextFrameFractions } from "../../../../lib/klingLayout.js";
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
const KLING_TYPOGRAPHY_MODEL = "gpt-image-2.5-flare";
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
    if (raw.includes("visit")) return "Besök vår webbutik";
    if (raw.includes("shop")) return "Se produkten";
    return "Upptäck sortimentet";
  }
  if (raw.includes("contact")) return "Contact us";
  if (raw.includes("book")) return "Book now";
  if (raw.includes("visit")) return "Besök vår webbutik";
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
  const videoUrl = String(selection.kling_source_storage_url || selection.kling_source_url || "").trim();
  if (!videoUrl) return null;
  return {
    status: String(selection.kling_source_status || post?.kling_task_status || "succeeded"),
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
  const control=post?.video_background_selection?.finalization_control;
  if(['waiting_render','waiting_creative'].includes(control?.state)) {
    return new Date(control.next_retry_at||0).getTime()>nowMs;
  }
  const failedAt = new Date(post?.kling_last_polled_at || 0).getTime();
  return Number.isFinite(failedAt) && failedAt > 0 && nowMs - failedAt < KLING_FINALIZATION_RETRY_BACKOFF_MS;
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

async function preserveKlingSourceVideo({ supabase, post, task }) {
  let selection = post.video_background_selection || {};
  if (selection.kling_source_storage_url) return { ...task, videoUrl: selection.kling_source_storage_url, cached: true };
  let buffer;
  try {
    buffer = await downloadKlingVideo(task.videoUrl);
  } catch (error) {
    if (![403, 404, 410].includes(error.httpStatus)) throw error;
    // Refresh a potentially expired download link for the SAME paid task.
    // This is a read-only status lookup, never a replacement generation.
    const refreshed = await getKlingImageToVideoTask(post.kling_task_id);
    if (!isKlingTaskSuccessful(refreshed?.status) || !refreshed.videoUrl) throw error;
    buffer = await downloadKlingVideo(refreshed.videoUrl);
    selection = { ...selection, kling_source_url: refreshed.videoUrl, kling_source_status: refreshed.status };
  }
  const storagePath = `${post.user_id}/${post.id}-kling-source.mp4`;
  const { error: uploadError } = await supabase.storage.from(POST_VIDEOS_BUCKET).upload(storagePath, buffer, { contentType: "video/mp4", upsert: true });
  if (uploadError) throw new Error(`Could not preserve the paid Kling source video: ${uploadError.message}`);
  const { data } = supabase.storage.from(POST_VIDEOS_BUCKET).getPublicUrl(storagePath);
  if (!data?.publicUrl) throw new Error("Could not resolve the saved Kling source-video URL");
  const next = { ...selection, kling_source_storage_url: data.publicUrl, kling_source_storage_path: storagePath, kling_source_preserved_at: new Date().toISOString() };
  await saveKlingQualitySelection(supabase, post, next);
  console.info("Kling source video preserved for admin review", { postId: post.id, taskId: post.kling_task_id, sourceVideoUrl: data.publicUrl });
  return { ...task, videoUrl: data.publicUrl, cached: true };
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

  // Keep durable Rescue work items aligned with asynchronous Kling completion.
  // This is especially important for AI-product-video Rescue, which intentionally
  // returns while the provider task is still running.
  const { error: workItemError } = await supabase
    .from("admin_generation_work_items")
    .update({
      status: "failed",
      failure_stage: stage,
      failure_code: failureCode,
      failure_message: truncate(message, 2000),
      updated_at: nowIso,
    })
    .eq("post_id", postId)
    .eq("status", "running");
  if (workItemError) {
    console.warn("Kling finalizer could not update durable admin work-item failure", {
      postId,
      stage,
      message: workItemError.message,
    });
  }
  if (error || workItemError) throw (error || workItemError);
}

async function markKlingPostFailed(supabase, post, stage, message, failureCode = null, originalError = null) {
  const {data:latest,error:latestError} = await supabase.from('posts').select('video_background_selection').eq('id',post.id).maybeSingle();
  if(latestError) throw latestError;
  if(!latest) throw new Error(`Cannot record Kling failure: post ${post.id} missing`);
  post.video_background_selection = latest.video_background_selection || {};
  const nowIso = new Date().toISOString();
  const safeMessage = truncate(message, 2000);
  const diagnostic = videoFailureDetails(originalError || Object.assign(new Error(safeMessage), {code: failureCode || 'KLING_FINALIZATION_ERROR'}), {provider:'kling', stage, taskId:post.kling_task_id});
  const { error } = await supabase
    .from("posts")
    .update({
      status: "failed",
      admin_review_status: "needs_repair",
      video_status: "failed",
      // A completed, paid Kling provider task remains successful when its
      // *local post-processing* fails. Do not misreport the source as failed.
      kling_task_status: ['kling_video_generation', 'kling_video_timeout', 'kling_video_result'].includes(stage)
        ? 'failed' : (getCachedKlingSource(post) ? 'succeeded' : post.kling_task_status || 'failed'),
      kling_last_polled_at: nowIso,
      video_error: safeMessage,
      video_background_selection: {...post.video_background_selection, failure_diagnostic: diagnostic},
      updated_at: nowIso,
    })
    .eq("id", post.id)
    .eq("video_provider", "kling");

  if (error) throw error;
  const code=failureCode || (stage==='kling_finished_product_identity'?'KLING_FINISHED_PRODUCT_IDENTITY_REJECTED':'KLING_FINALIZATION_ERROR');
  let handoffError = null;
  try { await setReviewCaseFailure(supabase, post.id, stage, safeMessage, code); }
  catch (error) { handoffError = error; }
  // Alerts are best-effort, use durable incident deduplication, and never
  // change a terminal post back to generating because email failed.
  try { await sendTerminalVideoAdminAlert({supabase,post,stage,code,message:safeMessage,diagnostic}); }
  catch(alertError) { console.error('Kling terminal admin alert failed',{postId:post.id,message:alertError?.message}); }
  if (handoffError) throw Object.assign(new Error(`Failure handoff incomplete: ${handoffError.message}`), {cause: originalError || new Error(safeMessage)});
}

async function downloadKlingVideo(videoUrl) {
  const response = await fetch(videoUrl, {
    method: "GET",
    signal: AbortSignal.timeout(45_000),
    redirect: "follow",
    headers: {
      Accept: "video/mp4,video/*;q=0.9,*/*;q=0.5",
      "User-Agent": "Spreelo-Kling-Finalizer/144.25",
    },
  });

  if (!response.ok) {
    const error = new Error(`Kling output download failed (${response.status})`);
    error.httpStatus = response.status;
    throw error;
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

function klingLayoutSchema() {
  return { type: "object", additionalProperties: false,
    properties: { left: { type: "number" }, top: { type: "number" },
      width: { type: "number" }, height: { type: "number" },
      preferredScale: { type: "number" }, alignment: { type: "string", enum: ["left", "center", "right"] } },
    required: ["left", "top", "width", "height", "preferredScale", "alignment"] };
}

async function ensureKlingLogoOverlay({ supabase, post, selection }) {
  if (selection.logo_overlay_url) return selection;
  const { data: brand, error } = await supabase.from("brand_profiles").select("*").eq("id", post.brand_profile_id).maybeSingle();
  if (error) throw error;
  if (!brand?.logo_url && !brand?.logo_storage_path) {
    return { ...selection, logo_overlay_status: "not_available" };
  }
  // Video advertising always uses the company's available original logo,
  // regardless of an inherited include_logo:false on a legacy post.
  const logo = await sharp(await fetchBrandLogoBufferForOverlay(supabase, brand))
    .rotate().trim({ threshold: 10 })
    .resize({ width: 220, height: 100, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  const overlay = await sharp({ create: { width: 1080, height: 1920, channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: logo, left: 78, top: 77 }]).png().toBuffer();
  const storagePath = `${post.user_id}/${post.id}-kling-logo-overlay.png`;
  const { error: uploadError } = await supabase.storage.from(POST_IMAGES_BUCKET).upload(storagePath, overlay, { contentType: "image/png", upsert: true });
  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from(POST_IMAGES_BUCKET).getPublicUrl(storagePath);
  if (!data?.publicUrl) throw new Error("Could not resolve Kling logo overlay URL");
  const next = { ...selection, logo_overlay_url: data.publicUrl, logo_overlay_storage_path: storagePath };
  const { error: saveError } = await supabase.from("posts").update({ video_background_selection: next }).eq("id", post.id);
  if (saveError) throw saveError;
  post.video_background_selection = next;
  return next;
}

async function planFinishedKlingAdvertisingCreative({ openai, post, selection, frames, productReferenceBuffer = null, model = "gpt-5.6-sol" }) {
  const fallbackCopy = selection?.text_overlay_copy || {};
  const fallbackHeadline =
    normalizeKlingCreativeLine(fallbackCopy?.headline, { maxWords: 7, maxChars: 52 }) ||
    normalizeKlingCreativeLine(selection?.verified_product_title, { maxWords: 9, maxChars: 62 }) ||
    "Featured product";
  const fallbackSubheadline = normalizeKlingCreativeLine(fallbackCopy?.subheadline, { maxWords: 5, maxChars: 38 });
  const fallbackCta = normalizeKlingCreativeLine(getFallbackKlingCta(post), { maxWords: 6, maxChars: 40 }) || "Learn more";
  const fallbackPlan = {
    headline: fallbackHeadline,
    closing_headline: fallbackHeadline,
    end_card_emphasis: "",
    subheadline: fallbackSubheadline,
    cta: fallbackCta,
    main_placement: "lower_left",
    cta_placement: "lower_left",
    main_layout: normalizeKlingLayout(null, { left: 64, top: 1160, width: 720, height: 340 }),
    cta_layout: normalizeKlingLayout(null, { left: 64, top: 1320, width: 620, height: 180 }, 0, true),
    main_text_tone: "light",
    cta_text_tone: "light",
    placement_confidence: 0,
    creative_concept: normalizeCommercialConcept(null),
    concept_version: COMMERCIAL_CONCEPT_VERSION,
    source: "deterministic_fallback",
    model,
    model_purpose: "editorial_headline",
  };
  if (!openai || !Array.isArray(frames) || frames.length === 0) return fallbackPlan;

  const productTitle = String(selection?.verified_product_title || "verified product").trim();
  const context = selection?.music_context || {};
  const postCopy = String(post?.content || context?.post_copy || "").slice(0, 1200);
  const content = [{
    type: "input_text",
    text:
      `Plan the on-video advertising copy and placement for the finished 9:16 product commercial for "${productTitle}". ` +
      `The first image is the AUTHORITATIVE PRODUCT REFERENCE when supplied; all following images are frames from the FINISHED delivered video. The reference establishes product identity and meaning; only the video frames establish text placement and protected rectangles. Existing social caption: ${JSON.stringify(postCopy)}. ` +
      `CTA setting: ${JSON.stringify(post?.cta_type || "Learn more")}. Campaign goal: ${JSON.stringify(context?.goal || "")}. ` +
      `Company identity for the end card: ${JSON.stringify(selection?.end_card_brand_context || {})}. Product category: ${JSON.stringify(context?.product_category || "")}. ` +
      `Verified product identity/use (data): ${JSON.stringify({description:String(selection?.verified_product_description||"").slice(0,1800),subject:selection?.reference_safety?.productIntelligence?.physical_subject,visible_identity:selection?.reference_safety?.productIntelligence?.visible_identity})}. ` +
      COMMERCIAL_CONCEPT_BRIEF + " " + SCENE_HEADLINE_BRIEF + " " +
      "Write all visible words in the language of the caption; both headlines must be complete and at most 48 characters / 6 words. Subheadline should normally be empty; never put a domain or catalogue descriptor there. cta is a short product-specific closing invitation, max 58 characters / 7 words, without a button or invented clickable-video feature. closing_headline resolves the idea; end_card_emphasis is an exact phrase within it. design_direction is concrete production guidance, not extra visible words. " +
      "Compute protected_regions as the UNION of full product, physical print, faces and hands across ALL finished-video frames. Plan main_layout on a 1080x1920 canvas: left>=64, right<=1016, top>=340, bottom<=1536, width520–920, height140–500. Reserve y60–180 for the authentic corner logo and avoid social controls. The headline must remain clear of moving subjects over the WHOLE interval. Choose placement/alignment/font weight for an intentionally prominent readable composition. cta_layout and cta_placement are legacy metadata: the invitation belongs on the separate ending, never over the moving product. " +
      "The original product reference is available: " + Boolean(productReferenceBuffer) + ". With a usable physical-product reference, design a complete closing hero image containing the product, background and lettering together, not a separate product overlay. Without it, do not guess a product from the film; use the verified facts for a relevant environment-led ending. Keep each concept field to one concise sentence; return only the required JSON, no commentary.",
  }];
  if (productReferenceBuffer) {
    content.push({type:"input_text",text:"AUTHORITATIVE PRODUCT REFERENCE: identity and message evidence only; not a video-layout frame."});
    content.push({type:"input_image",image_url:`data:image/png;base64,${productReferenceBuffer.toString("base64")}`,detail:"high"});
  }
  content.push({type:"input_text",text:"FINISHED VIDEO FRAMES: compute protected regions across this sequence, excluding the separate product reference."});
  for (const frame of frames) {
    content.push({
      type: "input_image",
      image_url: `data:image/jpeg;base64,${frame.buffer.toString("base64")}`,
      detail: "high",
    });
  }
  const previousPlanningAttempts = Number(selection?.creative_planning_control?.attempts || 0);
  let planningAttempt = previousPlanningAttempts;
  try {
    for (let copyAttempt = 1; copyAttempt + previousPlanningAttempts <= 2; copyAttempt += 1) {
      planningAttempt = previousPlanningAttempts + copyAttempt;
      const response = await openai.responses.create({
        model,
        ...(/^gpt-[56](?:[.-]|$)/i.test(model) ? {reasoning:{effort:"medium"}} : {}),
        input: [{ role: "user", content }],
        max_output_tokens: /^gpt-[56](?:[.-]|$)/i.test(model) ? 4800 : 2600,
        text: {
          format: {
            type: "json_schema",
            name: "kling_finished_ad_creative_plan",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                creative_concept: COMMERCIAL_CONCEPT_SCHEMA,
                design_direction: { type: "string" },
                headline: { type: "string" },
                subheadline: { type: "string" },
                cta: { type: "string" },
                closing_headline: { type: "string" },
                end_card_emphasis: { type: "string" },
                main_placement: { type: "string", enum: Object.keys(KLING_FINISHED_TYPOGRAPHY_PLACEMENTS) },
                cta_placement: { type: "string", enum: Object.keys(KLING_FINISHED_TYPOGRAPHY_PLACEMENTS) },
                main_text_tone: { type: "string", enum: ["light", "dark"] },
                cta_text_tone: { type: "string", enum: ["light", "dark"] },
                protected_regions: {type:"array",minItems:1,maxItems:16,items:{type:"object",additionalProperties:false,properties:{left:{type:"number"},top:{type:"number"},width:{type:"number"},height:{type:"number"}},required:["left","top","width","height"]}},
                main_layout: klingLayoutSchema(),
                cta_layout: klingLayoutSchema(),
                placement_confidence: { type: "number", minimum: 0, maximum: 1 },
              },
              required: [
                "creative_concept", "design_direction", "headline", "subheadline", "cta", "closing_headline", "end_card_emphasis", "main_placement", "cta_placement",
                "main_text_tone", "cta_text_tone", "placement_confidence", "main_layout", "cta_layout", "protected_regions"
              ],
            },
          },
        },
      }, { timeout: CREATIVE_PLAN_TIMEOUT_MS, maxRetries: 0 });
      const parsed = JSON.parse(getOpenAiTextOutput(response));
      const headline = normalizeKlingCreativeLine(parsed?.headline, { maxWords: 6, maxChars: 48 }) || fallbackHeadline;
      const repeatsProduct = isProductLabelHeadline(headline, productTitle);
      if(repeatsProduct && planningAttempt < 2) {
        content[0].text += ` Your previous proposal was ${JSON.stringify(headline)}. It repeats the product label instead of adding an advertising idea. Rewrite it as one complete product-relevant invitation using only supplied facts, and return the full schema with the same protected regions.`;
        continue;
      }
      const proposedSubheadline = normalizeKlingCreativeLine(parsed?.subheadline, { maxWords: 5, maxChars: 36 });
      const subheadline = (repeatsAdvertisingMessage(headline, proposedSubheadline) || repeatsAdvertisingMessage(productTitle, proposedSubheadline)) ? "" : proposedSubheadline;
      const cta = normalizeKlingCreativeLine(separateCommercialWebsite(parsed?.cta,selection?.end_card_brand_context?.website_url).invitation, { maxWords: 7, maxChars: 58 }) || fallbackCta;
      const concept=normalizeCommercialConcept(parsed?.creative_concept);
      return {
        creative_concept: concept,
        concept_version: COMMERCIAL_CONCEPT_VERSION,
        design_direction: commercialConceptDirection(concept,parsed?.design_direction),
        headline,
        closing_headline: normalizeEndCardHook(parsed?.closing_headline,headline),
        end_card_emphasis: endCardEmphasis(parsed?.end_card_emphasis,normalizeEndCardHook(parsed?.closing_headline,headline)),
        subheadline,
        cta,
        main_placement: KLING_FINISHED_TYPOGRAPHY_PLACEMENTS[parsed?.main_placement] ? parsed.main_placement : fallbackPlan.main_placement,
        cta_placement: KLING_FINISHED_TYPOGRAPHY_PLACEMENTS[parsed?.cta_placement] ? parsed.cta_placement : fallbackPlan.cta_placement,
        main_text_tone: parsed?.main_text_tone === "dark" ? "dark" : "light",
        cta_text_tone: parsed?.cta_text_tone === "dark" ? "dark" : "light",
        placement_confidence: Math.max(0, Math.min(1, Number(parsed?.placement_confidence) || 0)),
        main_layout: normalizeKlingLayout(parsed?.main_layout, getKlingPlacementBox(parsed?.main_placement), parsed?.placement_confidence),
        protected_regions: parsed?.protected_regions || [],
        video_design_version: VIDEO_DESIGN_VERSION,
        cta_layout: normalizeKlingLayout(parsed?.cta_layout, getKlingPlacementBox(parsed?.cta_placement, "lower_left"), parsed?.placement_confidence, true),
        copy_planning_attempts: copyAttempt,
        copy_feedback: repeatsProduct ? "Product-label fallback retained once; no creative review hold" : null,
        source: "finished-video-creative-plan-v373",
        planning_attempts: planningAttempt,
        model,
        model_purpose: "editorial_headline",
      };
    }
  } catch (error) {
    const control=creativePlanningFailure(error,{attempt:planningAttempt,model});
    console.warn("Kling creative planning request did not complete",{postId:post?.id,...control});
    if(control.status==='retry_pending') throw Object.assign(new Error(control.last_error.message),
      {code:'KLING_CREATIVE_PLAN_PENDING',planningControl:control});
    return {...fallbackPlan,creative_planning_control:control,planning_attempts:planningAttempt,
      creative_concept:normalizeCommercialConcept({product_anchor:productTitle,
        product_truth:String(selection?.verified_product_description||productTitle).slice(0,350),
        campaign_idea:postCopy.slice(0,200),
        background_brief:'Use a relevant real setting for the verified product and company. Show the referenced product clearly with its design unobstructed, separate from a large expressive hook; no unrelated landscape.',
        closing_subject:productReferenceBuffer?'person_or_product':'environment',
        closing_subject_reason:productReferenceBuffer?'Make the exact product recognizable after the short moving demonstration.':'',
        closing_typography:'Large expressive display lettering, high lightness contrast, a meaningful complementary accent and a subordinate invitation.'})};
  }
}


async function validateFinishedKlingProductIdentity({ openai, supabase, post, task }) {
  const selection = post?.video_background_selection;
  if (!selection || typeof selection !== "object" || Array.isArray(selection)) throw new Error("Kling quality metadata is missing");
  const existing = selection.product_video_validation;
  // Cache only this audit version for this exact provider task and source. A
  // historical identity-only pass cannot bypass the new event inspector.
  if (existing?.version === KLING_QUALITY_VERSION && existing.task_id === post.kling_task_id && existing.source_url === task.videoUrl && ["passed", "failed"].includes(existing.status)) {
    return { passed: existing.status === "passed", cached: true, validation: existing };
  }
  const { productRequired, productUrl: productImageUrl, sceneUrl: sceneImageUrl, viewLock } = assertKlingAuditReferences(post);
  const durationSeconds = normalizeVideoDurationSeconds(task.durationSeconds, post.video_duration_seconds, 6);
  const timesSeconds = klingQualitySampleTimes(durationSeconds, selection.scene_trim_start_seconds);
  const [productDataUrl, sceneDataUrl, frames] = await Promise.all([
    productRequired ? fetchKlingVerifiedProductReferenceDataUrl(productImageUrl) : null,
    fetchKlingVerifiedProductReferenceDataUrl(sceneImageUrl),
    sampleRemoteVideoFrames({ videoUrl: task.videoUrl, durationSeconds, timesSeconds }),
  ]);
  if (frames?.length < 12) throw new Error("Kling quality audit frame sequence is incomplete");
  const parsed = await inspectKlingVideoQuality({
    openai, model: KLING_PRODUCT_IDENTITY_AUDIT_MODEL,
    productTitle: selection.verified_product_title || "engagement concept",
    productDataUrl, sceneDataUrl, viewLock, frames,
    intelligence: selection.reference_safety?.productIntelligence || null,
    motionPlan: selection.reference_safety?.motionPlan || null,
  });
  const checkCreativeMotion = productRequired && Number(selection.reference_safety?.motionPlan?.version || 0) >= 346;
  const decision = decideKlingVideoQuality(parsed, { productRequired, checkCreativeMotion });
  const validation = {
    ...parsed, ...decision, version: KLING_QUALITY_VERSION,
    status: decision.passed ? "passed" : "failed",
    checked_at: new Date().toISOString(), model: KLING_PRODUCT_IDENTITY_AUDIT_MODEL,
    task_id: post.kling_task_id, source_url: task.videoUrl,
    audit_scope: "ordered_sampled_frames",
    sampled_frames: frames.map(frame => Number(frame.time.toFixed(3))),
    reason: String(parsed.reason || "quality_audit_uncertain").trim(),
  };
  const nextSelection = { ...selection, product_video_validation: validation, quality_decision: decision.decision };
  const { error } = await supabase.from("posts").update({ video_background_selection: nextSelection, updated_at: new Date().toISOString() }).eq("id", post.id).eq("video_provider", "kling");
  if (error) throw new Error(`Could not persist Kling quality audit: ${error.message}`);
  post.video_background_selection = nextSelection;
  console.info("Kling product and event quality inspection completed", { postId: post.id, taskId: post.kling_task_id, ...decision, confidence: parsed.confidence, sampledFrames: frames.length });
  return { passed: decision.passed, cached: false, validation };
}

async function saveKlingQualitySelection(supabase, post, selection) {
  const { error } = await supabase.from("posts").update({ video_background_selection: selection, updated_at: new Date().toISOString() }).eq("id", post.id).eq("video_provider", "kling");
  if (error) throw new Error(`Could not checkpoint safe animation: ${error.message}`);
  post.video_background_selection = selection;
}

async function getKlingQualityFallbackSource({ supabase, post, costTracker }) {
  let selection = post.video_background_selection;
  let fallback = selection.quality_fallback || {};
  if (!selection.verified_product_image_url) throw new Error("Safe product animation requires the authoritative product reference");
  if (fallback.status === "ready" && fallback.video_url) return { status: "succeeded", videoUrl: fallback.video_url, durationSeconds: 6, qualityFallback: true };
  if (fallback.status === "submission_unknown" || (fallback.status === "submitting" && !fallback.render_id)) {
    const error = new Error("Safe animation submission outcome is unknown. Reconcile it in admin before any new render; no automatic resubmission was made.");
    error.code = "QUALITY_FALLBACK_SUBMISSION_UNKNOWN";
    throw error;
  }
  if (!fallback.frame_url) {
    // Compose locally using the FULL original photograph. Do not use the
    // AI-created scene, the rejected video, a generated cutout or a redraw.
    const originalDataUrl = await fetchKlingVerifiedProductReferenceDataUrl(selection.verified_product_image_url);
    const original = Buffer.from(originalDataUrl.split(",")[1], "base64");
    const frame = await sharp(original).resize({ width: 880, height: 1150, fit: "contain", background: "#f4f6fb" }).png().toBuffer();
    const path = `${post.user_id}/${post.id}-quality-safe-original.png`;
    const { error } = await supabase.storage.from(POST_IMAGES_BUCKET).upload(path, frame, { contentType: "image/png", upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from(POST_IMAGES_BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) throw new Error("Could not preserve safe original-image animation asset");
    fallback = { ...fallback, frame_url: data.publicUrl, frame_storage_path: path };
  }
  if (!fallback.render_id) {
    fallback = { ...fallback, status: "submitting", kind: "pixel_preserving_animation", original_task_id: post.kling_task_id, started_at: new Date().toISOString() };
    await saveKlingQualitySelection(supabase, post, { ...selection, quality_fallback: fallback });
    try {
      const renderId = await queueShotstackRender(buildKlingPixelPreservingEdit({ imageUrl: fallback.frame_url }));
      fallback = { ...fallback, status: "rendering", render_id: renderId };
      await saveKlingQualitySelection(supabase, post, { ...selection, quality_fallback: fallback });
    } catch (error) {
      // If queueing succeeded but checkpointing failed, the persisted submitting
      // claim still blocks a second paid render. Never solve ambiguity by retry.
      const blocked = new Error(`Safe animation needs reconciliation after submission: ${error.message}`);
      blocked.code = "QUALITY_FALLBACK_SUBMISSION_UNKNOWN";
      blocked.cause = error;
      throw blocked;
    }
  }
  const render = await waitForShotstackRender({ renderId: fallback.render_id, maxAttempts: 8, delayMs: 2500 });
  if (costTracker?.recordShotstack) {
    try { await costTracker.recordShotstack({ renderId: fallback.render_id, billableSeconds: render.billableSeconds, plan: render.plan, environment: render.environment }); }
    catch (error) { console.warn("Safe animation cost recording deferred", { postId: post.id, message: error.message }); }
  }
  fallback = { ...fallback, status: "ready", video_url: render.url, completed_at: new Date().toISOString() };
  selection = { ...post.video_background_selection, quality_fallback: fallback, scene_trim_start_seconds: 0.05, overlay_start_seconds: 1.0 };
  await saveKlingQualitySelection(supabase, post, selection);
  return { status: "succeeded", videoUrl: render.url, durationSeconds: 6, qualityFallback: true };
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

async function uploadKlingEndCardFrame({ supabase, post, buffer, suffix = "kling-end-card" }) {
  const storagePath = `${post.user_id}/${post.id}-${suffix}-v342.png`;
  const { error } = await supabase.storage.from(POST_IMAGES_BUCKET)
    .upload(storagePath, buffer, { contentType: "image/png", upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from(POST_IMAGES_BUCKET).getPublicUrl(storagePath);
  if (!data?.publicUrl) throw new Error("Could not create public URL for Kling end card");
  return { imageUrl: data.publicUrl, storagePath };
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
  // GPT-Image-2.5 Flare currently returns a portrait canvas that is not exactly 9:16.
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
    throwKlingTypographyValidationError("GPT-Image-2.5 Flare Kling typography was visually empty", normalized, analysis);
  }
  // A transparent overlay may legitimately contain a headline plus a compact
  // underline/brush/flourish. Do not reject that just because it crosses the
  // old 22% occupancy threshold. Reject only clear background-like output.
  if (visibleRatio > 0.42) {
    throwKlingTypographyValidationError("GPT-Image-2.5 Flare Kling typography contained a background-sized opaque area", normalized, analysis);
  }
  if (bboxAreaRatio > 0.18 && bboxFillRatio > 0.72) {
    throwKlingTypographyValidationError("GPT-Image-2.5 Flare Kling typography contained a large opaque panel-like area", normalized, analysis);
  }
  if (lowAlphaRatio > 0.18) {
    throwKlingTypographyValidationError("GPT-Image-2.5 Flare Kling typography contained excessive translucent haze", normalized, analysis);
  }
  if (edgeRatio > 0.12) {
    throwKlingTypographyValidationError("GPT-Image-2.5 Flare Kling typography touched the canvas edge", normalized, analysis);
  }
  return { buffer: normalized, ...analysis };
}


async function placeFinishedKlingTypographyInSafeArea(buffer, placement, layout = null) {
  const box = layout || normalizeKlingLayout(null, getKlingPlacementBox(placement));
  const trimmed = await sharp(buffer)
    .rotate()
    .ensureAlpha()
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const artwork = await sharp(trimmed)
    .resize({
      width: Math.max(120, Math.round(box.width * box.preferredScale)),
      height: Math.max(100, Math.round(box.height * box.preferredScale)),
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
  const { left, top } = klingTypographyGeometry(box, width, height);
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
    normalizeKlingCreativeLine(creativePlan?.cta, { maxWords: 6, maxChars: 40 }) ||
    normalizeKlingCreativeLine(getFallbackKlingCta(post), { maxWords: 6, maxChars: 40 });
  if (!cta) return selection;
  const placement = creativePlan?.cta_placement || "lower_left";
  const box = creativePlan?.cta_layout || normalizeKlingLayout(null, getKlingPlacementBox(placement, "lower_left"), 0, true);

  if (sourceBuffer) {
    const normalized = await placeFinishedKlingTypographyInSafeArea(sourceBuffer, placement, box);
    const uploaded = await uploadKlingCtaOverlay({ supabase, post, buffer: normalized.buffer });
    return {
      ...selection,
      cta_overlay_url: uploaded.imageUrl,
      cta_overlay_storage_path: uploaded.storagePath,
      cta_overlay_provider: "gpt-image-2.5-flare-shared-overlay-split",
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

  // The fallback is lettering, never a fake interactive pill or arrow.
  const textLayout = layoutDeterministicTypography(cta, {
    maxWidth: box.width * box.preferredScale,
    maxLines: 2,
    sizes: [64, 60, 56, 52, 48, 44],
  });
  const family = escapeProductSvg(getProductTypographyProfile(cta)?.family || "Noto Sans");
  const direction = getProductTypographyProfile(cta)?.direction === "rtl" ? "rtl" : "ltr";
  const lightText = creativePlan?.cta_text_tone !== "dark";
  const fill = lightText ? "#FFFFFF" : "#111827";
  const stroke = lightText ? "#111827" : "#FFFFFF";
  const anchor = box.alignment === "center" ? "middle" : box.alignment === "right" ? "end" : "start";
  const x = box.left + (box.alignment === "center" ? box.width / 2 : box.alignment === "right" ? box.width : 0);
  const top = box.top + Math.max(0, box.height - textLayout.lines.length * textLayout.lineHeight) / 2;
  const lines = textLayout.lines.map((line, i) => `<text x="${x}" y="${top + textLayout.fontSize + i * textLayout.lineHeight}" text-anchor="${anchor}" font-family="${family}, Noto Sans, sans-serif" font-size="${textLayout.fontSize}" font-weight="800" fill="${fill}" stroke="${stroke}" stroke-width="2" paint-order="stroke fill" direction="${direction}" unicode-bidi="plaintext">${escapeProductSvg(line)}</text>`).join("");
  const svg = `<svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">${lines}</svg>`;
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
    main_placement: "lower_left",
    cta_placement: "lower_left",
    main_layout: normalizeKlingLayout(null, { left: 64, top: 1160, width: 720, height: 340 }),
    cta_layout: normalizeKlingLayout(null, { left: 64, top: 1320, width: 620, height: 180 }, 0, true),
    main_text_tone: "light",
    cta_text_tone: "light",
    placement_confidence: 0,
    source: "fallback_without_scene_plan",
  };
  const normalized = await placeFinishedKlingTypographyInSafeArea(
    rendered,
    creativePlan.main_placement,
    creativePlan.main_layout
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

async function createFinishedKlingTypographyOnce({ openai, supabase, post, task, selection, brand = {}, logoBuffer = null }) {
  if (selection?.text_overlay_url) return selection;
  const status = String(selection?.text_overlay_status || "").trim();
  if(status === "blocked_layout") throw Object.assign(new Error(selection.text_overlay_error || "No sufficiently clear region for advertising typography"), {code:"KLING_TYPOGRAPHY_LAYOUT_UNSAFE"});
  if (status === "generating") {
    const startedAt = new Date(selection?.text_overlay_generation_started_at || 0).getTime();
    const stale = !Number.isFinite(startedAt) || startedAt <= 0 || Date.now() - startedAt >= KLING_FINALIZATION_LEASE_MS;
    if (!stale) {
      throw new Error("Kling typography generation is still inside its active finalization lease.");
    }
    throw Object.assign(new Error('GPT Image request outcome is unknown. Keep the original Kling source and reconcile in admin; do not replace professional typography with generic SVG.'),
      {code:'KLING_TYPOGRAPHY_SUBMISSION_UNKNOWN'});
  }
  if (status === "failed") {
    throw Object.assign(new Error(`GPT Image advertising design was not approved: ${selection?.text_overlay_error||'previous attempt failed'}`),
      {code:'KLING_TYPOGRAPHY_DESIGN_FAILED'});
  }
  const copy = selection?.text_overlay_copy || {};
  const fallbackHeadline = String(copy?.headline || "").trim();
  const fallbackSubheadline = String(copy?.subheadline || "").trim();
  if (!fallbackHeadline) throw new Error("Kling typography exact headline is missing");

  const claimedSelection = {
    ...selection,
    text_overlay_status: "planning",
    text_overlay_generation_started_at: new Date().toISOString(),
    text_overlay_generation_attempts: 1,
  };
  let workingSelection = claimedSelection;
  const { error: claimError } = await supabase
    .from("posts")
    .update({ video_background_selection: claimedSelection, updated_at: new Date().toISOString() })
    .eq("id", post.id)
    .eq("video_provider", "kling");
  if (claimError) throw new Error(`Could not claim the single GPT-Image-2.5 Flare typography generation: ${claimError.message}`);

  try {
    const durationSeconds = normalizeVideoDurationSeconds(task.durationSeconds, post.video_duration_seconds, 6);
    const frames = await sampleRemoteVideoFrames({
      videoUrl: task.videoUrl,
      durationSeconds,
      // Five frames cover the actual headline display interval after trim.
      fractions: getKlingTextFrameFractions(durationSeconds, selection),
    });

    // Fetch once, before choosing copy/concept, and reuse for image identity.
    // Retailer outages do not hold an already generated paid movie: verified
    // title/intelligence and actual frames remain available to the same planner.
    let productReferenceBuffer = null;
    const productImageUrl = String(selection?.verified_product_image_url || "").trim();
    if (productImageUrl) {
      try {
        const response = await fetch(productImageUrl, {headers:{Accept:"image/*"},redirect:"follow",signal:AbortSignal.timeout(12000)});
        if (!response.ok) throw new Error(`Product reference HTTP ${response.status}`);
        productReferenceBuffer = await sharp(Buffer.from(await response.arrayBuffer())).rotate()
          .resize({width:1024,height:1024,fit:"inside",withoutEnlargement:true}).png().toBuffer();
      } catch(error) {
        console.warn("Creative product reference unavailable; retaining verified facts and movie",{postId:post.id,message:String(error?.message||error).slice(0,180)});
      }
    }
    const creativePlan = workingSelection.ad_creative_plan?.source === "finished-video-creative-plan-v373"
      ? workingSelection.ad_creative_plan : await planFinishedKlingAdvertisingCreative({
      model:activeAiModel("editorial_headline",process.env.EDITORIAL_HEADLINE_MODEL||"gpt-5.6-sol"),
      productReferenceBuffer,
      openai,
      post,
      selection: {
        ...workingSelection,
        end_card_brand_context: { name: brand.business_name, industry: brand.industry, colors: brand.brand_colors || brand.colors || brand.primary_color, description: brand.brand_description || brand.description || brand.business_description, audience:brand.target_audience, website_url:brand.website_url||post.website_url },
        text_overlay_copy: { headline: fallbackHeadline, subheadline: fallbackSubheadline },
      },
      frames,
    });
    const headline = creativePlan.headline || fallbackHeadline;
    const subheadline = creativePlan.subheadline || "";
    const closingHeadline = creativePlan.closing_headline || headline;
    workingSelection = {
      ...workingSelection,
      ad_creative_plan: creativePlan,
      creative_planning_control:creativePlan.creative_planning_control||{
        ...workingSelection.creative_planning_control,status:'completed',attempts:creativePlan.planning_attempts||1,model:creativePlan.model,next_retry_at:null},
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
    if (productReferenceBuffer) {
      referenceFiles.push(await toFile(productReferenceBuffer, "verified-product-reference.png", { type: "image/png" }));
    }
    const prompt = buildKlingAdvertisingAtlasPrompt({
      headline, subheadline,
      closingLine: creativePlan.cta || getFallbackKlingCta(post),
      designDirection: creativePlan.design_direction,
      brand, hasLogo: Boolean(logoBuffer),
    });
    // Mark the paid IMAGE boundary only after text planning. A lost planning
    // invocation must not be mistaken for an unknown image-provider outcome.
    workingSelection={...workingSelection,text_overlay_status:'generating',
      text_overlay_generation_started_at:new Date().toISOString()};
    const {error:imageClaimError}=await supabase.from('posts').update({
      video_background_selection:workingSelection,updated_at:new Date().toISOString()
    }).eq('id',post.id).eq('video_provider','kling');
    if(imageClaimError)throw imageClaimError;
    // A single cached Kling movie, up to two KNOWN-outcome paid typography
    // attempts. Never repeat after unknown API outcome or on an unavailable reviewer.
    let approvedArtwork = null;
    let designFeedback = null;
    let cachedIndependentBackground = null;
    let cachedIndependentMaster = false;
    let cachedIndependentFraming = null;
    let compositionInspection = null;
    for (let designAttempt = 1; designAttempt <= 2; designAttempt += 1) {
      const attemptPrompt = designAttempt === 1 ? prompt : `${prompt}\n${creativeCorrectionInstruction(designFeedback)}`;
      if (designAttempt > 1) {
        workingSelection = {
          ...workingSelection,
          text_overlay_generation_attempts: designAttempt,
          text_overlay_correction_reason: truncate(designFeedback?.message || 'Visual quality repair', 500),
        };
        const { error: retryCheckpointError } = await supabase.from('posts').update({
          video_background_selection: workingSelection, updated_at: new Date().toISOString(),
        }).eq('id', post.id).eq('video_provider', 'kling');
        if (retryCheckpointError) throw new Error(`Cannot checkpoint second design attempt: ${retryCheckpointError.message}`);
      }
      try {
        // v348: independent end-card background, hero typography and CTA.
        // When the image model embeds a solid panel, restore the *AI-selected*
        // typography with exact-word vector lettering, not a generic template.
        // Unknown provider outcomes are NOT re-sent automatically.
        let splitOverlay = await generateIndependentAdvertisingAssets({
          openai, model:KLING_TYPOGRAPHY_MODEL, referenceFiles, productReferenceFiles:productReferenceBuffer?[await toFile(productReferenceBuffer,"authoritative-product.png",{type:"image/png"})]:[],
          headline, subheadline, closingLine:creativePlan.cta||getFallbackKlingCta(post),
          creativeConcept:creativePlan.creative_concept,closingHeadline,closingEmphasis:creativePlan.end_card_emphasis,sceneBackground:frames[0]?.buffer,renderEndCardMaster:true,masterFraming:END_CARD_FRAMING,websiteUrl:brand.website_url||post.website_url,
          designDirection:designAttempt===1?creativePlan.design_direction:`${creativePlan.design_direction}. ${creativeCorrectionInstruction(designFeedback)}`,
          brand, hasLogo:Boolean(logoBuffer),
          cachedBackground:cachedIndependentBackground,cachedMaster:cachedIndependentMaster,cachedMasterFraming:cachedIndependentFraming,
          onBackground:async(buffer,metadata)=>{cachedIndependentBackground=buffer;cachedIndependentMaster=metadata?.isMaster===true;cachedIndependentFraming=metadata?.framing||null;},
        });
        if (!splitOverlay.closingText) throw new Error('End card is missing GPT Image CTA lettering');
        // If GPT-image renders a misspelled (yet transparent) headline, repair
        // only the typography, retain its independent background and run the
        // exact-word audit again. No second provider image call is required.
        ({assets:splitOverlay}=await ensureExactAdvertisingLettering({
          assets:splitOverlay,headline,subheadline,
          closingLine:creativePlan.cta||getFallbackKlingCta(post),
          designDirection:creativePlan.design_direction,brand,
          verify:(main,cta)=>verifyAnimatedAdvertisingTypography({
            openai,model:KLING_PRODUCT_IDENTITY_AUDIT_MODEL,
            buffer:main,headline:[headline,subheadline].filter(Boolean).join(' '),
            closingBuffer:cta,closingLine:creativePlan.cta||getFallbackKlingCta(post),
          }),
        }));
        compositionInspection ||= await inspectVideoComposition({openai,sceneFrames:frames.map(frame=>frame.buffer),endCard:splitOverlay.endCard});
        const sceneChoice=await choosePlannedVideoTextBox({frames:frames.map(frame=>frame.buffer),plan:creativePlan,inspection:compositionInspection});
        creativePlan.scene_protection_source="planner_and_composition_regions_v369";
        creativePlan.scene_headline_omitted=!sceneChoice;
        if(sceneChoice)creativePlan.main_layout=sceneChoice.box;
        const combinedOverlay = await normalizeFinishedKlingTypography(splitOverlay.headline);
        const normalized = sceneChoice ? await placeFinishedKlingTypographyInSafeArea(
          combinedOverlay.buffer, creativePlan.main_placement, creativePlan.main_layout
        ) : {buffer:await emptyVideoTypography(),visibleRatio:0,strongRatio:0,lowAlphaRatio:0,edgeRatio:0,bboxWidthRatio:0,bboxHeightRatio:0,bboxAreaRatio:0,bboxFillRatio:0};
        // Per-pixel contrast is diagnostic only. A vision reviewer sees the
        // actual composited scene and rejects genuinely unreadable designs.
        const contrast = sceneChoice ? await ensureTypographyContrast({
          overlayBuffer:normalized.buffer,backgroundBuffers:frames.map(frame=>frame.buffer),
          textBox:creativePlan.main_layout,preserveDesign:true,
        }) : {buffer:normalized.buffer,analysis:{sceneHeadlineOmitted:true}};
        const initialLayers = await composeVideoEndCardLayers({
          background:splitOverlay.endCard,masterArtwork:splitOverlay.endCardMaster,closingText:splitOverlay.closingText,
          headlineArtwork:splitOverlay.headline,headline:closingHeadline,
          layoutPolicy:END_CARD_LAYOUT_POLICY,backgroundSource:splitOverlay.backgroundSource,designDirection:creativePlan.design_direction,
          websiteUrl:brand.website_url||post.website_url,emphasisText:creativePlan.end_card_emphasis,
          productLabel:selection?.verified_product_title||"",
          closingLine:creativePlan.cta||getFallbackKlingCta(post),brand,logoBuffer,
          language:post.language,preserveDesign:true,includeSender:false,
        });
        const layers=await adaptEndCardComposition({layers:initialLayers,inspection:compositionInspection,sceneBackground:frames.at(-1)?.buffer,
          quietBackground:()=>buildOfflineAdvertisingBackdrop({designDirection:creativePlan.design_direction,brand})});
        const videoBackgrounds=frames.map(frame=>frame.buffer);
        const verifyScene=async({overlay,endCard:card})=>reviewAdvertisingComposition({
          openai,model:KLING_PRODUCT_IDENTITY_AUDIT_MODEL,
          frames:await composedAdvertisingSceneFrames(videoBackgrounds,overlay),
          endCard:card,headline,endCardHeadline:closingHeadline,closingLine:creativePlan.cta||getFallbackKlingCta(post),sceneHeadlineOmitted:!sceneChoice,allowReviewServiceOutage:true,typographyPreflightPassed:true,
        });
        // v144.350: verify the ACTUAL final-resolution glyph height before
        // compositing and keep the existing approved Kling source untouched.
        const preflight=sceneChoice ? await ensurePreflightAdvertisingTypography({
          overlay:contrast.buffer,backgroundFrames:videoBackgrounds,
          box:creativePlan.main_layout,text:[headline,subheadline].filter(Boolean).join(' '),
          designDirection:creativePlan.design_direction,brand,
        }) : {buffer:contrast.buffer,locallyRebuilt:false};
        const sceneContrast=sceneChoice ? await adaptVideoTextContrast({overlay:preflight.buffer,frames:videoBackgrounds,box:creativePlan.main_layout,preservePalette:true}) : {buffer:preflight.buffer,analysis:{omitted:true}};
        contrast.analysis={...contrast.analysis,adaptive:sceneContrast.analysis};
        let approvedOverlay=sceneContrast.buffer;
        let approvedReview;
        let approvedLayers=layers;
        let localRepair=preflight.locallyRebuilt ? preflight.rebuildAnalysis : null;
        try {
          approvedReview=await verifyScene({overlay:approvedOverlay,endCard:layers.cardBuffer});
        } catch(designError) {
          if(!isLocallyRepairableReview(designError))throw designError;
          // Keep the paid, identity-verified Kling film. Fix the concrete
          // readability/layout defect locally and REQUIRE another visual review.
          const corrected=await repairReviewedAdvertising({error:designError,
            frames:videoBackgrounds,headline:[headline,subheadline].filter(Boolean).join(' '),
            box:creativePlan.main_layout,designDirection:creativePlan.design_direction,
            brand,closingLine:creativePlan.cta||getFallbackKlingCta(post),
            renderEndCard:async({variant,issue,reason})=>{
              if(issue!=='unfinished_end_card' && !/closing|end.card|cta/i.test(reason))return layers;
              const fixedCta=await renderReadableAdvertisingLettering({
                text:creativePlan.cta||getFallbackKlingCta(post),backgroundFrames:[splitOverlay.endCard],
                box:{left:75,top:770,width:930,height:380},
                designDirection:creativePlan.design_direction,brand,variant,
              });
              return adaptEndCardComposition({layers:await composeVideoEndCardLayers({background:splitOverlay.endCard,masterArtwork:splitOverlay.endCardMaster,
                headlineArtwork:splitOverlay.headline,headline:closingHeadline,
                layoutPolicy:END_CARD_LAYOUT_POLICY,backgroundSource:splitOverlay.backgroundSource,designDirection:creativePlan.design_direction,
                websiteUrl:brand.website_url||post.website_url,emphasisText:creativePlan.end_card_emphasis,
                productLabel:selection?.verified_product_title||"",
                closingText:fixedCta.buffer,closingLine:creativePlan.cta||getFallbackKlingCta(post),
                brand,logoBuffer,language:post.language,preserveDesign:true,includeSender:false}),inspection:compositionInspection,sceneBackground:frames.at(-1)?.buffer,
                quietBackground:()=>buildOfflineAdvertisingBackdrop({designDirection:creativePlan.design_direction,brand})});
            },
            verify:verifyScene,
          });
          approvedOverlay=corrected.overlay;approvedLayers=corrected.endCard;
          approvedReview=corrected.review;localRepair=corrected.repair;
        }
        approvedArtwork={splitOverlay,combinedOverlay,normalized,
          contrast:{...contrast,buffer:approvedOverlay},layers:approvedLayers,review:approvedReview,
          localRepair,prompt:attemptPrompt,designAttempt};
        break;
      } catch (designError) {
        if (!canRegenerateTypographyAfterKnownRejection(designError, designAttempt)) throw designError;
        designFeedback = designError;
        console.warn('Kling creative director requested one targeted typography correction', {
          postId: post.id, designAttempt, code: designError?.code || null,
          reason: truncate(designError?.message, 450),
        });
      }
    }
    if (!approvedArtwork) throw Object.assign(new Error('No approved finished-video typography after bounded correction'),{code:'KLING_TYPOGRAPHY_DESIGN_FAILED'});
    const {splitOverlay,combinedOverlay,normalized,contrast,layers,review} = approvedArtwork;
    const uploaded = await uploadKlingTypographyOverlay({ supabase, post, buffer: contrast.buffer });
    const endCard=await uploadKlingEndCardFrame({supabase,post,buffer:layers.cardBuffer});
    const endBackground=await uploadKlingEndCardFrame({supabase,post,buffer:layers.backgroundBuffer,suffix:"kling-end-background"});
    const endText=await uploadKlingEndCardFrame({supabase,post,buffer:layers.foregroundBuffer,suffix:"kling-end-text"});
    let completedSelection = {
      ...workingSelection,
      video_design_version: VIDEO_DESIGN_VERSION,
      ad_creative_plan: creativePlan,
      composition_inspection: compositionInspection,
      logo_placement: 'corner_only',
      end_card_layout: layers.layout,
      end_card_background_url: endBackground.imageUrl,
      end_card_text_url: endText.imageUrl,
      end_card_url: endCard.imageUrl,
      end_card_storage_path: endCard.storagePath,
      end_card_prompt: splitOverlay.endCardPrompt,
      end_card_reference_mode: splitOverlay.backgroundReferenceMode,
      end_card_reference_count: splitOverlay.backgroundReferenceCount,
      end_card_framing: splitOverlay.endCardFraming || null,
      end_card_provider: layers.isMaster?'gpt-image-complete-end-card-v365':layers.layout?.adaptive?.backgroundSource==='designed_fallback' ? "designed-background-fallback-v363" : "gpt-image-independent-background-v363",
      advertising_typography_mode:splitOverlay.typographyMode,
      end_card_seconds: END_CARD_HOLD_SECONDS,
      end_card_brand_name: brand.business_name || null,
      end_card_has_logo: false,
      end_card_includes_sender: Boolean(layers.hasSender),
      end_card_is_master: layers.isMaster===true,
      end_card_background_bounds: splitOverlay.backgroundBounds,
      end_card_text_alignment: "center_within_verified_region",
      text_overlay_url: uploaded.imageUrl,
      text_overlay_storage_path: uploaded.storagePath,
      text_overlay_provider: splitOverlay.typographyMode?.headline === "ai_brief_vector_recovery" ? "ai-directed-vector-lettering-v348" : "gpt-image-2.5-flare-independent-lettering-v348",
      text_overlay_prompt: approvedArtwork.prompt,
      text_overlay_local_repair: approvedArtwork.localRepair || null,
      creative_director_version: VIDEO_DESIGN_VERSION,
      text_overlay_approved_attempt: approvedArtwork.designAttempt,
      text_overlay_status: "ready",
      text_overlay_generated_at: new Date().toISOString(),
      text_overlay_analysis: {
        design_review: review,
        contrast: contrast.analysis,
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
    const { error: persistError } = await supabase
      .from("posts")
      .update({ video_background_selection: completedSelection, updated_at: new Date().toISOString() })
      .eq("id", post.id)
      .eq("video_provider", "kling");
    if (persistError) throw new Error(`Could not persist finished Kling typography: ${persistError.message}`);
    console.info("Finished-video independent advertising assets approved", {
      postId: post.id,
      headline,
      hasSubheadline: Boolean(subheadline),
      cta: creativePlan.cta || completedSelection.cta_overlay_copy || null,
      closingHeadline,conceptVersion:creativePlan.concept_version,
      campaignIdea:creativePlan.creative_concept?.campaign_idea||null,
      backgroundReferenceMode:splitOverlay.backgroundReferenceMode,
      backgroundSource:layers.layout?.adaptive?.backgroundSource,
      mainPlacement: creativePlan.main_placement,
      ctaPlacement: creativePlan.cta_placement,
      placementConfidence: creativePlan.placement_confidence,
      referenceFrames: frames.length,
      provider: completedSelection.text_overlay_provider,
      artworkModes:splitOverlay.typographyMode,
    });
    return completedSelection;
  } catch (error) {
    if(error?.code==='KLING_CREATIVE_PLAN_PENDING') {
      const next={...workingSelection,text_overlay_status:'pending',text_overlay_generation_started_at:null,
        creative_planning_control:error.planningControl};
      const {error:saveError}=await supabase.from('posts').update({video_background_selection:next,
        updated_at:new Date().toISOString()}).eq('id',post.id).eq('video_provider','kling');
      if(saveError)throw saveError;
      post.video_background_selection=next;
      throw error;
    }
    if (/No sufficiently clear region/.test(error?.message || "")) {
      const blocked={...workingSelection,text_overlay_status:"blocked_layout",text_overlay_error:error.message};
      await supabase.from("posts").update({video_background_selection:blocked,updated_at:new Date().toISOString()}).eq("id",post.id);
      throw Object.assign(error,{code:"KLING_TYPOGRAPHY_LAYOUT_UNSAFE"});
    }
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
    // Never disguise an under-designed GPT Image asset with a generic SVG
    // text layer. Preserve failed status and the original Kling film for review.
    throw Object.assign(new Error(`AI advertising typography needs review; source Kling film preserved: ${error?.message || error}`),
      {code:error?.code||'KLING_TYPOGRAPHY_DESIGN_FAILED',cause:error});
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

async function ensureKlingEndCard({ supabase, post, selection, brand, logoBuffer }) {
  if(selection.end_card_url) return selection;
  const layers=await buildFallbackKlingEndCardLayers({brand,logoBuffer,language:post.language,
    closingLine:selection.ad_creative_plan?.cta||selection.cta_overlay_copy||getFallbackKlingCta(post),includeSender:false});
  const uploaded=await uploadKlingEndCardFrame({supabase,post,buffer:layers.cardBuffer});
  const bg=await uploadKlingEndCardFrame({supabase,post,buffer:layers.backgroundBuffer,suffix:"kling-end-background"});
  const text=await uploadKlingEndCardFrame({supabase,post,buffer:layers.foregroundBuffer,suffix:"kling-end-text"});
  const next={...selection,end_card_url:uploaded.imageUrl,end_card_storage_path:uploaded.storagePath,
    end_card_background_url:bg.imageUrl,end_card_text_url:text.imageUrl,video_design_version:VIDEO_DESIGN_VERSION,
    end_card_provider:"deterministic-cached-typography-fallback-v342",end_card_seconds:KLING_END_CARD_SECONDS,
    end_card_has_logo:false,end_card_brand_name:brand.business_name||null};
  const {error}=await supabase.from("posts").update({video_background_selection:next}).eq("id",post.id);
  if(error) throw error;
  return next;
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

  const { data: brandProfile, error: brandError } = await supabase.from("brand_profiles").select("*").eq("id", post.brand_profile_id).maybeSingle();
  if (brandError) throw brandError;
  const brand = brandProfile || { business_name: postprocess.music_context?.business_name || "" };
  const logoBuffer = (brand.logo_url || brand.logo_storage_path)
    ? await fetchBrandLogoBufferForOverlay(supabase, brand) : null;

  postprocess = await createFinishedKlingTypographyOnce({
    openai,
    supabase,
    post,
    task,
    selection: postprocess,
    brand, logoBuffer,
  });

  const durationSeconds = normalizeVideoDurationSeconds(
    task.durationSeconds,
    post.video_duration_seconds,
    6
  );
  // Keep the paid 341 source and safety instructions unchanged. Its planned
  // final hold is replaced by the moving end card in the advertising edit.
  const plannedFinish=Number(postprocess.reference_safety?.motionPlan?.finish_seconds);
  const motionEndSeconds=!postprocess.quality_fallback && Number.isFinite(plannedFinish) && plannedFinish>=3
    ? Math.min(durationSeconds,plannedFinish) : durationSeconds;
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
      Math.max(0.8, motionEndSeconds - trimStartSeconds - 0.8),
      Number(postprocess.overlay_start_seconds ?? 1.5) || 1.5
    )
  );
  let renderId = String(postprocess.shotstack_render_id || "").trim() || null;
  let nextSelection = postprocess;

  if (!renderId) {
    // An earlier invocation might already have submitted a paid Shotstack
    // render but crashed before its ID was checkpointed. Never submit again.
    if (postprocess.shotstack_submission_status === 'submitting') {
      const error = new Error('Shotstack submission outcome is unknown. Preserve the Kling source and resolve the existing render in admin.');
      error.code = 'SHOTSTACK_SUBMISSION_UNKNOWN';
      throw error;
    }
    if (postprocess.quality_fallback && postprocess.quality_postprocess_submission === "submitting") {
      const error = new Error("Safe animation advertising render has an unknown submission outcome. Reconcile it before ordering another render.");
      error.code = "QUALITY_FALLBACK_SUBMISSION_UNKNOWN";
      throw error;
    }
    postprocess = await ensureKlingEndCard({ supabase, post, selection: postprocess, brand, logoBuffer });
    const closingHoldSeconds = postprocess.video_design_version>=363 ? END_CARD_HOLD_SECONDS : KLING_END_CARD_SECONDS;
    const deliveredMotionDurationSeconds = Math.max(2.5, motionEndSeconds - trimStartSeconds);
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
    postprocess = await ensureKlingLogoOverlay({ supabase, post, selection: postprocess });
    const edit = buildVideoOverlayEdit({
      videoUrl: task.videoUrl,
      textOverlayUrl: postprocess.text_overlay_url,
      ctaOverlayUrl: null,
      logoOverlayUrl: postprocess.logo_overlay_url || null,
      endCardIncludesSender: postprocess.end_card_includes_sender === true,
      endCardIsMaster: postprocess.end_card_is_master === true,
      closingFrameUrl: null,
      endCardUrl: postprocess.end_card_url,
      endCardBackgroundUrl: postprocess.end_card_background_url || null,
      endCardTextUrl: postprocess.end_card_text_url || null,
      endCardTransitionSeconds: postprocess.video_design_version >= 361 ? 0.12 : KLING_END_CARD_TRANSITION_SECONDS,
      durationSeconds: motionEndSeconds,
      overlayStartSeconds,
      trimStartSeconds,
      closingHoldSeconds,
      musicUrl: musicSelection?.url || null,
      musicDurationSeconds: musicSelection?.durationSeconds || null,
      musicTrimStartSeconds: musicSelection?.trimStartSeconds || null,
      musicVolume: musicSelection?.volume ?? 0.5,
    });
    // Persist BEFORE provider call. Ambiguous submission outcomes require
    // reconciliation, never blindly ordering the same paid render again.
    postprocess = {
      ...postprocess,
      shotstack_submission_status:'submitting',
      shotstack_submission_started_at:new Date().toISOString(),
      ...(postprocess.quality_fallback ? {quality_postprocess_submission:'submitting'} : {}),
    };
    await saveKlingQualitySelection(supabase, post, postprocess);
    try {
      renderId = await queueShotstackRender(edit);
    } catch (error) {
      throw Object.assign(new Error(error.message), {code:postprocess.quality_fallback ? 'QUALITY_FALLBACK_SUBMISSION_UNKNOWN' : 'SHOTSTACK_SUBMISSION_UNKNOWN',cause:error});
    }
    nextSelection = {
      ...postprocess,
      shotstack_submission_status:'submitted',
      ...(postprocess.quality_fallback ? { quality_postprocess_submission: "submitted" } : {}),
      scene_trim_start_seconds: trimStartSeconds,
      overlay_start_seconds: overlayStartSeconds,
      scene_motion_end_seconds: motionEndSeconds,
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
      shotstack_closing_hero_applied: false,
      shotstack_end_card_applied: Boolean(postprocess.end_card_url),
      shotstack_logo_applied: Boolean(postprocess.logo_overlay_url),
      shotstack_cta_overlay_applied: false,
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
      const error = new Error(
        `Professional Kling typography render ${renderId} was queued but its id could not be saved: ${persistError.message || "unknown database error"}`
      );
      error.code = postprocess.quality_fallback ? 'QUALITY_FALLBACK_SUBMISSION_UNKNOWN' : 'SHOTSTACK_SUBMISSION_UNKNOWN';
      throw error;
    }
    post.video_background_selection = nextSelection;
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

  // v144.354: old subjective rejections must not become permanent locks on a
  // completed render. Reinspect the SAME Shotstack ID; never buy a second film.
  if(nextSelection.shotstack_design_review?.status==='rejected') {
    const reason=nextSelection.shotstack_design_review?.reason||'';
    if(!isRecoverableAestheticRejection(reason)) {
      throw Object.assign(new Error('Rendered Kling advertisement has a concrete visual-integrity defect; repair without resubmitting Kling.'),
        {code:'KLING_RENDER_DESIGN_REJECTED'});
    }
    nextSelection={...nextSelection,shotstack_design_review:{status:'advisory_recovered',reason,at:new Date().toISOString(),render_id:renderId}};
  }
  const render = await waitForShotstackRender({
    renderId,
    maxAttempts: 5,
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


  let finishedDesignReview;
  try {
    finishedDesignReview=await reviewRenderedAdvertisingVideo({openai,videoUrl:render.url,
      durationSeconds:nextSelection.delivered_duration_seconds||6,sampleFrames:sampleRemoteVideoFrames,model:KLING_PRODUCT_IDENTITY_AUDIT_MODEL,
      headline:postprocess.text_overlay_copy?.headline||'',endCardHeadline:postprocess.ad_creative_plan?.closing_headline||'',closingLine:postprocess.ad_creative_plan?.cta||'',
      sceneHeadlineOmitted:postprocess.ad_creative_plan?.scene_headline_omitted===true,
      allowReviewServiceOutage:true,typographyPreflightPassed:true,deliveryFirstRender:true});
  } catch(error) {
    const rejected={...nextSelection,shotstack_design_review:{status:'rejected',reason:String(error.message).slice(0,800),
      review:error.review||null,at:new Date().toISOString(),render_id:renderId,render_url:render.url}};
    const {error:reviewPersistError}=await supabase.from('posts').update({video_background_selection:rejected,updated_at:new Date().toISOString()}).eq('id',post.id).eq('video_provider','kling');
    if(!reviewPersistError) post.video_background_selection=rejected;
    throw Object.assign(new Error(`Final Kling advertising render needs review: ${error.message}${reviewPersistError ? `; could not save review checkpoint: ${reviewPersistError.message}` : ''}`),
      {code:'KLING_RENDER_DESIGN_REJECTED',cause:error,renderId,checkpointError:reviewPersistError||null});
  }


  const completedSelection = {
    ...nextSelection,
    shotstack_design_review:{status:finishedDesignReview?.reviewStatus||'approved',
      ...(finishedDesignReview?.creativeFeedback ? {creativeFeedback:finishedDesignReview.creativeFeedback}:{}),
      requiresFollowup:Boolean(finishedDesignReview?.requiresFollowup),at:new Date().toISOString(),render_id:renderId},
    shotstack_render_id: renderId,
    shotstack_status: "done",
    shotstack_completed_at: new Date().toISOString(),
  };
  const { error: completedPersistError } = await supabase
    .from("posts")
    .update({
      video_background_selection: completedSelection,
      updated_at: new Date().toISOString(),
    })
    .eq("id", post.id)
    .eq("video_provider", "kling");

  if (completedPersistError) throw new Error(`Could not checkpoint completed advertising render: ${completedPersistError.message}`);
  post.video_background_selection = completedSelection;

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
        Math.max(2.5, motionEndSeconds - trimStartSeconds)
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
      video_render_id: post.video_background_selection?.quality_fallback?.status === "ready"
        ? post.video_background_selection.shotstack_render_id || post.video_background_selection.quality_fallback.render_id
        : post.kling_task_id,
      ...(post.video_background_selection?.quality_fallback?.status === "ready" ? {
        video_provider: "shotstack",
        image_url: post.video_background_selection.quality_fallback.frame_url,
        image_storage_path: post.video_background_selection.quality_fallback.frame_storage_path,
      } : {}),
      kling_task_status: task.status || "succeeded",
      kling_completed_at: nowIso,
      kling_last_polled_at: nowIso,
      // posts.video_duration_seconds is an INTEGER column. Keep the exact
      // post-processed duration in video_background_selection.delivered_duration_seconds,
      // but normalize the summary column to a whole second before persistence.
      video_background_selection: completedVideoSelection(post.video_background_selection,nowIso),
      video_duration_seconds: normalizeVideoDurationSeconds(
        finalDurationSeconds,
        task.durationSeconds,
        post.video_duration_seconds,
        6
      ),
      video_error: null,
      status: "pending_approval",
      admin_review_status: "pending",
      updated_at: nowIso,
    })
    .eq("id", post.id)
    .eq("video_provider", "kling")
    .eq("kling_task_id", post.kling_task_id);

  if (updateError) throw updateError;
  try {
    const delivery = await completeShotstackDeliveryForPost({ supabase, postId: post.id });
    console.info("Kling completed-video delivery", { postId: post.id, ...delivery });
  } catch (deliveryError) {
    console.error("Completed Kling video awaiting delivery; ready result retained", {postId:post.id,message:deliveryError?.message});
  }
  // A ready video stays ready on delivery errors. The durable delivery cron
  // retries only delivery; it never orders another Kling or Shotstack render.
  return publicUrl;
}

export async function GET(request) {
  if (!isAuthorized(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  return withRuntimeAiModels(async () => {
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
    const batchStartedAt = Date.now();
    const pendingStatuses = [...KLING_PROVIDER_PENDING_STATUSES, "finalizing", "finalization_retry"];
    const { data: posts, error } = await supabase
      .from("posts")
      .select(KLING_FINALIZER_POST_SELECT)
      .eq("video_provider", "kling")
      .or(`video_status.in.(${pendingStatuses.join(",")}),and(video_status.eq.failed,video_background_selection->>kling_source_url.not.is.null,or(video_error.ilike.*reference prerequisites are missing*,video_error.ilike.*Kling generation did not finish*))`)
      .not("kling_task_id", "is", null)
      .order("kling_submitted_at", { ascending: true, nullsFirst: true })
      .limit(10);

    if (error) throw error;

    for (const post of posts || []) {
      if (Date.now() - batchStartedAt > 180_000) {
        summary.batch_budget_reached = true;
        break;
      }
      summary.checked += 1;
      try {
      if (post.video_status === "failed" && !recoverableKlingReferenceFailure(post)) continue;

      // Local post-processing retries are intentionally slower than the cron.
      // A transient Shotstack/storage/etc. problem must not be hammered every
      // minute. Successful Kling output is already cached at this point.
      const productionGate = finalizationJobGate(post);
      if (productionGate.action === 'review') {
        // Repairing a rejected GPT Image design requires a new explicit admin
        // decision, not another cron loop with identical inputs.
        const previousFailure = post.video_background_selection?.finalization_control;
        await markKlingPostFailed(supabase, post, productionGate.stage,
          previousFailure?.last_error_message || post.video_error || productionGate.reason,
          previousFailure?.last_error_code || null);
        summary.failed += 1;
        summary.needs_repair = Number(summary.needs_repair || 0) + 1;
        continue;
      }
      const nextPoll = new Date(post.video_background_selection?.provider_poll_control?.next_retry_at || 0).getTime();
      if (nextPoll > Date.now() || productionGate.action === 'defer' || finalizationRetryBackoffIsFresh(post)) {
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

      let task = getCachedKlingSource(post);
      const now = new Date();
      const submittedAtMs = new Date(post.kling_submitted_at || 0).getTime();
      const ageHours = Number.isFinite(submittedAtMs)
        ? (now.getTime() - submittedAtMs) / 3_600_000
        : 0;

      if (!task && submittedAtMs > 0 && ageHours > maxPendingHours) {
        const message = `Kling generation did not finish within ${maxPendingHours} hours. Last status error: ${post.video_background_selection?.provider_poll_control?.last_error?.message || "none recorded"}. No automatic retry was made; this post has already used its one allowed Kling generation.`;
        await markKlingPostFailed(supabase, post, "kling_video_timeout", message);
        summary.failed += 1;
        summary.timed_out += 1;
        continue;
      }

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
        const diagnostic = videoFailureDetails(pollError, {provider:'kling',stage:'kling_status_poll',taskId:post.kling_task_id});
        if ([401,403].includes(diagnostic.http_status)) {
          await markKlingPostFailed(supabase, post, 'kling_status_poll', diagnostic.message, diagnostic.code, pollError);
          summary.failed += 1;
          continue;
        }
        const attempts = Number(post.video_background_selection?.provider_poll_control?.attempts || 0) + 1;
        const nextRetryAt = new Date(Date.now() + Math.min(30 * 60_000, 60_000 * 2 ** Math.min(attempts - 1, 5))).toISOString();
        const {error:pollSaveError} = await supabase.from("posts").update({
          video_status: "processing",
          video_error: truncate(`${diagnostic.message} Next status check: ${nextRetryAt}. Existing Kling task retained.`, 1600),
          video_background_selection: {...post.video_background_selection, provider_poll_control:{attempts,next_retry_at:nextRetryAt,last_error:diagnostic}},
          kling_last_polled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", post.id);
        if (pollSaveError) throw pollSaveError;
        summary.poll_errors += 1;
        continue;
      }

      const providerStatus = String(task?.status || "unknown").toLowerCase();
      if (isKlingTaskSuccessful(providerStatus) || isKlingTaskFailed(providerStatus)) {
        await markKlingProviderTaskTerminal(supabase,post.id,providerStatus);
      }
      // A successful status read clears only polling diagnostics, not design checkpoints.
      post.video_background_selection = {...post.video_background_selection, provider_poll_control:null};
      const nowIso = new Date().toISOString();
      const {error:statusSaveError} = await supabase.from("posts").update({
        kling_task_status: providerStatus,
        video_error: null,
        video_background_selection: post.video_background_selection,
        kling_last_polled_at: nowIso,
        video_status:
          KLING_PROVIDER_PENDING_STATUSES.includes(providerStatus)
            ? providerStatus
            : isKlingTaskSuccessful(providerStatus)
              ? "finalizing"
              : post.video_status,
        updated_at: nowIso,
      }).eq("id", post.id);

      if (statusSaveError) throw statusSaveError;

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
        task = await preserveKlingSourceVideo({ supabase, post, task });
        await restoreKlingLegacyViewLock({ supabase, post });
        const productIdentity = await validateFinishedKlingProductIdentity({
          openai,
          supabase,
          post,
          task,
        });
        let deliveryTask = task;
        const creativeOnly=isKlingCreativeOnlyReview(productIdentity.validation);
        if(creativeOnly||productIdentity.validation.creative_feedback) {
          summary.creative_feedback=Number(summary.creative_feedback||0)+1;
          console.info('Kling creative feedback recorded; finishing saved source with normal customer routing', {postId:post.id,taskId:post.kling_task_id});
        }
        if (!productIdentity.passed) {
          const reason = productIdentity.validation.reason || "Finished video quality failed";
          if(!creativeOnly) {
            summary.product_identity_rejected += 1;
            if (productIdentity.validation.decision !== "pixel_preserving_animation") {
              await markKlingPostFailed(supabase, post, "kling_finished_product_identity",
                `Kling event-quality inspection rejected the video: ${reason}`, 'KLING_FINISHED_PRODUCT_IDENTITY_REJECTED');
              summary.failed += 1;
              continue;
            }
            deliveryTask = await getKlingQualityFallbackSource({ supabase, post, costTracker });
            summary.safe_animation_fallbacks = Number(summary.safe_animation_fallbacks || 0) + 1;
          }
        }
        const finalVideo = await getKlingFinalVideoSource({ openai, supabase, post, task: deliveryTask, costTracker });
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
        if(finalizeError?.code==='KLING_CREATIVE_PLAN_PENDING') {
          const next={...post.video_background_selection,finalization_control:{
            ...post.video_background_selection?.finalization_control,state:'waiting_creative',
            next_retry_at:finalizeError.planningControl.next_retry_at,provider_regeneration_allowed:false}};
          const {error:saveError}=await supabase.from('posts').update({video_status:'finalization_retry',
            video_background_selection:next,video_error:'Creative text planning timed out; automatic bounded continuation scheduled. Saved Kling movie retained.',
            kling_last_polled_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',post.id);
          if(saveError)throw saveError;
          summary.deferred+=1;
          continue;
        }
        if (finalizeError?.code === 'SHOTSTACK_RENDER_PENDING') {
          try {
            await deferKlingRenderContinuation({supabase,post,error:finalizeError});
            summary.deferred += 1;
            continue;
          } catch (continuationError) {
            finalizeError = continuationError;
          }
        }
        if (finalizeError?.code === "KLING_AUDIT_REFERENCES_MISSING") {
          const selection = { ...post.video_background_selection, quality_reference_repair: { status: "needs_repair", missing: finalizeError.missingReferences || [], message: finalizeError.message, checked_at: new Date().toISOString() } };
          await saveKlingQualitySelection(supabase, post, selection);
          await markKlingPostFailed(supabase, post, "kling_quality_references", finalizeError.message);
          summary.reference_repairs_required = Number(summary.reference_repairs_required || 0) + 1;
          summary.failed += 1;
          continue;
        }
        if (finalizeError?.code === "QUALITY_FALLBACK_SUBMISSION_UNKNOWN" || (post.video_background_selection?.quality_fallback && finalizeError?.code === "SHOTSTACK_RENDER_FAILED")) {
          await markKlingPostFailed(supabase, post, "kling_safe_animation_render", finalizeError.message, finalizeError.code, finalizeError);
          summary.failed += 1;
          continue;
        }
        // Read latest state: previous helpers may have persisted the Kling
        // source, approved artwork, Shotstack ID or a rejected artwork.
        // Never overwrite those checkpoints with a stale cron snapshot.
        const {data:latestPost,error:checkpointReadError} = await supabase
          .from('posts').select('video_background_selection').eq('id',post.id).maybeSingle();
        if (checkpointReadError) throw Object.assign(new Error(`Could not read finalization checkpoint: ${checkpointReadError.message}; original failure: ${finalizeError.message}`), {cause:finalizeError});
        const latestSelection=latestPost?.video_background_selection || post.video_background_selection || {};
        const decision=nextFinalizationControl({
          current:latestSelection.finalization_control || {},
          selection:latestSelection,
          error:finalizeError,
        });
        const nowIso=new Date().toISOString();
        const checkpoint={...latestSelection, finalization_control:decision.control};
        const {error:checkpointError}=await supabase.from('posts').update({
          video_background_selection:checkpoint, updated_at:nowIso,
        }).eq('id',post.id).eq('video_provider','kling');
        if (checkpointError) throw Object.assign(new Error(`Could not save finalization checkpoint: ${checkpointError.message}; original failure: ${finalizeError.message}`), {cause:finalizeError});
        post.video_background_selection = checkpoint;
        if (decision.terminal) {
          await markKlingPostFailed(supabase,post,decision.stage,
            `Kling video preserved; finalization stopped after ${decision.control.attempts} attempt(s). ${decision.failure.message}`,decision.failure.code,finalizeError);
          summary.failed += 1;
          summary.needs_repair = Number(summary.needs_repair || 0) + 1;
          console.error('Kling finalization stopped for admin review, source retained', {
            postId:post.id,taskId:post.kling_task_id,errorCode:decision.failure.code,
            attempts:decision.control.attempts,stage:decision.stage,
          });
          continue;
        }
        // Only transient errors with known, safe continuation paths can retry;
        // progressive delay and a maximum attempt count are durable per post.
        const {error:retryPersistError}=await supabase.from('posts').update({
          video_status:'finalization_retry',
          video_error:truncate(`Kling film saved; temporary finalization error (attempt ${decision.control.attempts}/${decision.control.max_attempts}): ${decision.failure.message}`,1600),
          kling_last_polled_at:nowIso,updated_at:nowIso,
        }).eq('id',post.id).eq('video_provider','kling');
        if (retryPersistError) throw retryPersistError;
        console.warn('Kling finalization deferred with durable bounded retry', {
          postId:post.id,taskId:post.kling_task_id,attempts:decision.control.attempts,
          nextRetryAt:decision.control.next_retry_at,errorCode:decision.failure.code,
        });
        summary.poll_errors += 1;
      }
      } catch (jobError) {
        summary.job_errors = Number(summary.job_errors || 0) + 1;
        console.error("Kling finalizer job interrupted; remaining jobs continue", {postId:post.id, taskId:post.kling_task_id, message:jobError?.message});
        try {
          await sendTerminalVideoAdminAlert({supabase,post,stage:'kling_job_interrupted',code:jobError?.code || 'KLING_JOB_INTERRUPTED',message:jobError?.message || String(jobError)});
        } catch (incidentError) {
          console.error("Kling job incident could not be saved", {postId:post.id,message:incidentError?.message});
        }
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
    try {
      await sendTerminalVideoAdminAlert({supabase:createSupabaseAdmin(),post:{},stage:'kling_batch',code:error?.code || 'KLING_FINALIZER_CRON_FAILED',message:error?.message || String(error)});
    } catch (incidentError) { console.error('Kling batch incident unavailable',{message:incidentError?.message}); }
    return Response.json(
      { ok: false, error: error?.message || "Could not finalize Kling videos", summary },
      { status: 500 }
    );
  }
  });
}

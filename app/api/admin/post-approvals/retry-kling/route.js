import crypto from "crypto";
import { adminContextError, getAdminContext } from "../../../../../lib/adminAuth";
import { submitKlingImageToVideo } from "../../../../../lib/kling.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const AUDIT_STAGE = "kling_finished_product_identity";
const AUDIT_CODE = "KLING_FINISHED_PRODUCT_IDENTITY_REJECTED";

function buildRetryPrompt(originalPrompt) {
  const base = String(originalPrompt || "").trim();
  const retryLock = `
ADMIN RETRY PRODUCT LOCK — NON-NEGOTIABLE:
- Keep the referenced product visually identical in every frame.
- Every visible component keeps the same purpose, attachment, geometry and mechanical state. Never turn an existing panel, fabric part, cover, seam, cap, handle or other component into a different feature or accessory.
- Preserve every visible logo, emblem, letter, number, label graphic, printed mark and color character-for-character. Never redraw, simplify, substitute or reinterpret label text or brand marks.
- Do not expose an unseen side or surface of the product. Do not invent controls, openings, accessories, mechanisms or product details.
- If exact product preservation conflicts with motion, keep the product visually rigid and create motion with the camera, people, lighting and environment instead.

ADMIN RETRY SCENE CONTINUITY LOCK — NON-NEGOTIABLE:
- Treat the opening frame as one fixed real-world set filmed continuously by a real camera.
- Static visible furniture, benches, signs, lamps, plants, architecture, paths, ground features and background structures must persist in stable world-space positions. Never make them appear, disappear, morph, relocate or swap.
- A static object may become newly visible only when camera movement naturally reveals an area that was previously outside frame. Never add an object to an area already shown empty.
- People, animals, vehicles and moving props may enter or leave only by continuous physical movement or plausible occlusion. No pop-in, pop-out, teleporting, duplication or unexplained disappearance.
- If spectacle conflicts with continuity, simplify the action and preserve the fixed physical scene.
`.trim();
  return `${retryLock}\n\nORIGINAL CREATIVE DIRECTION:\n${base}`.trim().slice(0, 2500);
}

function cleanSelection(selection) {
  const source = selection && typeof selection === "object" ? selection : {};
  return {
    mode: source.mode || "kling_professional_advertising_postprocess",
    reference_safety: source.reference_safety || null,
    natural_start_background: source.natural_start_background || null,
    verified_product_image_url: source.verified_product_image_url || null,
    verified_product_source_url: source.verified_product_source_url || null,
    verified_product_title: source.verified_product_title || null,
    music_context: source.music_context || null,
    text_overlay_url: null,
    text_overlay_storage_path: null,
    text_overlay_provider: null,
    text_overlay_prompt: null,
    text_overlay_status: "waiting_for_finished_video",
    text_overlay_copy: source.text_overlay_copy || null,
    opening_scene_mode: source.opening_scene_mode || null,
    scene_trim_start_seconds: source.scene_trim_start_seconds ?? null,
    overlay_start_seconds: source.overlay_start_seconds ?? null,
    shotstack_render_id: null,
    shotstack_status: "waiting_for_kling",
    admin_retry_of_post_id: source.admin_retry_of_post_id || null,
  };
}

export async function POST(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);

  const body = await request.json().catch(() => ({}));
  const postId = String(body?.post_id || "").trim();
  if (!postId) {
    return Response.json({ ok: false, error: "A failed Kling post ID is required." }, { status: 400 });
  }

  const { data: post, error: postError } = await context.admin
    .from("posts")
    .select("*")
    .eq("id", postId)
    .maybeSingle();
  if (postError || !post) {
    return Response.json({ ok: false, error: postError?.message || "Post not found." }, { status: 404 });
  }

  const { data: reviewCase } = await context.admin
    .from("admin_review_cases")
    .select("*")
    .eq("post_id", postId)
    .maybeSingle();

  const audit = post?.video_background_selection?.product_video_validation || null;
  const rejectedByFinishedAudit =
    String(reviewCase?.failure_stage || "") === AUDIT_STAGE ||
    String(reviewCase?.failure_code || "") === AUDIT_CODE ||
    String(audit?.status || "") === "failed";

  if (
    String(post.video_provider || "").toLowerCase() !== "kling" ||
    String(post.video_status || "").toLowerCase() !== "failed" ||
    !rejectedByFinishedAudit
  ) {
    return Response.json(
      { ok: false, error: "Only a Kling video rejected by the finished-video product identity audit can be retried here." },
      { status: 409 }
    );
  }

  const referenceImageUrl = String(post.kling_reference_image_url || post.image_url || "").trim();
  const originalPrompt = String(post.kling_prompt || "").trim();
  const selection = cleanSelection(post.video_background_selection);
  if (!referenceImageUrl || !originalPrompt || !selection.verified_product_image_url) {
    return Response.json(
      { ok: false, error: "The rejected video is missing its verified Kling reference material and cannot be retried safely." },
      { status: 409 }
    );
  }

  const retryPrompt = buildRetryPrompt(originalPrompt);
  const approvalToken = crypto.randomBytes(32).toString("hex");
  const nowIso = new Date().toISOString();

  const { data: newPost, error: insertError } = await context.admin
    .from("posts")
    .insert({
      user_id: post.user_id,
      brand_profile_id: post.brand_profile_id,
      automation_rule_id: post.automation_rule_id,
      content: post.content,
      platform: post.platform || null,
      tone: post.tone || null,
      language: post.language || null,
      post_type: post.post_type || null,
      content_type_id: post.content_type_id || null,
      website_url: post.website_url || null,
      length: post.length || null,
      include_emojis: post.include_emojis !== false,
      include_hashtags: post.include_hashtags !== false,
      cta_type: post.cta_type || null,
      source: "automation_admin_kling_retry",
      source_label: "Kling video retried from verified post material",
      status: "generating",
      approval_required: true,
      approval_token: approvalToken,
      approved_at: null,
      admin_review_status: "pending",
      scheduled_for: post.scheduled_for || null,
      image_url: referenceImageUrl,
      image_storage_path: post.image_storage_path || null,
      image_status: "ready",
      image_prompt: post.image_prompt || null,
      content_format: post.content_format || "animated_video",
      admin_product_items: Array.isArray(post.admin_product_items) ? post.admin_product_items : [],
      video_provider: "kling",
      video_status: "submitting",
      video_duration_seconds: post.video_duration_seconds || 6,
      video_error: null,
      kling_prompt: retryPrompt,
      kling_reference_image_url: referenceImageUrl,
      video_background_selection: {
        ...selection,
        admin_retry_of_post_id: post.id,
      },
      include_logo: false,
      logo_url: null,
      text_model_used: post.text_model_used || null,
      image_model_used: post.image_model_used || null,
      product_research_model_used: post.product_research_model_used || null,
      updated_at: nowIso,
    })
    .select("*")
    .single();

  if (insertError || !newPost) {
    return Response.json({ ok: false, error: insertError?.message || "Could not create the Kling retry post." }, { status: 500 });
  }

  try {
    const { data: claimed, error: claimError } = await context.admin.rpc(
      "claim_kling_video_generation",
      { p_post_id: newPost.id }
    );
    if (claimError) throw new Error(claimError.message || "Could not claim Kling generation.");
    if (claimed !== true) throw new Error("The new retry post could not claim its one allowed Kling generation.");

    const submission = await submitKlingImageToVideo({
      imageUrl: referenceImageUrl,
      prompt: retryPrompt,
      externalTaskId: newPost.id,
    });
    const submittedAt = new Date().toISOString();

    const { error: persistError } = await context.admin
      .from("posts")
      .update({
        video_render_id: submission.taskId,
        video_status: submission.status || "submitted",
        video_provider: "kling",
        video_duration_seconds: submission.durationSeconds || post.video_duration_seconds || 6,
        video_error: null,
        kling_task_id: submission.taskId,
        kling_task_status: submission.status || "submitted",
        kling_submitted_at: submittedAt,
        kling_api_family: submission.apiFamily || null,
        kling_model: submission.model || null,
        kling_resolution: submission.resolution || null,
        kling_audio: submission.audio || null,
        updated_at: submittedAt,
      })
      .eq("id", newPost.id);
    if (persistError) {
      throw new Error(`Kling task ${submission.taskId} was submitted, but its task id could not be persisted: ${persistError.message}`);
    }

    if (reviewCase?.id) {
      await context.admin.from("admin_review_cases").update({
        post_id: newPost.id,
        status: "creating",
        needs_review: false,
        failure_code: null,
        failure_stage: null,
        failure_message: null,
        product_items: Array.isArray(post.admin_product_items) ? post.admin_product_items : reviewCase.product_items || [],
        draft_content: post.content || reviewCase.draft_content || null,
        updated_at: submittedAt,
      }).eq("id", reviewCase.id);
    } else {
      await context.admin.from("admin_review_cases").upsert({
        post_id: newPost.id,
        user_id: post.user_id,
        brand_profile_id: post.brand_profile_id,
        automation_rule_id: post.automation_rule_id,
        status: "creating",
        scheduled_for: post.scheduled_for || null,
        campaign_title: null,
        content_type_label: post.post_type || "Animated product video",
        content_format: post.content_format || "animated_video",
        draft_content: post.content || null,
        product_items: Array.isArray(post.admin_product_items) ? post.admin_product_items : [],
        failure_code: null,
        failure_stage: null,
        failure_message: null,
        needs_review: false,
        updated_at: submittedAt,
      }, { onConflict: "post_id" });
    }

    await context.admin.from("posts").update({
      admin_archived_at: submittedAt,
      admin_archived_by: context.user.id,
      admin_review_status: "archived",
      admin_review_note: `Replaced by manual Kling retry ${newPost.id}`,
      updated_at: submittedAt,
    }).eq("id", post.id);

    return Response.json({
      ok: true,
      post_id: newPost.id,
      task_id: submission.taskId,
      status: submission.status || "submitted",
    });
  } catch (error) {
    await context.admin.from("posts").update({
      status: "failed",
      video_status: "failed",
      video_error: String(error?.message || error).slice(0, 2000),
      updated_at: new Date().toISOString(),
    }).eq("id", newPost.id);
    return Response.json({ ok: false, error: error?.message || "Could not submit the Kling retry." }, { status: 500 });
  }
}

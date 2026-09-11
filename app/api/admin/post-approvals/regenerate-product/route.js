import crypto from "crypto";
import OpenAI from "openai";
import { adminContextError, getAdminContext } from "../../../../../lib/adminAuth";
import { buildProductContentContract } from "../../../../../lib/productEngineV2";
import { snapshotAdminPostVersion } from "../../../../../lib/adminPostVersions";
import { createGenerationCostTracker, wrapOpenAIForCostTracking } from "../../../../../lib/generationCostTracking";
import { resolveContentLanguagePreference } from "../../../../../lib/contentLanguage";
import {
  applyLogoOverlayIfNeeded,
  generateAnimatedProductVideo,
  generateLockedProductPostContentForUse,
  submitAdminRescueAiProductVideo,
  generateWebsiteItemAdImage,
  generateWebsiteItemEditorialPostImage,
  getCarouselProductLabelPresentation,
  renderCarouselProductSlideImage,
  resolveLockedProductUrlForUse,
  shouldUseLogoForEditorialProductPost,
  shouldUseLogoForRule,
} from "../../../cron/run-automations/route.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function normalizeProduct(product, productUrl) {
  return {
    title: product?.title || "",
    description: product?.description || product?.reason || "",
    url: product?.url || productUrl,
    image_url: product?.image_url || "",
    preview_image_url: "",
    product_brand: product?.product_brand || product?.locked_product_brand || "",
    product_identifier: product?.product_identifier || product?.locked_product_identifier || "",
    price: product?.price || "",
    currency: String(product?.currency || "").trim().toUpperCase(),
    product_display_type:
      product?.product_display_type ||
      product?.display_product_type ||
      product?.locked_product_category ||
      product?.category ||
      "",
    product_color: product?.product_color || product?.locked_product_color || "",
    product_image_width: Number(product?.product_image_width || 0) || null,
    product_image_height: Number(product?.product_image_height || 0) || null,
    product_identity_locked: product?.product_identity_locked === true,
    product_image_semantic_verified: product?.product_image_semantic_verified === true,
    locked_product_fingerprint: product?.locked_product_fingerprint || "",
    manual_override: product?.manual_override === true,
    manual_image_override: product?.manual_image_override === true,
    manual_override_note: product?.manual_override_note || "",
  };
}

async function uploadPng(admin, { userId, postId, suffix, imageBase64 }) {
  const path = `${userId}/${postId}-${suffix}-${crypto.randomUUID()}.png`;
  const upload = await admin.storage.from("post-images").upload(
    path,
    Buffer.from(imageBase64, "base64"),
    { contentType: "image/png", upsert: false }
  );
  if (upload.error) throw new Error(upload.error.message || "Could not save regenerated image");
  const { data } = admin.storage.from("post-images").getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("Could not create public URL for regenerated image");
  return { imageUrl: data.publicUrl, imageStoragePath: path };
}

export async function POST(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);

  const body = await request.json().catch(() => ({}));
  const postId = String(body?.post_id || "").trim();
  const requestedOccurrenceId = String(body?.occurrence_id || "").trim();
  const reviewCaseId = String(body?.review_case_id || "").trim();
  const workItemId = String(body?.work_item_id || "").trim();
  const suppliedProduct = normalizeProduct(body?.product_item || {}, String(body?.product_url || "").trim());
  const productUrl = String(body?.product_url || suppliedProduct.url || "").trim();
  const useManualOverride = suppliedProduct.manual_override === true;
  if (!postId && !requestedOccurrenceId && !reviewCaseId && !workItemId) {
    return Response.json({ ok: false, error: "A post, occurrence, review-case or work-item ID is required." }, { status: 400 });
  }
  if (
    useManualOverride
      ? (!suppliedProduct.title || !suppliedProduct.image_url)
      : (!productUrl || !/^https?:\/\//i.test(productUrl))
  ) {
    return Response.json(
      {
        ok: false,
        error: useManualOverride
          ? "Manual override requires at least a product name and product image."
          : "A complete original product URL is required."
      },
      { status: 400 }
    );
  }

  let post = null;
  let occurrence = null;
  let reviewCase = null;
  let workItem = null;
  if (workItemId) {
    const result = await context.admin.from("admin_generation_work_items").select("*").eq("id", workItemId).maybeSingle();
    if (result.error || !result.data) {
      return Response.json({ ok: false, error: result.error?.message || "Work item not found." }, { status: 404 });
    }
    workItem = result.data;
  }
  if (postId) {
    const result = await context.admin.from("posts").select("*").eq("id", postId).maybeSingle();
    if (result.error || !result.data) {
      return Response.json({ ok: false, error: result.error?.message || "Post not found." }, { status: 404 });
    }
    post = result.data;
  }
  if (reviewCaseId) {
    const result = await context.admin.from("admin_review_cases").select("*").eq("id", reviewCaseId).maybeSingle();
    if (result.error || !result.data) {
      return Response.json({ ok: false, error: result.error?.message || "Review case not found." }, { status: 404 });
    }
    reviewCase = result.data;
  }
  const occurrenceId = requestedOccurrenceId || String(reviewCase?.occurrence_id || "").trim();
  if (occurrenceId) {
    const result = await context.admin.from("automation_occurrences").select("*").eq("id", occurrenceId).maybeSingle();
    if (result.error || !result.data) {
      return Response.json({ ok: false, error: result.error?.message || "Generation occurrence not found." }, { status: 404 });
    }
    occurrence = result.data;
  }
  const originalWorkItemPostId = String(workItem?.post_id || "").trim() || null;
  const repairSource = post || occurrence || reviewCase || workItem;
  if (!repairSource) {
    return Response.json({ ok: false, error: "The failed generation could not be loaded." }, { status: 404 });
  }

  const ruleId = post?.automation_rule_id || occurrence?.automation_rule_id || reviewCase?.automation_rule_id || workItem?.automation_rule_id || null;
  const { data: rule } = ruleId
    ? await context.admin.from("automation_rules").select("*").eq("id", ruleId).maybeSingle()
    : { data: null };

  const workItemRescueType = String(workItem?.rescue_data?.rescue_type || "").trim().toLowerCase();
  const workItemContentType = String(workItem?.content_type_id || workItem?.content_type_label || "").trim().toLowerCase();
  const isAiProductVideoRescue = Boolean(
    workItemId &&
      workItemRescueType === "ai_product_video" &&
      String(workItem?.rescue_status || "").trim().toLowerCase() === "ready"
  );
  const isKlingAiVideoPost =
    isAiProductVideoRescue ||
    String(post?.video_provider || "").trim().toLowerCase() === "kling" ||
    String(rule?.content_type_id || "").trim().toLowerCase() === "ai_product_video" ||
    String(rule?.animation_style || "").trim().toLowerCase() === "kling_product_video" ||
    workItemContentType === "ai_product_video";

  if (isKlingAiVideoPost && !isAiProductVideoRescue) {
    return Response.json(
      {
        ok: false,
        error:
          "This AI product-video post is limited to one Kling generation. Spreelo will not regenerate or replace the video on the same post. Import a verified AI-product-video Rescue package to create one intentional fresh video post instead.",
        code: "KLING_SINGLE_GENERATION_PER_POST",
      },
      { status: 409 }
    );
  }

  const brandProfileId = post?.brand_profile_id || occurrence?.brand_profile_id || reviewCase?.brand_profile_id || workItem?.brand_profile_id || rule?.brand_profile_id || null;
  const { data: brandProfile } = brandProfileId
    ? await context.admin.from("brand_profiles").select("*").eq("id", brandProfileId).maybeSingle()
    : { data: null };
  const websiteUrl = String(
    brandProfile?.website_product_source_url ||
      brandProfile?.website_url ||
      productUrl ||
      suppliedProduct.url ||
      ""
  ).trim();
  const repairUserId = post?.user_id || occurrence?.user_id || reviewCase?.user_id || workItem?.user_id || rule?.user_id || null;
  if (!repairUserId) {
    return Response.json({ ok: false, error: "The customer account for this failed generation is missing." }, { status: 400 });
  }
  const costTracker = createGenerationCostTracker({
    supabase: context.admin,
    occurrenceId: occurrenceId || null,
    postId: post?.id || null,
  });
  const openai = wrapOpenAIForCostTracking(
    new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
    () => costTracker
  );

  try {
    // Claim the imported AI-video Rescue package itself before doing any paid or
    // long-running work. The per-post Kling claim is not enough here because two
    // concurrent clicks could otherwise create two different fresh posts. Only
    // one request is allowed to consume a ready Rescue package.
    if (isAiProductVideoRescue) {
      const rescueClaimedAt = new Date().toISOString();
      const claim = await context.admin
        .from("admin_generation_work_items")
        .update({
          status: "running",
          rescue_status: "used",
          technical_log: {
            ...(workItem?.technical_log || {}),
            ai_product_video_rescue_claim: {
              claimed_at: rescueClaimedAt,
              claimed_by: context.user.id,
            },
          },
          updated_at: rescueClaimedAt,
        })
        .eq("id", workItemId)
        .eq("rescue_status", "ready")
        .select("id")
        .maybeSingle();
      if (claim.error) {
        return Response.json(
          { ok: false, error: claim.error.message || "AI product-video Rescue could not be claimed." },
          { status: 409 }
        );
      }
      if (!claim.data?.id) {
        return Response.json(
          {
            ok: false,
            error: "This AI product-video Rescue package has already been used or is already running. Import a new verified Rescue package before requesting another video generation.",
            code: "AI_PRODUCT_VIDEO_RESCUE_ALREADY_USED",
          },
          { status: 409 }
        );
      }
    }
    if (post?.id) {
      await snapshotAdminPostVersion(context.admin, post.id, {
        reason: "before_admin_product_regeneration",
        createdBy: context.user.id,
      });
    }
    const lockedProduct = useManualOverride
      ? {
          ...suppliedProduct,
          title: suppliedProduct.title,
          description: suppliedProduct.description || "",
          url: suppliedProduct.url || productUrl || "",
          image_url: suppliedProduct.image_url,
          product_brand: suppliedProduct.product_brand || "",
          product_identifier: suppliedProduct.product_identifier || "",
          product_display_type: suppliedProduct.product_display_type || "",
          product_color: suppliedProduct.product_color || "",
          locked_product_title: suppliedProduct.title,
          locked_product_url: suppliedProduct.url || productUrl || "",
          locked_product_primary_image_url: suppliedProduct.image_url,
          locked_product_brand: suppliedProduct.product_brand || "",
          locked_product_identifier: suppliedProduct.product_identifier || "",
          locked_product_category: suppliedProduct.product_display_type || "",
          locked_product_color: suppliedProduct.product_color || "",
          product_identity_locked: false,
          product_image_semantic_verified: false,
          manual_override: true,
          manual_image_override: suppliedProduct.manual_image_override === true,
        }
      : await resolveLockedProductUrlForUse({
          supabase: context.admin,
          openai,
          productUrl,
          websiteUrl,
          titleHint: "",
          rule: rule || { id: ruleId || "admin-product-regeneration", brand_profile_id: brandProfileId },
          ruleId: ruleId || "admin-product-regeneration",
        });
    const product = normalizeProduct(lockedProduct, productUrl);
    const effectiveLanguage = resolveContentLanguagePreference({
      requestedLanguage: rule?.language,
      analyzedLanguage: brandProfile?.content_language,
      websiteUrl: brandProfile?.website_url || websiteUrl || productUrl || "",
      fallback: post?.language || "English",
    });
    const enhancedRule = {
      ...(rule || {}),
      id: rule?.id || ruleId || `admin-${occurrenceId || reviewCaseId || post?.id || "repair"}`,
      user_id: repairUserId,
      brand_profile_id: brandProfileId,
      brand_profile: brandProfile || null,
      content_type_id: rule?.content_type_id || post?.post_type || occurrence?.content_type_id || reviewCase?.content_type_label || "website_item",
      content_format: isAiProductVideoRescue
        ? "animated_video"
        : post?.content_format || occurrence?.content_format || reviewCase?.content_format || rule?.content_format || "single_image",
      language: effectiveLanguage,
      tone: post?.tone || rule?.tone || "Professional",
      platform: post?.platform || rule?.platform || "Instagram",
      uses_website_content: true,
      generate_image: true,
      website_item: lockedProduct,
      website_items: [],
      website_reserve_items: [],
      product_content_contract: buildProductContentContract([lockedProduct], []),
    };

    const generatedContent = await generateLockedProductPostContentForUse(openai, enhancedRule);
    if (!generatedContent) throw new Error("Spreelo could not regenerate the post copy for this product.");

    const isAnimated = String(enhancedRule.content_format || "").toLowerCase() === "animated_video";
    const isAiProductAd = String(enhancedRule.content_type_id || "") === "website_item_text_ad";
    const isEditorialProductPost = String(enhancedRule.content_type_id || "") === "website_item";
    const includeLogo = isEditorialProductPost
      ? shouldUseLogoForEditorialProductPost(enhancedRule, brandProfile)
      : shouldUseLogoForRule(enhancedRule, brandProfile);
    const now = new Date().toISOString();

    // A terminal generation failure may not have produced a posts row at all.
    // Create a fresh repair draft owned by the original customer before media
    // generation so every later asset is attached to a real post ID.
    // AI-product-video Rescue is stricter: even when the failed original post
    // exists, it is never reused. A brand-new post gets its own atomic one-shot
    // Kling claim, so the failed post can never consume a second generation.
    const failedAiVideoSourcePost = isAiProductVideoRescue && post?.id ? post : null;
    const failedAiVideoSourcePostId = failedAiVideoSourcePost?.id || (isAiProductVideoRescue ? originalWorkItemPostId : null);
    if (failedAiVideoSourcePost) {
      post = null;
    }
    if (!post) {
      const insert = await context.admin.from("posts").insert({
        user_id: repairUserId,
        brand_profile_id: brandProfileId,
        automation_rule_id: ruleId,
        content: generatedContent,
        platform: enhancedRule.platform || "instagram",
        tone: enhancedRule.tone || null,
        language: enhancedRule.language || "English",
        post_type: rule?.post_type || reviewCase?.content_type_label || occurrence?.content_type_label || "Product post",
        content_format: enhancedRule.content_format || "single_image",
        source: isAiProductVideoRescue ? "automation_admin_rescue_new_video_run" : "automation_admin_repair",
        source_label: isAiProductVideoRescue
          ? "Fresh AI product-video run from verified Rescue materials"
          : "Regenerated from admin-supplied product materials",
        status: "generating",
        approval_required: true,
        approval_token: crypto.randomBytes(32).toString("hex"),
        admin_review_status: "pending",
        admin_product_items: [product],
        scheduled_for: occurrence?.scheduled_for || reviewCase?.scheduled_for || workItem?.scheduled_for || new Date().toISOString(),
        image_status: "generating",
        video_status: isAnimated ? "rendering" : "none",
        video_provider: isAiProductVideoRescue ? "kling" : null,
        video_error: null,
        created_at: now,
        updated_at: now,
      }).select("*").single();
      if (insert.error || !insert.data) {
        throw new Error(insert.error?.message || "Could not create a repaired product post.");
      }
      post = insert.data;
      try { await costTracker.bindPost(post.id); } catch {}
      if (occurrenceId) {
        await context.admin.from("automation_occurrences").update({
          post_id: post.id,
          metadata: {
            ...(occurrence?.metadata || {}),
            admin_product_items: [product],
            admin_regeneration_started_at: now,
            ...(failedAiVideoSourcePostId ? {
              rescue_original_failed_post_id: failedAiVideoSourcePostId,
              rescue_new_video_post_id: post.id,
            } : {}),
          },
        }).eq("id", occurrenceId);
      }
      if (reviewCaseId) {
        await context.admin.from("admin_review_cases").update({
          post_id: post.id,
          product_items: [product],
          status: "creating",
          updated_at: now,
        }).eq("id", reviewCaseId);
      }
      if (workItemId) {
        await context.admin.from("admin_generation_work_items").update({ post_id: post.id, status: "running", updated_at: now }).eq("id", workItemId);
      }
    }

    let imageUrl = null;
    let imageStoragePath = null;
    let imagePrompt = null;
    let videoUrl = null;
    let videoStoragePath = null;
    let videoRenderId = null;
    let tiktokCleanImageUrl = null;
    let tiktokCleanImageStoragePath = null;

    if (isAiProductVideoRescue) {
      const submitted = await submitAdminRescueAiProductVideo({
        openai,
        supabase: context.admin,
        rule: {
          ...enhancedRule,
          content_type_id: "ai_product_video",
          content_format: "animated_video",
          animation_style: "kling_product_video",
          website_item: lockedProduct,
          website_items: [lockedProduct],
        },
        postContent: generatedContent,
        userId: repairUserId,
        postId: post.id,
      });

      if (occurrenceId) {
        await context.admin.from("automation_occurrences").update({
          post_id: post.id,
          metadata: {
            ...(occurrence?.metadata || {}),
            admin_product_items: [product],
            admin_rescue_video_submitted_at: new Date().toISOString(),
            rescue_original_failed_post_id: failedAiVideoSourcePostId,
            rescue_new_video_post_id: post.id,
            rescue_kling_task_id: submitted.taskId,
            rescue_credit_refund_available: false,
          },
        }).eq("id", occurrenceId);
      }
      if (reviewCaseId) {
        await context.admin.from("admin_review_cases").update({
          post_id: post.id,
          product_items: [product],
          status: "creating",
          needs_review: true,
          failure_code: null,
          failure_stage: null,
          failure_message: null,
          updated_at: new Date().toISOString(),
        }).eq("id", reviewCaseId);
      }
      if (workItemId) {
        await context.admin.from("admin_generation_work_items").update({
          post_id: post.id,
          status: "running",
          rescue_status: "used",
          failure_code: null,
          failure_stage: null,
          failure_message: null,
          updated_at: new Date().toISOString(),
        }).eq("id", workItemId);
      }

      return Response.json({
        ok: true,
        post_id: post.id,
        original_failed_post_id: failedAiVideoSourcePostId,
        product,
        content: generatedContent,
        image_url: submitted.imageUrl,
        video_url: null,
        video_task_id: submitted.taskId,
        video_status: submitted.status,
        format: "ai_product_video_rescue",
        new_post: true,
      });
    }

    if (isAnimated) {
      await context.admin.from("posts").update({
        content: generatedContent,
        admin_product_items: [product],
        image_status: "generating",
        video_status: "rendering",
        admin_review_status: "pending",
        updated_at: now,
      }).eq("id", post.id);

      const rendered = await generateAnimatedProductVideo({
        openai,
        supabase: context.admin,
        rule: enhancedRule,
        postContent: generatedContent,
        userId: repairUserId,
        postId: post.id,
        costTracker,
      });
      imageUrl = rendered.posterUrl;
      imageStoragePath = rendered.posterStoragePath;
      imagePrompt = rendered.foregroundPrompt;
      videoUrl = rendered.videoUrl;
      videoStoragePath = rendered.videoStoragePath;
      videoRenderId = rendered.renderId;
    } else if (isAiProductAd) {
      const generated = await generateWebsiteItemAdImage(openai, enhancedRule, generatedContent, costTracker);
      const uploaded = await uploadPng(context.admin, {
        userId: repairUserId,
        postId: post.id,
        suffix: "admin-product-ad",
        imageBase64: generated.imageBase64,
      });
      imageUrl = uploaded.imageUrl;
      imageStoragePath = uploaded.imageStoragePath;
      imagePrompt = generated.imagePrompt;
      tiktokCleanImageUrl = imageUrl;
      tiktokCleanImageStoragePath = imageStoragePath;
      const logoResult = await applyLogoOverlayIfNeeded({
        supabase: context.admin,
        userId: repairUserId,
        postId: post.id,
        imageUrl,
        imageStoragePath,
        brandProfile,
        includeLogo,
      });
      if (logoResult?.imageUrl) {
        imageUrl = logoResult.imageUrl;
        imageStoragePath = logoResult.imageStoragePath || imageStoragePath;
      }
    } else if (isEditorialProductPost) {
      const generated = await generateWebsiteItemEditorialPostImage(
        openai,
        enhancedRule,
        generatedContent,
        costTracker
      );
      const uploaded = await uploadPng(context.admin, {
        userId: post.user_id,
        postId: post.id,
        suffix: "admin-product-editorial",
        imageBase64: generated.imageBase64,
      });
      imageUrl = uploaded.imageUrl;
      imageStoragePath = uploaded.imageStoragePath;
      imagePrompt = generated.imagePrompt;
      tiktokCleanImageUrl = imageUrl;
      tiktokCleanImageStoragePath = imageStoragePath;

      const logoResult = await applyLogoOverlayIfNeeded({
        supabase: context.admin,
        userId: post.user_id,
        postId: post.id,
        imageUrl,
        imageStoragePath,
        brandProfile,
        includeLogo,
        placement: "top-left",
      });
      if (logoResult?.imageUrl) {
        imageUrl = logoResult.imageUrl;
        imageStoragePath = logoResult.imageStoragePath || imageStoragePath;
      }
    } else {
      const presentation = getCarouselProductLabelPresentation(lockedProduct, lockedProduct.title);
      const rendered = await renderCarouselProductSlideImage({
        sourceImageUrl: lockedProduct.image_url,
        openai,
        supabase: context.admin,
        rule: enhancedRule,
        websiteItem: lockedProduct,
        productTitle: presentation.title,
        productBrand: presentation.brand,
        productDescriptor: presentation.descriptor,
        includeLogo,
        languageHint: enhancedRule.language,
      });
      const uploaded = await uploadPng(context.admin, {
        userId: post.user_id,
        postId: post.id,
        suffix: "admin-product-post",
        imageBase64: rendered.imageBase64,
      });
      imageUrl = uploaded.imageUrl;
      imageStoragePath = uploaded.imageStoragePath;
      imagePrompt = useManualOverride
        ? "Admin-supplied product image rendered with GPT-Image-2 transparent Spreelo typography."
        : "Verified product-page image rendered with GPT-Image-2 transparent product typography.";
      tiktokCleanImageUrl = imageUrl;
      tiktokCleanImageStoragePath = imageStoragePath;
      const logoResult = await applyLogoOverlayIfNeeded({
        supabase: context.admin,
        userId: post.user_id,
        postId: post.id,
        imageUrl,
        imageStoragePath,
        brandProfile,
        includeLogo,
      });
      if (logoResult?.imageUrl) {
        imageUrl = logoResult.imageUrl;
        imageStoragePath = logoResult.imageStoragePath || imageStoragePath;
      }
    }

    const existingPublishSettings = post.platform_publish_settings && typeof post.platform_publish_settings === "object" ? post.platform_publish_settings : {};
    const existingTikTokSettings = existingPublishSettings.tiktok && typeof existingPublishSettings.tiktok === "object" ? existingPublishSettings.tiktok : {};
    const updatePayload = {
      content: generatedContent,
      image_url: imageUrl,
      image_storage_path: imageStoragePath,
      image_status: imageUrl ? "ready" : "none",
      image_prompt: imagePrompt,
      admin_product_items: [product],
      status: "pending_approval",
      admin_review_status: "pending",
      include_logo: includeLogo,
      logo_url: includeLogo ? brandProfile?.logo_url || null : null,
      ...(tiktokCleanImageUrl && String(post.platform || "").toLowerCase().includes("tiktok") ? {
        platform_publish_settings: {
          ...existingPublishSettings,
          tiktok: {
            ...existingTikTokSettings,
            media_overrides: {
              ...(existingTikTokSettings.media_overrides || {}),
              image_url: tiktokCleanImageUrl,
              image_storage_path: tiktokCleanImageStoragePath || null,
              source: "admin_pre_logo_clean_media",
            },
          },
        },
      } : {}),
      updated_at: new Date().toISOString(),
    };
    if (isAnimated) {
      Object.assign(updatePayload, {
        video_url: videoUrl,
        video_storage_path: videoStoragePath,
        video_render_id: videoRenderId,
        video_status: videoUrl ? "ready" : "failed",
        video_error: null,
      });
    }
    const update = await context.admin.from("posts").update(updatePayload).eq("id", post.id);
    if (update.error) throw new Error(update.error.message || "Could not save regenerated product post.");

    // A single-product post has no carousel slide rows; remove stale rows only
    // if this post had been converted from another format in admin.
    if (!isAnimated && String(post.content_format || "").toLowerCase() !== "carousel") {
      await context.admin.from("post_slides").delete().eq("post_id", post.id);
    }

    const reviewPayload = {
        occurrence_id: occurrenceId || null,
        post_id: post.id,
        user_id: repairUserId,
        brand_profile_id: brandProfileId,
        automation_rule_id: ruleId,
        status: "awaiting_spreelo",
        draft_content: generatedContent,
        product_items: [product],
        needs_review: true,
        failure_code: null,
        failure_stage: null,
        failure_message: null,
        updated_at: new Date().toISOString(),
      };
    try {
      if (reviewCaseId) {
        await context.admin.from("admin_review_cases").update(reviewPayload).eq("id", reviewCaseId);
      } else {
        await context.admin.from("admin_review_cases").upsert(
          reviewPayload,
          { onConflict: occurrenceId ? "occurrence_id" : "post_id" }
        );
      }
    } catch {
      // Older databases may not have the optional review-case table yet. The
      // post itself remains the authoritative admin review record.
    }
    if (occurrenceId) {
      await context.admin.from("automation_occurrences").update({
        post_id: post.id,
        metadata: {
          ...(occurrence?.metadata || {}),
          admin_product_items: [product],
          admin_regenerated_at: new Date().toISOString(),
          admin_rescue_resolved_at: new Date().toISOString(),
          admin_failure_resolved_by: context.user.id,
          rescue_credit_refund_available: false,
          rescue_credit_resolved_with_post: true,
        },
      }).eq("id", occurrenceId);
    }

    await snapshotAdminPostVersion(context.admin, post.id, {
      reason: "after_admin_product_regeneration",
      createdBy: context.user.id,
    });
    const resolvedWorkItemPatch = {
      post_id: post.id,
      status: "approval",
      rescue_status: "used",
      failure_code: null,
      failure_stage: null,
      failure_message: null,
      updated_at: new Date().toISOString(),
    };
    if (workItemId) {
      await context.admin.from("admin_generation_work_items").update(resolvedWorkItemPatch).eq("id", workItemId);
    } else if (occurrenceId) {
      await context.admin.from("admin_generation_work_items").update(resolvedWorkItemPatch).eq("occurrence_id", occurrenceId);
    }

    return Response.json({
      ok: true,
      post_id: post.id,
      product,
      content: generatedContent,
      image_url: imageUrl,
      video_url: videoUrl,
      format: isAnimated ? "animated_product_reel" : isAiProductAd ? "ai_product_ad" : "product_post",
    });
  } catch (error) {
    const failedAt = new Date().toISOString();
    if (post?.id) {
      await context.admin.from("posts").update({
        status: "failed",
        admin_review_status: "needs_repair",
        image_status: "failed",
        video_status: "failed",
        video_error: String(error?.message || "Admin regeneration failed").slice(0, 1200),
        updated_at: failedAt,
      }).eq("id", post.id);
      if (reviewCaseId) {
        await context.admin.from("admin_review_cases").update({
          status: "needs_repair",
          needs_review: true,
          failure_stage: isAiProductVideoRescue ? "admin_ai_product_video_rescue" : "admin_product_regeneration",
          failure_message: String(error?.message || "Admin regeneration failed").slice(0, 4000),
          updated_at: failedAt,
        }).eq("id", reviewCaseId);
      }
    }
    if (workItemId) {
      await context.admin.from("admin_generation_work_items").update({
        status: "failed",
        ...(isAiProductVideoRescue ? { rescue_status: "used" } : {}),
        failure_stage: isAiProductVideoRescue ? "admin_ai_product_video_rescue" : "admin_product_regeneration",
        failure_message: String(error?.message || "Admin regeneration failed").slice(0, 4000),
        updated_at: failedAt,
      }).eq("id", workItemId);
    }
    return Response.json(
      { ok: false, error: error?.message || "Spreelo could not regenerate this product post." },
      { status: 422 }
    );
  }
}

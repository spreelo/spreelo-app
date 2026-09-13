import crypto from "crypto";
import OpenAI from "openai";
import { adminContextError, getAdminContext } from "../../../../../lib/adminAuth";
import { snapshotAdminPostVersion } from "../../../../../lib/adminPostVersions";
import { createGenerationCostTracker, wrapOpenAIForCostTracking } from "../../../../../lib/generationCostTracking";
import { applyLogoOverlayIfNeeded, generateDesignedCarouselProductSlide, generateProductCarouselCreativePlan, resolveLockedProductUrlForUse, shouldUseLogoForRule } from "../../../cron/run-automations/route.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const ADMIN_CAROUSEL_SLIDE_RENDER_ATTEMPTS = 2;
const ADMIN_CAROUSEL_RENDER_FAILURE_CODE = "carousel_slide_render_incomplete";

export async function POST(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);
  const body = await request.json().catch(() => ({}));
  const requestedPostId = String(body?.post_id || "").trim();
  const requestedOccurrenceId = String(body?.occurrence_id || "").trim();
  const reviewCaseId = String(body?.review_case_id || "").trim();
  const workItemId = String(body?.work_item_id || "").trim();
  let products = (Array.isArray(body?.product_items) ? body.product_items : [])
    .map((item) => ({
      title: String(item?.title || "").trim(),
      description: String(item?.description || "").trim(),
      url: String(item?.url || "").trim(),
      image_url: String(item?.image_url || "").trim(),
      product_brand: String(item?.product_brand || item?.brand || "").trim(),
      product_display_type: String(item?.product_display_type || "").trim(),
      product_color: String(item?.product_color || item?.color || "").trim(),
      product_identifier: String(item?.product_identifier || "").trim(),
      price: String(item?.price || "").trim(),
      currency: String(item?.currency || "").trim().toUpperCase(),
      product_image_width: Number(item?.product_image_width || 0) || null,
      product_image_height: Number(item?.product_image_height || 0) || null,
      product_identity_locked: item?.product_identity_locked === true,
      product_image_semantic_verified: item?.product_image_semantic_verified === true,
      locked_product_fingerprint: String(item?.locked_product_fingerprint || "").trim(),
      manual_override: item?.manual_override === true,
      manual_image_override: item?.manual_image_override === true,
      manual_override_note: String(item?.manual_override_note || "").trim(),
    }))
    .filter((item) => item.url || item.title || item.image_url || item.description)
    .slice(0, 5);
  let post = null;
  let occurrence = null;
  let reviewCase = null;
  let workItem = null;
  if (workItemId) {
    const result = await context.admin.from("admin_generation_work_items").select("*").eq("id", workItemId).maybeSingle();
    if (result.error || !result.data) return Response.json({ ok: false, error: result.error?.message || "Work item not found." }, { status: 404 });
    workItem = result.data;
    if (!body?.product_items?.length && Array.isArray(workItem?.rescue_data?.products)) {
      products = workItem.rescue_data.products.slice(0, 5).map((item) => ({ ...item, manual_override: true, manual_image_override: true }));
    }
  }
  const incompleteManualProduct = (item) =>
    item.manual_override === true && (!item.title || !item.image_url);
  const incompleteAutomaticProduct = (item) =>
    item.manual_override !== true && !item.url;
  if (
    products.length !== 5 ||
    products.some((item) => incompleteManualProduct(item) || incompleteAutomaticProduct(item))
  ) {
    return Response.json({
      ok: false,
      error: "A carousel must contain exactly five complete products. Normally Spreelo needs each original product URL. If Manual override is enabled, a product name and image are required instead."
    }, { status: 400 });
  }
  if (requestedPostId) {
    const result = await context.admin.from("posts").select("*").eq("id", requestedPostId).single();
    if (result.error) return Response.json({ ok: false, error: result.error.message }, { status: 404 });
    post = result.data;
  }
  if (reviewCaseId) {
    const result = await context.admin.from("admin_review_cases").select("*").eq("id", reviewCaseId).maybeSingle();
    if (result.error || !result.data) return Response.json({ ok: false, error: result.error?.message || "Review case not found." }, { status: 404 });
    reviewCase = result.data;
  }
  const occurrenceId = requestedOccurrenceId || String(reviewCase?.occurrence_id || "").trim();
  if (occurrenceId) {
    const result = await context.admin.from("automation_occurrences").select("*").eq("id", occurrenceId).single();
    if (result.error) return Response.json({ ok: false, error: result.error.message }, { status: 404 });
    occurrence = result.data;
  }
  const repairSource = post || occurrence || reviewCase || workItem;
  if (!repairSource) return Response.json({ ok: false, error: "The failed generation could not be loaded." }, { status: 404 });
  const ruleId = post?.automation_rule_id || occurrence?.automation_rule_id || reviewCase?.automation_rule_id || workItem?.automation_rule_id;
  const { data: rule } = ruleId ? await context.admin.from("automation_rules").select("*").eq("id", ruleId).maybeSingle() : { data: null };
  const brandProfileId = post?.brand_profile_id || occurrence?.brand_profile_id || reviewCase?.brand_profile_id || workItem?.brand_profile_id || rule?.brand_profile_id;
  const { data: brandProfile } = brandProfileId ? await context.admin.from("brand_profiles").select("business_name, content_language, website_url, website_product_source_url, logo_url, logo_storage_path, logo_enabled_by_default").eq("id", brandProfileId).maybeSingle() : { data: null };
  const repairUserId = post?.user_id || occurrence?.user_id || reviewCase?.user_id || workItem?.user_id || rule?.user_id || null;
  if (!repairUserId) {
    return Response.json({ ok: false, error: "The customer account for this failed generation is missing." }, { status: 400 });
  }
  const language = post?.language || rule?.language || brandProfile?.content_language || "English";
  // Internal automation/plan names and occurrence titles are planning metadata.
  // They must never leak into regenerated customer-facing carousel copy.
  const campaign = String(
    rule?.campaign_theme ||
      rule?.campaign_opportunity_title ||
      ""
  ).trim() || "the selected products";
  const enhancedRule = { ...(rule || {}), brand_profile: brandProfile || null, language, campaign_theme: campaign };
  const includeLogo = shouldUseLogoForRule(enhancedRule, brandProfile);
  let content = String(body?.content || "").trim();
  const costTracker = createGenerationCostTracker({
    supabase: context.admin,
    occurrenceId: occurrenceId || null,
    postId: post?.id || null,
  });
  const openai = wrapOpenAIForCostTracking(
    new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
    () => costTracker
  );

  // v143.69: URL-first remains the default. A deliberate admin manual
  // override is a safety valve for sites that cannot be fetched. Manual data is
  // never mislabeled as verified source data and is preserved until the admin
  // explicitly refreshes from the original URL.
  if (post?.id) {
    await snapshotAdminPostVersion(context.admin, post.id, {
      reason: "before_admin_carousel_regeneration",
      createdBy: context.user.id,
    });
  }

  const resolvedProducts = [];
  for (const product of products) {
    if (product.manual_override === true) {
      resolvedProducts.push({
        ...product,
        product_identity_locked: false,
        product_image_semantic_verified: false,
        locked_product_fingerprint: "",
        manual_override: true,
        admin_materials_authoritative: true,
      });
      continue;
    }
    try {
      const resolved = await resolveLockedProductUrlForUse({
        supabase: context.admin,
        openai,
        productUrl: product.url,
        websiteUrl: brandProfile?.website_product_source_url || brandProfile?.website_url || product.url,
        titleHint: product.title || "",
        rule: enhancedRule,
        ruleId: ruleId || "admin-carousel-regeneration",
      });
      resolvedProducts.push({
        title: resolved.title || "",
        description: resolved.description || resolved.reason || "",
        url: resolved.url || product.url,
        image_url: resolved.image_url || "",
        product_brand: resolved.product_brand || resolved.locked_product_brand || "",
        product_display_type: resolved.product_display_type || resolved.display_product_type || resolved.locked_product_category || resolved.category || "",
        product_color: resolved.product_color || resolved.locked_product_color || "",
        product_identifier: resolved.product_identifier || resolved.locked_product_identifier || "",
        price: product.price || "",
        currency: product.currency || "",
        product_image_width: Number(resolved.product_image_width || 0) || null,
        product_image_height: Number(resolved.product_image_height || 0) || null,
        product_identity_locked: resolved.product_identity_locked === true,
        product_image_semantic_verified: resolved.product_image_semantic_verified === true,
        locked_product_fingerprint: resolved.locked_product_fingerprint || "",
        manual_override: false,
        manual_image_override: false,
      });
    } catch (error) {
      return Response.json({
        ok: false,
        error: `Could not verify product ${resolvedProducts.length + 1}: ${error?.message || "unknown product error"}`,
      }, { status: 422 });
    }
  }
  products = resolvedProducts;

  const carouselRule = {
    ...enhancedRule,
    content_type_id: enhancedRule?.content_type_id || "carousel_website_item",
    content_format: "carousel",
    website_item: products[0],
    website_items: products,
    product_content_contract: null,
  };
  const creativePlan = await generateProductCarouselCreativePlan(
    openai,
    carouselRule,
    products,
    content
  );
  content = String(creativePlan?.caption || content).trim();
  if (!content) {
    return Response.json({ ok: false, error: "Carousel creative planning returned no usable caption." }, { status: 502 });
  }

  const now = new Date().toISOString();
  if (!post) {
    const insert = await context.admin.from("posts").insert({
      user_id: repairUserId,
      brand_profile_id: brandProfileId,
      automation_rule_id: ruleId || null,
      content,
      platform: rule?.platform || "instagram",
      post_type: rule?.post_type || occurrence?.content_type_label || reviewCase?.content_type_label || "Carousel",
      content_format: "carousel",
      language,
      source: "automation_admin_repair",
      source_label: "Regenerated from admin-supplied verified materials",
      status: "generating",
      approval_required: true,
      approval_token: crypto.randomBytes(32).toString("hex"),
      admin_review_status: "pending",
      admin_product_items: products,
      scheduled_for: occurrence?.scheduled_for || reviewCase?.scheduled_for || workItem?.scheduled_for || new Date().toISOString(),
      image_status: "generating",
      created_at: now,
      updated_at: now,
    }).select("*").single();
    if (insert.error) return Response.json({ ok: false, error: insert.error.message }, { status: 500 });
    post = insert.data;
    try { await costTracker.bindPost(post.id); } catch {}
    if (occurrenceId) {
      await context.admin.from("automation_occurrences").update({
        post_id: post.id,
        metadata: {
          ...(occurrence?.metadata || {}),
          admin_product_items: products,
          admin_regeneration_started_at: now,
        },
      }).eq("id", occurrenceId);
    }
    if (reviewCaseId) {
      await context.admin.from("admin_review_cases").update({
        post_id: post.id,
        product_items: products,
        status: "creating",
        updated_at: now,
      }).eq("id", reviewCaseId);
    }
    if (workItemId) {
      await context.admin.from("admin_generation_work_items").update({ post_id: post.id, status: "running", updated_at: now }).eq("id", workItemId);
    }
  } else {
    const update = await context.admin.from("posts").update({ content, content_format: "carousel", status: "generating", admin_review_status: "pending", admin_product_items: products, image_status: "generating", updated_at: now }).eq("id", post.id);
    if (update.error) return Response.json({ ok: false, error: update.error.message }, { status: 500 });
  }

  const slides = [];
  for (let index = 0; index < products.length; index += 1) {
    const product = products[index];
    const slidePlan = creativePlan?.slides?.[index] || {
      slide_type: index === products.length - 1 ? "product_cta" : "product",
      headline: product.title,
      body: "",
      cta_text: index === products.length - 1 ? rule?.cta_type || "" : "",
    };
    let cleanImageUrl = product.image_url;
    let cleanImageStoragePath = null;
    let finalImageUrl = cleanImageUrl;
    let finalImageStoragePath = null;
    let renderError = null;
    let imagePrompt = null;
    let identityReview = null;
    let renderedBy = "source_image_identity_safe_fallback";
    const renderAttemptErrors = [];
    let renderAttemptCount = 0;

    for (let attempt = 1; attempt <= ADMIN_CAROUSEL_SLIDE_RENDER_ATTEMPTS; attempt += 1) {
      renderAttemptCount = attempt;
      try {
        // Keep the exact same verified product, Sol-locked copy and shared design brief
        // on the retry. Only GPT Image gets another chance to produce a compliant render.
        const designed = await generateDesignedCarouselProductSlide({
          openai,
          sourceImageUrl: product.image_url,
          rule: carouselRule,
          websiteItem: product,
          slidePlan,
          designBrief: creativePlan?.design_brief || "",
          slideIndex: index,
          slideCount: products.length,
        });
        const path = `admin-regenerated/${post.id}/${index + 1}-attempt-${attempt}-${crypto.randomUUID()}.png`;
        const upload = await context.admin.storage.from("post-images").upload(
          path,
          Buffer.from(designed.imageBase64, "base64"),
          { contentType: "image/png", upsert: false }
        );
        if (upload.error) throw upload.error;
        const { data: publicData } = context.admin.storage.from("post-images").getPublicUrl(path);
        cleanImageUrl = publicData.publicUrl;
        cleanImageStoragePath = path;
        finalImageUrl = cleanImageUrl;
        finalImageStoragePath = path;
        imagePrompt = designed.imagePrompt || null;
        identityReview = designed.identityReview || null;
        renderedBy = designed.provider || "gpt-image-2-full-carousel-design";
        renderError = null;
        break;
      } catch (error) {
        const attemptError = error?.message || String(error);
        renderAttemptErrors.push(attemptError);
        renderError = attemptError;
        console.warn("Admin carousel full-slide design attempt failed", {
          postId: post.id,
          slideOrder: index + 1,
          productTitle: product.title || null,
          attempt,
          maxAttempts: ADMIN_CAROUSEL_SLIDE_RENDER_ATTEMPTS,
          message: attemptError,
        });
      }
    }

    if (includeLogo && finalImageUrl) {
      try {
        const logoResult = await applyLogoOverlayIfNeeded({
          supabase: context.admin,
          userId: post.user_id,
          postId: `${post.id}-admin-carousel-${index + 1}`,
          imageUrl: finalImageUrl,
          imageStoragePath: finalImageStoragePath,
          brandProfile,
          includeLogo,
        });
        if (logoResult?.imageUrl) {
          finalImageUrl = logoResult.imageUrl;
          finalImageStoragePath = logoResult.imageStoragePath || finalImageStoragePath;
        }
      } catch (logoError) {
        console.warn("Admin carousel logo overlay failed; keeping clean slide", {
          postId: post.id,
          slideOrder: index + 1,
          message: logoError?.message || String(logoError),
        });
      }
    }

    slides.push({
      user_id: post.user_id,
      post_id: post.id,
      slide_order: index + 1,
      slide_type: "content",
      headline: null,
      body: null,
      cta_text: null,
      image_url: finalImageUrl,
      product_url: product.url || null,
      logo_enabled: includeLogo,
      metadata: {
        image_storage_path: finalImageStoragePath,
        tiktok_image_url: cleanImageUrl,
        tiktok_image_storage_path: cleanImageStoragePath,
        image_prompt: imagePrompt,
        generated_by: renderedBy,
        rendered_slide: renderedBy !== "source_image_identity_safe_fallback" && !renderError,
        render_attempt_count: renderAttemptCount,
        render_attempt_errors: renderAttemptErrors,
        carousel_creative_model: creativePlan?.model || null,
        carousel_design_brief: creativePlan?.design_brief || null,
        locked_headline: slidePlan?.headline || null,
        locked_supporting_text: slidePlan?.body || slidePlan?.supporting_text || null,
        locked_cta_text: slidePlan?.cta_text || null,
        product_title: product.title,
        product_description: product.description || null,
        product_brand: product.product_brand || null,
        product_identifier: product.product_identifier || null,
        product_display_type: product.product_display_type || null,
        product_color: product.product_color || null,
        product_image_width: product.product_image_width || null,
        product_image_height: product.product_image_height || null,
        product_identity_locked: product.product_identity_locked === true,
        product_image_semantic_verified: product.product_image_semantic_verified === true,
        source_image_url: product.image_url,
        carousel_slide_role: slidePlan?.slide_type || (index === products.length - 1 ? "product_cta" : "product"),
        admin_regenerated: true,
        admin_materials_authoritative: true,
        admin_manual_override: product.manual_override === true,
        admin_manual_image_override: product.manual_image_override === true,
        generated_identity_review_confidence: Number(identityReview?.confidence || 0) || null,
        generated_identity_review_reason: identityReview?.reason || null,
        product_card_render_error: renderError,
      },
    });
  }
  const { data: previousSlides, error: previousSlidesError } = await context.admin
    .from("post_slides")
    .select("*")
    .eq("post_id", post.id)
    .order("slide_order", { ascending: true });
  if (previousSlidesError) return Response.json({ ok: false, error: previousSlidesError.message }, { status: 500 });

  const deleteSlides = await context.admin.from("post_slides").delete().eq("post_id", post.id);
  if (deleteSlides.error) return Response.json({ ok: false, error: deleteSlides.error.message }, { status: 500 });
  // post_slides.slide_type is a database-level structural type. Product hook/product/CTA semantics
  // belong in metadata.carousel_slide_role, exactly like the normal carousel generator.
  // Keep every admin-regenerated carousel row on the supported `content` type so an
  // otherwise successful repair can never fail the post_slides_slide_type_check constraint.
  const invalidSlideType = slides.find((slide) => slide.slide_type !== "content");
  if (invalidSlideType) {
    if (previousSlides?.length) await context.admin.from("post_slides").insert(previousSlides);
    return Response.json({
      ok: false,
      error: `Regeneration safety check failed before save: unsupported slide type ${invalidSlideType.slide_type}.`,
    }, { status: 500 });
  }
  const insertSlides = await context.admin.from("post_slides").insert(slides);
  if (insertSlides.error) {
    if (previousSlides?.length) await context.admin.from("post_slides").insert(previousSlides);
    return Response.json({ ok: false, error: `Regeneration could not be saved: ${insertSlides.error.message}` }, { status: 500 });
  }

  const renderedSlides = slides.filter((slide) => slide?.metadata?.rendered_slide === true);
  const failedSlideOrders = slides
    .filter((slide) => slide?.metadata?.rendered_slide !== true)
    .map((slide) => Number(slide.slide_order || 0))
    .filter(Boolean);
  if (renderedSlides.length !== 5) {
    const failedAt = new Date().toISOString();
    const failureMessage = `Carousel Rescue rendered ${renderedSlides.length} of 5 slides after ${ADMIN_CAROUSEL_SLIDE_RENDER_ATTEMPTS} attempts per failed slide. Slides ${failedSlideOrders.join(", ")} still need a compliant full design.`;
    await context.admin.from("posts").update({
      content,
      status: "failed",
      admin_review_status: "needs_repair",
      admin_product_items: products,
      slide_count: slides.length,
      slide_generation_status: "failed",
      slide_render_status: renderedSlides.length > 0 ? "partial" : "none",
      image_status: "failed",
      updated_at: failedAt,
    }).eq("id", post.id);
    if (occurrenceId) {
      await context.admin.from("automation_occurrences").update({
        post_id: post.id,
        metadata: {
          ...(occurrence?.metadata || {}),
          admin_product_items: products,
          admin_regeneration_incomplete_at: failedAt,
          admin_carousel_rendered_slide_count: renderedSlides.length,
          admin_carousel_failed_slide_orders: failedSlideOrders,
        },
      }).eq("id", occurrenceId);
    }
    const failedReviewPayload = {
      occurrence_id: occurrenceId || null,
      post_id: post.id,
      user_id: post.user_id,
      brand_profile_id: post.brand_profile_id,
      automation_rule_id: post.automation_rule_id,
      status: "needs_repair",
      draft_content: content,
      product_items: products,
      needs_review: true,
      failure_code: ADMIN_CAROUSEL_RENDER_FAILURE_CODE,
      failure_stage: "admin_carousel_regeneration",
      failure_message: failureMessage,
      updated_at: failedAt,
    };
    if (reviewCaseId) {
      await context.admin.from("admin_review_cases").update(failedReviewPayload).eq("id", reviewCaseId);
    } else {
      await context.admin.from("admin_review_cases").upsert(failedReviewPayload, { onConflict: occurrenceId ? "occurrence_id" : "post_id" });
    }
    const failedWorkItemPatch = {
      post_id: post.id,
      status: "failed",
      rescue_status: "needed",
      failure_code: ADMIN_CAROUSEL_RENDER_FAILURE_CODE,
      failure_stage: "admin_carousel_regeneration",
      failure_message: failureMessage,
      updated_at: failedAt,
    };
    if (workItemId) {
      await context.admin.from("admin_generation_work_items").update(failedWorkItemPatch).eq("id", workItemId);
    } else if (occurrenceId) {
      await context.admin.from("admin_generation_work_items").update(failedWorkItemPatch).eq("occurrence_id", occurrenceId);
    }
    return Response.json({
      ok: false,
      error: failureMessage,
      post_id: post.id,
      slide_count: slides.length,
      rendered_slide_count: renderedSlides.length,
      failed_slide_orders: failedSlideOrders,
    }, { status: 422 });
  }

  const postReadyUpdate = await context.admin.from("posts").update({
    content,
    status: "pending_approval",
    admin_review_status: "pending",
    admin_product_items: products,
    slide_count: slides.length,
    slide_generation_status: "ready",
    slide_render_status: "ready",
    image_status: "ready",
    updated_at: now,
  }).eq("id", post.id);
  if (postReadyUpdate.error) return Response.json({ ok: false, error: postReadyUpdate.error.message }, { status: 500 });
  if (occurrenceId) await context.admin.from("automation_occurrences").update({ post_id: post.id, metadata: { ...(occurrence?.metadata || {}), admin_product_items: products, admin_regenerated_at: now, admin_rescue_resolved_at: now, admin_failure_resolved_by: context.user.id, rescue_credit_refund_available: false, rescue_credit_resolved_with_post: true } }).eq("id", occurrenceId);
  const reviewPayload = { occurrence_id: occurrenceId || null, post_id: post.id, user_id: post.user_id, brand_profile_id: post.brand_profile_id, automation_rule_id: post.automation_rule_id, status: "awaiting_spreelo", draft_content: content, product_items: products, needs_review: true, failure_code: null, failure_stage: null, failure_message: null, updated_at: now };
  if (reviewCaseId) {
    await context.admin.from("admin_review_cases").update(reviewPayload).eq("id", reviewCaseId);
  } else {
    await context.admin.from("admin_review_cases").upsert(reviewPayload, { onConflict: occurrenceId ? "occurrence_id" : "post_id" });
  }
  await snapshotAdminPostVersion(context.admin, post.id, { reason: "after_admin_carousel_regeneration", createdBy: context.user.id });
  const resolvedWorkItemPatch = {
    post_id: post.id,
    status: "approval",
    rescue_status: "used",
    failure_code: null,
    failure_stage: null,
    failure_message: null,
    updated_at: now,
  };
  if (workItemId) {
    await context.admin.from("admin_generation_work_items").update(resolvedWorkItemPatch).eq("id", workItemId);
  } else if (occurrenceId) {
    // v144.110: older rescue actions did not always carry work_item_id back to
    // the regeneration route. Resolve the durable failure row by occurrence as
    // a fallback so the repaired post cannot remain in Misslyckat.
    await context.admin.from("admin_generation_work_items").update(resolvedWorkItemPatch).eq("occurrence_id", occurrenceId);
  }
  return Response.json({ ok: true, post_id: post.id, slide_count: slides.length });
}

import { adminContextError, getAdminContext } from "../../../../lib/adminAuth";
import { sendApprovalEmail } from "../../cron/run-automations/route.js";

export const dynamic = "force-dynamic";

const VISIBLE_STATUSES = new Set(["pending_approval", "approved", "rejected", "failed", "creating"]);
const REVIEW_STATUSES = new Set(["new", "reviewing", "resolved"]);
const REFUND_STATUSES = new Set(["pending_review", "approved", "declined", "credited"]);

function getAdminMissingExpectedCostEvents(post, summary) {
  const events = Array.isArray(summary?.breakdown?.events) ? summary.breakdown.events : [];
  const missing = Array.isArray(summary?.breakdown?.missing_expected_events)
    ? [...summary.breakdown.missing_expected_events]
    : [];
  const addMissing = (value) => {
    if (!missing.includes(value)) missing.push(value);
  };

  const imageModel = String(post?.image_model_used || "").trim().toLowerCase();
  const imageStatus = String(post?.image_status || "").trim().toLowerCase();
  const imageExpected =
    imageModel.startsWith("gpt-image-2") &&
    !["", "none", "failed", "not_required", "not-required"].includes(imageStatus);
  if (imageExpected) {
    const hasImageEvent = events.some((event) =>
      String(event?.provider || "").toLowerCase() === "openai" &&
      String(event?.model || "").toLowerCase().startsWith("gpt-image-2") &&
      (String(event?.service || "").toLowerCase() === "image_generation" ||
        ["images.generate", "images.edit"].includes(String(event?.operation || "")))
    );
    if (!hasImageEvent) addMissing("openai:gpt-image-2:image_generation");
  }

  const videoProvider = String(post?.video_provider || "").trim().toLowerCase();
  const videoStatus = String(post?.video_status || "").trim().toLowerCase();
  const videoExpected =
    ["kling", "shotstack"].includes(videoProvider) &&
    !["", "none", "failed", "not_required", "not-required"].includes(videoStatus);
  if (videoExpected && !events.some((event) => String(event?.provider || "").toLowerCase() === videoProvider)) {
    addMissing(`${videoProvider}:video_generation`);
  }

  return missing;
}

export async function GET(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);

  const url = new URL(request.url);
  const status = String(url.searchParams.get("status") || "all");
  const testBatch = String(url.searchParams.get("testBatch") || "").trim();

  const postSelect =
    "id, user_id, brand_profile_id, automation_rule_id, status, content, platform, post_type, content_type_id, content_format, text_model_used, image_model_used, image_url, image_storage_path, image_status, image_prompt, video_url, video_status, video_error, video_provider, video_duration_seconds, video_background_selection, kling_prompt, kling_reference_image_url, kling_task_id, scheduled_for, created_at, updated_at, approved_at, approval_token, approval_email_sent_at, admin_review_status, admin_reviewed_at, admin_review_note, admin_product_items, admin_archived_at, website_url, is_admin_test, admin_test_batch_id, admin_test_job_key";

  let query = context.admin
    .from("posts")
    .select(postSelect)
    .in("status", Array.from(VISIBLE_STATUSES))
    .is("admin_archived_at", null)
    .order("created_at", { ascending: false })
    .limit(testBatch ? 600 : 150);

  if (VISIBLE_STATUSES.has(status)) query = query.eq("status", status);
  if (testBatch) query = query.eq("admin_test_batch_id", testBatch);

  const { data: posts, error } = await query;
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  let postRows = posts || [];
  if (status === "upcoming") postRows = [];
  const completedAdminReviewStates = new Set(["approved_by_spreelo", "released", "archived", "not_required"]);
  if (status === "queue") {
    postRows = postRows.filter((post) => {
      const reviewStatus = String(post.admin_review_status || "").toLowerCase();
      const pendingReview =
        post.status === "pending_approval" &&
        !completedAdminReviewStates.has(reviewStatus) &&
        reviewStatus !== "not_required";
      return pendingReview;
    });
  } else if (status === "history") {
    postRows = postRows.filter((post) =>
      ["approved", "rejected"].includes(post.status) ||
      completedAdminReviewStates.has(String(post.admin_review_status || "").toLowerCase())
    );
  }

  // v143.63: failures are queried explicitly in SQL instead of fetching the
  // newest 200 occurrences of every status and filtering afterwards. A busy
  // installation can otherwise push a terminal failure out of the admin
  // window even though the failure email was sent correctly.
  const occurrenceSelect =
    "id, post_id, user_id, brand_profile_id, automation_rule_id, status, scheduled_for, content_type_label, content_format, campaign_title, started_at, finished_at, failure_code, failure_stage, failure_message_internal, failure_message_customer, refunded_credits, notification_status, metadata, is_admin_test, admin_test_batch_id, admin_test_job_key";
  // v144.22: a durable background generation can be healthy while it is in
  // retry_pending. The normal admin queue must surface that state instead of
  // looking empty while the customer is waiting. We intentionally keep
  // short-lived `running` rows in the Creating view only to avoid queue noise.
  const [failedOccurrenceResult, activeOccurrenceResult] = await Promise.all([
    ["all", "failed"].includes(status)
      ? context.admin
          .from("automation_occurrences")
          .select(occurrenceSelect)
          .eq("status", "failed_terminal")
          .order("started_at", { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [], error: null }),
    ["all", "creating"].includes(status)
      ? context.admin
          .from("automation_occurrences")
          .select(occurrenceSelect)
          .in("status", ["running", "retry_pending"])
          .order("started_at", { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const occurrenceError =
    failedOccurrenceResult.error || activeOccurrenceResult.error;
  if (occurrenceError) {
    return Response.json({ ok: false, error: occurrenceError.message }, { status: 500 });
  }
  const occurrenceResult = {
    data: [
      ...(failedOccurrenceResult.data || []),
      ...(activeOccurrenceResult.data || []),
    ],
    error: null,
  };

  const reviewCaseResult = ["all", "failed"].includes(status)
    ? await context.admin
        .from("admin_review_cases")
        .select("id, occurrence_id, post_id, user_id, brand_profile_id, automation_rule_id, status, scheduled_for, campaign_title, content_type_label, content_format, product_items, failure_code, failure_stage, failure_message, needs_review, created_at, updated_at, is_admin_test, admin_test_batch_id, admin_test_job_key")
        .eq("needs_review", true)
        .eq("status", "needs_repair")
        .order("updated_at", { ascending: false })
        .limit(200)
    : { data: [], error: null };
  if (
    reviewCaseResult.error &&
    !/admin_review_cases|schema cache|does not exist/i.test(
      String(reviewCaseResult.error.message || "")
    )
  ) {
    return Response.json({ ok: false, error: reviewCaseResult.error.message }, { status: 500 });
  }

  const workItemStatuses =
    status === "upcoming" ? ["planned", "running"] :
    status === "queue" ? ["approval"] :
    status === "failed" ? ["failed"] :
    status === "history" ? ["history"] :
    status === "all" ? ["planned", "running", "approval", "failed", "history"] : [];
  let workItemRows = [];
  if (workItemStatuses.length) {
    const workItemSelect = "id, user_id, brand_profile_id, automation_rule_id, is_admin_test, admin_test_batch_id, admin_test_job_key, occurrence_id, post_id, run_log_id, scheduled_for, status, plan_name, platform, content_type_id, content_type_label, content_format, source_url, source_scope, product_strategy, product_match_terms, product_search_queries, requirement_count, prompt_snapshot, strategy_snapshot, rule_snapshot, failure_code, failure_stage, failure_message, technical_log, rescue_status, rescue_data, rescue_imported_at, created_at, updated_at";
    const pageSize = 500;
    for (let from = 0; ; from += pageSize) {
      let workItemQuery = context.admin
        .from("admin_generation_work_items")
        .select(workItemSelect)
        .in("status", workItemStatuses)
        .order(status === "upcoming" ? "scheduled_for" : "updated_at", { ascending: status === "upcoming" })
        .range(from, from + pageSize - 1);
      if (testBatch) workItemQuery = workItemQuery.eq("admin_test_batch_id", testBatch);
      const workItemResult = await workItemQuery;
      if (workItemResult.error) {
        if (!/admin_generation_work_items|schema cache|does not exist/i.test(String(workItemResult.error.message || ""))) {
          return Response.json({ ok: false, error: workItemResult.error.message }, { status: 500 });
        }
        workItemRows = [];
        break;
      }
      const pageRows = workItemResult.data || [];
      workItemRows.push(...pageRows);
      if (pageRows.length < pageSize) break;
    }
  }

  // v144.110 defensive cleanup: a successfully used rescue item is no longer
  // actionable even if an older row was left with status=failed. Keep the row
  // in the database for audit/history, but never show it in Misslyckat.
  if (status === "failed") {
    workItemRows = workItemRows.filter((item) => String(item?.rescue_status || "") !== "used");
  }

  // The durable work queue is the source of truth. If the legacy posts query
  // window did not include a linked approval/history post, fetch that exact post
  // so the admin tabs never silently lose a durable work item.
  const existingPostIds = new Set(postRows.map((item) => item.id));
  const missingWorkPostIds = Array.from(new Set(
    workItemRows.map((item) => item.post_id).filter((id) => id && !existingPostIds.has(id))
  ));
  for (let offset = 0; offset < missingWorkPostIds.length; offset += 100) {
    const ids = missingWorkPostIds.slice(offset, offset + 100);
    let missingQuery = context.admin.from("posts").select(postSelect).in("id", ids).is("admin_archived_at", null);
    if (testBatch) missingQuery = missingQuery.eq("admin_test_batch_id", testBatch);
    const missingResult = await missingQuery;
    if (missingResult.error) {
      return Response.json({ ok: false, error: missingResult.error.message }, { status: 500 });
    }
    const matchingRows = (missingResult.data || []).filter((post) => {
      if (status === "queue") {
        const reviewStatus = String(post.admin_review_status || "").toLowerCase();
        return post.status === "pending_approval" && !completedAdminReviewStates.has(reviewStatus) && reviewStatus !== "not_required";
      }
      if (status === "history") {
        return ["approved", "rejected"].includes(post.status) || completedAdminReviewStates.has(String(post.admin_review_status || "").toLowerCase());
      }
      return true;
    });
    postRows.push(...matchingRows.filter((post) => !existingPostIds.has(post.id)));
    matchingRows.forEach((post) => existingPostIds.add(post.id));
  }

  const workRunLogIds = Array.from(new Set(workItemRows.map((item) => item.run_log_id).filter(Boolean)));
  let workRunLogMap = new Map();
  if (workRunLogIds.length) {
    const runLogResult = await context.admin
      .from("automation_run_logs")
      .select("id, occurrence_id, rule_id, status, started_at, finished_at, duration_ms, error_message, content_type_id, content_format, products_selected, search_methods, product_titles, product_urls, metadata")
      .in("id", workRunLogIds);
    if (!runLogResult.error) {
      workRunLogMap = new Map((runLogResult.data || []).map((item) => [item.id, item]));
    } else if (!/automation_run_logs|schema cache|does not exist/i.test(String(runLogResult.error.message || ""))) {
      console.warn("Admin work-item run logs could not be loaded", { message: runLogResult.error.message });
    }
  }

  const occurrenceRows = (occurrenceResult.data || []).filter((occurrence) => {
    if (testBatch && occurrence.admin_test_batch_id !== testBatch) return false;

    // v144.110: a terminal automatic attempt remains preserved as audit history,
    // but once admin rescue/regeneration has successfully produced a replacement
    // post it must no longer stay in the actionable Failed queue. Older repaired
    // rows already carry admin_regenerated_at; new rows also get the explicit
    // admin_rescue_resolved_at marker.
    const failureResolvedByAdmin = Boolean(
      occurrence?.metadata?.admin_rescue_resolved_at ||
      occurrence?.metadata?.admin_regenerated_at ||
      occurrence?.metadata?.customer_failure_notified_at
    );
    if (occurrence.status === "failed_terminal" && failureResolvedByAdmin) return false;

    if (status === "failed") return occurrence.status === "failed_terminal";
    if (status === "creating") return !["completed", "failed_terminal"].includes(occurrence.status);
    return true;
  });
  const occurrenceById = new Map(occurrenceRows.map((item) => [item.id, item]));
  const reviewCaseRows = (reviewCaseResult.data || []).filter((item) => !testBatch || item.admin_test_batch_id === testBatch);
  const reviewCaseByOccurrence = new Map(
    reviewCaseRows
      .filter((item) => item.occurrence_id)
      .map((item) => [item.occurrence_id, item])
  );
  const reviewCaseByPost = new Map(
    reviewCaseRows
      .filter((item) => item.post_id)
      .map((item) => [item.post_id, item])
  );

  const orphanFailures = occurrenceRows.filter(
    (occurrence) => !occurrence.post_id || !postRows.some((post) => post.id === occurrence.post_id)
  );
  const orphanOccurrenceIds = new Set(
    orphanFailures.map((item) => item.id).filter(Boolean)
  );
  const reviewOnlyFailures = reviewCaseRows.filter(
    (reviewCase) =>
      (!reviewCase.post_id || !postRows.some((post) => post.id === reviewCase.post_id)) &&
      (!reviewCase.occurrence_id || !orphanOccurrenceIds.has(reviewCase.occurrence_id))
  );

  const adminQueueRows = [...postRows, ...orphanFailures, ...reviewOnlyFailures, ...workItemRows];
  const brandIds = Array.from(new Set(adminQueueRows.map((item) => item.brand_profile_id).filter(Boolean)));
  const userIds = Array.from(new Set(adminQueueRows.map((item) => item.user_id).filter(Boolean)));
  const postIds = postRows.map((item) => item.id);

  const ruleIds = Array.from(new Set(adminQueueRows.map((item) => item.automation_rule_id).filter(Boolean)));
  const [{ data: brands }, { data: rules }, { data: feedbackRows }, { data: slideRows }] = await Promise.all([
    brandIds.length
      ? context.admin.from("brand_profiles").select("id, business_name, website_url, website_product_source_url, admin_review_required").in("id", brandIds)
      : Promise.resolve({ data: [] }),
    ruleIds.length
      ? context.admin.from("automation_rules").select("id, website_url, content_source_url, content_source_scope, content_type_id, content_type_label, content_format, platform, is_admin_test, admin_test_batch_id, admin_test_job_key, name, queue_source, credit_cost, credit_reservation_status, credit_reserved_amount").in("id", ruleIds)
      : Promise.resolve({ data: [] }),
    postIds.length
      ? context.admin
          .from("post_rejection_feedback")
          .select(
            "id, post_id, reason_category, reason_text, contact_email, review_status, refund_status, admin_note, reviewed_at, created_at"
          )
          .in("post_id", postIds)
      : Promise.resolve({ data: [] }),
    postIds.length
      ? context.admin
          .from("post_slides")
          .select("post_id, slide_order, headline, body, cta_text, image_url, product_url, metadata")
          .in("post_id", postIds)
          .order("slide_order", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  let generationCostRows = [];
  if (postIds.length) {
    const costResult = await context.admin
      .from("post_generation_cost_summaries")
      .select("post_id, amount, currency, complete, breakdown, updated_at")
      .in("post_id", postIds);
    if (!costResult.error) {
      generationCostRows = costResult.data || [];
    } else if (!/post_generation_cost_summaries|schema cache|does not exist/i.test(String(costResult.error.message || ""))) {
      console.warn("Admin generation-cost summaries could not be loaded", { message: costResult.error.message });
    }
  }

  let versionRows = [];
  if (postIds.length) {
    const versionsResult = await context.admin
      .from("admin_post_versions")
      .select("id, post_id, version_number, reason, content, image_url, video_url, content_format, website_url, product_items, slides, created_at")
      .in("post_id", postIds)
      .order("version_number", { ascending: false });
    if (!versionsResult.error) {
      versionRows = versionsResult.data || [];
    } else if (!/admin_post_versions|schema cache|does not exist/i.test(String(versionsResult.error.message || ""))) {
      console.warn("Admin post versions could not be loaded", { message: versionsResult.error.message });
    }
  }

  let productReviewRows = [];
  if (postIds.length) {
    const productReviewResult = await context.admin
      .from("admin_review_cases")
      .select("post_id, product_items, updated_at")
      .in("post_id", postIds)
      .order("updated_at", { ascending: false });
    if (!productReviewResult.error) {
      productReviewRows = productReviewResult.data || [];
    } else if (!/admin_review_cases|schema cache|does not exist/i.test(String(productReviewResult.error.message || ""))) {
      console.warn("Admin review product source rows could not be loaded", {
        message: productReviewResult.error.message,
      });
    }
  }

  const userEntries = await Promise.all(
    userIds.map(async (userId) => {
      try {
        const { data } = await context.admin.auth.admin.getUserById(userId);
        return [userId, data?.user?.email || ""];
      } catch {
        return [userId, ""];
      }
    })
  );

  const brandMap = Object.fromEntries((brands || []).map((item) => [item.id, item.business_name]));
  const brandDetailsMap = Object.fromEntries((brands || []).map((item) => [item.id, item]));
  const ruleMap = Object.fromEntries((rules || []).map((item) => [item.id, item]));
  const userMap = Object.fromEntries(userEntries);
  const feedbackMap = Object.fromEntries((feedbackRows || []).map((item) => [item.post_id, item]));
  const reviewProductsMap = new Map();
  for (const row of productReviewRows) {
    if (!row?.post_id || reviewProductsMap.has(row.post_id)) continue;
    if (Array.isArray(row.product_items) && row.product_items.length) {
      reviewProductsMap.set(row.post_id, row.product_items);
    }
  }
  const slidesMap = (slideRows || []).reduce((map, slide) => {
    if (!map[slide.post_id]) map[slide.post_id] = [];
    map[slide.post_id].push(slide);
    return map;
  }, {});
  const versionsMap = (versionRows || []).reduce((map, version) => {
    if (!map[version.post_id]) map[version.post_id] = [];
    map[version.post_id].push(version);
    return map;
  }, {});
  const generationCostMap = Object.fromEntries(
    (generationCostRows || []).map((row) => [row.post_id, row])
  );

  const getEditableProductItems = (post) => {
    const slideProducts = (slidesMap[post.id] || [])
      .filter((slide) => {
        const role = String(slide?.metadata?.carousel_slide_role || "").toLowerCase();
        const title = slide?.metadata?.product_title || slide?.headline;
        return Boolean(title || slide?.product_url) && !role.includes("outro") && !role.includes("cta");
      })
      .slice(0, 5)
      .map((slide) => ({
        title: String(slide?.metadata?.product_title || slide?.headline || "").trim(),
        description: String(
          slide?.metadata?.product_description ||
          slide?.body ||
          slide?.metadata?.product_title ||
          slide?.headline ||
          ""
        ).trim(),
        url: String(slide?.product_url || "").trim(),
        image_url: String(slide?.metadata?.source_image_url || slide?.image_url || "").trim(),
        preview_image_url: String(slide?.image_url || "").trim(),
        product_brand: String(slide?.metadata?.product_brand || "").trim(),
        product_identifier: String(slide?.metadata?.product_identifier || "").trim(),
        product_display_type: String(slide?.metadata?.product_display_type || "").trim(),
        product_color: String(slide?.metadata?.product_color || "").trim(),
        product_image_width: Number(slide?.metadata?.product_image_width || 0) || null,
        product_image_height: Number(slide?.metadata?.product_image_height || 0) || null,
        product_identity_locked: slide?.metadata?.product_identity_locked === true,
        product_image_semantic_verified: slide?.metadata?.product_image_semantic_verified === true,
        existing_slide_order: slide?.slide_order || null,
      }));
    const storedProducts = Array.isArray(post.admin_product_items) && post.admin_product_items.length
      ? post.admin_product_items.slice(0, 5)
      : Array.isArray(reviewProductsMap.get(post.id))
        ? reviewProductsMap.get(post.id).slice(0, 5)
        : [];
    if (storedProducts.length === 0) return slideProducts;

    const itemCount = Math.max(slideProducts.length, storedProducts.length);
    return Array.from({ length: itemCount }, (_, index) => {
      const original = slideProducts[index] || {};
      const replacement = storedProducts[index] || {};
      const preferReplacement = (key) => {
        const replacementValue = String(replacement?.[key] || "").trim();
        return replacementValue || String(original?.[key] || "").trim();
      };

      return {
        ...original,
        ...replacement,
        image_url: preferReplacement("image_url"),
        title: preferReplacement("title"),
        description: preferReplacement("description"),
        url: preferReplacement("url"),
      };
    });
  };

  const getAdminSourceUrl = (item) => {
    const rule = ruleMap[item?.automation_rule_id] || {};
    const brand = brandDetailsMap[item?.brand_profile_id] || {};
    return String(
      item?.website_url ||
      rule?.content_source_url ||
      rule?.website_url ||
      brand?.website_product_source_url ||
      brand?.website_url ||
      ""
    ).trim();
  };

  const getOutroSlide = (postId) => (slidesMap[postId] || []).find((slide) => {
    const role = String(slide?.metadata?.carousel_slide_role || "").toLowerCase();
    return role.includes("outro") || role.includes("cta") || String(slide?.metadata?.slide_type || "").toLowerCase() === "product_outro";
  }) || null;

  const workItemByOccurrence = new Map(workItemRows.filter((item) => item.occurrence_id).map((item) => [item.occurrence_id, item]));
  const workItemByPost = new Map(workItemRows.filter((item) => item.post_id).map((item) => [item.post_id, item]));
  const representedWorkItemIds = new Set();
  for (const item of postRows) {
    const workItem = workItemByPost.get(item.id);
    if (workItem?.id) representedWorkItemIds.add(workItem.id);
  }
  for (const item of orphanFailures) {
    const workItem = workItemByOccurrence.get(item.id);
    if (workItem?.id) representedWorkItemIds.add(workItem.id);
  }
  for (const item of reviewOnlyFailures) {
    const workItem = item.occurrence_id ? workItemByOccurrence.get(item.occurrence_id) : null;
    if (workItem?.id) representedWorkItemIds.add(workItem.id);
  }
  const syntheticWorkItems = workItemRows.filter((item) => status === "upcoming" || !representedWorkItemIds.has(item.id));
  const workItemProducts = (item) => Array.isArray(item?.rescue_data?.products) ? item.rescue_data.products : [];
  const workItemFailure = (item) => {
    const occurrence = item?.occurrence_id ? occurrenceById.get(item.occurrence_id) || null : null;
    const heldRescueCredits = occurrence
      ? Math.max(0, Number(
          occurrence?.metadata?.rescue_credit_cost ||
          item?.technical_log?.rescue_credit_cost ||
          0
        ))
      : 0;
    const refundedCredits = Math.max(0, Number(occurrence?.refunded_credits || 0));
    return {
      id: item.occurrence_id || item.id,
      work_item_id: item.id,
      review_case_id: item.occurrence_id ? reviewCaseByOccurrence.get(item.occurrence_id)?.id || null : null,
      status: item.status === "failed" ? "failed_terminal" : item.status,
      scheduled_for: item.scheduled_for,
      content_type_label: item.content_type_label,
      content_format: item.content_format,
      campaign_title: item.plan_name,
      failure_code: item.failure_code,
      failure_stage: item.failure_stage,
      failure_message_internal: item.failure_message,
      failure_message_customer: occurrence?.failure_message_customer || null,
      refunded_credits: refundedCredits,
      notification_status: occurrence?.notification_status || "suppressed",
      held_rescue_credits: refundedCredits > 0 ? 0 : heldRescueCredits,
      rescue_credit_refund_available: refundedCredits <= 0 && heldRescueCredits > 0,
      technical_log: item.technical_log || {},
      technical_run_log: item.run_log_id ? workRunLogMap.get(item.run_log_id) || null : null,
      rescue_status: item.rescue_status || "none",
    };
  };

  return Response.json({
    ok: true,
    posts: [...postRows.map((item) => {
      const generationSummary = generationCostMap[item.id] || null;
      const missingExpectedCostEvents = getAdminMissingExpectedCostEvents(item, generationSummary);
      const generationBreakdown = generationSummary?.breakdown || {};
      return ({
      ...item,
      generation_cost_amount: generationSummary?.amount ?? null,
      generation_cost_currency: generationSummary?.currency || null,
      generation_cost_complete: generationSummary?.complete === true && missingExpectedCostEvents.length === 0,
      generation_cost_breakdown: {
        ...generationBreakdown,
        missing_expected_events: missingExpectedCostEvents,
      },
      generation_cost_updated_at: generationSummary?.updated_at || null,
      content_type_id: ruleMap[item.automation_rule_id]?.content_type_id || null,
      content_type_label: ruleMap[item.automation_rule_id]?.content_type_label || item.post_type || null,
      is_admin_test: item.is_admin_test === true || ruleMap[item.automation_rule_id]?.is_admin_test === true,
      admin_test_batch_id: item.admin_test_batch_id || ruleMap[item.automation_rule_id]?.admin_test_batch_id || null,
      admin_test_job_key: item.admin_test_job_key || ruleMap[item.automation_rule_id]?.admin_test_job_key || null,
      admin_test_campaign: ruleMap[item.automation_rule_id]?.queue_source === "campaign" ? ruleMap[item.automation_rule_id]?.name || null : null,
      admin_product_items: getEditableProductItems(item),
      brand_name: brandMap[item.brand_profile_id] || "",
      brand_admin_review_required: brands?.find((brand) => brand.id === item.brand_profile_id)?.admin_review_required ?? null,
      customer_email: userMap[item.user_id] || "",
      source_url: getAdminSourceUrl(item),
      brand_website_url: brandDetailsMap[item.brand_profile_id]?.website_url || "",
      rejection: feedbackMap[item.id] || null,
      slides: slidesMap[item.id] || [],
      outro_slide: getOutroSlide(item.id),
      versions: versionsMap[item.id] || [],
      work_item_id: workItemByPost.get(item.id)?.id || null,
      work_item: workItemByPost.get(item.id) || null,
      failure: reviewCaseByPost.get(item.id)
        ? (() => {
            const reviewCase = reviewCaseByPost.get(item.id);
            const occurrence = reviewCase?.occurrence_id ? occurrenceById.get(reviewCase.occurrence_id) || null : null;
            const refundedCredits = Math.max(0, Number(occurrence?.refunded_credits || 0));
            const heldRescueCredits = Math.max(0, Number(occurrence?.metadata?.rescue_credit_cost || 0));
            return {
              ...reviewCase,
              review_case_id: reviewCase.id,
              failure_message_internal: reviewCase.failure_message || item.video_error || null,
              refunded_credits: refundedCredits,
              notification_status: occurrence?.notification_status || "suppressed",
              held_rescue_credits: refundedCredits > 0 ? 0 : heldRescueCredits,
              rescue_credit_refund_available: Boolean(occurrence) && refundedCredits <= 0 && heldRescueCredits > 0,
              technical_log: workItemByPost.get(item.id)?.technical_log || {},
              technical_run_log: workItemByPost.get(item.id)?.run_log_id ? workRunLogMap.get(workItemByPost.get(item.id)?.run_log_id) || null : null,
            };
          })()
        : (workItemByPost.get(item.id)?.status === "failed" ? workItemFailure(workItemByPost.get(item.id)) : null),
      });
    }), ...orphanFailures.map((occurrence) => ({
      id: `occurrence-${occurrence.id}`,
      occurrence_id: occurrence.id,
      user_id: occurrence.user_id,
      brand_profile_id: occurrence.brand_profile_id,
      automation_rule_id: occurrence.automation_rule_id,
      status: occurrence.status === "failed_terminal" ? "failed" : "creating",
      content: occurrence.campaign_title || occurrence.content_type_label || "",
      platform: ruleMap[occurrence.automation_rule_id]?.platform || null,
      content_type_id: ruleMap[occurrence.automation_rule_id]?.content_type_id || null,
      content_type_label: ruleMap[occurrence.automation_rule_id]?.content_type_label || occurrence.content_type_label || null,
      is_admin_test: occurrence.is_admin_test === true || ruleMap[occurrence.automation_rule_id]?.is_admin_test === true,
      admin_test_batch_id: occurrence.admin_test_batch_id || ruleMap[occurrence.automation_rule_id]?.admin_test_batch_id || null,
      admin_test_job_key: occurrence.admin_test_job_key || ruleMap[occurrence.automation_rule_id]?.admin_test_job_key || null,
      admin_test_campaign: ruleMap[occurrence.automation_rule_id]?.queue_source === "campaign" ? ruleMap[occurrence.automation_rule_id]?.name || null : null,
      post_type: occurrence.content_type_label || "Generation",
      content_format: occurrence.content_format || null,
      image_url: null,
      video_url: null,
      image_status: "missing",
      video_status: "missing",
      video_error: occurrence.failure_message_internal || occurrence.failure_message_customer || occurrence.failure_code,
      scheduled_for: occurrence.scheduled_for,
      created_at: occurrence.started_at,
      updated_at: occurrence.finished_at || occurrence.started_at,
      admin_review_status: occurrence.status === "failed_terminal" ? "needs_repair" : "creating",
      admin_product_items:
        reviewCaseByOccurrence.get(occurrence.id)?.product_items ||
        occurrence.metadata?.admin_product_items ||
        occurrence.metadata?.partial_products ||
        [],
      brand_admin_review_required: brands?.find((brand) => brand.id === occurrence.brand_profile_id)?.admin_review_required ?? null,
      brand_name: brandMap[occurrence.brand_profile_id] || "",
      customer_email: userMap[occurrence.user_id] || "",
      source_url: getAdminSourceUrl(occurrence),
      brand_website_url: brandDetailsMap[occurrence.brand_profile_id]?.website_url || "",
      rejection: null,
      slides: [],
      work_item_id: workItemByOccurrence.get(occurrence.id)?.id || null,
      work_item: workItemByOccurrence.get(occurrence.id) || null,
      failure: {
        ...occurrence,
        held_rescue_credits: Math.max(0, Number(occurrence?.metadata?.rescue_credit_cost || 0)),
        rescue_credit_refund_available: Math.max(0, Number(occurrence?.refunded_credits || 0)) <= 0 && Math.max(0, Number(occurrence?.metadata?.rescue_credit_cost || 0)) > 0,
        ...(workItemByOccurrence.get(occurrence.id) ? {
          work_item_id: workItemByOccurrence.get(occurrence.id).id,
          technical_log: workItemByOccurrence.get(occurrence.id).technical_log || {},
          technical_run_log: workItemByOccurrence.get(occurrence.id).run_log_id ? workRunLogMap.get(workItemByOccurrence.get(occurrence.id).run_log_id) || null : null,
          rescue_status: workItemByOccurrence.get(occurrence.id).rescue_status || "none",
        } : {}),
        ...(reviewCaseByOccurrence.get(occurrence.id)
          ? {
              review_case_id: reviewCaseByOccurrence.get(occurrence.id).id,
              failure_code:
                reviewCaseByOccurrence.get(occurrence.id).failure_code ||
                occurrence.failure_code,
              failure_stage:
                reviewCaseByOccurrence.get(occurrence.id).failure_stage ||
                occurrence.failure_stage,
              failure_message_internal:
                reviewCaseByOccurrence.get(occurrence.id).failure_message ||
                occurrence.failure_message_internal,
            }
          : {}),
      },
    })), ...reviewOnlyFailures.map((reviewCase) => ({
      id: `review-case-${reviewCase.id}`,
      occurrence_id: reviewCase.occurrence_id || null,
      user_id: reviewCase.user_id,
      brand_profile_id: reviewCase.brand_profile_id,
      automation_rule_id: reviewCase.automation_rule_id,
      status: "failed",
      content: reviewCase.campaign_title || reviewCase.content_type_label || "",
      platform: ruleMap[reviewCase.automation_rule_id]?.platform || null,
      content_type_id: ruleMap[reviewCase.automation_rule_id]?.content_type_id || null,
      content_type_label: ruleMap[reviewCase.automation_rule_id]?.content_type_label || reviewCase.content_type_label || null,
      is_admin_test: reviewCase.is_admin_test === true || ruleMap[reviewCase.automation_rule_id]?.is_admin_test === true,
      admin_test_batch_id: reviewCase.admin_test_batch_id || ruleMap[reviewCase.automation_rule_id]?.admin_test_batch_id || null,
      admin_test_job_key: reviewCase.admin_test_job_key || ruleMap[reviewCase.automation_rule_id]?.admin_test_job_key || null,
      admin_test_campaign: ruleMap[reviewCase.automation_rule_id]?.queue_source === "campaign" ? ruleMap[reviewCase.automation_rule_id]?.name || null : null,
      post_type: reviewCase.content_type_label || "Generation",
      content_format: reviewCase.content_format || null,
      image_url: null,
      video_url: null,
      image_status: "missing",
      video_status: "missing",
      video_error: reviewCase.failure_message || reviewCase.failure_code || "Post generation needs repair",
      scheduled_for: reviewCase.scheduled_for,
      created_at: reviewCase.created_at,
      updated_at: reviewCase.updated_at || reviewCase.created_at,
      admin_review_status: "needs_repair",
      admin_product_items: Array.isArray(reviewCase.product_items) ? reviewCase.product_items : [],
      brand_admin_review_required: brands?.find((brand) => brand.id === reviewCase.brand_profile_id)?.admin_review_required ?? null,
      brand_name: brandMap[reviewCase.brand_profile_id] || "",
      customer_email: userMap[reviewCase.user_id] || "",
      source_url: getAdminSourceUrl(reviewCase),
      brand_website_url: brandDetailsMap[reviewCase.brand_profile_id]?.website_url || "",
      rejection: null,
      slides: [],
      work_item_id: reviewCase.occurrence_id ? workItemByOccurrence.get(reviewCase.occurrence_id)?.id || null : null,
      work_item: reviewCase.occurrence_id ? workItemByOccurrence.get(reviewCase.occurrence_id) || null : null,
      failure: (() => {
        const occurrence = reviewCase.occurrence_id ? occurrenceById.get(reviewCase.occurrence_id) || null : null;
        const refundedCredits = Math.max(0, Number(occurrence?.refunded_credits || 0));
        const heldRescueCredits = Math.max(0, Number(occurrence?.metadata?.rescue_credit_cost || 0));
        return {
          id: reviewCase.occurrence_id || reviewCase.id,
          review_case_id: reviewCase.id,
          status: "failed_terminal",
          scheduled_for: reviewCase.scheduled_for,
          content_type_label: reviewCase.content_type_label,
          content_format: reviewCase.content_format,
          campaign_title: reviewCase.campaign_title,
          failure_code: reviewCase.failure_code,
          failure_stage: reviewCase.failure_stage,
          failure_message_internal: reviewCase.failure_message,
          failure_message_customer: occurrence?.failure_message_customer || null,
          refunded_credits: refundedCredits,
          notification_status: occurrence?.notification_status || "suppressed",
          held_rescue_credits: refundedCredits > 0 ? 0 : heldRescueCredits,
          rescue_credit_refund_available: Boolean(occurrence) && refundedCredits <= 0 && heldRescueCredits > 0,
        };
      })(),
    })), ...syntheticWorkItems.map((workItem) => ({
      id: `work-item-${workItem.id}`,
      work_item_id: workItem.id,
      work_item: workItem,
      occurrence_id: workItem.occurrence_id || null,
      user_id: workItem.user_id,
      brand_profile_id: workItem.brand_profile_id,
      automation_rule_id: workItem.automation_rule_id,
      status: workItem.status === "failed"
        ? "failed"
        : workItem.status === "running"
          ? "creating"
          : workItem.status === "approval"
            ? "pending_approval"
            : workItem.status === "history"
              ? "approved"
              : "planned",
      content: workItem.plan_name || workItem.content_type_label || "",
      platform: workItem.platform || ruleMap[workItem.automation_rule_id]?.platform || null,
      content_type_id: workItem.content_type_id || ruleMap[workItem.automation_rule_id]?.content_type_id || null,
      content_type_label: workItem.content_type_label || ruleMap[workItem.automation_rule_id]?.content_type_label || null,
      is_admin_test: workItem.is_admin_test === true || ruleMap[workItem.automation_rule_id]?.is_admin_test === true,
      admin_test_batch_id: workItem.admin_test_batch_id || ruleMap[workItem.automation_rule_id]?.admin_test_batch_id || null,
      admin_test_job_key: workItem.admin_test_job_key || ruleMap[workItem.automation_rule_id]?.admin_test_job_key || null,
      admin_test_campaign: ruleMap[workItem.automation_rule_id]?.queue_source === "campaign" ? ruleMap[workItem.automation_rule_id]?.name || null : null,
      post_type: workItem.content_type_label || "Planned post",
      content_format: workItem.content_format || null,
      scheduled_for: workItem.scheduled_for,
      created_at: workItem.created_at,
      updated_at: workItem.updated_at,
      admin_review_status: workItem.status === "failed" ? "needs_repair" : workItem.status === "approval" ? "pending" : workItem.status === "history" ? "approved_by_spreelo" : "planned",
      admin_product_items: workItemProducts(workItem),
      brand_name: brandMap[workItem.brand_profile_id] || "",
      brand_admin_review_required: brands?.find((brand) => brand.id === workItem.brand_profile_id)?.admin_review_required ?? null,
      customer_email: userMap[workItem.user_id] || "",
      source_url: workItem.source_url || getAdminSourceUrl(workItem),
      brand_website_url: brandDetailsMap[workItem.brand_profile_id]?.website_url || "",
      rejection: null,
      slides: [],
      failure: workItem.status === "failed" ? workItemFailure(workItem) : null,
      rescue_status: workItem.rescue_status || "none",
      requirement_count: workItem.requirement_count || 0,
      product_strategy: workItem.product_strategy || null,
      product_match_terms: workItem.product_match_terms || [],
      product_search_queries: workItem.product_search_queries || [],
      prompt_snapshot: workItem.prompt_snapshot || null,
      strategy_snapshot: workItem.strategy_snapshot || null,
      rule_snapshot: workItem.rule_snapshot || {},
    }))],
  }, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
    },
  });
}

export async function PATCH(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);

  const body = await request.json().catch(() => ({}));
  if (body?.action === "release_to_customer") {
    return releasePostToCustomer({ context, body });
  }
  if (body?.action === "set_brand_review_policy") {
    return setBrandReviewPolicy({ context, body });
  }
  if (body?.action === "save_materials") {
    return saveAdminMaterials({ context, body });
  }
  if (body?.action === "archive" || body?.action === "bulk_archive") {
    return archivePosts({ context, body });
  }
  const feedbackId = String(body?.feedback_id || "").trim();
  if (!feedbackId) {
    return Response.json({ ok: false, error: "Feedback ID is required." }, { status: 400 });
  }

  const reviewStatus = REVIEW_STATUSES.has(String(body?.review_status || ""))
    ? String(body.review_status)
    : "new";
  const requestedRefundStatus = REFUND_STATUSES.has(String(body?.refund_status || ""))
    ? String(body.refund_status)
    : "pending_review";
  const now = new Date().toISOString();

  const { data: existingFeedback, error: feedbackError } = await context.admin
    .from("post_rejection_feedback")
    .select("id, post_id, user_id, refund_status")
    .eq("id", feedbackId)
    .single();

  if (feedbackError || !existingFeedback) {
    return Response.json(
      { ok: false, error: feedbackError?.message || "Feedback could not be found." },
      { status: 404 }
    );
  }

  let finalRefundStatus = requestedRefundStatus;
  const shouldReturnCredits =
    ["approved", "credited"].includes(requestedRefundStatus) &&
    existingFeedback.refund_status !== "credited";

  if (shouldReturnCredits) {
    const { data: post, error: postError } = await context.admin
      .from("posts")
      .select("id, user_id, automation_rule_id")
      .eq("id", existingFeedback.post_id)
      .single();

    if (postError || !post?.user_id) {
      return Response.json(
        { ok: false, error: postError?.message || "The rejected post account could not be found." },
        { status: 400 }
      );
    }

    let refundCredits = 1;
    if (post.automation_rule_id) {
      const { data: rule } = await context.admin
        .from("automation_rules")
        .select("credit_cost")
        .eq("id", post.automation_rule_id)
        .maybeSingle();
      refundCredits = Math.max(1, Number(rule?.credit_cost || 1));
    }

    let targetEmail = "";
    try {
      const { data } = await context.admin.auth.admin.getUserById(post.user_id);
      targetEmail = data?.user?.email || "";
    } catch {
      targetEmail = "";
    }

    const { error: adjustmentError } = await context.admin.rpc(
      "admin_adjust_user_credits",
      {
        p_target_user_id: post.user_id,
        p_target_email: targetEmail || null,
        p_amount: refundCredits,
        p_reason: `Approved rejection refund for post ${post.id}`,
        p_admin_user_id: context.user.id,
        p_admin_email: context.user.email || null,
      }
    );

    if (adjustmentError) {
      return Response.json({ ok: false, error: adjustmentError.message }, { status: 500 });
    }

    finalRefundStatus = "credited";
  } else if (
    existingFeedback.refund_status === "credited" &&
    requestedRefundStatus !== "credited"
  ) {
    finalRefundStatus = "credited";
  }

  const { data, error } = await context.admin
    .from("post_rejection_feedback")
    .update({
      review_status: reviewStatus,
      refund_status: finalRefundStatus,
      admin_note: String(body?.admin_note || "").trim() || null,
      reviewed_by: context.user.id,
      reviewed_at: reviewStatus === "new" ? null : now,
      updated_at: now,
    })
    .eq("id", feedbackId)
    .select("*")
    .single();

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, feedback: data });
}

async function setBrandReviewPolicy({ context, body }) {
  const brandProfileId = String(body?.brand_profile_id || "").trim();
  if (!brandProfileId) return Response.json({ ok: false, error: "Brand profile ID is required." }, { status: 400 });
  const { data, error } = await context.admin
    .from("brand_profiles")
    .update({
      admin_review_required:
        body?.admin_review_required === null ? null : Boolean(body?.admin_review_required),
      updated_at: new Date().toISOString(),
    })
    .eq("id", brandProfileId)
    .select("id, admin_review_required")
    .single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, brand: data });
}

function normalizeProductItems(items) {
  return (Array.isArray(items) ? items : []).slice(0, 10).map((item) => ({
    title: String(item?.title || "").trim().slice(0, 240),
    description: String(item?.description || "").trim().slice(0, 3000),
    url: String(item?.url || "").trim().slice(0, 2000),
    image_url: String(item?.image_url || "").trim().slice(0, 3000),
    preview_image_url: String(item?.preview_image_url || "").trim().slice(0, 3000),
    product_brand: String(item?.product_brand || "").trim().slice(0, 180),
    product_identifier: String(item?.product_identifier || "").trim().slice(0, 180),
    product_display_type: String(item?.product_display_type || "").trim().slice(0, 220),
    product_color: String(item?.product_color || "").trim().slice(0, 220),
    product_image_width: Number(item?.product_image_width || 0) || null,
    product_image_height: Number(item?.product_image_height || 0) || null,
    product_identity_locked: item?.product_identity_locked === true,
    product_image_semantic_verified: item?.product_image_semantic_verified === true,
    locked_product_fingerprint: String(item?.locked_product_fingerprint || "").trim().slice(0, 240),
    manual_override: item?.manual_override === true,
    manual_image_override: item?.manual_image_override === true,
    manual_override_note: String(item?.manual_override_note || "").trim().slice(0, 500),
  }));
}

async function saveAdminMaterials({ context, body }) {
  const postId = String(body?.post_id || "").trim();
  const occurrenceId = String(body?.occurrence_id || "").trim();
  const productItems = normalizeProductItems(body?.product_items);
  const content = String(body?.content || "").trim().slice(0, 12000);
  if (!postId && !occurrenceId) return Response.json({ ok: false, error: "Post or occurrence ID is required." }, { status: 400 });

  if (postId) {
    const { error } = await context.admin.from("posts").update({
      admin_product_items: productItems,
      ...(content ? { content } : {}),
      admin_review_status: "pending",
      updated_at: new Date().toISOString(),
    }).eq("id", postId);
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (occurrenceId) {
    const { data: occurrence, error: loadError } = await context.admin
      .from("automation_occurrences").select("metadata").eq("id", occurrenceId).single();
    if (loadError) return Response.json({ ok: false, error: loadError.message }, { status: 500 });
    const { error } = await context.admin.from("automation_occurrences").update({
      metadata: { ...(occurrence?.metadata || {}), admin_product_items: productItems, admin_content: content || null },
    }).eq("id", occurrenceId);
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true, product_items: productItems });
}

async function archivePosts({ context, body }) {
  const ids = Array.from(new Set((body?.post_ids || [body?.post_id]).map((value) => String(value || "").trim()).filter(Boolean)));
  if (!ids.length) return Response.json({ ok: false, error: "At least one post ID is required." }, { status: 400 });
  const now = new Date().toISOString();
  const { error } = await context.admin.from("posts").update({
    admin_archived_at: now,
    admin_archived_by: context.user.id,
    admin_review_status: "archived",
    updated_at: now,
  }).in("id", ids);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, archived: ids.length });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function releasePostToCustomer({ context, body }) {
  const postId = String(body?.post_id || "").trim();
  if (!postId) return Response.json({ ok: false, error: "Post ID is required." }, { status: 400 });

  const { data: post, error: postError } = await context.admin
    .from("posts")
    .select("id, user_id, brand_profile_id, automation_rule_id, status, content, platform, post_type, content_format, image_url, video_url, approval_token, scheduled_for, admin_review_status, language")
    .eq("id", postId)
    .single();
  if (postError || !post) {
    return Response.json({ ok: false, error: postError?.message || "Post not found." }, { status: 404 });
  }
  if (post.status === "failed") {
    return Response.json({ ok: false, error: "A failed post must be repaired before it can be released." }, { status: 400 });
  }

  const [{ data: brand }, { data: rule }] = await Promise.all([
    context.admin.from("brand_profiles").select("business_name, content_language").eq("id", post.brand_profile_id).maybeSingle(),
    post.automation_rule_id
      ? context.admin.from("automation_rules").select("*").eq("id", post.automation_rule_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  let customerEmail = "";
  let userAppLanguage = null;
  try {
    const { data } = await context.admin.auth.admin.getUserById(post.user_id);
    customerEmail = data?.user?.email || "";
    const metadata = data?.user?.user_metadata || {};
    userAppLanguage = metadata.app_locale || metadata.appLocale || metadata.app_language || metadata.appLanguage || metadata.ui_language || metadata.uiLanguage || metadata.locale || null;
  } catch {
    customerEmail = "";
  }
  if (!customerEmail) return Response.json({ ok: false, error: "Customer email is missing." }, { status: 400 });
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) return Response.json({ ok: false, error: "RESEND_API_KEY is not configured." }, { status: 500 });

  try {
    await sendApprovalEmail({
      supabase: context.admin,
      resendApiKey,
      to: customerEmail,
      rule: {
        ...(rule || {}),
        platform: post.platform || rule?.platform,
        post_type: post.post_type || rule?.post_type,
        content_format: post.content_format || rule?.content_format,
        language: post.language || rule?.language || brand?.content_language,
        brand_profile: brand || null,
      },
      postContent: post.content,
      approvalToken: post.approval_token,
      imageUrl: post.content_format === "carousel" ? null : post.image_url,
      userAppLanguage,
      postId: post.id,
      contentFormat: post.content_format,
    });
  } catch (emailError) {
    return Response.json({ ok: false, error: emailError?.message || "Customer email could not be sent." }, { status: 502 });
  }

  const releasedAt = new Date().toISOString();
  const { error: releaseUpdateError } = await context.admin.from("posts").update({
    admin_review_status: "approved_by_spreelo",
    admin_reviewed_at: releasedAt,
    admin_reviewed_by: context.user.id,
    admin_review_note: String(body?.admin_note || "").trim() || null,
    approval_email_sent_at: releasedAt,
    updated_at: releasedAt,
  }).eq("id", post.id);
  if (releaseUpdateError) return Response.json({ ok: false, error: releaseUpdateError.message }, { status: 500 });
  await context.admin.from("admin_review_cases").update({
    status: "approved_by_spreelo",
    needs_review: false,
    reviewed_at: releasedAt,
    reviewed_by: context.user.id,
    delivered_at: releasedAt,
    updated_at: releasedAt,
  }).eq("post_id", post.id);
  return Response.json({ ok: true, released: true, recipient: customerEmail });

  /* Legacy v143.28 release template retained below only for deployment rollback reference.
  const appUrl = String(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://app.spreelo.com").replace(/\/$/, "");
  const token = encodeURIComponent(post.approval_token || "");
  const approveUrl = `${appUrl}/api/approve-post?token=${token}`;
  const rejectUrl = `${appUrl}/api/reject-post?token=${token}`;
  const media = (slides || []).length
    ? (slides || []).map((slide) => slide.image_url ? `<img src="${escapeHtml(slide.image_url)}" alt="" style="width:150px;height:150px;object-fit:contain;border:1px solid #e5e7eb;border-radius:10px;margin:5px"/>` : "").join("")
    : post.image_url
      ? `<img src="${escapeHtml(post.image_url)}" alt="" style="width:100%;max-height:460px;object-fit:contain;border-radius:14px"/>`
      : "";
  const brandName = brand?.business_name || "your brand";
  const html = `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;padding:30px;color:#172033"><div style="color:#d65337;font-weight:800;letter-spacing:.1em;font-size:12px">SPREELO · READY FOR REVIEW</div><h1 style="font-size:28px;margin:10px 0">Your post for ${escapeHtml(brandName)} is ready</h1><p style="color:#667085;line-height:1.65">Spreelo has completed its internal quality review. Review the complete post below and approve it when you are happy.</p><div style="margin:22px 0">${media}</div><div style="white-space:pre-wrap;line-height:1.65;background:#f8fafc;padding:18px;border-radius:12px">${escapeHtml(post.content)}</div><div style="margin-top:24px"><a href="${approveUrl}" style="display:inline-block;background:#e85c3c;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:800;margin-right:9px">Approve post</a><a href="${rejectUrl}" style="display:inline-block;color:#344054;text-decoration:none;padding:12px 18px;border:1px solid #d6dce5;border-radius:10px;font-weight:700">Request changes</a></div></div>`;

  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || "Spreelo <noreply@spreelo.com>",
      to: customerEmail,
      subject: `Your Spreelo post is ready · ${brandName}`,
      html,
      text: `Your post for ${brandName} is ready for review.\n\n${post.content || ""}\n\nApprove: ${approveUrl}\nRequest changes: ${rejectUrl}`,
    }),
  });
  if (!emailResponse.ok) {
    return Response.json({ ok: false, error: (await emailResponse.text()) || "Customer email could not be sent." }, { status: 502 });
  }

  const now = new Date().toISOString();
  const { error: updateError } = await context.admin.from("posts").update({
    admin_review_status: "released",
    admin_reviewed_at: now,
    admin_reviewed_by: context.user.id,
    admin_review_note: String(body?.admin_note || "").trim() || null,
    approval_email_sent_at: now,
    updated_at: now,
  }).eq("id", post.id);
  if (updateError) return Response.json({ ok: false, error: updateError.message }, { status: 500 });
  return Response.json({ ok: true, released: true, recipient: customerEmail }); */
}

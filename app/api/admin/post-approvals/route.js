import { adminContextError, getAdminContext } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

const VISIBLE_STATUSES = new Set(["pending_approval", "approved", "rejected"]);
const REVIEW_STATUSES = new Set(["new", "reviewing", "resolved"]);
const REFUND_STATUSES = new Set(["pending_review", "approved", "declined", "credited"]);

export async function GET(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);

  const url = new URL(request.url);
  const status = String(url.searchParams.get("status") || "all");

  let query = context.admin
    .from("posts")
    .select(
      "id, user_id, brand_profile_id, automation_rule_id, status, content, platform, post_type, content_format, image_url, video_url, image_status, video_status, scheduled_for, created_at, updated_at, approved_at, approval_email_sent_at"
    )
    .in("status", Array.from(VISIBLE_STATUSES))
    .order("created_at", { ascending: false })
    .limit(150);

  if (VISIBLE_STATUSES.has(status)) query = query.eq("status", status);

  const { data: posts, error } = await query;
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const postRows = posts || [];
  const brandIds = Array.from(new Set(postRows.map((item) => item.brand_profile_id).filter(Boolean)));
  const userIds = Array.from(new Set(postRows.map((item) => item.user_id).filter(Boolean)));
  const postIds = postRows.map((item) => item.id);

  const [{ data: brands }, { data: feedbackRows }, { data: slideRows }] = await Promise.all([
    brandIds.length
      ? context.admin.from("brand_profiles").select("id, business_name").in("id", brandIds)
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
  const userMap = Object.fromEntries(userEntries);
  const feedbackMap = Object.fromEntries((feedbackRows || []).map((item) => [item.post_id, item]));
  const slidesMap = (slideRows || []).reduce((map, slide) => {
    if (!map[slide.post_id]) map[slide.post_id] = [];
    map[slide.post_id].push(slide);
    return map;
  }, {});

  return Response.json({
    ok: true,
    posts: postRows.map((item) => ({
      ...item,
      brand_name: brandMap[item.brand_profile_id] || "",
      customer_email: userMap[item.user_id] || "",
      rejection: feedbackMap[item.id] || null,
      slides: slidesMap[item.id] || [],
    })),
  });
}

export async function PATCH(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);

  const body = await request.json().catch(() => ({}));
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

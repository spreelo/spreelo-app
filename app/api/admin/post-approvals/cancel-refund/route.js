import { adminContextError, getAdminContext } from "../../../../../lib/adminAuth";
import { sendFailedOccurrenceRefundedEmail } from "../../../../../lib/failedOccurrenceEmails.js";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);

  const body = await request.json().catch(() => ({}));
  const occurrenceId = String(body?.occurrence_id || "").trim();
  if (!occurrenceId) {
    return Response.json({ ok: false, error: "Occurrence ID is required." }, { status: 400 });
  }

  const { data: occurrence, error: occurrenceError } = await context.admin
    .from("automation_occurrences")
    .select("id,user_id,brand_profile_id,automation_rule_id,status,scheduled_for,content_type_label,content_format,failure_code,failure_message_customer,refunded_credits,notification_status,metadata")
    .eq("id", occurrenceId)
    .maybeSingle();
  if (occurrenceError) return Response.json({ ok: false, error: occurrenceError.message }, { status: 500 });
  if (!occurrence) return Response.json({ ok: false, error: "Failed occurrence was not found." }, { status: 404 });
  if (occurrence.status !== "failed_terminal") {
    return Response.json({ ok: false, error: "Only a failed occurrence can be cancelled and refunded." }, { status: 409 });
  }

  const heldCredit = Math.max(0, Number(occurrence?.metadata?.rescue_credit_cost || occurrence.refunded_credits || 0));
  const alreadyRefunded = Math.max(0, Number(occurrence.refunded_credits || 0));
  if (heldCredit <= 0 && alreadyRefunded <= 0) {
    return Response.json({ ok: false, error: "This failed occurrence has no held rescue credit to refund." }, { status: 409 });
  }

  const { data: refundResult, error: refundError } = await context.admin.rpc(
    "cancel_failed_automation_occurrence_and_refund",
    {
      p_occurrence_id: occurrenceId,
      p_admin_user_id: context.user.id,
    }
  );
  if (refundError) {
    return Response.json({ ok: false, error: refundError.message }, { status: 500 });
  }

  const refundedCredits = Math.max(
    0,
    Number(refundResult?.refunded_credits || alreadyRefunded || heldCredit || 0)
  );

  const [{ data: brand }, { data: rule }] = await Promise.all([
    occurrence.brand_profile_id
      ? context.admin.from("brand_profiles").select("business_name").eq("id", occurrence.brand_profile_id).maybeSingle()
      : Promise.resolve({ data: null }),
    occurrence.automation_rule_id
      ? context.admin.from("automation_rules").select("name,content_type_label,post_type,content_format").eq("id", occurrence.automation_rule_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  let emailResult = null;
  try {
    emailResult = await sendFailedOccurrenceRefundedEmail({
      supabaseAdmin: context.admin,
      userId: occurrence.user_id,
      brandName: brand?.business_name || "Spreelo",
      postType: occurrence.content_type_label || rule?.content_type_label || rule?.post_type || rule?.content_format || occurrence.content_format || "post",
      failureCode: occurrence.failure_code,
      refundedCredits,
    });

    await context.admin.rpc("mark_automation_failure_notification", {
      p_occurrence_id: occurrenceId,
      p_status: "sent",
      p_recipient: emailResult?.recipient || null,
      p_subject: emailResult?.subject || null,
      p_error_message: null,
      p_metadata: {
        admin_cancelled_and_refunded: true,
        refunded_credits: refundedCredits,
        locale: emailResult?.locale || null,
      },
    });
  } catch (emailError) {
    await context.admin.rpc("mark_automation_failure_notification", {
      p_occurrence_id: occurrenceId,
      p_status: "failed",
      p_recipient: null,
      p_subject: null,
      p_error_message: String(emailError?.message || "Customer email failed").slice(0, 1800),
      p_metadata: {
        admin_cancelled_and_refunded: true,
        refunded_credits: refundedCredits,
        refund_applied_but_customer_email_failed: true,
      },
    }).catch(() => {});

    return Response.json({
      ok: false,
      refund_applied: true,
      refunded_credits: refundedCredits,
      email_sent: false,
      error: "The credit was refunded, but the customer email could not be sent. Try again from the failed case.",
    }, { status: 502 });
  }

  const now = new Date().toISOString();
  const mergedMetadata = {
    ...(occurrence.metadata || {}),
    admin_rescue_cancelled_at: occurrence?.metadata?.admin_rescue_cancelled_at || now,
    admin_rescue_cancelled_by: context.user.id,
    rescue_credit_refunded: true,
    rescue_credit_refund_available: false,
    rescue_refund_amount: refundedCredits,
    customer_failure_notified_at: now,
    customer_failure_notification_locale: emailResult?.locale || null,
  };

  await Promise.all([
    context.admin
      .from("automation_occurrences")
      .update({ metadata: mergedMetadata, notification_status: "sent", updated_at: now })
      .eq("id", occurrenceId),
    context.admin
      .from("admin_review_cases")
      .update({
        status: "resolved",
        needs_review: false,
        reviewed_at: now,
        reviewed_by: context.user.id,
        updated_at: now,
      })
      .eq("occurrence_id", occurrenceId),
    context.admin
      .from("admin_generation_work_items")
      .update({
        status: "cancelled",
        rescue_status: "used",
        updated_at: now,
      })
      .eq("occurrence_id", occurrenceId),
  ]);

  return Response.json({
    ok: true,
    refund_applied: true,
    refunded_credits: refundedCredits,
    email_sent: true,
    locale: emailResult?.locale || "en",
    recipient: emailResult?.recipient || null,
  });
}

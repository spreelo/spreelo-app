export function getCustomerFriendlyAnalysisError(error) {
  const message = String(error?.message || "");

  if (
    message.includes("FUNCTION_INVOCATION_TIMEOUT") ||
    message.toLowerCase().includes("timeout") ||
    message.toLowerCase().includes("aborted")
  ) {
    return "Spreelo could not finish the website analysis in time. Please try again. If it still takes too long, add a short business description instead.";
  }

  if (
    message.toLowerCase().includes("json") ||
    message.toLowerCase().includes("parse") ||
    message.toLowerCase().includes("openai response") ||
    message.toLowerCase().includes("analysis result")
  ) {
    return "Spreelo could not read the analysis result correctly. Please try again.";
  }

  if (
    message.toLowerCase().includes("website returned") ||
    message.toLowerCase().includes("website did not return html") ||
    message.toLowerCase().includes("fetch failed") ||
    message.toLowerCase().includes("website url") ||
    message.toLowerCase().includes("website is required")
  ) {
    return "Spreelo could not read this website right now. Please check the website URL or add a short business description instead.";
  }

  return (
    message ||
    "Spreelo could not finish the brand analysis right now. Please try again."
  );
}

export async function updateBrandAnalysisJob({
  supabase,
  userId,
  jobId,
  status,
  step,
  progress,
  result,
  errorMessage,
  internalError,
  startedAt,
  completedAt,
  failedAt,
}) {
  const updatePayload = {
    updated_at: new Date().toISOString(),
  };

  if (status !== undefined) {
    updatePayload.status = status;
  }

  if (step !== undefined) {
    updatePayload.step = step;
  }

  if (progress !== undefined) {
    updatePayload.progress = progress;
  }

  if (result !== undefined) {
    updatePayload.result = result;
  }

  if (errorMessage !== undefined) {
    updatePayload.error_message = errorMessage;
  }

  if (internalError !== undefined) {
    updatePayload.internal_error = internalError;
  }

  if (startedAt !== undefined) {
    updatePayload.started_at = startedAt;
  }

  if (completedAt !== undefined) {
    updatePayload.completed_at = completedAt;
  }

  if (failedAt !== undefined) {
    updatePayload.failed_at = failedAt;
  }

  const { data, error } = await supabase
    .from("brand_analysis_jobs")
    .update(updatePayload)
    .eq("id", jobId)
    .eq("user_id", userId)
    .select(
      [
        "id",
        "brand_profile_id",
        "status",
        "step",
        "progress",
        "website_url",
        "brand_description",
        "business_name",
        "content_market",
        "country_code",
        "content_language",
        "result",
        "error_message",
        "created_at",
        "updated_at",
        "started_at",
        "completed_at",
        "failed_at",
      ].join(", ")
    )
    .single();

  if (error) {
    throw new Error(error.message || "Could not update analysis job.");
  }

  return data;
}

export async function readBrandAnalysisJob({ supabase, userId, jobId }) {
  const { data: job, error } = await supabase
    .from("brand_analysis_jobs")
    .select(
      [
        "id",
        "user_id",
        "brand_profile_id",
        "status",
        "step",
        "progress",
        "website_url",
        "brand_description",
        "business_name",
        "content_market",
        "country_code",
        "content_language",
        "result",
        "error_message",
        "internal_error",
        "created_at",
        "updated_at",
        "started_at",
        "completed_at",
        "failed_at",
      ].join(", ")
    )
    .eq("id", jobId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Could not read analysis job.");
  }

  return job;
}

export async function verifyBrandAnalysisOwnership({
  supabase,
  userId,
  brandProfileId,
}) {
  const { data, error } = await supabase
    .from("brand_profiles")
    .select("id, business_name")
    .eq("id", brandProfileId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Could not verify brand profile.");
  }

  if (!data?.id) {
    throw new Error("Brand profile not found.");
  }

  return data;
}

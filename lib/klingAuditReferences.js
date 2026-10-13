// v144.338 — A paid task requires a persisted, readable reference contract.
// The cron must select the start-image columns as well as the JSON metadata.
export const KLING_FINALIZER_POST_SELECT = "id, user_id, brand_profile_id, automation_rule_id, include_logo, logo_url, status, content, cta_type, language, website_url, image_url, image_storage_path, kling_reference_image_url, admin_review_status, video_provider, video_status, video_duration_seconds, video_error, video_background_selection, kling_generation_count, kling_task_id, kling_task_status, kling_submitted_at, kling_last_polled_at, kling_model, kling_resolution, kling_audio, updated_at";
export function httpUrl(value) {
  try { const url = new URL(String(value || "").trim()); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; }
  catch { return ""; }
}
export function klingAuditReferences(post) {
  const selection = post?.video_background_selection || {};
  const backup = selection.kling_audit_references || {};
  return {
    productRequired: typeof backup.product_required === "boolean" ? backup.product_required : selection.identity_validation_required !== false,
    sceneUrl: httpUrl(backup.scene_image_url || post?.kling_reference_image_url || post?.image_url),
    productUrl: httpUrl(backup.product_image_url || selection.verified_product_image_url),
    viewLock: backup.verified_view_lock || selection.reference_safety?.verifiedViewLock || null,
  };
}
export function assertKlingAuditReferences(post) {
  const refs = klingAuditReferences(post);
  const missing = [];
  if (!refs.sceneUrl) missing.push("scene_image");
  if (refs.productRequired && !refs.productUrl) missing.push("authoritative_product_image");
  if (refs.productRequired && (!String(refs.viewLock?.verifiedView || "").trim() || !String(refs.viewLock?.motionConstraint || "").trim())) missing.push("verified_view_lock");
  if (missing.length) {
    const error = new Error(`Kling quality audit references missing: ${missing.join(", ")}. No video generation or audit was ordered.`);
    error.code = "KLING_AUDIT_REFERENCES_MISSING";
    error.missingReferences = missing;
    throw error;
  }
  return refs;
}
export async function verifyPreparedKlingAuditReferences({ supabase, postId }) {
  const { data: post, error } = await supabase.from("posts")
    .select("id, image_url, kling_reference_image_url, video_background_selection").eq("id", postId).maybeSingle();
  if (error || !post) throw new Error(`Kling reference preparation could not be read back; no paid submission made: ${error?.message || "post missing"}`);
  const refs = assertKlingAuditReferences(post);
  const selection = { ...post.video_background_selection, kling_audit_references: {
    version: 338, scene_image_url: refs.sceneUrl, product_image_url: refs.productUrl || null,
    verified_view_lock: refs.viewLock, product_required: refs.productRequired,
  } };
  const { data: saved, error: saveError } = await supabase.from("posts")
    .update({ video_background_selection: selection, updated_at: new Date().toISOString() })
    .eq("id", postId).select("id, image_url, kling_reference_image_url, video_background_selection").maybeSingle();
  if (saveError || !saved) throw new Error(`Kling reference contract could not be persisted; no paid submission made: ${saveError?.message || "post missing"}`);
  const confirmed = assertKlingAuditReferences(saved);
  if (confirmed.sceneUrl !== refs.sceneUrl || confirmed.productUrl !== refs.productUrl || JSON.stringify(confirmed.viewLock) !== JSON.stringify(refs.viewLock)) throw new Error("Kling reference contract changed during preparation; no paid submission made");
  return confirmed;
}
export function recoverableKlingReferenceFailure(post) {
  const selection = post?.video_background_selection || {};
  return post?.video_status === "failed" && Boolean(httpUrl(selection.kling_source_storage_url || selection.kling_source_url)) &&
    selection.product_video_validation?.status !== "failed" &&
    /reference prerequisites are missing|Kling generation did not finish/i.test(String(post.video_error || ""));
}
export async function restoreKlingLegacyViewLock({ supabase, post }) {
  const refs = klingAuditReferences(post);
  if (!refs.productRequired || !refs.productUrl || refs.viewLock) return false;
  // A strict same-view constraint is safe to reconstruct from an existing
  // authoritative image. NEVER promote the generated scene to original truth.
  const viewLock = {
    verifiedView: "same authoritative retailer source view only",
    visibleSurfaceSummary: "Only the exact visible source geometry, components, material, color and markings are verified.",
    motionConstraint: "Keep the original source-facing view; never reveal an unseen surface or invent an operation.",
    confidence: 0, source: "legacy_strict_same_view_recovery",
  };
  const selection = { ...post.video_background_selection,
    reference_safety: { ...(post.video_background_selection?.reference_safety || {}), verifiedViewLock: viewLock },
    quality_reference_recovery: { recovered_view_lock: true, recovered_at: new Date().toISOString() },
  };
  const { error } = await supabase.from("posts").update({ video_background_selection: selection, updated_at: new Date().toISOString() }).eq("id", post.id).eq("kling_task_id", post.kling_task_id);
  if (error) throw new Error(`Could not preserve recovered strict view lock: ${error.message}`);
  post.video_background_selection = selection;
  return true;
}

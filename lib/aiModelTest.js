import { AI_PURPOSES, isVerifiedForCapability, isModelVerifiedForPurpose, isPendingKlingVideoCandidate } from './aiModelControl.js';
import { getConfiguredAdminEmails } from './adminAuth.js';

// Match each purpose to a real supported admin test recipe. Modes without a
// meaningful integration test are not advertised as testable.
export const AI_MODEL_TEST_RECIPES = Object.freeze({
  post_text: 'website_item_text_ad',
  product_research: 'website_item_text_ad',
  editorial_headline: 'website_item_text_ad',
  carousel_creative: 'carousel_website_item',
  standard_image: 'website_item_text_ad',
  transparent_typography: 'animated_website_item',
  kling_video: 'ai_product_video',
});

export function getAiModelPurpose(key) {
  return AI_PURPOSES.find(p => p.key === String(key || '')) || null;
}
export function modelAllowedForPurpose(purpose, model) {
  return Boolean(purpose && typeof model === 'string' &&
    isVerifiedForCapability(model, purpose.capability) &&
    (purpose.provider === 'kling' ? model.startsWith('kling-') : model.startsWith('gpt-')));
}

// Resolve only accounts that are *currently* active Spreelo administrators.
// Admin accounts may hold real shop profiles that are not Spreelo customers.
export async function modelAllowedForPurposeAsync(db, purpose, model) {
  return await isModelVerifiedForPurpose(db, purpose, model);
}

// Kling video tests can intentionally verify a discovered *pending* candidate.
// The candidate never becomes an active production choice until its real admin
// video generation succeeds, the result email is sent, and an admin approves.
export async function modelTestEligible(db,purpose,model) {
  return await modelAllowedForPurposeAsync(db,purpose,model) ||
    await isPendingKlingVideoCandidate(db,purpose,model);
}

export async function findActiveAdminUserIds(db) {
  const emails = new Set(getConfiguredAdminEmails());
  const { data: members, error: teamError } = await db
    .from('spreelo_admin_team_members')
    .select('user_id,email,status')
    .eq('status', 'active');
  if (teamError) throw new Error('Could not verify active admin accounts: ' + teamError.message);
  const ids = new Set((members || []).filter(m => Boolean(m.user_id))
    .map(m => String(m.user_id)));
  // Configured admins may not have admin-team rows; resolve by auth email.
  for (let page = 1; page <= 40; page++) {
    const { data, error } = await db.auth.admin.listUsers({page, perPage: 500});
    if (error) throw error;
    const users = data?.users || [];
    for (const user of users) {
      if (emails.has(String(user.email || '').trim().toLowerCase())) ids.add(user.id);
    }
    if (users.length < 500) break;
  }
  return [...ids];
}

// The worker does NOT accept model overrides from a rule, cookie, request
// header, or arbitrary mass-test batch. It reads only this dedicated record,
// requires its brand and owner to match, and revalidates capabilities.
export async function loadVerifiedAiModelTestOverride(db, rule) {
  if (rule?.is_admin_test !== true || !rule?.admin_test_batch_id ||
      !String(rule.admin_test_job_key || '').startsWith('ai-model-test:')) return null;
  const { data: test, error } = await db.from('ai_model_test_requests')
    .select('id,batch_id,brand_profile_id,brand_owner_id,purpose,model,status')
    .eq('batch_id', rule.admin_test_batch_id).maybeSingle();
  if (error || !test) throw new Error(error?.message || 'Model test request missing');
  if (test.status !== 'queued' && test.status !== 'running') throw new Error('Model test is no longer active');
  if (test.brand_profile_id !== rule.brand_profile_id || test.brand_owner_id !== rule.user_id)
    throw new Error('Test job does not match approved admin brand');
  const purpose = getAiModelPurpose(test.purpose);
  if (!AI_MODEL_TEST_RECIPES[test.purpose] || !await modelTestEligible(db, purpose, test.model))
    throw new Error('Test model is incompatible with this generation purpose');
  return { purpose: test.purpose, model: test.model };
}

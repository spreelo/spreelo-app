export const AI_PURPOSES = [
  { key:'manual_post', label:'Manuellt inlägg', provider:'openai', capability:'text_reasoning', fallback:'gpt-5.5' },
  { key:'campaign_plan', label:'Kampanjplanering', provider:'openai', capability:'text_reasoning', fallback:'gpt-5.5' },
  { key:'post_text', label:'Inläggstext', provider:'openai', capability:'text', fallback:'gpt-4.1-mini' },
  { key:'brand_analysis', label:'Varumärkesanalys / Grow Brain', provider:'openai', capability:'text_vision', fallback:'gpt-4.1-mini' },
  { key:'content_plan', label:'Innehållsplanering', provider:'openai', capability:'text_reasoning', fallback:'gpt-5.5' },
  { key:'product_research', label:'Produktresearch', provider:'openai', capability:'text_reasoning', fallback:'gpt-5.5' },
  { key:'editorial_headline', label:'Rubriker', provider:'openai', capability:'text_reasoning', fallback:'gpt-5.6-sol' },
  { key:'carousel_creative', label:'Karusell / kreativ plan', provider:'openai', capability:'text_reasoning', fallback:'gpt-5.6-sol' },
  { key:'standard_image', label:'Vanlig bildgenerering', provider:'openai', capability:'image', fallback:'gpt-image-2' },
  { key:'transparent_typography', label:'Transparent textgrafik', provider:'openai', capability:'image_alpha', fallback:'gpt-image-2.5-flare' },
  { key:'calendar_image', label:'Temakalenderbilder', provider:'openai', capability:'image', fallback:'gpt-image-2' },
  { key:'kling_video', label:'AI-video', provider:'kling', capability:'image_to_video', fallback:'kling-3.0' },
];

// Deliberately conservative. A model is never offered for a purpose merely because
// /v1/models returns it. Capabilities must be explicitly known/verified first.
export const VERIFIED_MODEL_CAPABILITIES = {
  'gpt-4.1-mini': ['text','text_vision'],
  'gpt-5.5': ['text','text_vision','text_reasoning'],
  'gpt-5.6-sol': ['text','text_vision','text_reasoning'],
  'gpt-6.1-sol': ['text','text_reasoning'],
  'gpt-image-2': ['image'],
  'gpt-image-2.5-flare': ['image','image_alpha'],
  'kling-3.0': ['image_to_video'],
  'kling-v3': ['image_to_video'],
};

import { supportedReasoningEfforts, initialReasoningEffort, normalizeReasoningEffort } from './aiModelReasoning.js';
export {supportedReasoningEfforts, initialReasoningEffort, normalizeReasoningEffort};
export function isVerifiedForCapability(model, capability) {
  return (VERIFIED_MODEL_CAPABILITIES[String(model)] || []).includes(String(capability));
}

// v328: new capabilities are trusted only after server-side evidence is persisted.
export function isCatalogCapabilityApproved(row, capability) {
  return Boolean(row && row.status === 'approved' && Array.isArray(row.verified_capabilities) &&
    row.verified_capabilities.includes(capability));
}

export async function isModelVerifiedForPurpose(db, purpose, model) {
  if (!purpose || typeof model !== 'string' || model.length > 128) return false;
  if (purpose.provider === 'kling' ? !model.startsWith('kling-') : !model.startsWith('gpt-')) return false;
  if (isVerifiedForCapability(model, purpose.capability)) return true; // preserve v322 defaults
  if (!db) return false;
  try {
    const {data,error}=await db.from('ai_model_catalog')
      .select('status,verified_capabilities').eq('provider',purpose.provider).eq('model',model).maybeSingle();
    return !error && isCatalogCapabilityApproved(data, purpose.capability);
  } catch { return false; }
}

export async function isPendingKlingVideoCandidate(db,purpose,model) {
  if (!db || purpose?.key !== 'kling_video' || !/^kling-[a-z0-9][a-z0-9.-]{0,60}$/.test(String(model||''))) return false;
  try {
    const {data,error}=await db.from('ai_model_catalog').select('status,verification_notes')
      .eq('provider','kling').eq('model',model).maybeSingle();
    return !error && data?.status==='pending_review' &&
      String(data?.verification_notes||'').startsWith('Candidate discovered in official Kling docs.');
  } catch {return false;}
}

export async function loadApprovedCatalog(db) {
  if (!db) return [];
  const {data,error}=await db.from('ai_model_catalog')
    .select('provider,model,status,verified_capabilities,last_seen_at,verified_at,verification_notes')
    .eq('status','approved').limit(1000);
  if (error) throw error;
  return data || [];
}

export async function loadAiModelSettings(admin) {
  const defaults = Object.fromEntries(AI_PURPOSES.map(p => [p.key, p.fallback]));
  if (!admin) return {...defaults,__reasoningEfforts:{}};
  const reasoningEfforts={};
  try {
    const [{data,error}, catalog] = await Promise.all([
      admin.from('ai_model_settings').select('purpose,model,reasoning_effort'),
      loadApprovedCatalog(admin).catch(()=>[]),
    ]);
    if (error) return {...defaults,__reasoningEfforts:{}};
    for (const row of data || []) {
      const p=AI_PURPOSES.find(x=>x.key===row?.purpose);
      if (p && (isVerifiedForCapability(row.model,p.capability) ||
        catalog.some(x=>x.provider===p.provider && x.model===row.model && isCatalogCapabilityApproved(x,p.capability)))) {
        defaults[p.key]=row.model;
        if (row.reasoning_effort && supportedReasoningEfforts(row.model).includes(row.reasoning_effort))
          reasoningEfforts[p.key]=row.reasoning_effort;
      }
    }
  } catch {}
  return {...defaults,__reasoningEfforts:reasoningEfforts};
}

import { AsyncLocalStorage } from 'node:async_hooks';
import { createClient } from '@supabase/supabase-js';
const aiModelStore = new AsyncLocalStorage();

export function activeAiModel(purpose, fallback) {
  return aiModelStore.getStore()?.[purpose] || fallback;
}
export function activeAiReasoning(purpose, model, fallback=null) {
  const setting=aiModelStore.getStore()?.__reasoningEfforts?.[purpose];
  const effort=setting || fallback;
  if (!effort) return null;
  if (supportedReasoningEfforts(model).includes(effort)) return effort;
  // A known 'none' fallback from the previous Sol model maps explicitly to low.
  if (effort==='none' && supportedReasoningEfforts(model).includes('low')) return 'low';
  return null;
}
export function reasoningOptionsForPurpose(purpose,model,fallback=null) {
  const effort=activeAiReasoning(purpose,model,fallback);
  return effort?{reasoning:{effort}}:{};
}


export async function loadRuntimeAiModels() {
  try {
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!url||!key) return {...Object.fromEntries(AI_PURPOSES.map(p=>[p.key,p.fallback])),__reasoningEfforts:{}};
    const admin=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
    return await loadAiModelSettings(admin);
  } catch { return {...Object.fromEntries(AI_PURPOSES.map(p=>[p.key,p.fallback])),__reasoningEfforts:{}}; }
}

// v327: Override exactly one job inside the request-local model context.
// Every new job resets to the immutable base; other workers and live users
// cannot see the test model. Caller must validate it server-side.
export function setRuntimeJobModelOverride(purpose = null, model = null, reasoningEffort = null) {
  const state = aiModelStore.getStore();
  if (!state) return;
  const base = state.__baseAiModels || state;
  aiModelStore.enterWith({ ...base, __baseAiModels: base,
    __reasoningEfforts: {...(base.__reasoningEfforts||{}), ...(purpose && model && reasoningEffort?{[purpose]:normalizeReasoningEffort(model,reasoningEffort)}:{})},
    ...(purpose && model ? { [purpose]: model } : {}) });
}

export async function withRuntimeAiModels(callback) {
  const settings=await loadRuntimeAiModels();
  return aiModelStore.run({ ...settings, __baseAiModels: settings }, callback);
}

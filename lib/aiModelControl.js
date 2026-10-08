export const AI_PURPOSES = [
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
  'gpt-image-2': ['image'],
  'gpt-image-2.5-flare': ['image','image_alpha'],
  'kling-3.0': ['image_to_video'],
  'kling-v3': ['image_to_video'],
};

export function isVerifiedForCapability(model, capability) {
  return (VERIFIED_MODEL_CAPABILITIES[String(model)] || []).includes(String(capability));
}

export async function loadAiModelSettings(admin) {
  const defaults = Object.fromEntries(AI_PURPOSES.map(p => [p.key, p.fallback]));
  if (!admin) return defaults;
  try {
    const { data, error } = await admin.from('ai_model_settings').select('purpose,model');
    if (error) return defaults;
    for (const row of data || []) if (row?.purpose && row?.model) defaults[row.purpose] = row.model;
  } catch {}
  return defaults;
}

import { AsyncLocalStorage } from 'node:async_hooks';
import { createClient } from '@supabase/supabase-js';
const aiModelStore = new AsyncLocalStorage();

export function activeAiModel(purpose, fallback) {
  return aiModelStore.getStore()?.[purpose] || fallback;
}

export async function loadRuntimeAiModels() {
  const defaults = Object.fromEntries(AI_PURPOSES.map(p => [p.key,p.fallback]));
  try {
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!url||!key) return defaults;
    const admin=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
    const {data,error}=await admin.from('ai_model_settings').select('purpose,model');
    if(error) return defaults;
    for(const row of data||[]) if(row?.purpose&&row?.model) defaults[row.purpose]=row.model;
  } catch {}
  return defaults;
}

export async function withRuntimeAiModels(callback) {
  const settings=await loadRuntimeAiModels();
  return aiModelStore.run(settings, callback);
}

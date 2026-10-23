import {ALL_UI_NAMESPACES,DEFAULT_UI_LOCALE,getDefaultNamespaceLabels} from './defaultLabels.js';
import {isLanguageNeutralUiSource,validateGeneratedUiTranslation} from './translationValidation.js';
export const BROWSER_UI_NAMESPACES=ALL_UI_NAMESPACES.filter(ns=>!['emails','approvePages','rejectPages'].includes(ns));
function sourceFingerprint(value){const text=String(value??'');let hash=2166136261;for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}return `fnv1a:${(hash>>>0).toString(16).padStart(8,'0')}`;}
// A single read, no translation generation or lease/write operation.
export async function readStoredUiTranslations({supabaseAdmin,locale}) {
 if(locale===DEFAULT_UI_LOCALE)return {};
 const {data,error}=await supabaseAdmin.from('ui_translation_packs').select('namespace, labels').eq('locale',locale).in('namespace',BROWSER_UI_NAMESPACES);
 if(error)throw error;
 const result={};
 for(const row of data||[]){
  if(!BROWSER_UI_NAMESPACES.includes(row.namespace))continue;
  const defaults=getDefaultNamespaceLabels(row.namespace),pack=row.labels||{},meta=pack.__spreelo_translation_meta||{};
  const intentional=new Set(Array.isArray(meta.intentional_unchanged_keys)?meta.intentional_unchanged_keys:[]);
  for(const [key,source] of Object.entries(defaults)){
   const value=pack[key],fingerprint=meta.source_fingerprints?.[key];
   if(fingerprint&&fingerprint!==sourceFingerprint(source))continue;
   if(isLanguageNeutralUiSource(source)){result[key]=source;continue;}
   if(typeof value!=='string'||!value.trim())continue;
   // The database is authoritative for an already-saved value. Same-spelling
   // borrowed terms are valid; only a changed English fingerprint invalidates it.
   if(typeof value==='string'&&value.trim())result[key]=value;
  }
 }
 return result;
}

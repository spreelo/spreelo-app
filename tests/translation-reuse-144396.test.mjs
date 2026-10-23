import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createUiTranslationCache, getNamespaceStorageKey } from '../lib/i18n/uiTranslationCache.js';
import { isLanguageNeutralUiSource } from '../lib/i18n/translationValidation.js';
import { SUPPORTED_UI_LOCALES } from '../lib/i18n/defaultLabels.js';

const ui = fs.readFileSync('app/api/ui-translations/route.js','utf8');
const server = fs.readFileSync('lib/i18n/serverUiText.js','utf8');
const admin = fs.readFileSync('app/api/admin/translations/route.js','utf8');
const hook = fs.readFileSync('lib/i18n/useUiText.js','utf8');
function extraction(code, name) {
 const start=code.indexOf(`function ${name}(`);
 assert(start>=0, `Missing function: ${name}`);
 const from=start, next=code.slice(start+1).search(/\n(?:function |async function |export (?:async )?function )/);
 return next>=0?code.slice(from,start+1+next):code.slice(from);
}
function runSelected(source, names, testCode, extra={}) {
 const expressions=names.map(name=>extraction(source,name)).join('\n');
 return vm.runInNewContext(`${expressions}\n${testCode}`, {
   DEFAULT_UI_LOCALE:'en', isLanguageNeutralUiSource,
   TRANSLATION_META_KEY:'__spreelo_translation_meta', TRANSLATION_DEFER_MS:300000,
   ...extra,
 });
}
const keys=SUPPORTED_UI_LOCALES.map(x=>x.locale).filter(x=>x!=='en');
assert(keys.includes('fi')&&keys.includes('sv')&&keys.includes('fr')&&keys.length>=25);
const commonUi=['sourceFingerprint','getSourceFingerprints','getDeferredTranslationKeys','isTranslationKeyDeferred','stripTranslationMetadata','getIntentionalUnchangedKeys','getLabelsNeedingTranslation','shouldRetranslateLabel','withTranslationMetadata','getCurrentSourceLabels'];
for(const locale of keys){
 const outcome = runSelected(ui,commonUi,`(()=>{
  const defaults={label:'Schedule',changed:'New English title',neutral:'Spreelo'};
  const oldFp=sourceFingerprint('Old English title');
  const saved={label:'Saved target label',changed:'Previously translated', neutral:'Spreelo',
   __spreelo_translation_meta:{source_fingerprints:{label:sourceFingerprint('Schedule'),changed:oldFp}}};
  const missing=getLabelsNeedingTranslation(defaults,saved,'${locale}');
  if(Object.keys(missing).join(',')!=='changed') throw Error('Changed English should be sole translation task');
  const pending=withTranslationMetadata({labels:saved,previousLabels:saved,defaultLabels:defaults,
   deferredKeys:{changed:{source:'New English title',permanent:true}},intentionalUnchangedKeys:new Set()});
  if(getSourceFingerprints(pending).changed!==oldFp)throw Error('Failed changed key was marked complete');
  if(Object.keys(getLabelsNeedingTranslation(defaults,pending,'${locale}')).length!==0)throw Error('Quarantine ignored');
  if(Object.keys(getLabelsNeedingTranslation(defaults,pending,'${locale}',{manualRepair:true})).join(',')!=='changed')throw Error('Manual targeted repair failed');
  const translated=withTranslationMetadata({labels:{...saved,changed:'Fresh localized text'},previousLabels:saved,defaultLabels:defaults,
   updatedKeys:['changed'],deferredKeys:{},intentionalUnchangedKeys:new Set()});
  if(getSourceFingerprints(translated).changed!==sourceFingerprint(defaults.changed))throw Error('New source not marked successful');
  return true;
 })()`, {});
 assert.equal(outcome,true, locale);
}
const serverNames=['sourceFingerprint','getTranslationMeta','stripTranslationMetadata','getSourceFingerprints','sourceMetadataNeedsRefresh','withSourceMetadata','shouldRetranslateLabel','getLabelsNeedingTranslation','getCurrentServerLabels'];
for(const locale of keys){
 assert.equal(runSelected(server,serverNames,`(()=>{
  const defaults={existing:'Save',changed:'Fresh English source'};
  const stored={existing:'Saved value',changed:'Old localized value',__spreelo_translation_meta:{
   source_fingerprints:{existing:sourceFingerprint('Save'),changed:sourceFingerprint('Previous English source')}}};
  const pending=getLabelsNeedingTranslation(defaults,stored,'${locale}');
  if(Object.keys(pending).join(',')!=='changed')throw Error('Server ignored changed English');
  const failed=withSourceMetadata(stored,defaults,{previousLabels:stored,failedKeys:['changed']});
  if(getSourceFingerprints(failed).changed!==sourceFingerprint('Previous English source'))throw Error('Failed update incorrectly advanced fingerprint');
  if(Object.keys(getLabelsNeedingTranslation(defaults,failed,'${locale}')).length)throw Error('Repeated paid server translation');
  if(Object.keys(getLabelsNeedingTranslation(defaults,failed,'${locale}',{manualRepair:true})).join(',')!=='changed')throw Error('Cannot repair failed key');
  return true;
 })()`),true,locale);
}
// Browser response must remove obsolete keys from the namespace being loaded.
const data=new Map();const storage={getItem:key=>data.has(key)?data.get(key):null,setItem:(key,val)=>data.set(key,val),removeItem:key=>data.delete(key),get length(){return data.size},key:i=>[...data.keys()][i]};
const cache=createUiTranslationCache({getStorage:()=>storage});
cache.write('fi',{'common.existing':'Tallennettu','common.stale':'Vanha','layout.other':'Muu'});
cache.write('fi',{'common.existing':'Päivitetty'},{replaceNamespaces:['common']});
assert.equal(cache.read('fi')['common.stale'],undefined);
assert.equal(cache.read('fi')['layout.other'],'Muu');
assert(!JSON.parse(storage.getItem(getNamespaceStorageKey('fi','common')))['common.stale']);
assert(hook.includes('replaceNamespaces: normalizedNamespaces'));
assert(admin.includes('status: "refresh_requested"') && !ui.includes('refreshRequested\n    ? { ...defaultLabels }'));
console.log(`PASS 144.396: ${keys.length} locales reuse saved translations; English changes update only the affected keys; failed keys are quarantined; targeted repairs work; browser cache removes obsolete entries.`);

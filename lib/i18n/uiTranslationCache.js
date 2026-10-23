import {ALL_UI_NAMESPACES,DEFAULT_UI_LOCALE} from './defaultLabels.js';
import {getShellStorageKey,selectShellUiLabels} from './startupUiText.js';
import {writeBrowserCache} from '../browserStorage.js';
export const EMPTY_UI_LABELS=Object.freeze({});
export const getNamespaceStorageKey=(locale,namespace)=>`spreelo_ui_labels_v31_ns_${locale}_${namespace}`;
const legacyKey=locale=>`spreelo_ui_labels_v30_${locale}`;
const clean=value=>value && typeof value==='object' && !Array.isArray(value)?Object.fromEntries(Object.entries(value).filter(([,v])=>typeof v==='string'&&v.trim())):{};
const parse=(storage,key)=>{try{return clean(JSON.parse(storage?.getItem(key)||'{}'));}catch{try{storage?.removeItem(key);}catch{}return {};}};
// Static UI strings only; persistence shares the existing bounded cache writer.
export function createUiTranslationCache({getStorage=()=>typeof window==='undefined'?null:window.localStorage,memory=new Map()}={}) {
 const listeners=new Set();
 const storage=()=>{try{return getStorage();}catch{return null;}};
 const read=locale=>{
  if(locale===DEFAULT_UI_LOCALE)return EMPTY_UI_LABELS;
  if(memory.has(locale))return memory.get(locale);
  const target=storage(),labels={...parse(target,getShellStorageKey(locale)),...parse(target,legacyKey(locale))};
  for(const namespace of ALL_UI_NAMESPACES){
   const key=getNamespaceStorageKey(locale,namespace);
   const namespaceRecord=target?.getItem(key);
   if(namespaceRecord!==null && namespaceRecord!==undefined){
    for(const oldKey of Object.keys(labels))if(oldKey.startsWith(namespace+'.'))delete labels[oldKey];
   }
   for(const [label,value] of Object.entries(parse(target,key)))if(label.startsWith(namespace+'.'))labels[label]=value;
  }
  memory.set(locale,labels);return labels;
 };
 const write=(locale,incoming,{persist=true,overwrite=true,replaceNamespaces=[]}={})=>{
  if(locale===DEFAULT_UI_LOCALE)return;
  const previous=read(locale),accepted=clean(incoming);
  const scoped=new Set(replaceNamespaces.filter(ns=>ALL_UI_NAMESPACES.includes(ns)));
  const base={...previous};
  for(const key of Object.keys(base))if(scoped.has(key.split('.')[0]))delete base[key];
  const next=overwrite?{...base,...accepted}:{...accepted,...base};
  const changed=Object.keys(next).some(key=>next[key]!==previous[key]) || Object.keys(previous).some(key=>!Object.hasOwn(next,key));if(changed)memory.set(locale,next);
  if(persist){const target=storage();if(target){
   const namespaces=new Set([...Object.keys(accepted).map(key=>key.split('.')[0]),...scoped]);
   for(const namespace of namespaces){if(!ALL_UI_NAMESPACES.includes(namespace))continue;
    const pack=Object.fromEntries(Object.entries(next).filter(([key])=>key.startsWith(namespace+'.')));
    writeBrowserCache(target,getNamespaceStorageKey(locale,namespace),JSON.stringify(pack));
   }
   const shell=selectShellUiLabels(next);if(Object.keys(shell).length || [...scoped].some(ns=>['common','layout'].includes(ns)))writeBrowserCache(target,getShellStorageKey(locale),JSON.stringify(shell));
  }}
  if(changed)for(const listener of listeners)listener();
 };
 return {read,write,subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener);}};
}
export const uiTranslationCache=createUiTranslationCache();

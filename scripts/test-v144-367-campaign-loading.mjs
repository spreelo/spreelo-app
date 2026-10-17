import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {calendarCampaignHref} from '../lib/calendarCampaignLink.js';
import {getStartupUiLabel,getShellStorageKey,selectShellUiLabels} from '../lib/i18n/startupUiText.js';
import {SUPPORTED_UI_LOCALES,interpolateUiText} from '../lib/i18n/defaultLabels.js';
import {isLanguageNeutralUiSource} from '../lib/i18n/translationValidation.js';
import {writeBrowserCache,BROWSER_CACHE_MAX_CHARS,BROWSER_CACHE_MAX_ENTRY_CHARS,isRebuildableBrowserCache} from '../lib/browserStorage.js';
const {parse}=createRequire(import.meta.url)('next/dist/compiled/babel/parser');
function named(file,name){const source=fs.readFileSync(file,'utf8');let found;
 const walk=n=>{if(!n||typeof n!=='object')return;if(n.type==='FunctionDeclaration'&&n.id?.name===name)found=n;
 for(const value of Object.values(n))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);};
 walk(parse(source,{sourceType:'module',plugins:['jsx']}));assert(found,name);return source.slice(found.start,found.end);}

const id='calendar/id + &=',brand='selected/brand +';
const href=calendarCampaignHref(id,brand),params=new URL(href,'https://example.test').searchParams;
assert.equal(params.get('campaignOpportunityId'),id);assert.equal(params.get('campaignId'),id);assert.equal(params.get('brandProfileId'),brand);assert.equal(params.get('mode'),'campaign');
assert.equal(params.get('campaign'),null);assert.equal(calendarCampaignHref(null,brand),'/calendar');
const window={location:{href:''}},saved=[];
const handle=vm.runInNewContext(`(${named('app/calendar/page.jsx','handleCreateCampaign')})`,{
 window,localStorage:{setItem:(...args)=>saved.push(args)},calendarCampaignHref,brandProfileId:brand,
 CAMPAIGN_HANDOFF_STORAGE_KEY:'handoff',normalizeCampaignForStudioHandoff:c=>c});
handle({id,title:'Prepared calendar',post_plan:[{role:'Prepared post'}]});
assert.equal(window.location.href,href);assert.equal(JSON.parse(saved[0][1]).campaign.post_plan[0].role,'Prepared post');
const noStorage=vm.runInNewContext(`(${named('app/calendar/page.jsx','handleCreateCampaign')})`,{
 window,localStorage:{setItem(){throw new Error('Storage unavailable');}},calendarCampaignHref,brandProfileId:brand,
 CAMPAIGN_HANDOFF_STORAGE_KEY:'handoff',normalizeCampaignForStudioHandoff:c=>c});
noStorage({id});assert.equal(window.location.href,href,'database-backed URL survives unavailable optional handoff storage');
const planner=fs.readFileSync('app/automation/page.jsx','utf8');
const resolve=planner.slice(planner.indexOf('const requestedMode = searchParams?.get("mode")'),planner.indexOf('const shouldShowCampaignDebug ='));
const resolved=vm.runInNewContext(resolve+'\n({campaignOpportunityId,requestedBrandProfileId,requestedMode})',{
 searchParams:params,getStoredCalendarCampaignHandoff:()=>({campaign:{id:'stale-other-campaign'},brandProfileId:'other-brand'}),isRecentCalendarCampaignHandoff:()=>true});
assert.equal(resolved.campaignOpportunityId,id);assert.equal(resolved.requestedBrandProfileId,brand);assert.equal(resolved.requestedMode,'campaign');
for(const path of ['app/page.jsx','components/HomeReferenceOverview.jsx']){
 const source=fs.readFileSync(path,'utf8');assert(source.includes('calendarCampaignHref('));assert(!source.includes('/automation?campaign='));}

const liveText={current:{locale:'sv',localeReady:true,labels:{},cachedLabels:{},settled:false,
 fallbackLabels:{'layout.preparingWorkspace':'Preparing your workspace','layout.loadingWorkspace':'Loading your workspace...',missing:'Missing'}}};
const t=vm.runInNewContext(`(${named('lib/i18n/useUiText.js','t')})`,{liveText,getStartupUiLabel,interpolateUiText,DEFAULT_UI_LOCALE:'en',isLanguageNeutralUiSource});
assert.equal(t('layout.preparingWorkspace'),'Förbereder din arbetsyta');assert.equal(t('layout.loadingWorkspace'),'Laddar din arbetsyta…');
assert.equal(t('missing'),'…','no broad English fallback or page-wide language wait introduced');
for(const {locale} of SUPPORTED_UI_LOCALES){liveText.current.locale=locale;
 for(const key of ['layout.preparingWorkspace','layout.loadingWorkspace'])assert(getStartupUiLabel(locale,key),locale+':'+key);
 assert.notEqual(t('layout.preparingWorkspace'),'…');}
liveText.current={...liveText.current,locale:'sv',labels:{'layout.loadingWorkspace':'Serverns svenska laddningstext'}};
assert.equal(t('layout.loadingWorkspace'),'Serverns svenska laddningstext','server pack wins over bootstrap');
liveText.current={...liveText.current,locale:'de',labels:{}};assert.equal(t('layout.loadingWorkspace'),'Dein Arbeitsbereich wird geladen…');

class Storage {
 items=new Map();get length(){return this.items.size;}key(i){return [...this.items.keys()][i]??null;}
 getItem(k){return this.items.get(k)??null;}removeItem(k){this.items.delete(k);}setItem(k,v){this.items.set(k,String(v));}
}
const storage=new Storage(),memory=new Map();
storage.setItem('sb-project-auth-token','keep-auth');storage.setItem('spreelo_app_language','sv');storage.setItem('spreelo_calendar_campaign_handoff','keep-unsaved');
const ctx=vm.createContext({window:{},localStorage:storage,translationMemory:memory,DEFAULT_UI_LOCALE:'en',
 getStorageKey:locale=>'spreelo_ui_labels_v30_'+locale,getShellStorageKey,selectShellUiLabels,
 writeOptionalBrowserCache:(k,v)=>writeBrowserCache(storage,k,v)});
vm.runInContext(named('lib/i18n/useUiText.js','readStoredLabels')+'\n'+named('lib/i18n/useUiText.js','writeStoredLabels'),ctx);
ctx.writeStoredLabels('sv',{'layout.loadingWorkspace':'Omedelbar svensk laddningstext','layout.nav.home':'Hem',oversized:'x'.repeat(BROWSER_CACHE_MAX_ENTRY_CHARS+1)});
assert.equal(storage.getItem('spreelo_ui_labels_v30_sv'),null,'oversized main cache stays optional');
memory.clear();assert.equal(ctx.readStoredLabels('sv')['layout.loadingWorkspace'],'Omedelbar svensk laddningstext','shell restores synchronously after a hard navigation');
for(let i=0;i<40;i++)writeBrowserCache(storage,`spreelo_plan_recommendation_v296_test_${i}`,'x'.repeat(60000));
memory.clear();assert.equal(ctx.readStoredLabels('sv')['layout.nav.home'],'Hem','large expendable page caches do not displace the small shell');
assert([...storage.items].filter(([k])=>isRebuildableBrowserCache(k)).reduce((n,[k,v])=>n+k.length+v.length,0)<=BROWSER_CACHE_MAX_CHARS);
assert.equal(storage.getItem('sb-project-auth-token'),'keep-auth');assert.equal(storage.getItem('spreelo_app_language'),'sv');assert.equal(storage.getItem('spreelo_calendar_campaign_handoff'),'keep-unsaved');
storage.setItem('spreelo_ui_labels_v30_sv','broken JSON');memory.clear();assert.equal(ctx.readStoredLabels('sv')['layout.nav.home'],'Hem','broken page pack does not discard healthy shell');
assert.equal(storage.getItem('spreelo_ui_labels_v30_sv'),null);
const layout=fs.readFileSync('components/AppLayout.jsx','utf8');assert.match(layout,/<Link\s+className=\{.*\n\s+href=\{item.href\}/);
assert(layout.includes('event.preventDefault();\n                  openChannelGate(item.href)'),'navigation keeps channel access gate');
console.log('PASS 144.367: shared encoded calendar handoff and exact IDs beat stale storage; 30 locales have immediate loader copy; server translations win; bounded shell survives cache eviction/corruption without losing auth or draft; navigation preserves runtime and gates');

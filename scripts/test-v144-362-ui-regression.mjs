import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {isLanguageNeutralUiSource,validateGeneratedUiTranslation} from '../lib/i18n/translationValidation.js';
import {interpolateUiText} from '../lib/i18n/defaultLabels.js';
const require=createRequire(import.meta.url);
const {parse}=require('next/dist/compiled/babel/parser');
function fn(file,name,context={}) {
 const source=fs.readFileSync(file,'utf8');let node;
 const walk=n=>{if(!n||typeof n!=='object')return;if(n.type==='FunctionDeclaration'&&n.id?.name===name)node=n;for(const value of Object.values(n))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);};
 walk(parse(source,{sourceType:'module',plugins:['jsx']}));assert(node,name);
 return vm.runInNewContext(`(${source.slice(node.start,node.end)})`,context);
}
for(const text of ['SCHEDULE','STRATEGY','SUPPORT','WEEKLY','SETTINGS','CHANNELS']){
 assert.equal(isLanguageNeutralUiSource(text),false,text);
 assert.equal(validateGeneratedUiTranslation({sourceText:text,translatedText:text,locale:'sv'}).valid,false,text);
}
for(const text of ['AI','API','URL','PNG','MP4','P90','SEK','Spreelo','OpenAI','Facebook','{count}','https://example.test'])assert.equal(isLanguageNeutralUiSource(text),true,text);
const translate=fn('app/api/ui-translations/route.js','shouldRetranslateLabel',{DEFAULT_UI_LOCALE:'en',isLanguageNeutralUiSource});
assert(translate({key:'automation.scheduleHeading',defaultValue:'SCHEDULE',translatedValue:'SCHEDULE',locale:'sv',intentionalUnchangedKeys:new Set()}),'old uppercase English in the persistent pack must be repaired');
assert.equal(translate({key:'automation.scheduleHeading',defaultValue:'SCHEDULE',translatedValue:'SCHEMA',locale:'sv',intentionalUnchangedKeys:new Set()}),false,'valid prior translations must be retained');
const typeLabel=fn('app/calendar/page.jsx','getEventTypeLabel');
assert.equal(typeLabel('awareness_theme',key=>key),'calendar.eventType.awarenessTheme.v362');
assert.equal(typeLabel('theme_day',key=>key),'calendar.eventType.themeDay.v362');
assert.equal(typeLabel('unknown_provider_enum',key=>key),'calendar.eventType.campaign','internal enums never leak into visible UI');
const liveText={current:{locale:'sv',localeReady:true,labels:{heading:'Svensk rubrik'},cachedLabels:{},settled:false,fallbackLabels:{heading:'Headline',missing:'Missing label',error:'Connection error'}}};
const text=fn('lib/i18n/useUiText.js','t',{liveText,DEFAULT_UI_LOCALE:'en',interpolateUiText,isLanguageNeutralUiSource});
assert.equal(text('heading'),'Svensk rubrik','cached text is immediate during refresh');
assert.equal(text('missing'),'…','an uncached label gets a local placeholder, not the entire source page');
assert.equal(text('error'),'Connection error','actionable failures never become an unreadable placeholder');
liveText.current={...liveText.current,locale:'de',labels:{heading:'Deutsche Überschrift'}};
assert.equal(text('heading'),'Deutsche Überschrift','an older async callback reads the current language');
liveText.current.settled=true;assert.equal(text('missing'),'Missing label','a real translation outage keeps the existing usable fallback');
console.log('PASS 144.362: uppercase words translate; brands/codes stay; legacy English repair; calendar enums localize');
console.log('PASS 144.362: immediate cached text, local missing-label placeholder, readable errors and current-language async callbacks');

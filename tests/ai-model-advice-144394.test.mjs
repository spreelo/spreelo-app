import test from 'node:test';
import assert from 'node:assert/strict';
import {parseOfficialOpenAiShutdownRows,shutdownDaysRemaining,shutdownAlertStage,buildModelAdvice} from '../lib/aiModelAdvice.js';

const fixture=`<html><table>
<tr><th>Shutdown date</th><th>Model</th><th>Replacement</th></tr>
<tr><td>January 14, 2027</td><td>GPT-4.1 mini (<code>gpt-4.1-mini-2025-04-14</code>)</td><td><code>gpt-6-luna</code></td></tr>
<tr><td>January 14, 2027</td><td>GPT-4.1 (<code>gpt-4.1-2025-04-14</code>)</td><td><code>gpt-6-luna</code></td></tr>
<tr><td>October 23, 2026</td><td><code>gpt-4.1-nano</code></td><td><code>gpt-5.6-luna</code></td></tr>
</table><div>Models not in a shutdown table: gpt-5.5, gpt-6.1-sol.</div></html>`;

test('reads exact and alias shutdown dates from official table only',()=>{
  const result=parseOfficialOpenAiShutdownRows(fixture);
  assert.equal(result.find(x=>x.model==='gpt-4.1-mini')?.shutdown_date,'2027-01-14');
  assert.equal(result.find(x=>x.model==='gpt-4.1-mini-2025-04-14')?.replacement_model,'gpt-6-luna');
  assert.equal(result.find(x=>x.model==='gpt-4.1')?.shutdown_date,'2027-01-14');
  assert.equal(result.find(x=>x.model==='gpt-4.1-nano')?.shutdown_date,'2026-10-23');
  assert.equal(result.some(x=>x.model==='gpt-6.1-sol'),false);
  assert.equal(result.some(x=>x.model==='gpt-5.5'),false);
});
test('ignores prose without official dated table rows',()=>{
  assert.deepEqual(parseOfficialOpenAiShutdownRows('<p>January 14, 2027 gpt-5.5</p>'),[]);
});
test('dates use deterministic UTC day boundaries and escalating warning stages',()=>{
  assert.equal(shutdownDaysRemaining('2027-01-14',new Date('2026-10-23T23:50:00Z')),83);
  assert.equal(shutdownAlertStage(91),null);
  assert.equal(shutdownAlertStage(90),'90d');
  assert.equal(shutdownAlertStage(30),'30d');
  assert.equal(shutdownAlertStage(14),'14d');
  assert.equal(shutdownAlertStage(7),'7d');
  assert.equal(shutdownAlertStage(-1),'expired');
});
test('advice is per capability and never claims improvement or absolute post savings',()=>{
  const purposes=[{key:'manual_post',provider:'openai',label:'Manuella inlägg',capability:'text_reasoning',fallback:'gpt-5.5'},
    {key:'post_text',provider:'openai',label:'Inläggstext',capability:'text',fallback:'gpt-4.1-mini'},
    {key:'image',provider:'openai',label:'Bilder',capability:'image',fallback:'gpt-image-2'}];
  const prices=[['gpt-5.5',5,30],['gpt-6.1-sol',2,10],['gpt-4.1-mini',0.4,1.6],['gpt-6-luna',0.1,0.5]].flatMap(([model,i,o])=>[
    {provider:'openai',model,unit:'input_1m_tokens',amount_usd:i},{provider:'openai',model,unit:'output_1m_tokens',amount_usd:o}]);
  const warnings=[{model:'gpt-4.1-mini',shutdown_date:'2027-01-14',replacement_model:'gpt-6-luna',source_url:'https://developers.openai.com/api/docs/deprecations'}];
  const result=buildModelAdvice({purposes,settings:[],pricing:prices,shutdowns:warnings,
    catalog:[{provider:'openai',model:'gpt-6.1-sol',status:'pending_review',verified_capabilities:[]}],now:new Date('2026-10-23T12:00:00Z')});
  assert.equal(result.suggestions.length,2);
  assert.equal(result.suggestions.find(x=>x.purpose==='manual_post')?.candidateModel,'gpt-6.1-sol');
  assert.equal(result.suggestions.find(x=>x.purpose==='manual_post')?.status,'test_required');
  assert.equal(result.suggestions.find(x=>x.purpose==='post_text')?.candidateModel,'gpt-6-luna');
  assert.equal(result.suggestions.some(x=>x.purpose==='image'),false);
  assert.equal(result.warnings[0]?.shutdownDate,'2027-01-14');
  assert.equal(result.suggestions[0].comparison.newCost,12);
});
test('missing prices never generates ungrounded savings recommendation',()=>{
 const purposes=[{key:'manual_post',provider:'openai',label:'Manuella inlägg',capability:'text_reasoning',fallback:'gpt-5.5'}];
 assert.equal(buildModelAdvice({purposes}).suggestions.length,0);
});

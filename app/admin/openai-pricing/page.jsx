'use client';
import { useEffect,useState } from 'react';
import AppLayout from '../../../components/AppLayout';
import { supabase } from '../../../lib/supabaseClient';
const SOURCE='https://developers.openai.com/api/docs/pricing';
const fields=[['input_usd_per_m','Input (USD/1M)'],['cached_input_usd_per_m','Cached input (USD/1M)'],['output_usd_per_m','Output (USD/1M)']];
const imageFields=[['image_input_usd_per_m','Image input (USD/1M)'],['cached_image_input_usd_per_m','Cached image input (USD/1M)']];
const PRICE_PRIORITY=['gpt-4.1-mini','gpt-5.5','gpt-5.6-sol','gpt-6.1-sol','gpt-image-2','gpt-image-2.5-flare'];
const initial={model:'',pricing_kind:'text',valid_from:new Date().toISOString().slice(0,16),input_usd_per_m:'',cached_input_usd_per_m:'',output_usd_per_m:'',image_input_usd_per_m:'',cached_image_input_usd_per_m:''};
const panel={padding:18,background:'var(--panel-bg,#fff)',color:'var(--text-color,inherit)',border:'1px solid var(--border-color,#d9dfe7)',borderRadius:12,marginBottom:18};
export default function OpenAIPricingAdmin(){
  const [info,setInfo]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[form,setForm]=useState(initial),[confirm,setConfirm]=useState(false),[modelQuery,setModelQuery]=useState(''),[syncMessage,setSyncMessage]=useState('');
  async function api(method='GET',body=null){
    const {data:{session}}=await supabase.auth.getSession();
    if(!session?.access_token)throw new Error('Administrator sign-in required.');
    const res=await fetch('/api/admin/openai-pricing',{method,headers:{Authorization:`Bearer ${session.access_token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});
    const v=await res.json();if(!res.ok)throw new Error(v.error||'Serverfel');return v;
  }
  async function refresh(){setLoading(true);setError('');try{setInfo(await api())}catch(e){setError(String(e.message||e))}finally{setLoading(false)}}
  useEffect(()=>{refresh()},[]);
  async function propose(e){e.preventDefault();if(!confirm)return;setLoading(true);setError('');try{
    await api('POST',{action:'propose',...form,valid_from:new Date(form.valid_from).toISOString(),confirmOfficialPriceReview:true});
    setForm(initial);setConfirm(false);await refresh();
  }catch(e){setError(String(e.message||e))}finally{setLoading(false)}}
  async function approve(id){if(!window.confirm('Have you compared all USD prices against the official OpenAI pricing page? Approve only when they match.'))return;
    setLoading(true);setError('');try{await api('POST',{action:'approve',id,confirmOfficialPriceReview:true});await refresh()}catch(e){setError(String(e.message||e))}finally{setLoading(false)}}
  async function syncNow(){setLoading(true);setError('');setSyncMessage('');try{const result=await api('POST',{action:'sync'});setSyncMessage(result.skipped?'This check has already run recently.':`Check: ${result.status}. Models: ${result.modelsSeen||0}, new: ${result.newModels||0}, price proposals: ${result.proposedPrices||0}.`);await refresh()}catch(e){setError(String(e.message||e))}finally{setLoading(false)}}
  const latest=info?.audits?.[0];
  const modelRows=(info?.models||[]).filter(m=>m.model.toLowerCase().includes(modelQuery.toLowerCase())).slice(0,120);
  const discovery=info?.discoveryRuns?.[0];
  const priorityRows=PRICE_PRIORITY.map(model=>{
    const catalog=(info?.models||[]).find(m=>m.model===model);
    const tariffs=(info?.versions||[]).filter(v=>v.model===model);
    return {model,catalog,approved:tariffs.find(v=>v.approved),pending:tariffs.find(v=>!v.approved)};
  });
  return <AppLayout active="admin"><main style={{maxWidth:1100,margin:'30px auto',padding:'0 18px 80px'}}>
    <a href="/admin">← Till admin</a><h1>OpenAI-priser och kostnadskontroll</h1>
    <p>Price calculations estimate costs using reported usage and approved rates. Daily billing reconciliation applies to a project, not individual posts.</p>
    {info && !info.enabled && <p role='status' style={{padding:12,background:'#fff3d6',color:'#453000',borderRadius:8}}>The new OpenAI pricing engine is disabled in production. Existing cost calculations remain active until enabled.</p>}
    {info && !info.configured && <p role='status'>The database tables for 144.389 are not yet installed. Existing features are unaffected.</p>}
    {error&&<p role="alert" style={{color:'#b3261e'}}>{error}</p>}
    <button type="button" disabled={loading} onClick={refresh}>Uppdatera</button>
    <section style={panel}><h2>Price monitoring</h2><p>Latest check: {latest?.checked_at?new Date(latest.checked_at).toLocaleString('en-US'):'Not run'} · {latest?.status||'Missing'}</p>
      <p>Changes to the pricing webpage are flagged for manual review. They do not necessarily mean token prices changed, and never automatically change active rates.</p>
      <a href={SOURCE} target="_blank" rel="noreferrer">Open OpenAI official pricing ↗</a>
      {info?.audits?.slice(0,4).map(a=><p key={a.checked_at} style={{fontSize:13}}>{new Date(a.checked_at).toLocaleString('en-US')}: {a.status}</p>)}
    </section>
    <section style={panel}>
      <h2>Automatic model discovery (144.391)</h2>
      <p>The OpenAI models API identifies models available to our account. For models Spreelo uses, official model pages are also checked when the price list has multiple tiers. Only unambiguous Standard short-context prices are proposed for approval.</p>
      {!info?.discoveryConfigured&&<p role="status" style={{padding:10,background:'#fff3d6'}}>Model discovery database tables are not installed yet. Run only the 144.390 SQL migration.</p>}
      {discovery?<p>Latest model check: {new Date(discovery.checked_at).toLocaleString('en-US')} · {discovery.status} · {discovery.models_seen} models · {discovery.newly_seen} newly discovered for Spreelo · {discovery.proposed_prices} price proposals · {discovery.ambiguous_prices} with conflicting prices</p>:<p>No model check has run yet.</p>}
      {syncMessage&&<p role="status" style={{fontWeight:600}}>{syncMessage}</p>}
      {info?.canApprove&&info?.discoveryConfigured&&<button type="button" disabled={loading||!info?.enabled} onClick={syncNow}>Kontrollera OpenAI-modeller nu</button>}
      <p style={{fontSize:13}}>A newly discovered model is not activated automatically. Unusual tiers, specialist models and unclear pricing are shown without an approved rate.</p>
      <h3>Prioriterade modeller i Spreelo</h3>
      <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',textAlign:'left'}}><thead><tr><th>Modell</th><th>Standardpris USD/1M tokens</th><th>Review status</th><th>Source</th></tr></thead><tbody>
        {priorityRows.map(({model,catalog,approved,pending})=>{const tariff=approved||pending;return <tr key={model} style={{borderTop:'1px solid #eee'}}>
          <td style={{padding:'9px 6px'}}><strong>{model}</strong></td>
          <td style={{padding:'9px 6px',fontSize:12}}>{tariff?`Input ${tariff.input_usd_per_m} · Cache ${tariff.cached_input_usd_per_m} · Output ${tariff.output_usd_per_m}${tariff.pricing_kind==='image'?` · Bildinput ${tariff.image_input_usd_per_m} · Bildcache ${tariff.cached_image_input_usd_per_m}`:''}`:model==='gpt-6.1-sol'?'Published Standard: input $2 · cached $0.10 · output $10 (USD/1M). Requires v144.397 SQL for DB approval.':'Missing / not yet verified'}</td>
          <td style={{padding:'9px 6px',fontSize:12}}>{approved?'Approved':pending?'Proposal – check':catalog?.pricing_status==='ambiguous'?'Multiple price tiers – review required':'Inget verifierat Standardpris'}</td>
          <td style={{padding:'9px 6px',fontSize:12}}><a href={tariff?.source_url||`https://developers.openai.com/api/docs/models/${model}`} target='_blank' rel='noreferrer'>OpenAI ↗</a></td>
        </tr>})}
      </tbody></table></div>
      <p style={{fontSize:12}}>These proposals cover Standard short-context usage only, not Batch, Fast, long contexts, cache writes or regional add-ons. Reliable image estimates require complete actual usage. Nothing is approved automatically.</p>
      <label style={{display:'block',margin:'12px 0'}}>Search model ID <input type="search" value={modelQuery} onChange={e=>setModelQuery(e.target.value)} placeholder="e.g. gpt-" style={{marginLeft:8,padding:6}}/></label>
      <div style={{maxHeight:380,overflow:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',textAlign:'left'}}>
        <thead><tr><th>Modell-ID</th><th>First seen in Spreelo</th><th>Discovered via</th><th>Pricing status</th></tr></thead>
        <tbody>{modelRows.map(m=><tr key={m.model} style={{borderTop:'1px solid #eee'}}><td style={{padding:'7px 4px',fontSize:13}}>{m.model}</td>
          <td style={{fontSize:12}}>{new Date(m.first_seen_at).toLocaleDateString('en-US')}</td>
          <td style={{fontSize:12}}>{[m.listed_in_api?'API':null,m.listed_on_pricing_page?'Prislista':null].filter(Boolean).join(' + ')||'Unknown'}</td>
          <td style={{fontSize:12}}>{info?.versions?.some(v=>v.model===m.model && v.approved)?'Approved':
            info?.versions?.some(v=>v.model===m.model && !v.approved)?'Proposal – review':
            m.pricing_status==='ambiguous'?'Ambiguous pricing':
            m.pricing_status==='candidate'?'Price entry found – review required':'Pris ej verifierat'}</td></tr>)}</tbody>
      </table></div>
      {(info?.models||[]).length>120&&<p style={{fontSize:12}}>Showing the first 120 filtered models. Search by name to view others.</p>}
    </section>
    <section style={panel}><h2>Approved and proposed rates</h2>
      {!info?.versions?.length?<p>No manually approved prices yet. Earlier calculations are marked as estimates.</p>:null}
      <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',textAlign:'left'}}><thead><tr><th>Modell</th><th>Typ</th><th>USD/1M input</th><th>Cache</th><th>Output</th><th>Valid from</th><th>Status</th></tr></thead><tbody>
       {info?.versions?.map(v=><tr key={v.id} style={{borderTop:'1px solid #ddd'}}><td>{v.model}<small style={{display:'block'}}>{v.version}{v.pricing_kind==='image'?` · Image input: ${v.image_input_usd_per_m ?? 'saknas'} · Cached image input: ${v.cached_image_input_usd_per_m ?? 'saknas'}`:''}</small><a href={v.source_url||SOURCE} target='_blank' rel='noreferrer' style={{display:'block',fontSize:11}}>Price source ↗</a></td><td>{v.pricing_kind}</td><td>{v.input_usd_per_m}</td><td>{v.cached_input_usd_per_m}</td><td>{v.output_usd_per_m}</td><td>{new Date(v.valid_from).toLocaleDateString('en-US')}</td><td>{v.approved?'Approved':info?.canApprove?<button type="button" disabled={loading} onClick={()=>approve(v.id)}>Review and approve</button>:'Pending'}</td></tr>)}
      </tbody></table></div>
    </section>
    {info?.canApprove&&<section style={panel}><h2>Propose new model price</h2>
      <p>Verify published Standard pricing first. Enter all components per million tokens in USD. New rates are not activated until explicitly approved.</p>
      <form onSubmit={propose} style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:14}}>
        <label>Exakt modell-ID<input required value={form.model} onChange={e=>setForm({...form,model:e.target.value})} style={{display:'block',width:'100%'}}/></label>
        <label>Typ<select value={form.pricing_kind} onChange={e=>setForm({...form,pricing_kind:e.target.value})} style={{display:'block',width:'100%'}}><option value="text">Text</option><option value="image">Bildtokens</option></select></label>
        <label>Valid from (local time)<input required type="datetime-local" value={form.valid_from} onChange={e=>setForm({...form,valid_from:e.target.value})} style={{display:'block',width:'100%'}}/></label>
        {[...fields,...(form.pricing_kind==='image'?imageFields:[])].map(([key,label])=><label key={key}>{label}<input required type="number" min="0" step="any" value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} style={{display:'block',width:'100%'}}/></label>)}
        <label style={{gridColumn:'1/-1'}}><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)}/> I personally verified these prices against OpenAI official pricing.</label>
        <button type="submit" disabled={loading||!confirm}>Save proposal (inactive)</button>
      </form></section>}
    <section style={panel}><h2>Daily billing reconciliation</h2><p>Compares the configured Spreelo OpenAI project costs against our logs. Differences may be caused by billing delays, missing prices or other project costs.</p>
      <div style={{overflowX:'auto'}}><table style={{width:'100%',textAlign:'left'}}><thead><tr><th>Day (UTC)</th><th>OpenAI USD</th><th>Logged USD</th><th>Missing price</th><th>Difference USD</th><th>Assessment</th></tr></thead><tbody>
        {info?.reconciliations?.map(r=><tr key={r.day_utc+r.project_id}><td>{r.day_utc}</td><td>{r.actual_usd}</td><td>{r.recorded_estimate_usd}</td><td>{r.unpriced_events}</td><td>{r.delta_usd}</td><td>{r.status}</td></tr>)}
      </tbody></table></div>{!info?.reconciliations?.length&&<p>No reconciliation yet. Requires an OpenAI Admin API key and dedicated project.</p>}
    </section>
  </main></AppLayout>;
}

'use client';
import { useCallback, useEffect, useState } from 'react';
import AppLayout from '../../../components/AppLayout';
import { supabase } from '../../../lib/supabaseClient';

const panel = {background:'var(--panel-bg,#fff)',color:'var(--text-color,#172033)',border:'1px solid var(--border-color,#dbe2eb)',borderRadius:14,padding:18};
const faint = {fontSize:12,color:'var(--muted-text,#64748b)'};
const button = {padding:'9px 14px',border:'1px solid #cbd5e1',borderRadius:9,cursor:'pointer',background:'var(--panel-bg,#fff)',color:'var(--text-color,#172033)'};
function toLocalInput(date) {
  const d = new Date(date.getTime() - date.getTimezoneOffset()*60000);
  return d.toISOString().slice(0,16);
}
function usd(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'Not priced';
  return '$' + n.toFixed(n > 0 && n < 0.01 ? 7 : 5);
}
function integer(n) { return Number(n||0).toLocaleString('en-US'); }
function localTime(value) { return value ? new Date(value).toLocaleString(undefined,{dateStyle:'short',timeStyle:'short'}) : '—'; }
function dateRange(hours) {
  const now = new Date();
  return {start:new Date(now.getTime()-hours*3600_000).toISOString(),end:now.toISOString()};
}
function displayError(error) { return String(error?.message || error || 'Unknown error'); }

export default function AdminAiCostsPage() {
  const [range,setRange]=useState(null);
  const [startInput,setStartInput]=useState('');
  const [endInput,setEndInput]=useState('');
  const [provider,setProvider]=useState('openai');
  const [model,setModel]=useState('');
  const [modelInput,setModelInput]=useState('');
  const [kind,setKind]=useState('all');
  const [page,setPage]=useState(1);
  const [result,setResult]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [reload,setReload]=useState(0);
  useEffect(()=>{
    const r = dateRange(24);
    setRange(r);
    setStartInput(toLocalInput(new Date(r.start)));
    setEndInput(toLocalInput(new Date(r.end)));
  },[]);
  const selectPreset = (hours) => {
    const r=dateRange(hours);
    setStartInput(toLocalInput(new Date(r.start)));
    setEndInput(toLocalInput(new Date(r.end)));
    setPage(1);setRange(r);
  };
  const applyDates = () => {
    const start = new Date(startInput),end = new Date(endInput);
    if(!startInput||!endInput||!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start||end-start>31*86400_000){
      setError('Choose a valid start/end period, up to 31 days.'); return;
    }
    setError('');setPage(1);setRange({start:start.toISOString(),end:end.toISOString()});
  };
  const load=useCallback(async (signal) => {
    if(!range)return;
    setBusy(true);setError('');setResult(null);
    try {
      const {data:{session}}=await supabase.auth.getSession();
      if(!session?.access_token) throw new Error('Administrator sign-in required.');
      const query=new URLSearchParams({start:range.start,end:range.end,provider,kind,page:String(page)});
      if(model)query.set('model',model);
      const response=await fetch(`/api/admin/ai-costs?${query}`,{headers:{Authorization:`Bearer ${session.access_token}`},signal,cache:'no-store'});
      const json=await response.json();
      if(!response.ok)throw new Error(json.error||'Could not load cost overview.');
      if(!signal.aborted)setResult(json);
    } catch(e) {
      if(e?.name!=='AbortError'&&!signal.aborted){setError(displayError(e));setResult(null);}
    } finally {if(!signal.aborted)setBusy(false);}
  },[range,provider,kind,model,page]);
  useEffect(()=>{const controller=new AbortController();load(controller.signal);return()=>controller.abort();},[load,reload]);
  const totals=result?.overview?.totals||{};
  const operations=[...(result?.overview?.operations||[])].sort((a,b)=>Number(b.total_usd)-Number(a.total_usd));
  const models=[...(result?.overview?.models||[])].sort((a,b)=>Number(b.total_usd)-Number(a.total_usd));
  const rows=result?.rows||[];
  return <AppLayout active="admin"><main style={{maxWidth:1250,margin:'28px auto',padding:'0 18px 80px',display:'grid',gap:16}}>
    <div><a href="/admin" style={faint}>← Admin</a><h1 style={{margin:'10px 0 6px',fontSize:27}}>AI cost overview</h1>
      <p style={{color:'#64748b',margin:0}}>Registered provider costs, including AI calls not linked to a post. Amounts are estimates from the cost ledger — not confirmed charges for an individual request.</p></div>
    <section style={{...panel,display:'grid',gap:12}}>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
        {[['1 hour',1],['3 hours',3],['24 hours',24],['7 days',168],['30 days',720]].map(([label,hours])=><button type="button" key={hours} style={button} onClick={()=>selectPreset(hours)}>{label}</button>)}
        <button type="button" disabled={busy} style={{...button,marginLeft:'auto'}} onClick={()=>setReload(n=>n+1)}>{busy?'Loading…':'Refresh'}</button>
      </div>
      <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'end'}}>
        <label style={faint}>From (your local time)<input type="datetime-local" value={startInput} onChange={e=>setStartInput(e.target.value)} style={{display:'block',padding:8,border:'1px solid #cbd5e1',borderRadius:8,marginTop:4}}/></label>
        <label style={faint}>To (your local time)<input type="datetime-local" value={endInput} onChange={e=>setEndInput(e.target.value)} style={{display:'block',padding:8,border:'1px solid #cbd5e1',borderRadius:8,marginTop:4}}/></label>
        <button type="button" onClick={applyDates} style={button}>Apply dates</button>
        <label style={faint}>Provider<select value={provider} onChange={e=>{setProvider(e.target.value);setPage(1)}} style={{display:'block',padding:9,marginTop:4,borderRadius:8}}><option value="openai">OpenAI</option><option value="all">All providers</option><option value="kling">Kling</option><option value="shotstack">Shotstack</option></select></label>
        <label style={faint}>Events<select value={kind} onChange={e=>{setKind(e.target.value);setPage(1)}} style={{display:'block',padding:9,marginTop:4,borderRadius:8}}><option value="all">All</option><option value="post">Linked to a post</option><option value="other">Other AI activity</option><option value="unpriced">Missing price</option></select></label>
        <label style={faint}>Exact model ID<input value={modelInput} onChange={e=>setModelInput(e.target.value)} placeholder="All models" style={{display:'block',padding:9,marginTop:4,border:'1px solid #cbd5e1',borderRadius:8,maxWidth:175}}/></label>
        <button type="button" onClick={()=>{setModel(modelInput.trim());setPage(1)}} style={button}>Filter model</button>
        {model&&<button type="button" style={button} onClick={()=>{setModel('');setModelInput('');setPage(1)}}>Clear model</button>}
      </div>
      <p style={{...faint,margin:0}}>Summary cards cover <strong>all cost events for the selected provider, model and dates</strong>. The Events filter only changes the detailed list.</p>
    </section>
    {error&&<div role="alert" style={{...panel,borderColor:'#e78787',color:'#ad2c2c'}}>{error}</div>}
    <section style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12}}>
      {[
        ['Total registered',usd(totals.total_usd??0),`${integer(totals.events)} events`],
        ['Linked to posts',usd(totals.posts_usd??0),`${integer(totals.post_events)} events`],
        ['Other AI costs',usd(totals.other_usd??0),`${integer(totals.other_events)} events`],
        ['Missing a usable price',integer(totals.unpriced_events),`Unpriced events (not $0)`]
      ].map(([title,value,sub])=><article key={title} style={{...panel,display:'grid',gap:8}}><div style={faint}>{title}</div><strong style={{fontSize:24,letterSpacing:'-.5px'}}>{!result?'—':value}</strong><span style={faint}>{sub}</span></article>)}
    </section>
    {Number(totals.unpriced_events)>0&&<p role="status" style={{padding:12,background:'#fff4dc',color:'#7b4900',border:'1px solid #efd39b',borderRadius:10,margin:0}}>Some provider requests could not be priced. Displayed totals exclude them and must not be treated as complete costs.</p>}
    <p style={{...faint,margin:0}}>The previous OpenAI balance change cannot be attributed to a single post from these logs alone. Billing updates can be delayed and some external requests may not have been logged. <a href="/admin/openai-pricing">Open billing reconciliation →</a></p>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(350px,1fr))',gap:14}}>
      <section style={panel}><h2 style={{margin:'0 0 14px',fontSize:18}}>Cost by AI operation</h2><div style={{maxHeight:400,overflow:'auto'}}><table style={{width:'100%',fontSize:12,borderCollapse:'collapse'}}><thead><tr><th style={{textAlign:'left'}}>Operation / service</th><th style={{textAlign:'right'}}>Posts</th><th style={{textAlign:'right'}}>Other</th><th style={{textAlign:'right'}}>Total</th></tr></thead><tbody>{operations.map((x,i)=><tr key={`${x.operation}-${i}`} style={{borderTop:'1px solid #e2e8f0'}}><td style={{padding:'10px 5px',overflowWrap:'anywhere'}}><strong>{x.operation}</strong><div style={faint}>{x.service} · {integer(x.events)} calls {Number(x.unpriced_events)?`· ${x.unpriced_events} unpriced`:''}</div></td><td style={{textAlign:'right'}}>{usd(x.posts_usd)}</td><td style={{textAlign:'right'}}>{usd(x.other_usd)}</td><td style={{textAlign:'right',fontWeight:700}}>{usd(x.total_usd)}</td></tr>)}{!operations.length&&<tr><td colSpan={4} style={{padding:14}}>No registered AI costs in this period.</td></tr>}</tbody></table></div></section>
      <section style={panel}><h2 style={{margin:'0 0 14px',fontSize:18}}>Cost by AI model</h2><div style={{maxHeight:400,overflow:'auto'}}><table style={{width:'100%',fontSize:12,borderCollapse:'collapse'}}><thead><tr><th style={{textAlign:'left'}}>Model / provider</th><th style={{textAlign:'right'}}>Calls</th><th style={{textAlign:'right'}}>Cost</th></tr></thead><tbody>{models.map((x,i)=><tr key={`${x.provider}-${x.model}-${i}`} style={{borderTop:'1px solid #e2e8f0'}}><td style={{padding:'10px 5px',overflowWrap:'anywhere'}}><strong>{x.model}</strong><div style={faint}>{x.provider}{Number(x.unpriced_events)?` · ${x.unpriced_events} unpriced`:''}</div></td><td style={{textAlign:'right'}}>{integer(x.events)}</td><td style={{textAlign:'right',fontWeight:700}}>{usd(x.total_usd)}</td></tr>)}{!models.length&&<tr><td colSpan={3} style={{padding:14}}>No models in this period.</td></tr>}</tbody></table></div></section>
    </div>
    <section style={panel}><div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:8,flexWrap:'wrap'}}><h2 style={{fontSize:18,margin:'0 0 12px'}}>Individual cost events</h2><span style={faint}>Most recent first · 75 per page · Page {page}</span></div>
      <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:850}}><thead><tr style={{textAlign:'left'}}><th>Local time</th><th>Link</th><th>Provider / model</th><th>Operation</th><th>Cost</th><th>Pricing</th></tr></thead><tbody>{rows.map(item=><tr key={item.id} style={{borderTop:'1px solid #e2e8f0'}}><td style={{padding:'11px 5px',whiteSpace:'nowrap'}}>{localTime(item.created_at)}</td><td>{item.post_id?<><strong>Post</strong><div style={faint} title={item.post_id}>{item.post_id.slice(0,8)}…</div></>:<strong style={{color:'#9a5800'}}>Other AI</strong>}</td><td>{item.provider}<div style={faint}>{item.model||'Unknown'}</div></td><td style={{maxWidth:290,overflowWrap:'anywhere'}}>{item.operation}<div style={faint}>{item.service}{item.note?` · ${String(item.note).slice(0,90)}`:''}</div></td><td style={{fontWeight:700,whiteSpace:'nowrap'}}>{item.amount==null||item.currency!=='USD'?'Not priced':usd(item.amount)}</td><td>{item.amount==null?'Missing price':item.exact?'Usage based':'Estimate'}<div style={faint}>{item.pricing_version}</div></td></tr>)}{!rows.length&&<tr><td colSpan={6} style={{padding:16}}>No cost events match these filters.</td></tr>}</tbody></table></div>
      <div style={{display:'flex',justifyContent:'end',alignItems:'center',gap:10,marginTop:16}}><button type="button" style={button} disabled={busy||page===1} onClick={()=>setPage(p=>p-1)}>Previous</button><span style={faint}>{page}</span><button type="button" style={button} disabled={busy||!result?.hasMore} onClick={()=>setPage(p=>p+1)}>Next</button></div>
    </section>
    <p style={faint}>A true OpenAI invoice reconciliation is only available for whole UTC days with the dedicated OpenAI Admin billing integration. These event records are not proof of a per-request invoice charge.</p>
  </main></AppLayout>;
}

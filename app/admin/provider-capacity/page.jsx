"use client";
import { useEffect, useState } from "react";
import { ArrowLeft, RefreshCw, Activity, ExternalLink, AlertTriangle } from "lucide-react";
import AppLayout from "../../../components/AppLayout";
import { supabase } from "../../../lib/supabaseClient";

const number = (value) => Number(value).toLocaleString("en-US");
function state(row) {
  if (row.monitoring_mode !== "instrumented") return "Measurement not connected";
  if (row.limit_value == null) return "Limit unknown";
  if (row.verification === "unknown" || row.verification === "provisional") return "Account limit not verified";
  return null;
}
function windowLabel(value) {
  return ({ minute:"Minut",pacific_day:"Dygn (Pacific Time)",utc_day:"Dygn (UTC)",utc_month:"Month (UTC)",concurrent:"Samtidigt" })[value] || value;
}
export default function ProviderCapacityPage() {
  const [rows,setRows] = useState([]);
  const [reported,setReported] = useState([]);
  const [klingQueue,setKlingQueue] = useState(null);
  const [sources,setSources] = useState([]);
  const [missingReported,setMissingReported] = useState(false);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [updated,setUpdated] = useState(null);
  const [canEdit,setCanEdit] = useState(false);
  const [editing,setEditing] = useState("");
  const [draftLimit,setDraftLimit] = useState("");
  const [draftVerification,setDraftVerification] = useState("unknown");
  const [saving,setSaving] = useState(false);
  async function reload() {
    setLoading(true);setError("");
    try {
      const {data:{session}}=await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Admin sign-in required.");
      const response=await fetch("/api/admin/provider-capacity",{
        headers:{Authorization:`Bearer ${session.access_token}`},cache:"no-store"
      });
      const payload=await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load provider capacity. Check that the SQL migration is installed.");
      setRows(payload.rows || []);setReported(payload.reported || []);setKlingQueue(payload.klingQueue||null);setSources(payload.sources || []);setMissingReported(Boolean(payload.reportedMigrationRequired));setCanEdit(Boolean(payload.canEdit));setUpdated(payload.updatedAt);
    } catch(e) {setError(String(e.message||e));}finally{setLoading(false);}
  }

  function editLimit(row) {
    setEditing(row.provider + ":" + row.metric);
    setDraftLimit(row.limit_value == null ? "" : String(row.limit_value));
    setDraftVerification(row.verification === "documented" ? "confirmed" : row.verification);
  }
  async function saveLimit(row) {
    setSaving(true);setError("");
    try {
      const {data:{session}}=await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Inloggning saknas.");
      const response=await fetch("/api/admin/provider-capacity",{
        method:"PATCH",headers:{Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json"},
        body:JSON.stringify({provider:row.provider,metric:row.metric,limit_value:draftLimit===""?null:Number(draftLimit),verification:draftVerification})
      });
      const payload=await response.json();
      if (!response.ok) throw new Error(payload.error||"Could not save the limit.");
      setEditing("");
      await reload();
    } catch(e){setError(String(e?.message||e));}
    finally{setSaving(false);}
  }
  useEffect(()=>{reload();},[]);
  const providers = [...new Set(rows.map(r=>r.provider))];
  return <AppLayout active="admin">
    <main style={{maxWidth:1160,margin:"28px auto",padding:"0 18px 80px"}}>
      <a href="/admin" style={{display:"inline-flex",alignItems:"center",gap:8,marginBottom:18}}><ArrowLeft size={16}/> Till admin</a>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
        <div><p style={{fontSize:12,letterSpacing:1.5,fontWeight:700,color:"#6b7890"}}>SYSTEM HEALTH / CAPACITY</p><h1 style={{fontSize:32,fontWeight:800}}>Provider capacity monitoring</h1>
          <p>Observed API calls and documented baseline limits. No customer tasks or provider settings are modified here.</p></div>
        <button type="button" onClick={reload} disabled={loading} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 15px",border:"1px solid #aaa",borderRadius:10}}><RefreshCw size={16}/> Uppdatera</button>
      </div>
      <div style={{margin:"16px 0",padding:16,borderRadius:12,background:"#eaf3fc",color:"#233b58"}}>
        <Activity size={18} style={{verticalAlign:"middle",marginRight:8}}/> Metrics without verified limits never show invented percentages. Request counts are not billed units or provider-reported quotas. Monitoring started at installation and may be incomplete.
      </div>
      {error&&<div role="alert" style={{padding:16,border:"1px solid #c55",borderRadius:12,marginBottom:12}}><AlertTriangle size={18}/> {error}</div>}
      {klingQueue&&<section style={{background:"#fff",border:"1px solid #d9dfe7",borderRadius:14,padding:18,margin:"18px 0"}}>
        <h2>Kling – capacity queue</h2>
        <p style={{fontSize:13}}>Spreelo database reservation metrics, not Kling official concurrency statistics.</p>
        <p><strong>{Number(klingQueue.active_jobs||0)} / {klingQueue.verified_limit ?? "?"}</strong> reserved/running tasks · <strong>{Number(klingQueue.waiting_jobs||0)}</strong> waiting · <strong>{Number(klingQueue.uncertain_jobs||0)}</strong> uncertain provider submissions</p>
        {Number(klingQueue.uncertain_jobs||0)>0&&<p style={{color:"#ac541d"}}>Uncertain submissions retain capacity until the Kling task has been checked. Never generate a replacement video automatically.</p>}
      </section>}
      {loading?<p>Loading metrics…</p>:providers.length===0?<p>No capacity metrics found. Check SQL installation.</p>:null}
      <section style={{background:"#fff",border:"1px solid #d9dfe7",borderRadius:14,padding:18,margin:"18px 0"}}>
        <h2 style={{fontSize:22,margin:"0 0 8px"}}>Provider-reported quotas</h2>
        <p style={{fontSize:13,color:"#586576"}}>Direct provider measurements appear separately from Spreelo estimated API usage. Outdated readings do not trigger current quota warnings.</p>
        {missingReported&&<p style={{color:"#ad521a"}}>Install SQL 144.388 before provider metrics can be shown.</p>}
        {sources.map(source=><p key={source.provider} style={{fontSize:13}}>
          <strong style={{textTransform:"capitalize"}}>{source.provider}</strong> · {source.state==="connected"?"Ansluten":source.state==="permission_required"?"API access missing":source.state==="not_configured"?"Ej konfigurerad":"Cannot be measured"}
          {" · "}{source.message}
        </p>)}
        {reported.length===0&&!missingReported&&<p style={{fontSize:13}}>No quota metrics have been retrieved yet. Resend is checked automatically using the existing API key if permissions allow.</p>}
        {reported.map(r=>{
          const cap=r.limit_value===null?null:Number(r.limit_value);
          const used=r.observed_count===null?null:Number(r.observed_count);
          const pct=cap>0&&used!==null?Math.max(0,Math.round(100*used/cap)):null;
          const age=Date.now()-new Date(r.checked_at).getTime();
          const fresh=Number.isFinite(age)&&age>=0&&age<45*60*1000;
          return <div key={r.provider+":"+r.scope+":"+r.metric} style={{borderTop:"1px solid #e4e7eb",padding:"12px 0"}}>
            <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
              <strong>{r.label}</strong>
              <span>{used!==null?number(used):"Not reported"} / {cap===null?"No fixed limit":number(cap)} {r.unit}</span>
            </div>
            <div style={{background:"#edf0f3",height:9,borderRadius:9,overflow:"hidden",margin:"9px 0"}}>
              {pct!==null&&<div style={{height:"100%",width:`${Math.min(100,pct)}%`,background:pct>=85?"#c46a32":"#218c82"}}/>}
            </div>
            <p style={{fontSize:12,color:"#66717b",margin:0}}>{r.source==="resend_usage_api"?"Official Resend Usage API":"OpenAI rate-limit-headers"} · {fresh?"Current reading":"Outdated reading"} · {r.checked_at?new Date(r.checked_at).toLocaleString("en-US"):"—"}{r.reset_at?" · Resets "+new Date(r.reset_at).toLocaleString("en-US"):""}</p>
          </div>;
        })}
      </section>

      {providers.map(provider=><section key={provider} style={{background:"var(--panel-bg,#fff)",border:"1px solid var(--border-color,#d9dfe7)",borderRadius:14,padding:18,margin:"18px 0"}}>
        <h2 style={{fontSize:22,margin:"0 0 16px",textTransform:"capitalize"}}>{provider}</h2>
        {rows.filter(r=>r.provider===provider).map(r=>{
          const note=state(r);const observed=r.observed_count===null?null:Number(r.observed_count);
          const ratio=!note && observed!==null && r.limit_value>0 ? observed/Number(r.limit_value):null;
          const pct=ratio===null?null:Math.max(0,Math.round(ratio*100));
          const color=pct>=95?"#c44848":pct>=85?"#cf8a33":pct>=70?"#bc9943":"#218c82";
          return <div key={r.metric} style={{borderTop:"1px solid #e2e6ea",padding:"14px 0"}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
              <div><strong>{r.label}</strong><div style={{fontSize:12,color:"#6d7480"}}>{windowLabel(r.window_kind)} · {r.verification==="confirmed"?"Account verified":r.verification==="documented"?"Documented":r.verification==="provisional"?"Provisional":"Unknown"} limit</div></div>
              <div style={{textAlign:"right",fontWeight:700}}>{observed===null?"No measurement":number(observed)}{r.limit_value!==null?` / ${number(r.limit_value)} ${r.unit}`:` ${r.unit}`}</div>
            </div>
            <div style={{height:9,borderRadius:9,background:"#e5e8ee",overflow:"hidden",marginTop:10}}>
              {pct!==null&&<div style={{height:"100%",width:`${Math.min(100,pct)}%`,background:color}}/>}
            </div>
            <p style={{fontSize:13,marginTop:7,color:"#66717b"}}>{note || `${pct}% of limit`}{r.monitoring_mode==="instrumented"&&!r.full_window_observed?" · Partial measurement window":""}</p>

            {canEdit && <div style={{marginTop:8,fontSize:13}}>
              {editing===r.provider+":"+r.metric ? <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                <label>Account limit <input aria-label="Account limit" type="number" min="1" step="1" value={draftLimit} onChange={e=>setDraftLimit(e.target.value)} style={{width:120,padding:8,border:"1px solid #bfc7d0",borderRadius:7}}/></label>
                <label>Verification <select aria-label="Verification status" value={draftVerification} onChange={e=>setDraftVerification(e.target.value)} style={{padding:8,border:"1px solid #bfc7d0",borderRadius:7}}>
                  <option value="unknown">Unknown</option><option value="provisional">Provisional</option><option value="confirmed">Confirmed in account</option>
                </select></label>
                <button type="button" disabled={saving} onClick={()=>saveLimit(r)}>Save</button>
                <button type="button" disabled={saving} onClick={()=>setEditing("")}>Cancel</button>
              </div> : <button type="button" onClick={()=>editLimit(r)} style={{textDecoration:"underline",border:0,background:"transparent",cursor:"pointer"}}>Set/verify limit</button>}
            </div>}
            <details style={{fontSize:13}}><summary style={{cursor:"pointer"}}>Action and source</summary><p>{r.instructions}</p>{r.documentation_url&&<a target="_blank" rel="noreferrer" href={r.documentation_url}>Provider documentation <ExternalLink size={13} style={{display:"inline"}}/></a>}</details>
          </div>;
        })}
      </section>)}
      <p style={{fontSize:12,color:"#6d7480"}}>Last fetched: {updated?new Date(updated).toLocaleString("en-US"):"—"}. Email alerts are checked separately by a scheduled server process after SQL is installed.</p>
    </main>
  </AppLayout>;
}

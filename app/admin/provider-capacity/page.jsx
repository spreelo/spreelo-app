"use client";
import { useEffect, useState } from "react";
import { ArrowLeft, RefreshCw, Activity, ExternalLink, AlertTriangle } from "lucide-react";
import AppLayout from "../../../components/AppLayout";
import { supabase } from "../../../lib/supabaseClient";

const number = (value) => Number(value).toLocaleString("sv-SE");
function state(row) {
  if (row.monitoring_mode !== "instrumented") return "Mätning ej ansluten";
  if (row.limit_value == null) return "Gräns okänd";
  if (row.verification === "unknown" || row.verification === "provisional") return "Kontogräns ej verifierad";
  return null;
}
function windowLabel(value) {
  return ({ minute:"Minut",pacific_day:"Dygn (Pacific Time)",utc_day:"Dygn (UTC)",utc_month:"Månad (UTC)",concurrent:"Samtidigt" })[value] || value;
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
      if (!session?.access_token) throw new Error("Du behöver logga in som administratör.");
      const response=await fetch("/api/admin/provider-capacity",{
        headers:{Authorization:`Bearer ${session.access_token}`},cache:"no-store"
      });
      const payload=await response.json();
      if (!response.ok) throw new Error(payload.error || "Kunde inte läsa leverantörskapaciteten. Kontrollera att SQL-migreringen är installerad.");
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
      if (!response.ok) throw new Error(payload.error||"Gränsen kunde inte sparas.");
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
        <div><p style={{fontSize:12,letterSpacing:1.5,fontWeight:700,color:"#6b7890"}}>SYSTEMHÄLSA / KAPACITET</p><h1 style={{fontSize:32,fontWeight:800}}>Leverantörsövervakning</h1>
          <p>Observerade API-anrop och dokumenterade grundgränser. Inga kundjobb eller leverantörsinställningar ändras här.</p></div>
        <button type="button" onClick={reload} disabled={loading} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 15px",border:"1px solid #aaa",borderRadius:10}}><RefreshCw size={16}/> Uppdatera</button>
      </div>
      <div style={{margin:"16px 0",padding:16,borderRadius:12,background:"#eaf3fc",color:"#233b58"}}>
        <Activity size={18} style={{verticalAlign:"middle",marginRight:8}}/> Värden utan verifierad gräns visar aldrig påhittad procent. Anropsräknare är inte fakturerade enheter eller leverantörens egna kvotvärden. Mätningen började vid installationen och kan vara ofullständig.
      </div>
      {error&&<div role="alert" style={{padding:16,border:"1px solid #c55",borderRadius:12,marginBottom:12}}><AlertTriangle size={18}/> {error}</div>}
      {klingQueue&&<section style={{background:"#fff",border:"1px solid #d9dfe7",borderRadius:14,padding:18,margin:"18px 0"}}>
        <h2>Kling – kapacitetskö</h2>
        <p style={{fontSize:13}}>Spreelos databaserade reservationsmätning, inte Klings officiella samtidighetsstatistik.</p>
        <p><strong>{Number(klingQueue.active_jobs||0)} / {klingQueue.verified_limit ?? "?"}</strong> reserverade/pågående jobb · <strong>{Number(klingQueue.waiting_jobs||0)}</strong> väntar · <strong>{Number(klingQueue.uncertain_jobs||0)}</strong> osäkra leverantörsinsändningar</p>
        {Number(klingQueue.uncertain_jobs||0)>0&&<p style={{color:"#ac541d"}}>Osäkra insändningar håller sin kapacitetsplats tills Kling-jobbet kontrollerats. Skapa inte en ersättningsvideo automatiskt.</p>}
      </section>}
      {loading?<p>Hämtar mätvärden…</p>:providers.length===0?<p>Inga kapacitetsmått hittades. Kontrollera SQL-installationen.</p>:null}
      <section style={{background:"#fff",border:"1px solid #d9dfe7",borderRadius:14,padding:18,margin:"18px 0"}}>
        <h2 style={{fontSize:22,margin:"0 0 8px"}}>Leverantörernas egna kvotuppgifter</h2>
        <p style={{fontSize:13,color:"#586576"}}>Direkt avlästa uppgifter visas separat från Spreelos uppskattade API-anrop. Värden från föråldrade avläsningar används inte för aktuella kvotvarningar.</p>
        {missingReported&&<p style={{color:"#ad521a"}}>SQL 144.388 behöver installeras innan leverantörsuppgifterna kan visas.</p>}
        {sources.map(source=><p key={source.provider} style={{fontSize:13}}>
          <strong style={{textTransform:"capitalize"}}>{source.provider}</strong> · {source.state==="connected"?"Ansluten":source.state==="permission_required"?"Saknar API-behörighet":source.state==="not_configured"?"Ej konfigurerad":"Kan inte avläsas"}
          {" · "}{source.message}
        </p>)}
        {reported.length===0&&!missingReported&&<p style={{fontSize:13}}>Inga kvotuppgifter har hämtats ännu. Resend avläses automatiskt med befintlig API-nyckel om behörigheten tillåter det.</p>}
        {reported.map(r=>{
          const cap=r.limit_value===null?null:Number(r.limit_value);
          const used=r.observed_count===null?null:Number(r.observed_count);
          const pct=cap>0&&used!==null?Math.max(0,Math.round(100*used/cap)):null;
          const age=Date.now()-new Date(r.checked_at).getTime();
          const fresh=Number.isFinite(age)&&age>=0&&age<45*60*1000;
          return <div key={r.provider+":"+r.scope+":"+r.metric} style={{borderTop:"1px solid #e4e7eb",padding:"12px 0"}}>
            <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
              <strong>{r.label}</strong>
              <span>{used!==null?number(used):"Ej angivet"} / {cap===null?"Ingen fast gräns":number(cap)} {r.unit}</span>
            </div>
            <div style={{background:"#edf0f3",height:9,borderRadius:9,overflow:"hidden",margin:"9px 0"}}>
              {pct!==null&&<div style={{height:"100%",width:`${Math.min(100,pct)}%`,background:pct>=85?"#c46a32":"#218c82"}}/>}
            </div>
            <p style={{fontSize:12,color:"#66717b",margin:0}}>{r.source==="resend_usage_api"?"Officiellt Resend Usage API":"OpenAI rate-limit-headers"} · {fresh?"Aktuell avläsning":"Inaktuell avläsning"} · {r.checked_at?new Date(r.checked_at).toLocaleString("sv-SE"):"—"}{r.reset_at?" · Återställs "+new Date(r.reset_at).toLocaleString("sv-SE"):""}</p>
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
              <div><strong>{r.label}</strong><div style={{fontSize:12,color:"#6d7480"}}>{windowLabel(r.window_kind)} · {r.verification==="confirmed"?"Kontoverifierad":r.verification==="documented"?"Dokumenterad":r.verification==="provisional"?"Preliminär":"Okänd"} gräns</div></div>
              <div style={{textAlign:"right",fontWeight:700}}>{observed===null?"Ingen mätning":number(observed)}{r.limit_value!==null?` / ${number(r.limit_value)} ${r.unit}`:` ${r.unit}`}</div>
            </div>
            <div style={{height:9,borderRadius:9,background:"#e5e8ee",overflow:"hidden",marginTop:10}}>
              {pct!==null&&<div style={{height:"100%",width:`${Math.min(100,pct)}%`,background:color}}/>}
            </div>
            <p style={{fontSize:13,marginTop:7,color:"#66717b"}}>{note || `${pct}% av gränsen`}{r.monitoring_mode==="instrumented"&&!r.full_window_observed?" · Delvis mätperiod":""}</p>

            {canEdit && <div style={{marginTop:8,fontSize:13}}>
              {editing===r.provider+":"+r.metric ? <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                <label>Kontogräns <input aria-label="Kontogräns" type="number" min="1" step="1" value={draftLimit} onChange={e=>setDraftLimit(e.target.value)} style={{width:120,padding:8,border:"1px solid #bfc7d0",borderRadius:7}}/></label>
                <label>Verifiering <select aria-label="Verifieringsstatus" value={draftVerification} onChange={e=>setDraftVerification(e.target.value)} style={{padding:8,border:"1px solid #bfc7d0",borderRadius:7}}>
                  <option value="unknown">Okänd</option><option value="provisional">Preliminär</option><option value="confirmed">Bekräftad i kontot</option>
                </select></label>
                <button type="button" disabled={saving} onClick={()=>saveLimit(r)}>Spara</button>
                <button type="button" disabled={saving} onClick={()=>setEditing("")}>Avbryt</button>
              </div> : <button type="button" onClick={()=>editLimit(r)} style={{textDecoration:"underline",border:0,background:"transparent",cursor:"pointer"}}>Ange/verifiera gräns</button>}
            </div>}
            <details style={{fontSize:13}}><summary style={{cursor:"pointer"}}>Åtgärd och källa</summary><p>{r.instructions}</p>{r.documentation_url&&<a target="_blank" rel="noreferrer" href={r.documentation_url}>Leverantörsdokumentation <ExternalLink size={13} style={{display:"inline"}}/></a>}</details>
          </div>;
        })}
      </section>)}
      <p style={{fontSize:12,color:"#6d7480"}}>Senast hämtat: {updated?new Date(updated).toLocaleString("sv-SE"):"—"}. Mejlvarningar kontrolleras separat av schemalagd serverprocess när SQL är installerat.</p>
    </main>
  </AppLayout>;
}

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
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [updated,setUpdated] = useState(null);
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
      setRows(payload.rows || []);setUpdated(payload.updatedAt);
    } catch(e) {setError(String(e.message||e));}finally{setLoading(false);}
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
      {loading?<p>Hämtar mätvärden…</p>:providers.length===0?<p>Inga kapacitetsmått hittades. Kontrollera SQL-installationen.</p>:null}
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
            <details style={{fontSize:13}}><summary style={{cursor:"pointer"}}>Åtgärd och källa</summary><p>{r.instructions}</p>{r.documentation_url&&<a target="_blank" rel="noreferrer" href={r.documentation_url}>Leverantörsdokumentation <ExternalLink size={13} style={{display:"inline"}}/></a>}</details>
          </div>;
        })}
      </section>)}
      <p style={{fontSize:12,color:"#6d7480"}}>Senast hämtat: {updated?new Date(updated).toLocaleString("sv-SE"):"—"}. Mejlvarningar kontrolleras separat av schemalagd serverprocess när SQL är installerat.</p>
    </main>
  </AppLayout>;
}

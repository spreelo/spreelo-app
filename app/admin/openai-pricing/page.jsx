'use client';
import { useEffect,useState } from 'react';
import AppLayout from '../../../components/AppLayout';
import { supabase } from '../../../lib/supabaseClient';
const SOURCE='https://developers.openai.com/api/docs/pricing';
const fields=[['input_usd_per_m','Input (USD/1M)'],['cached_input_usd_per_m','Cached input (USD/1M)'],['output_usd_per_m','Output (USD/1M)']];
const imageFields=[['image_input_usd_per_m','Image input (USD/1M)'],['cached_image_input_usd_per_m','Cached image input (USD/1M)']];
const initial={model:'',pricing_kind:'text',valid_from:new Date().toISOString().slice(0,16),input_usd_per_m:'',cached_input_usd_per_m:'',output_usd_per_m:'',image_input_usd_per_m:'',cached_image_input_usd_per_m:''};
const panel={padding:18,background:'var(--panel-bg,#fff)',color:'var(--text-color,inherit)',border:'1px solid var(--border-color,#d9dfe7)',borderRadius:12,marginBottom:18};
export default function OpenAIPricingAdmin(){
  const [info,setInfo]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[form,setForm]=useState(initial),[confirm,setConfirm]=useState(false);
  async function api(method='GET',body=null){
    const {data:{session}}=await supabase.auth.getSession();
    if(!session?.access_token)throw new Error('Administratörsinloggning krävs.');
    const res=await fetch('/api/admin/openai-pricing',{method,headers:{Authorization:`Bearer ${session.access_token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});
    const v=await res.json();if(!res.ok)throw new Error(v.error||'Serverfel');return v;
  }
  async function refresh(){setLoading(true);setError('');try{setInfo(await api())}catch(e){setError(String(e.message||e))}finally{setLoading(false)}}
  useEffect(()=>{refresh()},[]);
  async function propose(e){e.preventDefault();if(!confirm)return;setLoading(true);setError('');try{
    await api('POST',{action:'propose',...form,valid_from:new Date(form.valid_from).toISOString(),confirmOfficialPriceReview:true});
    setForm(initial);setConfirm(false);await refresh();
  }catch(e){setError(String(e.message||e))}finally{setLoading(false)}}
  async function approve(id){if(!window.confirm('Har du jämfört samtliga USD-priser med den officiella OpenAI-prissidan? Godkänn endast om de stämmer.'))return;
    setLoading(true);setError('');try{await api('POST',{action:'approve',id,confirmOfficialPriceReview:true});await refresh()}catch(e){setError(String(e.message||e))}finally{setLoading(false)}}
  const latest=info?.audits?.[0];
  return <AppLayout active="admin"><main style={{maxWidth:1100,margin:'30px auto',padding:'0 18px 80px'}}>
    <a href="/admin">← Till admin</a><h1>OpenAI-priser och kostnadskontroll</h1>
    <p>Prisberäkningar är uppskattningar utifrån rapporterad förbrukning och godkända tariffer. Daglig debiteringsavstämning gäller ett projekt, inte enskilda inlägg.</p>
    {info && !info.enabled && <p role='status' style={{padding:12,background:'#fff3d6',color:'#453000',borderRadius:8}}>Nya OpenAI-prismotorn är avstängd i produktion. Befintliga kostnadsberäkningar används tills den aktiveras.</p>}
    {info && !info.configured && <p role='status'>Databastabellerna för 144.389 är ännu inte installerade. Ingen befintlig funktion påverkas.</p>}
    {error&&<p role="alert" style={{color:'#b3261e'}}>{error}</p>}
    <button type="button" disabled={loading} onClick={refresh}>Uppdatera</button>
    <section style={panel}><h2>Prisbevakning</h2><p>Senaste kontroll: {latest?.checked_at?new Date(latest.checked_at).toLocaleString('sv-SE'):'Ej körd'} · {latest?.status||'Saknas'}</p>
      <p>En ändrad webbsida flaggas för manuell granskning. Den innebär inte säkert ändrade tokenpriser och ändrar aldrig aktiva priser automatiskt.</p>
      <a href={SOURCE} target="_blank" rel="noreferrer">Öppna OpenAI:s officiella prislista ↗</a>
      {info?.audits?.slice(0,4).map(a=><p key={a.checked_at} style={{fontSize:13}}>{new Date(a.checked_at).toLocaleString('sv-SE')}: {a.status}</p>)}
    </section>
    <section style={panel}><h2>Godkända och föreslagna tariffer</h2>
      {!info?.versions?.length?<p>Inga manuellt godkända priser finns ännu. Äldre beräkningar markeras som uppskattningar.</p>:null}
      <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',textAlign:'left'}}><thead><tr><th>Modell</th><th>Typ</th><th>USD/1M input</th><th>Cache</th><th>Output</th><th>Giltig från</th><th>Status</th></tr></thead><tbody>
       {info?.versions?.map(v=><tr key={v.id} style={{borderTop:'1px solid #ddd'}}><td>{v.model}<small style={{display:'block'}}>{v.version}</small></td><td>{v.pricing_kind}</td><td>{v.input_usd_per_m}</td><td>{v.cached_input_usd_per_m}</td><td>{v.output_usd_per_m}</td><td>{new Date(v.valid_from).toLocaleDateString('sv-SE')}</td><td>{v.approved?'Godkänd':info?.canApprove?<button type="button" disabled={loading} onClick={()=>approve(v.id)}>Granska och godkänn</button>:'Väntar'}</td></tr>)}
      </tbody></table></div>
    </section>
    {info?.canApprove&&<section style={panel}><h2>Föreslå nytt modellpris</h2>
      <p>Kontrollera officiellt publicerade standardpriser först. Ange alla komponenter per miljon tokens i USD. Inga nya priser aktiveras förrän du uttryckligen godkänner förslaget.</p>
      <form onSubmit={propose} style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:14}}>
        <label>Exakt modell-ID<input required value={form.model} onChange={e=>setForm({...form,model:e.target.value})} style={{display:'block',width:'100%'}}/></label>
        <label>Typ<select value={form.pricing_kind} onChange={e=>setForm({...form,pricing_kind:e.target.value})} style={{display:'block',width:'100%'}}><option value="text">Text</option><option value="image">Bildtokens</option></select></label>
        <label>Gäller från (lokal tid)<input required type="datetime-local" value={form.valid_from} onChange={e=>setForm({...form,valid_from:e.target.value})} style={{display:'block',width:'100%'}}/></label>
        {[...fields,...(form.pricing_kind==='image'?imageFields:[])].map(([key,label])=><label key={key}>{label}<input required type="number" min="0" step="any" value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} style={{display:'block',width:'100%'}}/></label>)}
        <label style={{gridColumn:'1/-1'}}><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)}/> Jag har själv kontrollerat dessa priser mot OpenAI:s officiella prislista.</label>
        <button type="submit" disabled={loading||!confirm}>Spara förslag (ej aktivt)</button>
      </form></section>}
    <section style={panel}><h2>Daglig debiteringsavstämning</h2><p>Visar OpenAI:s kostnad för det konfigurerade Spreelo-projektet jämfört med vår logg. Skillnader kan orsakas av fördröjd fakturering, saknade priser eller andra projektkostnader.</p>
      <div style={{overflowX:'auto'}}><table style={{width:'100%',textAlign:'left'}}><thead><tr><th>Dag (UTC)</th><th>OpenAI USD</th><th>Loggat USD</th><th>Saknar pris</th><th>Skillnad USD</th><th>Bedömning</th></tr></thead><tbody>
        {info?.reconciliations?.map(r=><tr key={r.day_utc+r.project_id}><td>{r.day_utc}</td><td>{r.actual_usd}</td><td>{r.recorded_estimate_usd}</td><td>{r.unpriced_events}</td><td>{r.delta_usd}</td><td>{r.status}</td></tr>)}
      </tbody></table></div>{!info?.reconciliations?.length&&<p>Ingen avstämning ännu. Kräver OpenAI Admin API-nyckel och dedikerat projekt.</p>}
    </section>
  </main></AppLayout>;
}

'use client';
import {useEffect,useState} from 'react';
import {BrainCircuit,RefreshCw,Save,ShieldCheck,TriangleAlert} from 'lucide-react';
import AppLayout from '../../../components/AppLayout';
import {supabase} from '../../../lib/supabaseClient';

async function headers(){const {data:{session}}=await supabase.auth.getSession();return {'Content-Type':'application/json',...(session?.access_token?{Authorization:`Bearer ${session.access_token}`}:{})};}
export default function AiControlPage(){
 const [news,setNews]=useState([]),[watchRun,setWatchRun]=useState(null),[newsError,setNewsError]=useState(''),[items,setItems]=useState([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(''),[msg,setMsg]=useState(''),[err,setErr]=useState(''),[warning,setWarning]=useState('');
 async function load(){setLoading(true);setErr('');try{const r=await fetch('/api/admin/ai-control',{headers:await headers(),cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.error||'Could not load AI Control Center');setItems(j.purposes||[]);setWarning(j.catalogWarning||'');}catch(e){setErr(e.message)}finally{setLoading(false)}}
 useEffect(()=>{load();(async()=>{try{const r=await fetch('/api/admin/ai-market-news',{headers:await headers(),cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.error||'News unavailable');setNews(j.items||[]);setWatchRun(j.lastRun||null);}catch(e){setNewsError(e.message)}})()},[]);
 function change(key,model){setItems(v=>v.map(x=>x.key===key?{...x,model}:x));}
 async function save(item){setSaving(item.key);setMsg('');setErr('');try{const r=await fetch('/api/admin/ai-control',{method:'PATCH',headers:await headers(),body:JSON.stringify({purpose:item.key,model:item.model})});const j=await r.json();if(!r.ok)throw new Error(j.error||'Could not save model');setMsg(`${item.label}: ${item.model} används från nästa nya körning.`);await load();}catch(e){setErr(e.message)}finally{setSaving('')}}
 return <AppLayout title="AI Control Center">
  <main style={{maxWidth:1180,margin:'0 auto',padding:'28px 24px 60px'}}>
   <div style={{display:'flex',justifyContent:'space-between',gap:20,alignItems:'flex-start',marginBottom:22}}><div><div style={{display:'flex',gap:10,alignItems:'center'}}><BrainCircuit size={28}/><h1 style={{margin:0}}>AI Control Center</h1></div><p style={{maxWidth:760,color:'#64748b'}}>Välj modell per funktion. V324 behåller exakt v322:s modeller tills du själv sparar ett annat val. Endast verifierat kompatibla modeller visas.</p></div><button onClick={load} style={{padding:'10px 14px'}}><RefreshCw size={16}/> Synka</button></div>
   {warning&&<div style={{padding:14,border:'1px solid #f59e0b',borderRadius:12,marginBottom:14}}><TriangleAlert size={17}/> {warning}</div>}
   {err&&<div style={{padding:14,border:'1px solid #ef4444',borderRadius:12,marginBottom:14}}>{err}</div>}{msg&&<div style={{padding:14,border:'1px solid #22c55e',borderRadius:12,marginBottom:14}}>{msg}</div>}
   <div style={{display:'grid',gap:12}}>{loading?<p>Laddar…</p>:items.map(item=><section key={item.key} style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:14,padding:18,display:'grid',gridTemplateColumns:'minmax(230px,1.4fr) minmax(220px,1fr) auto',gap:18,alignItems:'center'}}><div><strong>{item.label}</strong><div style={{fontSize:13,color:'#64748b',marginTop:5}}>{item.provider==='kling'?'Kling':'OpenAI'} · {item.capability}</div>{item.capability==='image_alpha'&&<div style={{fontSize:12,color:'#166534',marginTop:6}}><ShieldCheck size={14}/> Kräver verifierad riktig alpha-transparens</div>}</div><select value={item.model} onChange={e=>change(item.key,e.target.value)} style={{padding:'10px 12px',border:'1px solid #cbd5e1',borderRadius:9}}>{item.options.map(m=><option key={m} value={m}>{m}{m===item.default_model?' · v322':''}</option>)}</select><button disabled={saving===item.key} onClick={()=>save(item)} style={{padding:'10px 14px'}}><Save size={16}/> {saving===item.key?'Sparar…':'Spara'}</button></section>)}</div>
   <section style={{marginTop:32,background:'#fff',border:'1px solid #e2e8f0',borderRadius:14,padding:20}}>
    <h2 style={{margin:'0 0 8px'}}>AI-nyheter & rekommendationer</h2>
    <p style={{color:'#64748b',fontSize:13}}>Daglig bevakning av officiella AI-leverantörsflöden. Nyheter är automatiskt filtrerade, inte verifierade beslut om modellbyte. Inga modellval ändras av bevakningen.</p>
    <p style={{fontSize:12,color:'#64748b'}}>Senaste kontroll: {watchRun?.checked_at?new Date(watchRun.checked_at).toLocaleString('sv-SE'):'Ingen kontroll registrerad ännu'} · Källor OK: {watchRun?.sources_ok??'–'} · Misslyckade: {watchRun?.sources_failed??'–'}</p>
    {newsError&&<p style={{color:'#b45309'}}>Nyhetsflödet är inte tillgängligt ännu. Kontrollera v324 SQL. {newsError}</p>}
    {!newsError&&news.length===0&&<p style={{color:'#64748b'}}>Inga relevanta nyheter registrerade ännu. Första kontrollen körs enligt schemat.</p>}
    <div style={{display:'grid',gap:10}}>{news.map(n=><article key={n.id} style={{padding:'12px 0',borderTop:'1px solid #e2e8f0'}}><div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><strong style={{color:n.severity==='critical'?'#b91c1c':n.severity==='important'?'#b45309':'#334155'}}>{n.severity==='critical'?'Viktigt':n.severity==='important'?'Bevaka':'Info'}</strong><span style={{fontSize:12,color:'#64748b'}}>{n.provider} · {new Date(n.published_at||n.discovered_at).toLocaleDateString('sv-SE')}</span></div><a href={n.url} target="_blank" rel="noopener noreferrer" style={{fontWeight:600}}>{n.title}</a><p style={{fontSize:13,color:'#64748b',margin:'5px 0 0'}}>{n.summary?.slice(0,240)}</p></article>)}</div>
   </section>
  </main>
 </AppLayout>;
}

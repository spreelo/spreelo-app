"use client";

import { useState } from "react";
import { ArrowLeft, BarChart3, Play, ShieldCheck, TriangleAlert } from "lucide-react";
import AppLayout from "../../../components/AppLayout";
import { simulateCapacityScenario, sanitizeCapacityInputs } from "../../../lib/capacitySimulation.mjs";

const nf = (n) => Number(n).toLocaleString("sv-SE");
const initial = { customers: 10000, postsPerWeek: 5, videoShare: 20, workers: 5, videoWorkerMinutes: 3, peakFactor: 3 };
const fields = [
  { key: "customers", label: "Kunder", min: 100, max: 100000, step: 100 },
  { key: "postsPerWeek", label: "Inlägg per kund/vecka", min: 1, max: 10, step: 1 },
  { key: "videoShare", label: "Andel video (%)", min: 0, max: 100, step: 5 },
  { key: "workers", label: "Simulerade workers", min: 1, max: 50, step: 1 },
  { key: "videoWorkerMinutes", label: "Antagen arbetstid per video (min)", min: 1, max: 20, step: 1 },
  { key: "peakFactor", label: "Toppbelastning dagtid (×)", min: 1, max: 5, step: 1 },
];

export default function AdminCapacityTestPage() {
  const [params, setParams] = useState(initial);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  function runSimulation() {
    setRunning(true);
    // Browser-only in-memory queue. No customer data or API requests.
    try { setResult(simulateCapacityScenario(params)); }
    finally { setRunning(false); }
  }
  const sanitized = sanitizeCapacityInputs(params);
  return (
    <AppLayout active="admin">
      <main className="admin385-page">
        <header className="admin385-header">
          <a href="/admin" className="admin385-back"><ArrowLeft size={16}/> Till admin</a>
          <div className="admin385-kicker"><BarChart3 size={16}/> SYSTEMHÄLSA / KAPACITET</div>
          <h1>Belastningstest</h1>
          <p>Simulera en vecka med 100–100 000 kunder, toppar, videojobb och olika antal workers.</p>
        </header>
        <div className="admin385-safe"><ShieldCheck size={20}/><div><strong>Säker syntetisk simulering</strong><p>Ingen produktion, inga kundjobb, inga externa API-anrop, ingen Supabase-belastning och inga kreditkostnader. Testet körs enbart i webbläsarens minne, med grupperade jobb även vid stora volymer.</p></div></div>
        <section className="admin385-grid">
          <div className="admin385-panel">
            <h2>Testscenario</h2>
            <p>Utgå från 5 workers och 2 vanliga jobb eller 1 video per worker-körning.</p>
            {fields.map((f) => (
              <label className="admin385-field" key={f.key}>
                <span>{f.label}<strong>{nf(params[f.key])}</strong></span>
                <input type="range" min={f.min} max={f.max} step={f.step} value={params[f.key]} onChange={(e) => { setParams((s) => ({ ...s, [f.key]: Number(e.target.value) })); setResult(null); }}/>
              </label>
            ))}
            <div className="admin385-demand">Planerad efterfrågan <strong>{nf(sanitized.customers * sanitized.postsPerWeek)} inlägg/vecka</strong></div>
            <button className="admin385-run" type="button" onClick={runSimulation} disabled={running}><Play size={16}/>{running ? "Beräknar …" : "Kör säker simulering"}</button>
          </div>
          <div className="admin385-panel">
            <h2>Resultat</h2>
            {!result ? <div className="admin385-placeholder">Välj scenario och tryck på Kör säker simulering.</div> : <>
              <div className="admin385-results">
                <div><small>Planerade inlägg</small><strong>{nf(result.requestedPosts)}</strong></div>
                <div><small>Jobb påbörjade under veckan</small><strong>{nf(result.completedInWeek)}</strong></div>
                <div><small>Väntande vid veckans slut</small><strong>{nf(result.waitingEndOfWeek)}</strong></div>
                <div><small>Högsta väntande kö</small><strong>{nf(result.maxWaiting)}</strong></div>
                <div><small>95:e percentil väntan till jobbstart</small><strong>{result.p95QueueWaitMinutes == null ? "—" : `${nf(result.p95QueueWaitMinutes)} min`}</strong></div>
                <div><small>Extra tid tills alla jobb startat</small><strong>{result.simulationComplete ? `${nf(result.minutesUntilDrained)} min` : "Mer än en vecka"}</strong></div>
              </div>
              <div className="admin385-interpretation"><TriangleAlert size={20}/><p>{result.waitingEndOfWeek > 0 ? "Modellen visar köbildning. Testa fler workers eller kortare arbetstid – men verifiera i staging innan du driftsätter." : "Modellens antagna worker-kapacitet räcker för detta scenario. Det bevisar INTE att Vercel, Supabase, Kling eller sociala API:er klarar samma volym."}</p></div>
            </>}
            <div className="admin385-note"><strong>Så tolkar du siffrorna</strong><p>Det här är en <b>kapacitetsmodell</b> – inte ett faktiskt produktionstest med dessa kunder. Leverantörskvoter, databashastighet, timeout, fel och riktiga renderingstider mäts inte. För ett verifierat resultat krävs ett separat belastningstest i staging med syntetiska konton och avstängd publicering.</p></div>
          </div>
        </section>
      </main>
    </AppLayout>
  );
}

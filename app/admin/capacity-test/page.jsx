"use client";

import { useState } from "react";
import { ArrowLeft, BarChart3, Play, ShieldCheck, TriangleAlert } from "lucide-react";
import AppLayout from "../../../components/AppLayout";
import { simulateCapacityScenario, sanitizeCapacityInputs } from "../../../lib/capacitySimulation.mjs";

const nf = (n) => Number(n).toLocaleString("en-US");
const initial = { customers: 10000, postsPerWeek: 5, videoShare: 20, workers: 5, videoWorkerMinutes: 3, peakFactor: 3 };
const fields = [
  { key: "customers", label: "Customers", min: 100, max: 100000, step: 100 },
  { key: "postsPerWeek", label: "Posts per customer/week", min: 1, max: 10, step: 1 },
  { key: "videoShare", label: "Video share (%)", min: 0, max: 100, step: 5 },
  { key: "workers", label: "Simulated workers", min: 1, max: 50, step: 1 },
  { key: "videoWorkerMinutes", label: "Assumed processing time per video (min)", min: 1, max: 20, step: 1 },
  { key: "peakFactor", label: "Daytime peak load (×)", min: 1, max: 5, step: 1 },
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
          <a href="/admin" className="admin385-back"><ArrowLeft size={16}/> Back to admin</a>
          <div className="admin385-kicker"><BarChart3 size={16}/> SYSTEM HEALTH / CAPACITY</div>
          <h1>Capacity simulation</h1>
          <p>Simulate a week with 100–100,000 customers, peak loads, video tasks, and different worker counts.</p>
        </header>
        <div className="admin385-safe"><ShieldCheck size={20}/><div><strong>Safe synthetic simulation</strong><p>No production jobs, customer tasks, external API calls, Supabase load or credit charges. The simulation runs entirely in browser memory, grouping tasks for high-volume scenarios.</p></div></div>
        <section className="admin385-grid">
          <div className="admin385-panel">
            <h2>Test scenario</h2>
            <p>Start with five workers and two regular tasks or one video per worker run.</p>
            {fields.map((f) => (
              <label className="admin385-field" key={f.key}>
                <span>{f.label}<strong>{nf(params[f.key])}</strong></span>
                <input type="range" min={f.min} max={f.max} step={f.step} value={params[f.key]} onChange={(e) => { setParams((s) => ({ ...s, [f.key]: Number(e.target.value) })); setResult(null); }}/>
              </label>
            ))}
            <div className="admin385-demand">Planned demand <strong>{nf(sanitized.customers * sanitized.postsPerWeek)} posts/week</strong></div>
            <button className="admin385-run" type="button" onClick={runSimulation} disabled={running}><Play size={16}/>{running ? "Calculating…" : "Run safe simulation"}</button>
          </div>
          <div className="admin385-panel">
            <h2>Results</h2>
            {!result ? <div className="admin385-placeholder">Choose a scenario and click Run safe simulation.</div> : <>
              <div className="admin385-results">
                <div><small>Planned posts</small><strong>{nf(result.requestedPosts)}</strong></div>
                <div><small>Tasks started during the week</small><strong>{nf(result.completedInWeek)}</strong></div>
                <div><small>Tasks waiting at week end</small><strong>{nf(result.waitingEndOfWeek)}</strong></div>
                <div><small>Peak queued tasks</small><strong>{nf(result.maxWaiting)}</strong></div>
                <div><small>95th percentile wait before start</small><strong>{result.p95QueueWaitMinutes == null ? "—" : `${nf(result.p95QueueWaitMinutes)} min`}</strong></div>
                <div><small>Extra time until all tasks start</small><strong>{result.simulationComplete ? `${nf(result.minutesUntilDrained)} min` : "More than a week"}</strong></div>
              </div>
              <div className="admin385-interpretation"><TriangleAlert size={20}/><p>{result.waitingEndOfWeek > 0 ? "The model predicts a queue. Try more workers or shorter task durations, but verify in staging before deploying." : "The assumed worker capacity is sufficient for this scenario. This does NOT prove that Vercel, Supabase, Kling or social APIs can handle the same load."}</p></div>
            </>}
            <div className="admin385-note"><strong>How to interpret the numbers</strong><p>This is a <b>capacity model</b> —not a real production load test with these customers. Provider quotas, database speed, timeouts, errors and real rendering times are not measured. Verified results require a separate staging load test with synthetic accounts and publishing disabled.</p></div>
          </div>
        </section>
      </main>
    </AppLayout>
  );
}

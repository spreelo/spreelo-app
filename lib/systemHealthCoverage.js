const DAY=86400000;
// Observations are sampled, not a provider SLA. Gaps over seven minutes are
// unknown, never assumed healthy. Keep a rolling 31-day bounded ledger.
export function updateHealthSampling(previous={},status,at=new Date().toISOString()) {
  const end=Date.parse(at),start=Date.parse(previous.checked_at||'');
  const rows=new Map((previous.details?.sampling?.days||[]).filter(x=>Date.parse(x.day)>=end-31*DAY).map(x=>[x.day,{...x}]));
  if(Number.isFinite(start) && start<end) {
    const known=end-start<=7*60000 && ['up','down','degraded'].includes(previous.status);
    for(let cursor=Math.max(start,end-30*DAY);cursor<end;) {
      const day=new Date(cursor).toISOString().slice(0,10),stop=Math.min(end,Date.parse(day)+DAY);
      const row=rows.get(day)||{day,up:0,down:0,unknown:0};
      const key=!known?'unknown':previous.status==='up'?'up':'down';row[key]+=stop-cursor;rows.set(day,row);cursor=stop;
    }
  }
  return {version:361,started_at:previous.details?.sampling?.started_at||at,days:[...rows.values()].sort((a,b)=>a.day.localeCompare(b.day))};
}
export function summarizeHealthSampling(sampling,at=new Date().toISOString()) {
  const end=Date.parse(at),periodStart=end-30*DAY;
  if(!sampling?.started_at)return {uptime:null,observedMs:0,unknownMs:30*DAY,coveragePercent:0};
  let up=0,down=0;
  for(const row of sampling.days||[]) {
    const day=Date.parse(row.day),overlap=Math.max(0,Math.min(end,day+DAY)-Math.max(periodStart,day));
    if(!overlap)continue;
    const fraction=overlap/Math.min(DAY,Math.max(1,end-day));
    up+=Math.max(0,Number(row.up)||0)*fraction;down+=Math.max(0,Number(row.down)||0)*fraction;
  }
  const observedMs=Math.min(30*DAY,up+down);
  return {uptime:observedMs?up/(up+down)*100:null,observedMs,unknownMs:30*DAY-observedMs,coveragePercent:observedMs/(30*DAY)*100};
}
export function formatMeasuredUptime(value) {
  if(value==null || !Number.isFinite(Number(value)))return '—';
  const n=Math.max(0,Math.min(100,Number(value)));
  return n>99.999 && n<100?'>99.999%':`${n.toFixed(3)}%`;
}

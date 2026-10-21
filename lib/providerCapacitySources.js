// v144.388: supplier-reported quota snapshots (separate from local API-attempt telemetry).
// Only sanitized numeric values are persisted; no credentials, customer identities or raw bodies.
export function parseResendUsage(data) {
  const rows = [];
  const add = (metric, label, window_kind, unit, raw, resetField = "resets_at") => {
    if (!raw || typeof raw !== "object") return;
    const used = Number(raw.used);
    const cap = raw.limit == null ? null : Number(raw.limit);
    if (!Number.isSafeInteger(used) || used < 0 || (cap !== null && (!Number.isSafeInteger(cap) || cap < 1))) return;
    rows.push({provider:"resend",metric,scope:"account",label,window_kind,unit,observed_count:used,
      limit_value:cap,source:"resend_usage_api",reset_at:raw[resetField] || null,
      instructions:"Öppna Resend Usage och uppgradera abonnemanget eller begär högre mejlkvot vid behov.",
      documentation_url:"https://resend.com/changelog/account-usage-api"});
  };
  add("emails_daily","Mejl per dygn","utc_day","mejl",data?.emails?.daily);
  add("emails_monthly","Mejl per månad","utc_month","mejl",data?.emails?.monthly);
  add("automation_runs","Automationer per period","utc_month","körningar",data?.automation_runs);
  // Other cumulative/plan-resource counters intentionally excluded: they do not reset by a known time window.
  return rows;
}

export async function collectResendUsage(admin) {
  const key = String(process.env.RESEND_API_KEY || "").trim();
  const stamp = new Date().toISOString();
  const state = async (status, message, success = false) => {
    const payload = {provider:"resend",state:status,checked_at:stamp,message:String(message||"").slice(0,180)};
    if (success) payload.last_success_at = stamp;
    const {error} = await admin.from("provider_capacity_source_status").upsert(payload,{onConflict:"provider"});
    if (error) throw error;
    return {provider:"resend",status,message};
  };
  if (!key) return state("not_configured","RESEND_API_KEY saknas");
  try {
    const res = await fetch("https://api.resend.com/usage",{
      headers:{Authorization:`Bearer ${key}`,Accept:"application/json"},
      signal:AbortSignal.timeout(9000),cache:"no-store"
    });
    if (!res.ok) return state(res.status===401||res.status===403?"permission_required":"unavailable",
       res.status===401||res.status===403?"Resend Usage kräver API-nyckel med full access.":`Resend Usage HTTP ${res.status}`);
    const payload = await res.json();
    const rows = parseResendUsage(payload);
    if (!rows.length) return state("unavailable","Resend returnerade inga giltiga mejlkvoter.");
    for (const row of rows) {
      const {error} = await admin.from("provider_capacity_reported_snapshots")
        .upsert({...row,checked_at:stamp},{onConflict:"provider,metric,scope"});
      if (error) throw error;
    }
    return state("connected",`${rows.length} officiella Resend-kvoter avlästa.`,true);
  } catch (error) {return state("unavailable",String(error?.message||error).slice(0,180));}
}

export function parseOpenAiRateHeaders(headers,{model,operation} = {}) {
  if (!headers || !model || !/^[a-z0-9._-]{1,80}$/i.test(model)) return [];
  const mappings=[["requests","x-ratelimit-limit-requests","x-ratelimit-remaining-requests","RPM (requests)"],
                  ["tokens","x-ratelimit-limit-tokens","x-ratelimit-remaining-tokens","TPM (tokens)"]];
  const rows=[];
  for(const [kind,capName,remainName,label] of mappings){
    const cap=Number(headers.get(capName)),remain=Number(headers.get(remainName));
    if(!Number.isSafeInteger(cap)||cap<=0||!Number.isSafeInteger(remain)||remain<0||remain>cap)continue;
    rows.push({provider:"openai",metric:kind,scope:model,label:`${label} · ${model}`,
      window_kind:"minute",unit:kind==="tokens"?"tokens":"anrop",
      observed_count:cap-remain,limit_value:cap,checked_at:new Date().toISOString(),
      source:"openai_response_headers",instructions:"Kontrollera OpenAI Limits för modellen/projektet och begär nivåhöjning vid behov.",
      documentation_url:"https://platform.openai.com/docs/guides/rate-limits",reset_at:null});
  }
  return rows;
}

export async function recordOpenAiRateHeaders(headers,{model,operation} = {}) {
  const rows=parseOpenAiRateHeaders(headers,{model,operation});
  if(!rows.length)return;
  try {
    const {createClient}=await import("@supabase/supabase-js");
    if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)return;
    const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{
      auth:{persistSession:false,autoRefreshToken:false}});
    for(const row of rows){
      const {error}=await admin.from("provider_capacity_reported_snapshots")
        .upsert(row,{onConflict:"provider,metric,scope"});
      if(error)throw error;
    }
    await admin.from("provider_capacity_source_status").upsert({
      provider:"openai",state:"connected",checked_at:new Date().toISOString(),
      last_success_at:new Date().toISOString(),message:"Rate headers lästa från autentiskt API-anrop."
    },{onConflict:"provider"});
  }catch(error){console.warn("OpenAI quota header telemetry failed",{message:String(error?.message||error)});}
}

export async function notifyOfficialSupplierQuotas(admin) {
  const {data:rows,error}=await admin.from("provider_capacity_reported_snapshots")
    .select("provider,metric,label,unit,observed_count,limit_value,checked_at,reset_at,instructions,documentation_url,source")
    .eq("source","resend_usage_api");
  if(error){
    if(/provider_capacity_reported_snapshots|schema cache|does not exist/i.test(String(error.message)))return {skipped:"migration_missing"};
    throw error;
  }
  const key=process.env.RESEND_API_KEY;
  const {getConfiguredAdminEmails}=await import("./adminAuth.js");
  const recipients=getConfiguredAdminEmails();
  if(!key||!recipients.length)return {skipped:"email_not_configured"};
  let sent=0;
  for(const row of rows||[]) {
    const checked=Date.parse(row.checked_at||"");
    if(!Number.isFinite(checked)||Date.now()-checked>45*60_000)continue;
    const used=Number(row.observed_count),limit=Number(row.limit_value);
    if(!Number.isFinite(used)||!Number.isFinite(limit)||limit<=0)continue;
    const level=[100,95,85,70].find(t=>used/limit>=t/100);
    if(!level)continue;
    const period=String(row.reset_at||"").slice(0,20);
    // Only quotas with an explicit reset date are alertable; a missing reset risks repeat alarms.
    if(!period)continue;
    const {data:id,error:claimError}=await admin.rpc("claim_provider_capacity_alert",{
      p_provider:row.provider,p_metric:row.metric,p_period_key:"official:"+period,
      p_threshold:level,p_value:used,p_limit:limit
    });
    if(claimError)throw claimError;
    if(!id)continue;
    let status="failed",last_error=null;
    try{
      const res=await fetch("https://api.resend.com/emails",{
        method:"POST",signal:AbortSignal.timeout(10000),
        headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},
        body:JSON.stringify({from:process.env.RESEND_FROM_EMAIL||"Spreelo <noreply@spreelo.com>",
          to:recipients,subject:`[Spreelo] Resend · ${row.label} ${level}%`,
          text:[`Officiell leverantörskvot: ${row.label}`,
            `Användning: ${used} / ${limit} ${row.unit}`,`Återställning: ${period}`,
            `Åtgärd: ${row.instructions}`,row.documentation_url,
            "https://app.spreelo.com/admin/provider-capacity"].filter(Boolean).join("\n")})
      });
      if(res.ok){status="sent";sent++;}
      else last_error=`Resend HTTP ${res.status}`;
    }catch(e){last_error=String(e?.message||e).slice(0,180);}
    await admin.from("provider_capacity_alerts")
      .update({status,last_error,sent_at:status==="sent"?new Date().toISOString():null}).eq("id",id);
  }
  return {sent};
}

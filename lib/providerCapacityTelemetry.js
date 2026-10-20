import { createClient } from "@supabase/supabase-js";

// Best-effort observability only. No provider call must fail because telemetry fails.
// This counts observed request attempts, not provider-billed usage or actual concurrency.
let client;
export async function recordProviderAttempt(provider, metric) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    client ||= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await client.rpc("record_provider_capacity_attempt", {
      p_provider: provider, p_metric: metric, p_quantity: 1,
    });
    if (error && !/function.*does not exist|schema cache|could not find/i.test(String(error.message || ""))) {
      console.warn("Provider capacity telemetry unavailable", { provider, metric, message: error.message });
    }
  } catch (error) {
    console.warn("Provider capacity telemetry exception", { provider, metric, message: String(error?.message || error) });
  }
}

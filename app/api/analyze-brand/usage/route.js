import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function authClient(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authorization = request.headers.get("authorization") || "";
  if (!url || !key || !authorization.startsWith("Bearer ")) return null;
  return createClient(url, key, { global: { headers: { Authorization: authorization } } });
}

export async function GET(request) {
  try {
    const supabase = authClient(request);
    if (!supabase) return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    const timezone = String(new URL(request.url).searchParams.get("timezone") || "UTC").trim() || "UTC";
    const { data, error } = await supabase.rpc("get_spreelo_brand_analysis_usage", { p_timezone: timezone });
    if (error) throw error;
    return Response.json({ ok: true, usage: data || null });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not load analysis usage." }, { status: 500 });
  }
}

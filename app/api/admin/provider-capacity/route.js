import { adminContextError, getAdminContext } from "../../../../lib/adminAuth.js";
import { loadProviderCapacity } from "../../../../lib/providerCapacityMonitor.js";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);
  try {
    const rows = await loadProviderCapacity(context.admin);
    return Response.json({ ok: true, rows, updatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error), migrationRequired: true }, { status: 503 });
  }
}

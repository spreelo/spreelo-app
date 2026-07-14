import { GET as runSharedAutomationQueue } from "../run-automations/route";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request) {
  const workerName = "worker-2";
  const target = new URL("/api/cron/run-automations", request.url);
  target.searchParams.set("workerCount", "5");
  target.searchParams.set("workerName", workerName);

  const workerRequest = new Request(target, {
    method: "GET",
    headers: {
      authorization: request.headers.get("authorization") || "",
      "user-agent": `spreelo-smart-queue-${workerName}/2`,
    },
  });

  console.info("Smart queue worker started", { workerName });

  const response = await runSharedAutomationQueue(workerRequest);
  const payload = await response
    .clone()
    .json()
    .catch(() => null);

  console.info("Smart queue worker finished", {
    workerName,
    status: response.status,
    ok: payload?.ok ?? response.ok,
    fetchedRules: payload?.fetched_rules ?? null,
    claimedRules: payload?.claimed_rules ?? null,
    generated: payload?.summary?.generated ?? null,
    published: payload?.summary?.social_published ?? null,
    errors: payload?.summary?.errors ?? null,
    error: payload?.error ?? null,
  });

  return response;
}

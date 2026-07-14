export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request) {
  const target = new URL("/api/cron/run-automations", request.url);
  target.searchParams.set("workerCount", "5");
  target.searchParams.set("workerName", "worker-5");

  return fetch(target, {
    method: "GET",
    headers: {
      authorization: request.headers.get("authorization") || "",
      "user-agent": "spreelo-smart-queue-worker/5",
    },
    cache: "no-store",
  });
}

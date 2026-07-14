export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request) {
  const target = new URL("/api/cron/run-automations", request.url);
  target.searchParams.set("lane", "4");
  target.searchParams.set("laneCount", "5");
  target.searchParams.set("laneName", "lane-5");

  return fetch(target, {
    method: "GET",
    headers: {
      authorization: request.headers.get("authorization") || "",
      "user-agent": "spreelo-smart-queue-lane/5",
    },
    cache: "no-store",
  });
}

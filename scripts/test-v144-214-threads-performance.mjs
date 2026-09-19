import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PERFORMANCE_SUPPORTED_PLATFORMS,
  collectProviderMetrics,
  extractPostPerformanceTargets,
  fetchThreadsPostMetrics,
} from "../lib/postPerformance.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

assert.equal(PERFORMANCE_SUPPORTED_PLATFORMS.includes("threads"), true);

const targets = extractPostPerformanceTargets({
  published_targets: ["threads", "facebook"],
  publish_receipts: {
    threads: { thread_id: "th-214" },
    facebook: { post_id: "fb-214" },
  },
});
assert.deepEqual(targets.map((target) => target.platform), ["threads", "facebook"]);
assert.deepEqual(targets[0].externalIds, ["th-214"]);

await assert.rejects(
  () => fetchThreadsPostMetrics({
    accessToken: "token",
    externalIds: ["th-214"],
    connection: { permissions: ["threads_basic", "threads_content_publish"] },
  }),
  (error) => error?.scopeMissing === true && /threads_manage_insights/.test(error.message)
);

const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.hostname, "graph.threads.net");
    assert.equal(parsed.pathname, "/v1.0/th-214/insights");
    assert.match(parsed.searchParams.get("metric") || "", /likes/);
    return new Response(JSON.stringify({
      data: [
        { name: "views", values: [{ value: 1200 }] },
        { name: "likes", values: [{ value: 80 }] },
        { name: "replies", values: [{ value: 12 }] },
        { name: "reposts", values: [{ value: 7 }] },
        { name: "quotes", values: [{ value: 3 }] },
        { name: "shares", values: [{ value: 15 }] },
      ],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const result = await collectProviderMetrics({
    platform: "threads",
    accessToken: "token",
    externalIds: ["th-214"],
    connection: { permissions: ["threads_basic", "threads_content_publish", "threads_manage_insights"] },
  });
  assert.equal(result.metrics.views, 1200);
  assert.equal(result.metrics.likes, 80);
  assert.equal(result.metrics.comments, 12);
  assert.equal(result.metrics.shares, 15);
  assert.equal(result.metrics.engagements, 107);
  assert.equal(result.raw.provider_breakdown.reposts, 7);
  assert.equal(result.raw.provider_breakdown.quotes, 3);
} finally {
  globalThis.fetch = originalFetch;
}

const performance = read("lib/postPerformance.js");
const threadsOAuth = read("lib/threadsOAuth.js");
const publishCron = read("app/api/cron/run-automations/route.js");
assert.match(performance, /threads_manage_insights/);
assert.match(performance, /graph\.threads\.net\/v1\.0/);
assert.match(performance, /PERFORMANCE_PROVIDER_REGISTRY/);
assert.match(threadsOAuth, /threads_manage_insights/);
assert.match(publishCron, /thread_id: String\(threadsResult\.id\)/);

console.log("v144.214 Threads Grow Brain performance checks passed.");

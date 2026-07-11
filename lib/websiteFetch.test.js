import test from "node:test";
import assert from "node:assert/strict";
import {
  WEBSITE_FETCH_MAX_ATTEMPTS,
  WEBSITE_FETCH_TIMEOUT_MS,
  WEBSITE_FETCH_TOTAL_TIMEOUT_MS,
  buildWebsiteFetchAttemptPlan,
  fetchWebsiteHtmlRobust,
} from "./websiteFetch.js";

test("homepage fetch plan tries browser first, toggles www, then crawler", () => {
  const plan = buildWebsiteFetchAttemptPlan("https://next.se/sv", 4);

  assert.deepEqual(
    plan.map(({ url, profile }) => ({ url, profile })),
    [
      { url: "https://next.se/sv", profile: "browser" },
      { url: "https://www.next.se/sv", profile: "browser" },
      { url: "https://next.se/sv", profile: "crawler" },
      { url: "https://www.next.se/sv", profile: "crawler" },
    ]
  );
});

test("www input is also retried without www", () => {
  const plan = buildWebsiteFetchAttemptPlan("https://www.next.se/sv", 2);
  assert.equal(plan.length, 2);
  assert.equal(plan[0].url, "https://www.next.se/sv");
  assert.equal(plan[1].url, "https://next.se/sv");
});

test("homepage limits are bounded", () => {
  assert.equal(WEBSITE_FETCH_TIMEOUT_MS, 20000);
  assert.equal(WEBSITE_FETCH_TOTAL_TIMEOUT_MS, 45000);
  assert.equal(WEBSITE_FETCH_MAX_ATTEMPTS, 4);
});

test("missing URL fails before any network request", async () => {
  await assert.rejects(fetchWebsiteHtmlRobust(""), /Website URL is required/u);
});

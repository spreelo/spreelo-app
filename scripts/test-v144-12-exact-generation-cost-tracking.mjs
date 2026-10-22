import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${message}`);
  }
};

const tracker = read("lib/generationCostTracking.js");
const sql = read("supabase/v144_12_exact_generation_cost_tracking.sql");
const runtime = read("app/api/cron/run-automations/route.js");
const kling = read("app/api/cron/finalize-kling-videos/route.js");
const shotstack = read("lib/shotstack.js");
const adminApi = read("app/api/admin/post-approvals/route.js");
const adminUi = read("app/admin/post-approvals/page.jsx");
const manualGenerate = read("app/api/generate-post/route.js");
const manualCreate = read("app/create/page.jsx");
const manualBind = read("app/api/generation-cost/bind/route.js");
const adminRegen = [
  "app/api/admin/post-approvals/regenerate/route.js",
  "app/api/admin/post-approvals/regenerate-any/route.js",
  "app/api/admin/post-approvals/regenerate-product/route.js",
  "app/api/admin/post-approvals/resolve-product/route.js",
].map(read).join("\n");

assert(sql.includes("create table if not exists public.post_generation_cost_events"), "durable per-request cost ledger exists");
assert(sql.includes("create table if not exists public.post_generation_cost_summaries"), "admin-only per-post cost summary table exists");
assert(sql.includes("generation_session_id uuid") && sql.includes("generation_user_id uuid"), "manual create can meter before a posts row exists without changing posts schema");
assert(!/alter table public\.posts[\s\S]*generation_cost_/i.test(sql), "cost migration does not add internal COGS columns to customer-facing posts");
assert(!/exchange[_ -]?rate|usd.?sek|sek.?usd/i.test(tracker + sql + adminUi), "cost tracking contains no FX conversion or SEK exchange-rate logic");
assert(tracker.includes('const USD = "USD"'), "current provider billing currency is stored natively as USD where applicable");

assert(tracker.includes('"gpt-4.1-mini": { input: 0.4, cachedInput: 0.1, output: 1.6 }'), "GPT-4.1 mini token rates are pinned");
assert(tracker.includes('"gpt-5.5": { input: 5, cachedInput: 0.5, output: 30'), "GPT-5.5 token rates are pinned");
assert(tracker.includes('"gpt-image-2": { textInput: 2.5, cachedTextInput: 0.625, imageInput: 4, cachedImageInput: 1, imageOutput: 15 }'), "GPT-Image-2 text/image/cache/output rates are pinned to current API pricing");
assert(tracker.includes("OPENAI_WEB_SEARCH_USD_PER_CALL = 0.01"), "OpenAI web-search tool executions are included");
assert(tracker.includes('countResponseToolCalls(response, "web_search_call")'), "web-search cost uses actual response tool-call count");
assert(tracker.includes("GPT_4_1_MINI_WEB_SEARCH_CONTENT_TOKENS_PER_CALL = 8_000"), "GPT-4.1 mini web search includes the provider-billed fixed 8k search-content token block");
assert(tracker.includes("input_tokens_details?.cached_tokens") || tracker.includes("usage?.input_tokens_details?.cached_tokens"), "cached OpenAI text tokens use actual response usage");
assert(tracker.includes("cached_tokens_details"), "GPT-Image cache split is used when the provider reports it");
assert(tracker.includes("refused to guess the monetary amount"), "ambiguous provider billing is marked partial instead of guessed");

assert(/wrapOpenAIForCostTracking\(\s*rawOpenai,/s.test(runtime), "automatic post generation wraps existing OpenAI calls without adding a model call");
assert(runtime.includes("createGenerationCostTracker({"), "automatic generation creates a per-occurrence tracker");
assert(runtime.includes("activeGenerationCostTracker?.bindPost(post.id)"), "pre-insert usage is bound to the final post");
assert(runtime.includes("costTracker: activeGenerationCostTracker"), "automatic Shotstack render receives the same post cost tracker");

assert(shotstack.includes("billableSeconds: Number(result?.billable ?? result?.duration ?? 0)"), "Shotstack uses provider-returned billable seconds");
assert(tracker.includes("credits = seconds / 60"), "Shotstack billable seconds are converted to exact provider credits");

assert(kling.includes("await costTracker.recordKling({"), "successful existing Kling task records its cost");
assert(kling.includes("billingAt: post.kling_submitted_at"), "Kling resource-pack price is tied to task submission time");
assert(!kling.includes("createKlingImageToVideoTask("), "Kling finalizer still cannot create a second paid generation");

assert(adminApi.includes("post_generation_cost_summaries") && adminApi.includes("generation_cost_amount") && adminApi.includes("generation_cost_breakdown"), "admin approvals API merges admin-only generation cost fields");
assert(adminUi.includes('t("admin.approvals.generationCost")'), "admin review list/detail displays a generation cost column");
assert(adminUi.includes("generation_cost_breakdown?.totals"), "admin supports totals in original provider currencies without FX");
assert(adminRegen.match(/wrapOpenAIForCostTracking/g)?.length >= 4, "admin regeneration/repair OpenAI calls are tracked too");
assert(adminRegen.includes("costTracker,"), "admin animated-product regeneration forwards Shotstack cost tracking");

assert(manualGenerate.includes("wrapOpenAIForCostTracking(rawOpenai"), "manual /create GPT-5.5 generation uses the same non-invasive cost wrapper");
assert(manualGenerate.includes("generation_cost_session_id"), "manual generation returns only an opaque cost-session id to the client");
assert(manualCreate.includes('fetch("/api/generation-cost/bind"'), "manual draft save attaches the already-recorded generation cost after save");
assert(manualCreate.includes("globalThis.crypto?.randomUUID?.()"), "manual save keeps the old insert flow and uses a client UUID instead of adding a post-select dependency");
assert(!manualBind.includes("openai") && !manualBind.includes("kling") && !manualBind.includes("shotstack"), "manual cost binding cannot create an extra paid provider call");
assert(manualBind.includes('.eq("user_id", user.id)') && manualBind.includes("attachGenerationSessionCostsToPost"), "manual cost binding verifies post ownership before service-role attachment");
assert(tracker.includes("attachGenerationSessionCostsToPost"), "manual generation sessions can be bound to saved posts in the admin-only ledger");

assert(/generation cost tracking failed without affecting generation/i.test(tracker) || runtime.includes("cost tracking failed without affecting"), "cost metering failures are non-fatal to generation");
assert(tracker.includes('"responses.retrieve"'), "final background Responses retrieval is tracked");
assert(tracker.includes('operation: "responses.background"'), "background create/retrieve share one canonical ledger operation");
assert(!tracker.includes("ignoreDuplicates: true"), "final provider usage can update an earlier partial ledger row");
assert(tracker.includes("missing_expected_events"), "cost summary records missing expected provider events instead of incorrectly marking them exact");
assert(runtime.includes("ensureOpenAIResponseCostTracked"), "critical image generators explicitly retry cost recording without extra provider calls");

if (process.exitCode) process.exit(process.exitCode);
console.log("v144.12 exact generation cost tracking static checks passed.");

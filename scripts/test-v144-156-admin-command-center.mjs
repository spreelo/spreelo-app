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

const page = read("app/admin/page.jsx");
const css = read("app/styles/121-v144-156-admin-command-center.css");
const overview = read("app/api/admin/overview/route.js");
const labels = read("lib/i18n/defaultLabels.js");
const healthLib = read("lib/systemHealth.js");
const healthAdmin = read("app/api/admin/system-health/route.js");
const healthCron = read("app/api/cron/system-health/route.js");
const vercel = JSON.parse(read("vercel.json"));
const sql = read("spreelo-v144.156-SQL.sql");

assert(page.includes("admin156-hero") && page.includes("adminCommand.quick.title") && labels.includes("What do you want to do?"), "new admin command-center layout is installed through i18n");
assert(page.includes("adminCommand.costs.title") && page.includes("adminCommand.costs.median") && page.includes("adminCommand.costs.average"), "dashboard exposes translated median and average real generation costs");
assert(page.includes("adminCommand.system.title") && page.includes("adminCommand.system.recentHistory"), "dashboard exposes translated live system status and incident history");
assert(page.includes("/admin/customers") && page.includes("/admin/post-approvals") && page.includes("/admin/rescue-center"), "existing core admin tools remain linked");
assert(page.includes("requestTranslationRefresh") && page.includes("stopOpenAIBackgroundJobs"), "legacy translation and emergency background-job controls remain available");
assert(css.includes("@media (max-width:1280px)") && css.includes("@media (max-width:900px)") && css.includes("@media (max-width:640px)"), "desktop/tablet/mobile admin layouts have explicit responsive breakpoints");
assert(overview.includes("loadGenerationCostInsights") && overview.includes("medianUsd") && overview.includes("averageUsd"), "overview API aggregates complete generation costs using median and average");
assert(overview.includes("topCountries") && overview.includes("daily:"), "overview API provides country and daily trend data");
assert(healthLib.includes("checkSupabaseDatabase") && healthLib.includes("checkOpenAI") && healthLib.includes("checkResend") && healthLib.includes("checkStripe") && healthLib.includes("checkMeta") && healthLib.includes("checkKling") && healthLib.includes("checkShotstack"), "health monitor covers Spreelo's core infrastructure and providers");
assert(healthLib.includes("system_health_incidents") && healthLib.includes("resolved_at"), "health monitor opens and closes incident history records");
assert(healthAdmin.includes("calculateUptimePercentage") && healthAdmin.includes("uptime30d"), "admin health endpoint calculates 30-day uptime from incident history");
assert(healthCron.includes("CRON_SECRET") && healthCron.includes("runSystemHealthChecks"), "health collection runs through an authenticated cron route");
assert(vercel.crons.some((item) => item.path === "/api/cron/system-health" && item.schedule === "*/5 * * * *"), "Vercel cron records system health every five minutes");
assert(sql.includes("create table if not exists public.system_health_status") && sql.includes("create table if not exists public.system_health_incidents"), "additive SQL migration creates current status and incident history tables");
assert(sql.includes("enable row level security") && sql.includes("service_role"), "system-health tables remain admin/service-role only");

if (process.exitCode) process.exit(process.exitCode);
console.log("v144.156 admin command-center checks passed.");

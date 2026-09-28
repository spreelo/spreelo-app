import fs from "node:fs";

function read(path) { return fs.readFileSync(path, "utf8"); }
function expect(ok, message) { if (!ok) throw new Error(message); }

const freeTrial = read("lib/freeTrial.js");
const sql = read("supabase/v144_263_credit_balance_self_heal.sql");
const meta = read("app/api/meta/page-selection/route.js");
const instagram = read("app/api/auth/instagram/callback/route.js");
const tiktok = read("app/api/auth/tiktok/callback/route.js");

expect(freeTrial.includes("export async function ensureStandardSpreeloCreditBalance"), "Missing shared balance initializer");
expect((freeTrial.match(/await ensureStandardSpreeloCreditBalance\(supabaseAdmin, userId\)/g) || []).length >= 3, "Balance initializer is not used by preflight, authorization and refresh");
expect(freeTrial.includes('free_trial_status: "locked"'), "New Free balance is not locked pending social verification");
expect(freeTrial.includes("SPREELO_FREE_TRIAL_CREDITS"), "Standard 100-credit offer is not preserved");
expect(freeTrial.includes('String(createError.code || "") === "23505"'), "Concurrent balance initialization is not race-safe");

expect(sql.includes("ensure_spreelo_credit_balance_for_user"), "SQL self-heal helper missing");
expect(sql.includes("from auth.users u"), "Existing auth users are not backfilled");
expect(sql.includes("after insert on auth.users"), "Future signup trigger missing");
expect(sql.includes("on conflict (user_id) do nothing"), "SQL initialization is not conflict-safe");
expect(!sql.includes("update public.user_credit_balances set"), "Migration must not overwrite existing balances");

expect(meta.includes("preflightSocialConnectionForTrial"), "Facebook no longer uses trial preflight");
expect(instagram.includes("preflightSocialConnectionForTrial"), "Instagram no longer uses trial preflight");
expect(tiktok.includes("preflightSocialConnectionForTrial"), "TikTok no longer uses trial preflight");

console.log("v144.263 credit balance self-heal regression checks passed");

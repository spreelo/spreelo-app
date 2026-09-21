import fs from "node:fs";
import assert from "node:assert/strict";

const migration = fs.readFileSync("supabase/v144_244_free_social_account_entitlement_fix.sql", "utf8");
const route = fs.readFileSync("app/api/meta/page-selection/route.js", "utf8");
const picker = fs.readFileSync("app/social-channels/facebook/select/page.jsx", "utf8");
const labels = fs.readFileSync("lib/i18n/defaultLabels.js", "utf8");
const entitlements = fs.readFileSync("lib/planEntitlements.js", "utf8");

assert.match(migration, /elsif p_resource = 'social_accounts'[\s\S]*?else 1/);
assert.match(migration, /when 'growth' then 5/);
assert.match(migration, /when 'pro' then 2147483647/);
assert.match(entitlements, /free:\s*Object\.freeze\([\s\S]*?socialAccounts:\s*1/);
assert.match(route, /parsePlanLimitDatabaseError/);
assert.match(route, /code:\s*"plan_limit_reached"/);
assert.match(route, /status:\s*409/);
assert.match(picker, /social\.socialAccountPlanLimit/);
assert.match(labels, /"social\.socialAccountPlanLimit"/);

console.log("v144.244 Free social entitlement regression checks passed (9/9)");

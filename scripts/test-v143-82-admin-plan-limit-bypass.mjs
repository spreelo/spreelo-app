import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const adminAuth = read("lib/adminAuth.js");
const appLayout = read("components/AppLayout.jsx");
const sql = read("spreelo-v143.82-SQL.sql");
const meta = read("app/api/meta/connect/route.js");
const instagram = read("app/api/auth/instagram/start/route.js");
const pinterest = read("app/api/auth/pinterest/start/route.js");
const video = read("app/api/video-backgrounds/route.js");

assert(adminAuth.includes("SPREELO_ADMIN_EMAILS"), "Additional Vercel admin emails are not supported");
assert(adminAuth.includes("SPREELO_PRIMARY_ADMIN_EMAIL"), "Primary admin email support missing");
assert(adminAuth.includes("spreelo_admin"), "Admin status is not synchronized to protected app metadata");
assert(adminAuth.includes("updateUserById"), "Admin metadata synchronization is missing");
assert(appLayout.includes("!hasAdminBypass && brandProfiles.length >= entitlements.brands"), "Admin brand UI bypass missing");
assert(appLayout.includes("!isAdmin && brandProfiles.length >= entitlements.brands"), "Admin brand create bypass missing");
assert(sql.includes("spreelo_is_plan_limit_admin"), "Database admin bypass helper missing");
assert((sql.match(/if public\.spreelo_is_plan_limit_admin\(new\.user_id\) then/g) || []).length === 3, "All three DB capacity triggers must bypass admins");
for (const [name, source] of [["Meta", meta], ["Instagram", instagram], ["Pinterest", pinterest]]) {
  assert(source.includes("isConfiguredAdminEmail") || source.includes("hasAdminPlanLimitBypass"), `${name} server-side social limit bypass missing`);
}
assert(video.includes("../../../lib/adminAuth"), "Video backgrounds must use shared multi-admin auth");
console.log("v143.82 admin plan-limit bypass regression checks passed");

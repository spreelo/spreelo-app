import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(`v144.245 failed: ${message}`);
};

const automation = read("app/automation/page.jsx");
const layout = read("components/AppLayout.jsx");

assert(
  automation.includes('const [isSpreeloAdmin, setIsSpreeloAdmin] = useState(false);'),
  "automation must track real Spreelo admin access"
);
assert(
  automation.includes('fetch("/api/admin/me"'),
  "automation must verify admin access through the existing admin endpoint"
);
assert(
  automation.includes('setIsSpreeloAdmin(Boolean(response.ok && payload?.isAdmin));'),
  "admin result must come from the verified admin response"
);
assert(
  automation.includes('const canManuallyEditCampaignPlan =\n    isSpreeloAdmin ||'),
  "all verified admins must receive the existing manual scheduling bypass"
);
assert(
  automation.includes('String(currentUserEmail || "").trim().toLowerCase() === SPREELO_INTERNAL_TESTER_EMAIL'),
  "the original primary tester fallback must remain intact"
);
assert(
  automation.includes('const minimumSelectablePlanningDate = canManuallyEditCampaignPlan\n    ? null'),
  "admin past-date selection must still use the established bypass"
);

assert(
  layout.includes('const refreshedCreditsAfterSocialConnectRef = useRef(false);'),
  "sidebar must have a one-shot credit refresh guard after social connection"
);
assert(
  layout.includes('connectedChannelCount < 1 ||\n      !isLockedFreeTrial()'),
  "credit refresh must only run when a social channel exists but the trial still looks locked"
);
assert(
  layout.includes('void loadCreditBalance(user);'),
  "sidebar must refresh the authoritative credit/trial balance after social connection"
);
assert(
  layout.includes('!(isLockedFreeTrial() && Number(connectedChannelCount || 0) > 0)'),
  "unlock prompt must not remain visible once a social channel is connected"
);

console.log("v144.245 admin scheduling + free-trial sidebar checks passed (10/10)");

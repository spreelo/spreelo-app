import fs from "node:fs";

const page = fs.readFileSync("app/shopify/onboarding/page.jsx", "utf8");
const labels = fs.readFileSync("lib/i18n/defaultLabels.js", "utf8");
const checks = [
  ["daily limit reason", page.includes('reason === "daily_limit"')],
  ["monthly limit reason", page.includes('reason === "monthly_limit"')],
  ["cooldown reason", page.includes('reason === "cooldown"')],
  ["daily count", page.includes('dailyCount') && page.includes('dailyLimit')],
  ["monthly count", page.includes('monthlyCount') && page.includes('monthlyLimit')],
  ["reset timestamps", page.includes('dailyResetAt') && page.includes('monthlyResetAt') && page.includes('retryAt')],
  ["store remains connected note", labels.includes('shopifyOnboarding.analysisError.connectedSafe')],
  ["daily localized copy", labels.includes('shopifyOnboarding.analysisError.dailyText')],
  ["monthly localized copy", labels.includes('shopifyOnboarding.analysisError.monthlyText')],
  ["plan metadata", labels.includes('shopifyOnboarding.analysisError.planMeta')],
];
let passed = 0;
for (const [name, ok] of checks) { if (!ok) throw new Error(`FAILED: ${name}`); passed += 1; }
console.log(`v144.241 Shopify analysis-limit copy checks passed (${passed}/${checks.length}).`);

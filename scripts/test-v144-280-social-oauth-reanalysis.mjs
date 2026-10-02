import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(`v144.280 failed: ${message}`); };

const bootstrap = read("app/api/auth/oauth-bootstrap/route.js");
assert(bootstrap.includes("response.cookies.set(cookieName, state"), "bootstrap must set OAuth state as first-party cookie");
assert(bootstrap.includes('sameSite: "lax"'), "bootstrap cookie must retain SameSite=Lax");
assert(bootstrap.includes("isAllowedTarget"), "bootstrap must validate provider redirect target");

const routes = [
  ["app/api/meta/connect/route.js", "facebook"],
  ["app/api/auth/instagram/start/route.js", "instagram"],
  ["app/api/auth/threads/start/route.js", "threads"],
  ["app/api/auth/tiktok/start/route.js", "tiktok"],
  ["app/api/auth/youtube/start/route.js", "youtube"],
  ["app/api/auth/pinterest/start/route.js", "pinterest"],
];
for (const [path, provider] of routes) {
  const src = read(path);
  assert(src.includes("buildFirstPartyOAuthBootstrapUrl"), `${provider} must use first-party OAuth bootstrap`);
  assert(src.includes(`provider: "${provider}"`), `${provider} bootstrap provider must be explicit`);
  assert(src.includes("url: bootstrapUrl"), `${provider} POST must return bootstrap URL to popup`);
}

const brand = read("app/brand/page.jsx");
assert(brand.includes('className="brand-v144280-hero-actions"'), "read-only brand hero must expose action group");
assert(brand.includes("onClick={analyzeBrand}"), "reanalyze button must reuse existing analyzeBrand flow");
assert(brand.includes('t("brand.analysisRetry")'), "reanalyze button must use existing translated label");

const css = read("app/styles/104-v144-118-brand-profile-reference-rebuild.css");
assert(css.includes("v144.280 — restore reanalysis action and align placement preview"), "v144.280 UI patch must be present");
assert(css.includes(".brand-v144118-preview {\n  margin-top: 0 !important;"), "placement preview must align at top");

console.log("v144.280 social OAuth + reanalysis checks passed (16/16).");

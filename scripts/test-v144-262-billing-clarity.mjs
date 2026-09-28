import fs from "node:fs";

function read(path) { return fs.readFileSync(path, "utf8"); }
function expect(ok, message) { if (!ok) throw new Error(message); }

const appLayout = read("components/AppLayout.jsx");
const settings = read("app/settings/page.jsx");
const billing = read("components/StripeBillingPanel.jsx");
const labels = read("lib/i18n/defaultLabels.js");
const globals = read("app/globals.css");
const css = read("app/styles/158-v144-262-billing-clarity-currency-loader.css");

expect(appLayout.includes('id: "billing"'), "Missing dedicated billing sidebar item");
expect(appLayout.includes('href: "/settings?tab=billing"'), "Billing sidebar href missing");
expect(settings.includes('active={activeTab === "billing" ? "billing" : "settings"}'), "Billing sidebar active state missing");
expect(labels.includes('"layout.nav.billing": "Plan & billing"'), "Billing nav label missing");
expect(billing.includes('const pricingReady = !loading'), "Currency-ready gate missing");
expect(billing.includes('className="stripe-pricing-loading"'), "Billing loader missing");
expect(billing.includes('{!pricingReady ? ('), "Price UI is not gated by currency readiness");
expect(globals.includes('158-v144-262-billing-clarity-currency-loader.css'), "v144.262 CSS is not imported");
expect(css.includes('margin-bottom:18px'), "Free-credit banner spacing missing");
expect(css.includes('font-size:13.5px'), "Free-credit banner readable body text missing");

console.log("v144.262 billing clarity regression checks passed");

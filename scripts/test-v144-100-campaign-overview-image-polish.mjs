import fs from "node:fs";

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const page = fs.readFileSync(new URL("../app/automation/page.jsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../app/styles/96-v144-100-campaign-overview-image-polish.css", import.meta.url), "utf8");
const globals = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

expect(page.includes('className="sp100-campaign-image-overlay"'), "campaign image must show a campaign-name overlay");
expect(page.includes('<strong>{campaignOpportunity.title}</strong>'), "image overlay must use the active campaign name dynamically");
expect(!page.includes('<dt><Repeat2 size={15} aria-hidden="true" />{String(locale || "").startsWith("sv") ? "Frekvens"'), "redundant frequency fact card must be removed");
expect(!page.includes('<dt><PenLine size={15} aria-hidden="true" />{String(locale || "").startsWith("sv") ? "Du kan ändra"'), "redundant editable fact card must be removed");
expect(page.includes('t("automation.campaignOverview.totalPlannedPosts")'), "planned-post count fact must remain through i18n");
expect(page.includes('t("automation.campaignOverview.period")'), "campaign period fact must remain through i18n");
expect(css.includes('aspect-ratio: 16 / 10'), "campaign image must have a controlled desktop/tablet aspect ratio");
expect(css.includes('content: none !important'), "old image pseudo-frame must be disabled");
expect(css.includes('@media (max-width: 900px)'), "image layout must adapt before mobile widths");
expect(css.includes('@media (max-width: 520px)'), "image layout must include a small-mobile safeguard");
expect(globals.includes('96-v144-100-campaign-overview-image-polish.css'), "v144.100 stylesheet must load last");

console.log("v144.100 campaign overview image polish checks passed");

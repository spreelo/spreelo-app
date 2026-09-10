import fs from "node:fs";

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const page = fs.readFileSync(new URL("../app/automation/page.jsx", import.meta.url), "utf8");
const globals = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../app/styles/94-v144-98-campaign-overview-responsive.css", import.meta.url), "utf8");

expect(page.includes('className="sp98-campaign-overview"'), "campaign overview card must render in the unified planner");
expect(page.includes('getCampaignOverviewSummary(campaignOpportunity, locale, t)'), "campaign overview must explain the campaign automatically");
expect(page.includes('getCampaignOverviewImageSrc(campaignOpportunity)'), "campaign overview must render the campaign visual");
expect(page.includes('getCampaignOverviewTimelineMarkers(campaignOpportunity, slots)'), "campaign overview must render the campaign timeline markers");
expect(page.includes('t("automation.campaignOverview.aiSelected")'), "campaign overview must explain what AI selected");
expect(page.includes('t("automation.campaignOverview.editable")'), "campaign overview must explain what the customer can change");
expect(globals.includes('94-v144-98-campaign-overview-responsive.css'), "v144.98 stylesheet must be loaded globally");
expect(css.includes('@media (max-width: 760px)'), "campaign overview must include a mobile breakpoint");
expect(css.includes('.sp98-campaign-overview-timeline-marker'), "campaign overview must style timeline markers");

console.log('v144.98 campaign overview responsive checks passed');

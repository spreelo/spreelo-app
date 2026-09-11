import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCampaignRescueValidationContext,
  isCalendarCampaignRule,
  validateCampaignRescueMaterial,
} from "../lib/campaignRescueValidation.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const importRoute = read("app/api/admin/post-approvals/rescue-import/route.js");
const approvalsPage = read("app/admin/post-approvals/page.jsx");

assert.equal(isCalendarCampaignRule({ queue_source: "campaign" }), true);
assert.equal(isCalendarCampaignRule({ queue_source: "automation" }), false);

const context = buildCampaignRescueValidationContext({
  rule: {
    queue_source: "campaign",
    campaign_theme: "Father's Day",
    campaign_goal: "Gift discovery",
    target_customer_need: "Find a useful gift for dad",
    product_search_intent: "Choose giftable premium grill products",
    product_match_terms: ["grill", "gift", "premium"],
    product_search_queries: ["grill gift", "premium grill"],
  },
  workItem: { scheduled_for: "2027-11-14T10:00:00Z" },
});
assert.equal(context.campaign_theme, "Father's Day");
assert.deepEqual(context.product_match_terms, ["grill", "gift", "premium"]);

let calls = 0;
const acceptedClient = {
  chat: {
    completions: {
      create: async ({ messages }) => {
        calls += 1;
        assert.match(messages[0].content, /ORIGINAL calendar campaign/u);
        assert.match(messages[0].content, /Do NOT require a holiday\/event word/u);
        assert.match(messages[1].content, /Father's Day/u);
        return {
          choices: [{ message: { content: JSON.stringify({
            accepted: true,
            confidence: 94,
            reason: "The product fits the gift-oriented grill campaign.",
            item_results: [{ slot: 1, accepted: true, score: 92, reason: "Giftable grill product." }],
          }) } }],
        };
      },
    },
  },
};

const productResult = await validateCampaignRescueMaterial({
  rule: {
    queue_source: "campaign",
    campaign_theme: "Father's Day",
    product_search_intent: "Choose giftable premium grill products",
    product_match_terms: ["grill", "gift"],
  },
  workItem: {},
  rescueType: "single_product",
  products: [{ slot: 1, title: "Premium grill thermometer", description: "Thermometer for grilling" }],
  openai: acceptedClient,
});
assert.equal(productResult.required, true);
assert.equal(productResult.accepted, true);
assert.equal(productResult.status, "accepted");
assert.equal(calls, 1);

const rejectedCarouselClient = {
  chat: {
    completions: {
      create: async () => ({
        choices: [{ message: { content: JSON.stringify({
          accepted: true,
          confidence: 91,
          reason: "Most products fit, one does not.",
          item_results: [
            { slot: 1, accepted: true, score: 92, reason: "Fits." },
            { slot: 2, accepted: true, score: 90, reason: "Fits." },
            { slot: 3, accepted: false, score: 35, reason: "Off-theme." },
            { slot: 4, accepted: true, score: 88, reason: "Fits." },
            { slot: 5, accepted: true, score: 91, reason: "Fits." },
          ],
        }) } }],
      }),
    },
  },
};
const carouselResult = await validateCampaignRescueMaterial({
  rule: { queue_source: "campaign", campaign_theme: "Back to school", product_search_intent: "School-use products" },
  rescueType: "product_carousel",
  products: [1,2,3,4,5].map((slot) => ({ slot, title: `Product ${slot}` })),
  openai: rejectedCarouselClient,
});
assert.equal(carouselResult.accepted, false, "one off-theme carousel product must block the whole rescue");

const sourceClient = {
  chat: {
    completions: {
      create: async ({ messages }) => {
        assert.match(messages[0].content, /source research/u);
        return {
          choices: [{ message: { content: JSON.stringify({
            accepted: true,
            confidence: 89,
            reason: "The verified material directly supports the campaign guide.",
            item_results: [],
          }) } }],
        };
      },
    },
  },
};
const sourceResult = await validateCampaignRescueMaterial({
  rule: { queue_source: "campaign", campaign_theme: "Christmas", campaign_goal: "Gift guide" },
  rescueType: "source_research",
  verifiedContext: { summary: "Verified gift-related information", key_facts: ["Gift cards are available"] },
  sources: [{ url: "https://example.com/gifts", supports: "Gift information" }],
  openai: sourceClient,
});
assert.equal(sourceResult.accepted, true);

let ordinaryCalled = false;
const ordinaryResult = await validateCampaignRescueMaterial({
  rule: { queue_source: "automation", campaign_theme: "Christmas" },
  rescueType: "single_product",
  products: [{ title: "Anything" }],
  openai: { chat: { completions: { create: async () => { ordinaryCalled = true; throw new Error("should not call"); } } } },
});
assert.equal(ordinaryResult.required, false);
assert.equal(ordinaryResult.accepted, true);
assert.equal(ordinaryCalled, false, "ordinary non-campaign rescue must remain unchanged and make no validation AI call");

assert.match(importRoute, /rule_snapshot[\s\S]{0,900}originalRule/u);
assert.match(importRoute, /CAMPAIGN_RESCUE_VALIDATION_UNAVAILABLE/u);
assert.match(importRoute, /validateCampaignRescueMaterial\(\{/u);
assert.match(importRoute, /CAMPAIGN_RESCUE_THEME_MISMATCH/u);
assert.match(importRoute, /campaign_validation: campaignValidation/u);
assert.match(importRoute, /campaign_validation_status/u);
assert.match(importRoute, /openai: campaignValidationOpenAI/u);
assert.match(approvalsPage, /CALENDAR CAMPAIGN RESCUE LOCK/u);
assert.match(approvalsPage, /Spreelo will validate the imported Rescue package against this original campaign/u);

console.log("v144.171 calendar-campaign Rescue validation checks passed");

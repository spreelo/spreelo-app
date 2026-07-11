import test from "node:test";
import assert from "node:assert/strict";
import {
  campaignHasProductWebsiteFit,
  campaignSourceUsesWebsiteContent,
  getCampaignContentFormat,
  getCampaignContentTypeId,
  getProductCampaignCarouselIndex,
  resolveProductCampaignSourceMode,
} from "./campaignContentPolicy.js";

const productCampaign = {
  title: "Christmas gifts with personality",
  website_content_fit: "strong",
  website_content_strategy: "product",
  website_product_mode_available: true,
  website_single_product_post_available: true,
  website_carousel_mode_available: true,
};

test("six-post product campaign gets a balanced website mix", () => {
  const modes = Array.from({ length: 6 }, (_, index) =>
    resolveProductCampaignSourceMode({
      campaign: productCampaign,
      postPlanItem: {},
      index,
      total: 6,
    })
  );

  assert.deepEqual(modes, [
    "generic_campaign",
    "generic_campaign",
    "website_carousel",
    "website_product",
    "website_product",
    "website_product",
  ]);
});

test("four-post approved store campaign cannot become all generic from stale fit metadata", () => {
  const campaign = {
    title: "Halloween: mörk stil och uttrycksfulla tryck",
    website_content_fit: "weak",
    website_content_strategy: "none",
    product_match_terms: ["halloween t-shirt", "skull print"],
    product_search_queries: ["halloween", "skulls"],
    website_product_mode_available: true,
    website_single_product_post_available: true,
    website_carousel_mode_available: true,
  };

  const modes = Array.from({ length: 4 }, (_, index) =>
    resolveProductCampaignSourceMode({
      campaign,
      postPlanItem: {},
      index,
      total: 4,
    })
  );

  assert.deepEqual(modes, [
    "generic_campaign",
    "website_carousel",
    "website_product",
    "website_product",
  ]);
});

test("explicit mixed website post is preserved before the carousel", () => {
  const mode = resolveProductCampaignSourceMode({
    campaign: productCampaign,
    postPlanItem: { content_source_mode: "mixed_campaign_and_website" },
    index: 1,
    total: 6,
  });

  assert.equal(mode, "mixed_campaign_and_website");
});

test("late mixed website slot becomes a concrete product in a product campaign", () => {
  const mode = resolveProductCampaignSourceMode({
    campaign: productCampaign,
    postPlanItem: { content_source_mode: "mixed_campaign_and_website" },
    index: 3,
    total: 4,
  });

  assert.equal(mode, "website_product");
});

test("extra explicit carousel becomes a normal product post", () => {
  const mode = resolveProductCampaignSourceMode({
    campaign: productCampaign,
    postPlanItem: { content_source_mode: "website_carousel" },
    index: 4,
    total: 6,
  });

  assert.equal(mode, "website_product");
});

test("campaign without store capability is not forced into product content", () => {
  const campaign = {
    ...productCampaign,
    website_product_mode_available: false,
    website_single_product_post_available: false,
    website_carousel_mode_available: false,
  };

  assert.equal(campaignHasProductWebsiteFit(campaign), false);
  assert.equal(
    resolveProductCampaignSourceMode({ campaign, index: 2, total: 6 }),
    ""
  );
});

test("explicit carousel false is respected while single-product posts remain available", () => {
  const campaign = {
    ...productCampaign,
    website_product_mode_available: true,
    website_single_product_post_available: true,
    website_carousel_mode_available: false,
  };
  const modes = Array.from({ length: 4 }, (_, index) =>
    resolveProductCampaignSourceMode({ campaign, index, total: 4 })
  );

  assert.deepEqual(modes, [
    "generic_campaign",
    "generic_campaign",
    "website_product",
    "website_product",
  ]);
});

test("verified store information campaign without structured product intent stays generic", () => {
  const campaign = {
    title: "Världsdagen för psykisk hälsa – visa omtanke",
    campaign_category: "awareness_theme",
    website_content_fit: "weak",
    website_content_strategy: "none",
    product_match_terms: [],
    product_search_queries: [],
    recommended_angles: ["awareness", "engagement", "trust"],
    website_product_mode_available: true,
    website_single_product_post_available: true,
    website_carousel_mode_available: true,
  };

  const modes = Array.from({ length: 4 }, (_, index) =>
    resolveProductCampaignSourceMode({ campaign, index, total: 4 })
  );

  assert.deepEqual(modes, ["", "", "", ""]);
});

test("generic product angle or match terms alone do not force an awareness campaign", () => {
  const campaign = {
    title: "Mental health awareness day",
    campaign_category: "awareness_theme",
    website_content_fit: "weak",
    website_content_strategy: "none",
    product_match_terms: ["supportive products"],
    recommended_angles: ["awareness", "product_discovery", "trust"],
    post_plan: [
      {
        marketing_angle: "product_discovery",
        product_match_terms: [],
        content_source_mode: "generic_campaign",
      },
    ],
    website_product_mode_available: true,
    website_single_product_post_available: true,
    website_carousel_mode_available: true,
  };

  assert.equal(campaignHasProductWebsiteFit(campaign), false);
});

test("service strategy cannot be overridden by an accidental product source mode", () => {
  const campaign = {
    website_content_strategy: "service",
    website_product_mode_available: true,
    website_single_product_post_available: true,
    website_carousel_mode_available: true,
  };

  assert.equal(
    resolveProductCampaignSourceMode({
      campaign,
      postPlanItem: { content_source_mode: "website_carousel" },
      index: 1,
      total: 4,
    }),
    ""
  );
});

test("structured commercial category enables mix without language keyword matching", () => {
  const campaign = {
    title: "Omiyage no kisetsu",
    campaign_category: "gift_campaign",
    website_content_fit: "weak",
    website_content_strategy: "none",
    website_product_mode_available: true,
    website_single_product_post_available: true,
    website_carousel_mode_available: true,
  };

  const modes = Array.from({ length: 4 }, (_, index) =>
    resolveProductCampaignSourceMode({ campaign, index, total: 4 })
  );

  assert.deepEqual(modes, [
    "generic_campaign",
    "website_carousel",
    "website_product",
    "website_product",
  ]);
});

test("website modes map to runnable automation content types", () => {
  assert.equal(getCampaignContentTypeId("website_product"), "website_item");
  assert.equal(getCampaignContentTypeId("mixed_campaign_and_website"), "website_item");
  assert.equal(getCampaignContentTypeId("website_carousel"), "carousel_website_item");
  assert.equal(getCampaignContentFormat("website_carousel"), "carousel");
  assert.equal(getCampaignContentFormat("website_product"), "single_image");
  assert.equal(campaignSourceUsesWebsiteContent("mixed_campaign_and_website"), true);
  assert.equal(getProductCampaignCarouselIndex(6), 2);
});

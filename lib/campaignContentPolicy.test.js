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

test("website modes map to runnable automation content types", () => {
  assert.equal(getCampaignContentTypeId("website_product"), "website_item");
  assert.equal(getCampaignContentTypeId("mixed_campaign_and_website"), "website_item");
  assert.equal(getCampaignContentTypeId("website_carousel"), "carousel_website_item");
  assert.equal(getCampaignContentFormat("website_carousel"), "carousel");
  assert.equal(getCampaignContentFormat("website_product"), "single_image");
  assert.equal(campaignSourceUsesWebsiteContent("mixed_campaign_and_website"), true);
  assert.equal(getProductCampaignCarouselIndex(6), 2);
});

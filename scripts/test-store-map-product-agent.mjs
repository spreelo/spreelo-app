import assert from "node:assert/strict";
import {
  buildStoreMapIntent,
  canonicalizeStoreMapUrl,
  classifyStoreMapLinkHint,
  getStoreOriginUrl,
  rankStoreMapNodes,
  shouldRefreshStoreMap,
} from "../lib/storeMapProductAgent.js";

assert.equal(
  getStoreOriginUrl("https://example.com/products/item?x=1"),
  "https://example.com/"
);
assert.equal(
  canonicalizeStoreMapUrl("/collections/halloween?utm_source=test", "https://example.com/"),
  "https://example.com/collections/halloween"
);
assert.equal(
  canonicalizeStoreMapUrl(
    "/occasion/girlfriends-day?ord=d&p=3&utm_source=test",
    "https://example.com/"
  ),
  "https://example.com/occasion/girlfriends-day"
);
assert.equal(
  classifyStoreMapLinkHint({
    url: "https://example.com/collections/halloween",
    text: "Halloween",
    originUrl: "https://example.com/",
  }).nodeType,
  "category"
);
assert.equal(
  classifyStoreMapLinkHint({
    url: "https://example.com/products/pumpkin-candy",
    text: "Pumpkin Candy",
    originUrl: "https://example.com/",
  }).nodeType,
  "product"
);

const intent = buildStoreMapIntent({
  campaignText: "Halloween campaign for scary candy and party bags",
  searchQueries: ["halloween candy", "monster sweets"],
  avoidTerms: ["christmas"],
});
const ranked = rankStoreMapNodes(
  [
    {
      url: "https://example.com/collections/christmas",
      node_type: "category",
      title: "Christmas sweets",
      product_link_count: 100,
      node_type_confidence: 90,
    },
    {
      url: "https://example.com/collections/halloween",
      node_type: "campaign",
      title: "Halloween candy",
      summary: "Monster sweets, pumpkins and scary party bags",
      product_link_count: 40,
      node_type_confidence: 90,
    },
    {
      url: "https://example.com/collections/sour-candy",
      node_type: "category",
      title: "Sour candy",
      product_link_count: 60,
      node_type_confidence: 90,
    },
  ],
  intent,
  3
);
assert.equal(ranked[0].title, "Halloween candy");
assert.equal(shouldRefreshStoreMap([], { minimumNodes: 2 }), true);
assert.equal(
  shouldRefreshStoreMap(
    [
      { url: "https://example.com/a", node_type: "category", last_crawled_at: new Date().toISOString() },
      { url: "https://example.com/b", node_type: "campaign", last_crawled_at: new Date().toISOString() },
    ],
    { minimumNodes: 2, maxAgeHours: 72 }
  ),
  false
);

console.log("Store Map Product Agent helper tests passed.");

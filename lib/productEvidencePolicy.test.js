import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCapabilityEvidenceTitleFrequency,
  deriveProductTitleFromUrl,
  mergeNormalizedProductEvidence,
  resolveCapabilityEvidenceTitle,
} from "./productEvidencePolicy.js";

test("repeated site-wide evidence title is replaced by the product URL slug", () => {
  const items = [
    {
      title: "Copy of Impulse theme 3.0.3 | OPT",
      url: "https://pressit.se/products/candy-scarhold-clown-herr-t-shirt",
    },
    {
      title: "Copy of Impulse theme 3.0.3 | OPT",
      url: "https://pressit.se/products/halloween-31-oktober-t-shirt",
    },
  ];
  const frequency = buildCapabilityEvidenceTitleFrequency(items);

  assert.equal(
    resolveCapabilityEvidenceTitle(items[0], frequency),
    "Candy scarhold clown herr t shirt"
  );
  assert.equal(
    resolveCapabilityEvidenceTitle(items[1], frequency),
    "Halloween 31 oktober t shirt"
  );
});

test("unique verified product title is preserved", () => {
  const item = {
    title: "Camo skull T-shirt dam",
    url: "https://dunken.se/sv/products/camo-skull-t-shirt-dam",
  };

  assert.equal(
    resolveCapabilityEvidenceTitle(
      item,
      buildCapabilityEvidenceTitleFrequency([item])
    ),
    "Camo skull T-shirt dam"
  );
});

test("URL title derivation is Unicode-safe and language-independent", () => {
  assert.equal(
    deriveProductTitleFromUrl(
      "https://example.test/products/h%C3%A4xans-halloween-tr%C3%B6ja"
    ),
    "Häxans halloween tröja"
  );
});

test("normalization keeps verified commerce evidence", () => {
  const merged = mergeNormalizedProductEvidence(
    {
      product_page_verified: true,
      product_schema_verified: true,
      ecommerce_proof_found: true,
      add_to_cart_detected: true,
      campaign_fit_source: "brand_capability_verified_seed",
    },
    {
      title: "Halloween 31 oktober t shirt",
      url: "https://pressit.se/products/halloween-31-oktober-t-shirt",
      image_url: "https://pressit.se/cdn/product.png",
      description: "Verified product",
    }
  );

  assert.equal(merged.product_page_verified, true);
  assert.equal(merged.product_schema_verified, true);
  assert.equal(merged.ecommerce_proof_found, true);
  assert.equal(merged.add_to_cart_detected, true);
  assert.equal(merged.campaign_fit_source, "brand_capability_verified_seed");
});

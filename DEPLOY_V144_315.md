# Spreelo v144.315 – animation typography and video end-card composition

Complete package based on v144.314. No SQL migrations, environment changes, new dependencies or extra image-generation requests.

## Animation typography

The existing adaptive product/text positions and product motion are retained. The text artwork is centered in the same reserved region with maximum width 86% and height 78% of the previously available inner area. Prompt instructions prioritize the real product, readable supporting copy, airy line spacing and medium/semibold lettering. Heavy italic/extra-bold styling, decorative rules and thick shadows are discouraged. Type remains context-specific and varied. Copy planning prefers a complete 3–5 word headline, allowing up to 7 where needed. Existing independence-from-product-print and exact-word verification remain in place. Local contrast correction uses a thinner 2px outline only when needed.

## AI-video ending

One existing GPT-Image 2.5 Flare request now supplies three independent assets in a 1536×1024 atlas: a text-free company/product-specific background on the left, main video typography in the upper right and transparent closing typography in the lower right. The exact company logo is added locally; absent logos use a locally centered company name.

Background extraction follows the actual contiguous opaque rectangle instead of blindly cutting at x=576. Transparent gutters are removed before edge-to-edge 1080×1920 cover sizing, preventing pale strips. A transparent horizontal gutter separates the two text groups. CTA placement uses its actual visible alpha bounds and centers those bounds horizontally at x=540 and vertically at y=1175. This keeps asymmetric source padding from shifting the closing message. The central background is locally softened with a feathered blur of that same background to reduce stray sharp decoration beside the original logo, preserving the palette and outer design. Missing closing lettering uses local typesetting without an extra provider submission.

The existing 0.3s dissolve over moving video, 1.3s closing hold, original logo overlay during motion and end-aligned music remain unchanged. Kling generation, prompts for motion/product identity, submission and scene trimming remain unchanged. Popup components and assets are byte-for-byte unchanged. Persistent music deletion and all v144.314 fixes are included.

## Validation and deployment review

Production build passed. Tests passed for shifted/offset background bounds, transparent gutters, full image coverage, visible CTA centering, local softening of a stray logo-area stroke, original logo/no-logo sender, reduced animation typography within both adaptive regions, exact animation copy, contrast correction, initial Creator planning, one image submission/cache behavior, fallback backoff and persistent music deletion. Existing adaptive animation tests now supply the locked headline introduced in v144.312 and validate that contract.

Generate one new animation and one new AI-video after deployment to review actual provider typography/background artwork. Already completed videos and cached/submitted compositions are not automatically rebuilt. No paid image or video provider submissions were made during local verification.

# v144.300 — Adaptive animated product posts

Deploy the complete ZIP. No SQL or new environment variables are needed.

Before typography generation, Spreelo measures visible alpha bounds, crops transparent margins and chooses a wide, tall or balanced layout. Original white pixels and the verified-source fallback panel are preserved. Wide products occupy up to 960 pixels in width with text above and fade in without zoom. Other products preserve their aspect ratio, keep text underneath and slowly zoom once by at most 3.5%, bounded away from text and frame edges. Poster and video use the same product layout. The logo retains its original artwork without the generated white plate.

The existing GPT Image 2.5 Flare request now creates a short advertising headline in the configured content language, using the supplied product and post/campaign context. It is instructed not to merely repeat the product print and not to invent properties, prices or offers. One optional product-name line is allowed only when useful. Text has a larger final region and fades in after 0.6 seconds. Contrast guidance samples the selected text region. The existing safe product-name fallback is repositioned to the selected layout if image generation fails.

Background and music selection, product identity verification, token recovery, Shotstack polling and render-duration limits are unchanged. No extra AI request was added. Model-generated wording still requires normal customer approval. Existing videos are not regenerated.

Validation: adaptive layout/pixel bounds/shape/zoom/contrast/Shotstack payload tests, v144.299 typography/logo regression, v144.286 Kling regression, v144.294 identity, v144.298 Pinterest recovery and production build. No live AI or Shotstack render was performed locally. An obsolete v143.99 test also fails on the unchanged v144.299 baseline because it expects a removed legacy chroma-cutout function; it is not a regression introduced here.

After deployment, test at least one wide product and one tall product to review the generated headline and final renderer output.

# Spreelo V129 – Product-driven campaigns and safer product delivery

## What changed

### 1. Product-driven calendar campaigns

Verified store and ecommerce campaigns are normalized after AI planning so that they normally contain approximately 65–80% product formats.

The policy now guarantees:

- at least one AI product ad in every verified store campaign
- at most one product carousel per campaign
- animated product Reels only when the business, campaign and likely product material suit motion; the format is optional rather than forced into every campaign
- supporting FAQ, tips, mini-guide, checklist, problem → solution, mistakes, myth vs fact and seasonal formats when they strengthen the sequence
- campaign-specific variation rather than an automatic carousel + Reel + seasonal template

Existing cached campaign plans are reused only when they also satisfy the V129 policy. The V128 safeguard that prevents `Egen idé` / `manual_prompt` from being selected automatically remains in place.

### 2. Three distinct AI Content Studio goals

AI Content Studio still exposes only:

- Sell more
- Get more followers
- Build trust

The planning instructions now explicitly judge balance over a rolling multi-week schedule rather than forcing the same quota into every week.

- Sell more is more product-driven for verified stores, with supporting value content.
- Get more followers prioritizes engaging, saveable and shareable content, with fewer pure product advertisements.
- Build trust prioritizes helpful, educational, explanatory and uncertainty-reducing content.

### 3. Safer carousel product selection

Product selection now rejects visually empty or nearly empty custom templates, including generic “design your own” products when the title and image evidence indicate that no real visual product is present.

Near-identical variants are grouped by a product-family key. Size, dimension and common trailing colour/variant markers no longer allow the same underlying product to fill several carousel positions.

Campaign relevance remains the first ranking dimension. Fresh relevant products are exhausted before strong previously used products can be reused. Reused products still have to pass the same relevance and visual checks.

Single-product and Reel reserve pools use the same principle. If the initial reserve pool does not contain three strong campaign matches, Spreelo performs another verified website discovery pass before accepting weaker but still relevant reserves.

### 4. Technical URL filtering before product verification

The worker now rejects technical and non-product URLs before product verification, including:

- font, JavaScript, CSS, source-map, JSON and XML files
- image, video and document files interpreted as pages
- API, GraphQL, AJAX, analytics, pixel and tracking endpoints
- checkout, cart, account, login, payment and wallet flows
- internal Shopify/CDN/service addresses

Store search and collection pages can still be used by discovery logic to find real product links, but they cannot themselves be approved as products.

### 5. Animated product Reel reserves

Before a product is selected for an animated Reel, its image is tested for a usable transparent or safely removable background.

Shopify image URLs containing `{width}`, `{{width}}` or their encoded equivalents are converted to a concrete 1600-pixel URL.

The same automation run can now test:

- the primary product
- up to three relevant reserve products

If a reserve is used, the caption and destination URL are regenerated for that product. A product is added to used-product history only after the Reel has actually rendered and been attached to the post.

### 6. Protected carousel rendering

The carousel rendering functions were not changed.

The following V127/V128 behavior remains intact:

- slides 1–5 are clean product images on selected backgrounds with no product name, price or text box
- slide 6 is the existing AI-generated closing slide
- the current SVG/image rendering path is unchanged
- the five-product requirement and existing background/rendering safeguards remain

## Database

No new SQL migration is required for V129.

## Validation

Run:

```bash
npm run test:v127
npm run test:v128
npm run test:v129
```

A full Next.js production build requires installing the project dependencies first.

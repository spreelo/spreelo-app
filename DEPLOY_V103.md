# Spreelo v103 — post review makeover

## What changed

- Rebuilt `/posts/[id]` in the same visual system as AI Content Studio.
- Added the Spreelo background artwork with a soft fade behind the top of the page.
- Replaced the oversized media block with a compact, contained publishing preview.
- The preview now shows media and the complete `posts.content` caption together, preserving paragraphs, links, calls to action and hashtags.
- The text editor automatically expands to its full content height instead of hiding text behind an internal scrollbar.
- Added modern summary, status, publishing-details, editor and final-decision cards.
- Added matching icon buttons for back, copy, save, discard, open media and approve.
- Added responsive layouts for desktop, tablet and mobile.
- Carousel, slideshow and animated-video review paths remain supported.
- All new customer-facing copy uses English source labels and Spreelo's existing automatic translation flow.

## Data behavior

The email, review page and social publisher all use the same `posts.content` value. This update changes presentation only; saving or approving still writes the complete edited value back to `posts.content`.

## Deployment

No SQL migration is required. Deploy the application normally.

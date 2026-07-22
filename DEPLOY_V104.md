# Deploy v104 - Sharp Linux runtime stability

This release fixes the Vercel runtime failure where every automation lane
crashed before the queue handler started because Sharp could not load its
Linux libvips library.

## What changed

- All direct dependencies are pinned to the versions verified by this release.
- Sharp is pinned to 0.34.5, matching the version used by Next.js 16.2.10.
- pnpm is configured to retain Windows x64 and Linux x64/glibc optional assets.
- Next.js output tracing explicitly includes Sharp, its Linux binary and libvips.
- The production build performs a real one-pixel PNG probe. A deployment now
  fails during build rather than reaching production with a broken Sharp runtime.

## Deploy

No SQL or environment-variable changes are required. Deploy the whole package
so package.json, pnpm-lock.yaml, pnpm-workspace.yaml and next.config.mjs are all
included.

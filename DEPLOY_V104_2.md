# Deploy v104.2 - Vercel Sharp packaging and queue isolation

This release keeps the verified Sharp 0.34.5/libvips 8.17.3 fix from v104.1
and corrects the Vercel deployment-package failure caused by traced pnpm
symlink directories.

## What changed

- pnpm now uses `nodeLinker: hoisted` so serverless dependencies are installed
  in a flat `node_modules` tree without pnpm virtual-store symlinks.
- Internal `node_modules/.pnpm` globs were removed from Next.js output tracing.
- Sharp's install script is explicitly approved for pnpm 10.
- The shared automation route and all five lanes explicitly use Node.js runtime.
- Sharp is loaded only when an image operation is needed. A future Sharp runtime
  failure can therefore fail that image job without preventing text-only queue
  work from starting.
- The build-time Sharp PNG probe remains enabled.

## Deploy

No SQL or environment-variable changes are required. Deploy the full package.
The build log must show the Sharp runtime verification, complete `next build`,
and continue past `Deploying outputs...` to a Ready deployment.

/** @type {import("next").NextConfig} */
const nextConfig = {
  // Sharp is a native external package. Keep its Linux binary and matching
  // libvips payload in every automation function that imports the shared queue.
  outputFileTracingIncludes: {
    "/api/cron/run-automations*": [
      "node_modules/sharp/**/*",
      "node_modules/@img/sharp-linux-x64/**/*",
      "node_modules/@img/sharp-libvips-linux-x64/**/*",
      "node_modules/@fontsource/inter/files/*.woff",
    ],
  },
};

export default nextConfig;

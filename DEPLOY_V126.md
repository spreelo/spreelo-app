# Spreelo v126 – Turbopack-safe carousel label font path

- Fixes the Next.js 16 Turbopack build error for `.woff` files.
- Keeps `@fontsource/inter` as a production dependency.
- Stops resolving `.woff` files as module specifiers with `require.resolve()`.
- Resolves the traced font as a normal filesystem path at runtime.
- Keeps Sharp `text.fontfile`, the glass label design, campaign selection, backgrounds, AI outro and 600-second duration unchanged.
- No SQL or Supabase changes are required.

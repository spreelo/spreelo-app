import fs from "node:fs";

const page = fs.readFileSync(new URL("../app/grow-brain/page.jsx", import.meta.url), "utf8");
if (!/function\s+clamp\s*\(/.test(page)) throw new Error("Grow Brain page is missing clamp helper");
if (!/Math\.round\(clamp\(safeNumber\(insight\?\.confidence\),\s*0,\s*1\)\s*\*\s*100\)/.test(page)) throw new Error("Performance insight confidence no longer uses bounded clamp");
console.log("v144.228 Grow Brain Step 3B runtime fix checks passed.");

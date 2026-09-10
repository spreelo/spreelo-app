import fs from "node:fs";
const api = fs.readFileSync("app/api/admin/mass-tests/route.js", "utf8");
const page = fs.readFileSync("app/admin/mass-tests/page.jsx", "utf8");
function assert(c,m){if(!c)throw new Error(m)}
assert(api.includes("ADMIN_TEST_PLATFORMS"), "Supported mass-test platform list missing");
assert(api.includes("test_platforms: ADMIN_TEST_PLATFORMS"), "Mass-test platform options are not exposed");
assert(!api.includes("saknar vald ansluten plattform"), "Old connected-platform blocker still present");
assert(!api.includes("requestedPlatforms.filter((p)=>brand.connected_platforms.includes(p))"), "Mass tests still require a live connection");
assert(api.includes('["facebook", "instagram"]'), "Server fallback platform targets missing");
assert(page.includes('t("adminMassTests.testPlatforms")'), "Test-platform selector heading missing");
assert(page.includes('t("adminMassTests.testPlatformsText")'), "Mass-test connection explanation missing");
assert(page.includes("setup.test_platforms"), "UI does not render supported test platforms");
assert(page.includes('<small>{t("adminMassTests.connected")}</small>'), "Connected platform indicator missing");
assert(page.includes('fallback.length?fallback:["facebook"]'), "Client fallback platform selection missing");
console.log("v144.103 mass-test platform target checks passed");

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const page = read("app/admin/post-approvals/page.jsx");
const rescue = read("app/api/admin/post-approvals/rescue-import/route.js");

// Rescue prompt supports a manifest-only ZIP when ChatGPT can verify a direct original image URL.
assert.match(page, /Minimum valid structure:[\s\S]{0,120}manifest\.json/u);
assert.match(page, /image_url: a direct HTTPS URL/u);
assert.match(page, /If both image_file and image_url exist, Spreelo uses image_file first/u);
assert.match(page, /"version": 3/u);
assert.ok(page.includes('"rescue_type": ${JSON.stringify(rescueType)}'));
assert.match(page, /"image_url": "https:\/\/customer-cdn\.example/u);
assert.doesNotMatch(page, /IMPORTANT: Put the actual real product image files in the ZIP file\. Do not reply only with image links/u);

// Import accepts either an image packaged in the ZIP or a verified remote image URL.
assert.match(rescue, /remote_image_url: cleanUrl\(raw\?\.image_url/u);
assert.match(rescue, /either image_file or image_url/u);
assert.match(rescue, /if \(product\.image_file\)/u);
assert.match(rescue, /fetchRemoteProductImage\(product\.remote_image_url\)/u);

// Remote URL imports are constrained to public HTTPS with manual redirect checks and hard resource limits.
assert.match(rescue, /assertPublicHttpUrl/u);
assert.match(rescue, /Remote rescue images must use HTTPS/u);
assert.match(rescue, /redirect: "manual"/u);
assert.match(rescue, /MAX_REMOTE_REDIRECTS = 4/u);
assert.match(rescue, /REMOTE_IMAGE_TIMEOUT_MS = 15_000/u);
assert.match(rescue, /MAX_REMOTE_IMAGE_BYTES = 20 \* 1024 \* 1024/u);
assert.match(rescue, /inspectImageBytes\(downloaded\.bytes\)/u);

// The fetched external asset is copied into Spreelo storage and the local copy becomes authoritative.
assert.match(rescue, /rescue_original_image_url:/u);
assert.match(rescue, /rescue_image_source: prepared\.sourceKind/u);
assert.match(rescue, /image_url: publicData\.publicUrl/u);
assert.match(rescue, /original remote product image was downloaded and copied to Spreelo storage/u);
assert.match(rescue, /remote_image_count:/u);

console.log("v144.108 rescue remote-image checks passed.");

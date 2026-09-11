import crypto from "crypto";
import { inflateRawSync } from "node:zlib";
import sharp from "sharp";
import { adminContextError, getAdminContext } from "../../../../../lib/adminAuth";
import { assertPublicHttpUrl } from "../../../../../lib/security";
import { getPostRescueProductCount, POST_RESCUE_TYPES, resolvePostRescueType } from "../../../../../lib/postRescueFormat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET = "admin-review-assets";
const MAX_ZIP_BYTES = 60 * 1024 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 30;
const MAX_UNCOMPRESSED_BYTES = 120 * 1024 * 1024;
const MAX_REMOTE_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_REMOTE_REDIRECTS = 4;
const REMOTE_IMAGE_TIMEOUT_MS = 15_000;
const MIME_BY_EXT = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};
const EXT_BY_FORMAT = { jpeg: "jpg", png: "png", webp: "webp" };
const MIME_BY_FORMAT = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };


function readZipEntries(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  // EOCD is within the final 65,557 bytes (max ZIP comment + fixed record).
  const minOffset = Math.max(0, buffer.length - 65_557);
  let eocdOffset = -1;
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("ZIP end record was not found.");

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error("ZIP64 rescue packages are not supported.");
  }
  if (entryCount > MAX_FILES || centralOffset + centralSize > buffer.length) {
    throw new Error("The ZIP directory is invalid or contains too many files.");
  }

  const descriptors = [];
  let cursor = centralOffset;
  let declaredUncompressedBytes = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error("The ZIP central directory is invalid.");
    }
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd + extraLength + commentLength > buffer.length) throw new Error("The ZIP filename record is invalid.");
    const name = buffer.subarray(nameStart, nameEnd).toString("utf8");
    if (flags & 0x0001) throw new Error("Encrypted ZIP entries are not supported.");
    if (![0, 8].includes(method)) throw new Error(`Unsupported ZIP compression method for '${name}'.`);
    if ([compressedSize, uncompressedSize, localOffset].some((value) => value === 0xffffffff)) {
      throw new Error("ZIP64 rescue packages are not supported.");
    }
    declaredUncompressedBytes += uncompressedSize;
    if (declaredUncompressedBytes > MAX_UNCOMPRESSED_BYTES) throw new Error("The uncompressed rescue package is too large.");
    descriptors.push({ name, method, compressedSize, uncompressedSize, localOffset });
    cursor = nameEnd + extraLength + commentLength;
  }

  const entries = {};
  for (const descriptor of descriptors) {
    if (descriptor.name.endsWith("/")) continue;
    const localOffset = descriptor.localOffset;
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`The ZIP entry '${descriptor.name}' has an invalid local header.`);
    }
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + descriptor.compressedSize;
    if (dataEnd > buffer.length) throw new Error(`The ZIP entry '${descriptor.name}' is truncated.`);
    const compressed = buffer.subarray(dataStart, dataEnd);
    const output = descriptor.method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed);
    if (output.length !== descriptor.uncompressedSize) {
      throw new Error(`The ZIP entry '${descriptor.name}' has an invalid uncompressed size.`);
    }
    entries[descriptor.name] = output;
  }
  return entries;
}

function cleanText(value, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}
function cleanUrl(value) {
  const text = cleanText(value, 3000);
  return /^https?:\/\//i.test(text) ? text : "";
}
function baseName(value) {
  return String(value || "").replaceAll("\\", "/").split("/").pop();
}
function findEntry(entries, requested) {
  const wanted = baseName(requested).toLowerCase();
  if (!wanted) return null;
  for (const [name, bytes] of Object.entries(entries)) {
    if (baseName(name).toLowerCase() === wanted) return { name, bytes };
  }
  return null;
}
function normalizeProduct(raw, index) {
  return {
    slot: Number(raw?.slot || index + 1),
    title: cleanText(raw?.product_name || raw?.title || raw?.name, 500),
    description: cleanText(raw?.product_description || raw?.description, 5000),
    url: cleanUrl(raw?.product_url || raw?.url),
    product_identifier: cleanText(raw?.article_number || raw?.product_identifier || raw?.sku, 300),
    product_brand: cleanText(raw?.brand || raw?.product_brand, 300),
    product_display_type: cleanText(raw?.product_type || raw?.product_display_type, 300),
    product_color: cleanText(raw?.color || raw?.product_color, 300),
    price: cleanText(raw?.price, 120),
    currency: cleanText(raw?.currency, 20).toUpperCase(),
    image_file: cleanText(raw?.image_file || raw?.image_filename, 500),
    remote_image_url: cleanUrl(raw?.image_url || raw?.image_source_url || raw?.original_image_url),
    source_note: cleanText(raw?.source_note || raw?.verification_note, 1200),
  };
}

function normalizeSources(rawSources) {
  const sourceItems = Array.isArray(rawSources) ? rawSources : [];
  const seen = new Set();
  const result = [];
  for (const raw of sourceItems) {
    const url = cleanUrl(raw?.url || raw?.source_url || raw);
    if (!url || seen.has(url)) continue;
    let parsedUrl;
    try { parsedUrl = new URL(url); } catch { continue; }
    if (parsedUrl.protocol !== "https:") continue;
    seen.add(url);
    result.push({
      url,
      supports: cleanText(raw?.supports || raw?.note || raw?.description, 1600),
    });
    if (result.length >= 30) break;
  }
  return result;
}

function normalizeVerifiedContext(rawContext) {
  const context = rawContext && typeof rawContext === "object" && !Array.isArray(rawContext)
    ? rawContext
    : {};
  const keyFacts = Array.isArray(context.key_facts || context.facts)
    ? (context.key_facts || context.facts)
        .map((value) => cleanText(value, 1200))
        .filter(Boolean)
        .slice(0, 30)
    : [];
  return {
    summary: cleanText(context.summary, 6000),
    key_facts: keyFacts,
    audience_or_use_case: cleanText(context.audience_or_use_case || context.audience, 2500),
    content_notes: cleanText(context.content_notes || context.notes, 4000),
  };
}

async function readResponseBufferWithLimit(response, limitBytes) {
  const declaredBytes = Number(response.headers.get("content-length") || 0);
  if (declaredBytes > limitBytes) throw new Error("Remote product image exceeds the 20 MB limit.");
  if (!response.body || typeof response.body.getReader !== "function") {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > limitBytes) throw new Error("Remote product image is empty or exceeds the 20 MB limit.");
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > limitBytes) {
        try { await reader.cancel(); } catch {}
        throw new Error("Remote product image exceeds the 20 MB limit.");
      }
      chunks.push(chunk);
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }
  if (!total) throw new Error("Remote product image is empty.");
  return Buffer.concat(chunks, total);
}

async function fetchRemoteProductImage(rawUrl) {
  let currentUrl = await assertPublicHttpUrl(rawUrl);
  if (new URL(currentUrl).protocol !== "https:") throw new Error("Remote rescue images must use HTTPS.");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REMOTE_IMAGE_TIMEOUT_MS);
  try {
    for (let redirectCount = 0; redirectCount <= MAX_REMOTE_REDIRECTS; redirectCount += 1) {
      let response;
      try {
        response = await fetch(currentUrl, {
          method: "GET",
          redirect: "manual",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Spreelo/1.0",
            Accept: "image/webp,image/png,image/jpeg;q=0.9,*/*;q=0.1",
          },
        });
      } catch (error) {
        if (error?.name === "AbortError") throw new Error("Remote product image download timed out.");
        throw error;
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirectCount === MAX_REMOTE_REDIRECTS) throw new Error(`Remote product image redirect could not be followed (${response.status}).`);
        currentUrl = await assertPublicHttpUrl(new URL(location, currentUrl).toString());
        if (new URL(currentUrl).protocol !== "https:") throw new Error("Remote rescue image redirects must stay on HTTPS.");
        continue;
      }

      if (!response.ok) throw new Error(`Remote product image returned HTTP ${response.status}.`);
      const bytes = await readResponseBufferWithLimit(response, MAX_REMOTE_IMAGE_BYTES);
      return {
        bytes,
        finalUrl: currentUrl,
        contentType: cleanText(response.headers.get("content-type"), 200),
      };
    }
  } finally {
    clearTimeout(timeoutId);
  }

  throw new Error("Remote product image redirect limit exceeded.");
}

async function inspectImageBytes(bytes) {
  const metadata = await sharp(Buffer.from(bytes), { failOn: "error", limitInputPixels: 80_000_000 }).metadata();
  const format = String(metadata?.format || "").toLowerCase();
  if (!Object.hasOwn(EXT_BY_FORMAT, format) || !metadata?.width || !metadata?.height) {
    throw new Error("Image is not a readable PNG, JPG or WEBP image.");
  }
  return { width: metadata.width, height: metadata.height, format };
}

export async function POST(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);

  const uploadedPaths = [];
  try {
    const form = await request.formData();
    const workItemId = cleanText(form.get("work_item_id"), 100);
    const file = form.get("file");
    if (!workItemId) return Response.json({ ok: false, error: "Work item ID is required." }, { status: 400 });
    if (!file || typeof file.arrayBuffer !== "function") {
      return Response.json({ ok: false, error: "Choose a rescue ZIP file." }, { status: 400 });
    }
    if (Number(file.size || 0) <= 0 || Number(file.size || 0) > MAX_ZIP_BYTES) {
      return Response.json({ ok: false, error: "Rescue ZIP must be smaller than 60 MB." }, { status: 400 });
    }

    const { data: workItem, error: workError } = await context.admin
      .from("admin_generation_work_items")
      .select("*")
      .eq("id", workItemId)
      .maybeSingle();
    if (workError || !workItem) {
      return Response.json({ ok: false, error: workError?.message || "Work item not found." }, { status: 404 });
    }
    if (workItem.status !== "failed") {
      return Response.json({ ok: false, error: "Rescue packages can only be imported into failed work items." }, { status: 409 });
    }

    const zipBytes = Buffer.from(await file.arrayBuffer());
    let entries;
    try {
      entries = readZipEntries(zipBytes);
    } catch (zipError) {
      return Response.json({ ok: false, error: `The file is not a readable supported ZIP archive: ${zipError?.message || "invalid ZIP"}` }, { status: 400 });
    }
    const entryNames = Object.keys(entries).filter((name) => !name.endsWith("/"));
    if (!entryNames.length || entryNames.length > MAX_FILES) {
      return Response.json({ ok: false, error: `The rescue ZIP must contain 1-${MAX_FILES} files.` }, { status: 400 });
    }

    const manifestEntry = Object.entries(entries).find(([name]) => baseName(name).toLowerCase() === "manifest.json");
    if (!manifestEntry) {
      return Response.json({ ok: false, error: "manifest.json is missing from the rescue ZIP." }, { status: 400 });
    }
    let manifest;
    try {
      manifest = JSON.parse(Buffer.from(manifestEntry[1]).toString("utf8"));
    } catch {
      return Response.json({ ok: false, error: "manifest.json is not valid JSON." }, { status: 400 });
    }

    const rescueType = resolvePostRescueType(workItem);
    const declaredRescueType = cleanText(manifest?.rescue_type, 100);
    if (declaredRescueType && declaredRescueType !== rescueType) {
      return Response.json({
        ok: false,
        error: `This rescue package is for '${declaredRescueType}', but this failed job requires '${rescueType}'.`,
      }, { status: 400 });
    }

    if (rescueType === POST_RESCUE_TYPES.SOURCE_RESEARCH) {
      const sources = normalizeSources(manifest?.sources);
      const verifiedContext = normalizeVerifiedContext(manifest?.verified_context || manifest?.source_context);
      if (!sources.length) {
        return Response.json({ ok: false, error: "This source-research rescue needs at least one verified HTTPS source page." }, { status: 400 });
      }
      if (!verifiedContext.summary && !verifiedContext.key_facts.length && !verifiedContext.content_notes) {
        return Response.json({ ok: false, error: "This source-research rescue needs verified_context with a summary, key facts or task-specific notes." }, { status: 400 });
      }

      const importedAt = new Date().toISOString();
      const rescueData = {
        version: Number(manifest?.version || 3),
        source_type: cleanText(manifest?.source_type || "chatgpt_rescue", 100),
        rescue_type: rescueType,
        imported_file_name: cleanText(file.name, 300),
        manifest: {
          post_type: cleanText(manifest?.post_type, 200),
          website_url: cleanUrl(manifest?.website_url) || workItem.source_url || "",
          campaign_goal: cleanText(manifest?.campaign_goal, 500),
          theme: cleanText(manifest?.theme, 500),
          language: cleanText(manifest?.language, 100),
          notes: cleanText(manifest?.notes, 3000),
        },
        verified_context: verifiedContext,
        sources,
        products: [],
      };

      const update = await context.admin.from("admin_generation_work_items").update({
        rescue_status: "ready",
        rescue_data: rescueData,
        rescue_imported_at: importedAt,
        rescue_imported_by: context.user.id,
        technical_log: {
          ...(workItem.technical_log || {}),
          rescue_import: {
            imported_at: importedAt,
            imported_by: context.user.id,
            file_name: cleanText(file.name, 300),
            rescue_type: rescueType,
            source_count: sources.length,
            key_fact_count: verifiedContext.key_facts.length,
          },
        },
        updated_at: importedAt,
      }).eq("id", workItem.id);
      if (update.error) throw new Error(update.error.message);

      if (workItem.occurrence_id) {
        const { data: occurrence } = await context.admin.from("automation_occurrences").select("metadata").eq("id", workItem.occurrence_id).maybeSingle();
        await context.admin.from("automation_occurrences").update({
          metadata: {
            ...(occurrence?.metadata || {}),
            rescue_work_item_id: workItem.id,
            rescue_imported_at: importedAt,
            rescue_type: rescueType,
            rescue_verified_context: verifiedContext,
            rescue_sources: sources,
          },
          updated_at: importedAt,
        }).eq("id", workItem.occurrence_id);
      }

      return Response.json({
        ok: true,
        work_item_id: workItem.id,
        rescue_status: "ready",
        rescue_type: rescueType,
        product_count: 0,
        source_count: sources.length,
        products: [],
        sources,
        verified_context: verifiedContext,
        manifest: rescueData.manifest,
      });
    }

    const rawProducts = Array.isArray(manifest?.products) ? manifest.products : [];
    const neededCount = getPostRescueProductCount(workItem, rescueType);
    if (rawProducts.length < neededCount) {
      return Response.json({ ok: false, error: `This job needs ${neededCount} complete product${neededCount === 1 ? "" : "s"}, but the ZIP contains ${rawProducts.length}.` }, { status: 400 });
    }

    const normalized = rawProducts.slice(0, neededCount).map(normalizeProduct);
    const preparedImages = [];
    for (let index = 0; index < normalized.length; index += 1) {
      const product = normalized[index];
      if (!product.title || !product.url || (!product.image_file && !product.remote_image_url)) {
        return Response.json({ ok: false, error: `Product ${index + 1} needs product_name/title, product_url and either image_file or image_url.` }, { status: 400 });
      }

      if (product.image_file) {
        const imageEntry = findEntry(entries, product.image_file);
        if (!imageEntry) {
          return Response.json({ ok: false, error: `Image file '${product.image_file}' for product ${index + 1} is missing. Remove image_file and provide image_url if ChatGPT could only verify a remote original image.` }, { status: 400 });
        }
        if (imageEntry.bytes.byteLength <= 0 || imageEntry.bytes.byteLength > MAX_FILE_BYTES) {
          return Response.json({ ok: false, error: `Image ${index + 1} must be smaller than 20 MB.` }, { status: 400 });
        }
        try {
          const metadata = await inspectImageBytes(imageEntry.bytes);
          preparedImages.push({
            bytes: Buffer.from(imageEntry.bytes),
            ...metadata,
            sourceKind: "zip_file",
            sourceUrl: "",
            finalUrl: "",
          });
        } catch {
          return Response.json({ ok: false, error: `Image ${index + 1} is not a readable PNG, JPG or WEBP image.` }, { status: 400 });
        }
        continue;
      }

      try {
        const downloaded = await fetchRemoteProductImage(product.remote_image_url);
        const metadata = await inspectImageBytes(downloaded.bytes);
        preparedImages.push({
          bytes: downloaded.bytes,
          ...metadata,
          sourceKind: "remote_url",
          sourceUrl: product.remote_image_url,
          finalUrl: downloaded.finalUrl,
          declaredContentType: downloaded.contentType,
        });
      } catch (imageError) {
        return Response.json({ ok: false, error: `Could not import the verified remote image for product ${index + 1}: ${imageError?.message || "image download failed"}` }, { status: 400 });
      }
    }

    const importedProducts = [];
    for (let index = 0; index < normalized.length; index += 1) {
      const product = normalized[index];
      const prepared = preparedImages[index];
      const ext = EXT_BY_FORMAT[prepared.format];
      const contentType = MIME_BY_FORMAT[prepared.format];
      const storagePath = `rescue/${workItem.id}/${index + 1}-${crypto.randomUUID()}.${ext}`;
      const upload = await context.admin.storage.from(BUCKET).upload(
        storagePath,
        prepared.bytes,
        { contentType, upsert: false }
      );
      if (upload.error) throw new Error(`Could not save product ${index + 1} image: ${upload.error.message}`);
      uploadedPaths.push(storagePath);
      const { data: publicData } = context.admin.storage.from(BUCKET).getPublicUrl(storagePath);
      if (!publicData?.publicUrl) throw new Error(`Could not create image URL for product ${index + 1}.`);
      importedProducts.push({
        ...product,
        image_url: publicData.publicUrl,
        preview_image_url: publicData.publicUrl,
        image_storage_path: storagePath,
        rescue_original_image_url: prepared.sourceUrl || "",
        rescue_final_image_url: prepared.finalUrl || prepared.sourceUrl || "",
        rescue_image_source: prepared.sourceKind,
        product_image_width: prepared.width || null,
        product_image_height: prepared.height || null,
        manual_override: true,
        manual_image_override: true,
        product_identity_locked: false,
        product_image_semantic_verified: false,
        locked_product_fingerprint: "",
        admin_materials_authoritative: true,
        manual_override_note: prepared.sourceKind === "remote_url"
          ? "Imported from ChatGPT rescue manifest; original remote product image was downloaded and copied to Spreelo storage. Admin must preview before regeneration."
          : "Imported from ChatGPT rescue ZIP; admin must preview before regeneration.",
      });
    }

    const importedAt = new Date().toISOString();
    const rescueData = {
      version: Number(manifest?.version || 1),
      source_type: cleanText(manifest?.source_type || "chatgpt_rescue", 100),
      rescue_type: rescueType,
      imported_file_name: cleanText(file.name, 300),
      manifest: {
        post_type: cleanText(manifest?.post_type, 200),
        website_url: cleanUrl(manifest?.website_url) || workItem.source_url || "",
        campaign_goal: cleanText(manifest?.campaign_goal, 500),
        theme: cleanText(manifest?.theme, 500),
        language: cleanText(manifest?.language, 100),
        notes: cleanText(manifest?.notes, 3000),
      },
      products: importedProducts,
    };

    const update = await context.admin.from("admin_generation_work_items").update({
      rescue_status: "ready",
      rescue_data: rescueData,
      rescue_imported_at: importedAt,
      rescue_imported_by: context.user.id,
      technical_log: {
        ...(workItem.technical_log || {}),
        rescue_import: {
          imported_at: importedAt,
          imported_by: context.user.id,
          file_name: cleanText(file.name, 300),
          rescue_type: rescueType,
          product_count: importedProducts.length,
          remote_image_count: preparedImages.filter((item) => item.sourceKind === "remote_url").length,
          packaged_image_count: preparedImages.filter((item) => item.sourceKind === "zip_file").length,
        },
      },
      updated_at: importedAt,
    }).eq("id", workItem.id);
    if (update.error) throw new Error(update.error.message);

    if (workItem.post_id) {
      await context.admin.from("posts").update({ admin_product_items: importedProducts, updated_at: importedAt }).eq("id", workItem.post_id);
    }
    if (workItem.occurrence_id) {
      const { data: occurrence } = await context.admin.from("automation_occurrences").select("metadata").eq("id", workItem.occurrence_id).maybeSingle();
      await context.admin.from("automation_occurrences").update({
        metadata: { ...(occurrence?.metadata || {}), admin_product_items: importedProducts, rescue_work_item_id: workItem.id, rescue_imported_at: importedAt },
        updated_at: importedAt,
      }).eq("id", workItem.occurrence_id);
      await context.admin.from("admin_review_cases").update({ product_items: importedProducts, updated_at: importedAt }).eq("occurrence_id", workItem.occurrence_id);
    }

    return Response.json({
      ok: true,
      work_item_id: workItem.id,
      rescue_status: "ready",
      rescue_type: rescueType,
      product_count: importedProducts.length,
      products: importedProducts,
      manifest: rescueData.manifest,
    });
  } catch (error) {
    if (uploadedPaths.length) {
      try { await context.admin.storage.from(BUCKET).remove(uploadedPaths); } catch {}
    }
    return Response.json({ ok: false, error: error?.message || "Rescue ZIP could not be imported." }, { status: 422 });
  }
}

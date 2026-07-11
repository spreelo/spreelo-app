import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const POST_IMAGES_BUCKET = "post-images";
const BRAND_ASSETS_BUCKET = "brand-assets";
const DELETION_LOG_RETENTION_DAYS = 90;

const OPTIONAL_TABLE_ERROR_PATTERNS = [
  "Could not find the table",
  "relation",
  "does not exist",
  "schema cache",
  "Could not find a relationship",
  "column",
];

function getBearerToken(request) {
  const authHeader = request.headers.get("authorization") || "";

  if (!authHeader.startsWith("Bearer ")) {
    return "";
  }

  return authHeader.replace("Bearer ", "").trim();
}

function uniqueValues(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function hashPrivateValue(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  return createHash("sha256").update(normalized).digest("hex");
}

function getClientIp(request) {
  const forwardedFor = request.headers.get("x-forwarded-for") || "";
  const realIp = request.headers.get("x-real-ip") || "";
  const firstForwardedIp = forwardedFor.split(",")[0]?.trim();

  return firstForwardedIp || realIp || "";
}

function isIgnorableOptionalError(error) {
  const message = String(error?.message || "");

  return OPTIONAL_TABLE_ERROR_PATTERNS.some((pattern) =>
    message.toLowerCase().includes(pattern.toLowerCase())
  );
}

function normalizeShortText(value, maxLength = 500) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeDeletionReason(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);

  return normalized || "not_provided";
}

function normalizeStoragePath(value, bucketName) {
  if (!value || typeof value !== "string") {
    return "";
  }

  let path = value.trim();

  if (!path) {
    return "";
  }

  try {
    const url = new URL(path);
    const publicMarker = `/storage/v1/object/public/${bucketName}/`;
    const signedMarker = `/storage/v1/object/sign/${bucketName}/`;

    if (url.pathname.includes(publicMarker)) {
      path = url.pathname.split(publicMarker)[1] || "";
    } else if (url.pathname.includes(signedMarker)) {
      path = url.pathname.split(signedMarker)[1] || "";
    }
  } catch {
    // Not a URL, keep it as a storage path.
  }

  if (path.startsWith(`${bucketName}/`)) {
    path = path.replace(`${bucketName}/`, "");
  }

  return decodeURIComponent(path.replace(/^\/+/, ""));
}

function extractPostImagePathsFromSlide(slide) {
  const paths = [];
  const metadata = slide?.metadata && typeof slide.metadata === "object" ? slide.metadata : {};

  if (metadata.image_storage_path) {
    paths.push(metadata.image_storage_path);
  }

  if (slide?.image_storage_path) {
    paths.push(slide.image_storage_path);
  }

  if (slide?.image_url) {
    paths.push(slide.image_url);
  }

  return paths;
}

async function deleteRowsByColumn(
  supabaseAdmin,
  tableName,
  columnName,
  value,
  { optional = false } = {}
) {
  if (!value) {
    return;
  }

  const { error } = await supabaseAdmin
    .from(tableName)
    .delete()
    .eq(columnName, value);

  if (error) {
    if (optional && isIgnorableOptionalError(error)) {
      console.warn(`Delete account optional cleanup skipped for ${tableName}.${columnName}:`, error.message);
      return;
    }

    throw new Error(`${tableName}: ${error.message}`);
  }
}

async function deleteRowsInColumn(
  supabaseAdmin,
  tableName,
  columnName,
  values,
  { optional = false } = {}
) {
  const cleanValues = uniqueValues(values);

  if (cleanValues.length === 0) {
    return;
  }

  const { error } = await supabaseAdmin
    .from(tableName)
    .delete()
    .in(columnName, cleanValues);

  if (error) {
    if (optional && isIgnorableOptionalError(error)) {
      console.warn(`Delete account optional cleanup skipped for ${tableName}.${columnName}:`, error.message);
      return;
    }

    throw new Error(`${tableName}: ${error.message}`);
  }
}

async function selectRowsByColumn(
  supabaseAdmin,
  tableName,
  columns,
  columnName,
  value,
  { optional = false } = {}
) {
  if (!value) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from(tableName)
    .select(columns)
    .eq(columnName, value);

  if (error) {
    if (optional && isIgnorableOptionalError(error)) {
      console.warn(`Delete account optional select skipped for ${tableName}.${columnName}:`, error.message);
      return [];
    }

    throw new Error(`${tableName}: ${error.message}`);
  }

  return data || [];
}

async function selectRowsInColumn(
  supabaseAdmin,
  tableName,
  columns,
  columnName,
  values,
  { optional = false } = {}
) {
  const cleanValues = uniqueValues(values);

  if (cleanValues.length === 0) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from(tableName)
    .select(columns)
    .in(columnName, cleanValues);

  if (error) {
    if (optional && isIgnorableOptionalError(error)) {
      console.warn(`Delete account optional select skipped for ${tableName}.${columnName}:`, error.message);
      return [];
    }

    throw new Error(`${tableName}: ${error.message}`);
  }

  return data || [];
}

async function removeStorageFiles(supabaseAdmin, bucketName, paths) {
  const cleanPaths = uniqueValues(
    (paths || [])
      .map((path) => normalizeStoragePath(path, bucketName))
      .filter(Boolean)
  );

  if (cleanPaths.length === 0) {
    return;
  }

  const chunkSize = 100;

  for (let index = 0; index < cleanPaths.length; index += chunkSize) {
    const chunk = cleanPaths.slice(index, index + chunkSize);

    const { error } = await supabaseAdmin.storage.from(bucketName).remove(chunk);

    if (error) {
      throw new Error(`${bucketName} storage: ${error.message}`);
    }
  }
}

async function listStorageFilesRecursively(supabaseAdmin, bucketName, folderPath) {
  const prefix = String(folderPath || "").replace(/^\/+|\/+$/g, "");
  const results = [];

  async function walk(currentPath) {
    const { data, error } = await supabaseAdmin.storage
      .from(bucketName)
      .list(currentPath, {
        limit: 1000,
        offset: 0,
      });

    if (error) {
      const message = String(error.message || "");

      // Missing buckets should not block account deletion. Known DB paths are
      // still removed separately where the bucket exists.
      if (message.toLowerCase().includes("bucket") || message.toLowerCase().includes("not found")) {
        console.warn(`Delete account storage prefix cleanup skipped for ${bucketName}/${currentPath}:`, message);
        return;
      }

      throw new Error(`${bucketName} storage list: ${message}`);
    }

    for (const item of data || []) {
      const itemPath = currentPath ? `${currentPath}/${item.name}` : item.name;

      if (item.id === null || item.metadata === null) {
        await walk(itemPath);
      } else {
        results.push(itemPath);
      }
    }
  }

  if (prefix) {
    await walk(prefix);
  }

  return results;
}

async function removeStoragePrefixes(supabaseAdmin, bucketName, prefixes) {
  const filesToRemove = [];

  for (const prefix of uniqueValues(prefixes)) {
    const files = await listStorageFilesRecursively(supabaseAdmin, bucketName, prefix);
    filesToRemove.push(...files);
  }

  await removeStorageFiles(supabaseAdmin, bucketName, filesToRemove);
}

async function insertDeletionLog({
  supabaseAdmin,
  user,
  request,
  reason,
  reasonDetails,
  locale,
  summary,
}) {
  const deletedAt = new Date();
  const purgeAfter = new Date(
    deletedAt.getTime() + DELETION_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );

  const payload = {
    user_id_hash: hashPrivateValue(user?.id),
    email_hash: hashPrivateValue(user?.email),
    deletion_reason: normalizeDeletionReason(reason),
    deletion_reason_details: normalizeShortText(reasonDetails, 1000) || null,
    app_locale: normalizeShortText(locale, 40) || null,
    ip_hash: hashPrivateValue(getClientIp(request)),
    user_agent_hash: hashPrivateValue(request.headers.get("user-agent") || ""),
    had_brands: Boolean(summary.brandCount),
    brand_count: summary.brandCount || 0,
    post_count: summary.postCount || 0,
    automation_rule_count: summary.ruleCount || 0,
    social_connection_count: summary.socialConnectionCount || 0,
    plan_status: summary.planStatus || null,
    deleted_at: deletedAt.toISOString(),
    purge_after: purgeAfter.toISOString(),
  };

  const { error } = await supabaseAdmin.from("account_deletion_logs").insert(payload);

  if (error) {
    if (isIgnorableOptionalError(error)) {
      console.warn("Delete account log skipped:", error.message);
      return;
    }

    throw new Error(`account_deletion_logs: ${error.message}`);
  }
}

export async function POST(request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing Supabase environment variables.",
        },
        { status: 500 }
      );
    }

    const accessToken = getBearerToken(request);

    if (!accessToken) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing access token.",
        },
        { status: 401 }
      );
    }

    let requestBody = {};

    try {
      requestBody = await request.json();
    } catch {
      requestBody = {};
    }

    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey);

    const {
      data: { user },
      error: userError,
    } = await supabaseUserClient.auth.getUser(accessToken);

    if (userError || !user?.id) {
      return NextResponse.json(
        {
          ok: false,
          error: "Not authenticated.",
        },
        { status: 401 }
      );
    }

    const userId = user.id;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const brands = await selectRowsByColumn(
      supabaseAdmin,
      "brand_profiles",
      "id, logo_storage_path",
      "user_id",
      userId
    );

    const brandIds = uniqueValues(brands.map((brand) => brand.id));
    const logoPaths = uniqueValues(
      brands.map((brand) => brand.logo_storage_path).filter(Boolean)
    );

    const rulesByUser = await selectRowsByColumn(
      supabaseAdmin,
      "automation_rules",
      "id",
      "user_id",
      userId
    );

    const rulesByBrand = await selectRowsInColumn(
      supabaseAdmin,
      "automation_rules",
      "id",
      "brand_profile_id",
      brandIds
    );

    const ruleIds = uniqueValues([
      ...rulesByUser.map((rule) => rule.id),
      ...rulesByBrand.map((rule) => rule.id),
    ]);

    const postsByUser = await selectRowsByColumn(
      supabaseAdmin,
      "posts",
      "id, image_storage_path",
      "user_id",
      userId
    );

    const postsByBrand = await selectRowsInColumn(
      supabaseAdmin,
      "posts",
      "id, image_storage_path",
      "brand_profile_id",
      brandIds
    );

    const posts = [...postsByUser, ...postsByBrand];
    const postIds = uniqueValues(posts.map((post) => post.id));
    const postImagePaths = uniqueValues(
      posts.map((post) => post.image_storage_path).filter(Boolean)
    );

    const slidesByUser = await selectRowsByColumn(
      supabaseAdmin,
      "post_slides",
      "id, post_id, image_url, metadata",
      "user_id",
      userId,
      { optional: true }
    );

    const slidesByPost = await selectRowsInColumn(
      supabaseAdmin,
      "post_slides",
      "id, post_id, image_url, metadata",
      "post_id",
      postIds,
      { optional: true }
    );

    const slideImagePaths = uniqueValues(
      [...slidesByUser, ...slidesByPost].flatMap(extractPostImagePathsFromSlide)
    );

    const socialConnections = await selectRowsByColumn(
      supabaseAdmin,
      "social_connections",
      "id",
      "user_id",
      userId,
      { optional: true }
    );

    const creditBalanceRows = await selectRowsByColumn(
      supabaseAdmin,
      "user_credit_balances",
      "subscription_status, subscription_plan, plan_name",
      "user_id",
      userId,
      { optional: true }
    );

    const planStatus =
      creditBalanceRows.find((row) => row.subscription_status)?.subscription_status ||
      creditBalanceRows.find((row) => row.subscription_plan)?.subscription_plan ||
      creditBalanceRows.find((row) => row.plan_name)?.plan_name ||
      null;

    await insertDeletionLog({
      supabaseAdmin,
      user,
      request,
      reason: requestBody?.reason,
      reasonDetails: requestBody?.reason_details || requestBody?.reasonDetails,
      locale: requestBody?.locale,
      summary: {
        brandCount: brandIds.length,
        postCount: postIds.length,
        ruleCount: ruleIds.length,
        socialConnectionCount: socialConnections.length,
        planStatus,
      },
    });

    // Remove known files first, then remove whole user-owned prefixes to catch
    // orphaned files that no longer have database rows.
    await removeStorageFiles(supabaseAdmin, POST_IMAGES_BUCKET, [
      ...postImagePaths,
      ...slideImagePaths,
    ]);

    await removeStorageFiles(supabaseAdmin, BRAND_ASSETS_BUCKET, logoPaths);

    await removeStoragePrefixes(supabaseAdmin, POST_IMAGES_BUCKET, [userId]);
    await removeStoragePrefixes(supabaseAdmin, BRAND_ASSETS_BUCKET, [`logos/${userId}`]);

    await deleteRowsByColumn(
      supabaseAdmin,
      "website_product_catalog",
      "user_id",
      userId,
      { optional: true }
    );

    await deleteRowsByColumn(
      supabaseAdmin,
      "campaign_product_candidates",
      "user_id",
      userId,
      { optional: true }
    );

    await deleteRowsInColumn(
      supabaseAdmin,
      "website_product_catalog",
      "brand_profile_id",
      brandIds,
      { optional: true }
    );

    await deleteRowsByColumn(
      supabaseAdmin,
      "website_content_history",
      "user_id",
      userId
    );

    await deleteRowsInColumn(
      supabaseAdmin,
      "website_content_history",
      "brand_profile_id",
      brandIds
    );

    await deleteRowsInColumn(
      supabaseAdmin,
      "website_content_history",
      "automation_rule_id",
      ruleIds
    );

    await deleteRowsInColumn(
      supabaseAdmin,
      "website_content_history",
      "post_id",
      postIds
    );

    await deleteRowsByColumn(
      supabaseAdmin,
      "brand_campaign_opportunities",
      "user_id",
      userId
    );

    await deleteRowsInColumn(
      supabaseAdmin,
      "brand_campaign_opportunities",
      "brand_profile_id",
      brandIds
    );

    await deleteRowsByColumn(
      supabaseAdmin,
      "brand_analysis_jobs",
      "user_id",
      userId,
      { optional: true }
    );

    await deleteRowsInColumn(
      supabaseAdmin,
      "brand_analysis_jobs",
      "brand_profile_id",
      brandIds,
      { optional: true }
    );

    await deleteRowsByColumn(
      supabaseAdmin,
      "brand_analysis_runs",
      "user_id",
      userId
    );

    await deleteRowsByColumn(
      supabaseAdmin,
      "meta_page_selection_sessions",
      "user_id",
      userId,
      { optional: true }
    );

    await deleteRowsInColumn(
      supabaseAdmin,
      "meta_page_selection_sessions",
      "brand_profile_id",
      brandIds,
      { optional: true }
    );

    await deleteRowsByColumn(
      supabaseAdmin,
      "post_slides",
      "user_id",
      userId,
      { optional: true }
    );

    await deleteRowsInColumn(
      supabaseAdmin,
      "post_slides",
      "post_id",
      postIds,
      { optional: true }
    );

    await deleteRowsByColumn(
      supabaseAdmin,
      "credit_transactions",
      "user_id",
      userId,
      { optional: true }
    );

    await deleteRowsByColumn(
      supabaseAdmin,
      "trial_claims",
      "user_id",
      userId,
      { optional: true }
    );

    await deleteRowsByColumn(
      supabaseAdmin,
      "social_connections",
      "user_id",
      userId
    );

    await deleteRowsInColumn(
      supabaseAdmin,
      "social_connections",
      "brand_profile_id",
      brandIds
    );

    await deleteRowsByColumn(
      supabaseAdmin,
      "automation_rules",
      "user_id",
      userId
    );

    await deleteRowsInColumn(
      supabaseAdmin,
      "automation_rules",
      "brand_profile_id",
      brandIds
    );

    await deleteRowsByColumn(supabaseAdmin, "posts", "user_id", userId);

    await deleteRowsInColumn(
      supabaseAdmin,
      "posts",
      "brand_profile_id",
      brandIds
    );

    await deleteRowsByColumn(
      supabaseAdmin,
      "user_credit_balances",
      "user_id",
      userId
    );

    await deleteRowsByColumn(
      supabaseAdmin,
      "brand_profiles",
      "user_id",
      userId
    );

    const { error: deleteUserError } =
      await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteUserError) {
      throw new Error(`auth.users: ${deleteUserError.message}`);
    }

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    console.error("Delete account error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Could not delete account.",
      },
      { status: 500 }
    );
  }
}

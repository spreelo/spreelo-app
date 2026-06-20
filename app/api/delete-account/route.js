import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const STORAGE_BUCKET = "post-images";

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

function normalizeStoragePath(value) {
  if (!value || typeof value !== "string") {
    return "";
  }

  let path = value.trim();

  if (!path) {
    return "";
  }

  try {
    const url = new URL(path);
    const publicMarker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
    const signedMarker = `/storage/v1/object/sign/${STORAGE_BUCKET}/`;

    if (url.pathname.includes(publicMarker)) {
      path = url.pathname.split(publicMarker)[1] || "";
    } else if (url.pathname.includes(signedMarker)) {
      path = url.pathname.split(signedMarker)[1] || "";
    }
  } catch {
    // Not a URL, keep it as a storage path.
  }

  if (path.startsWith(`${STORAGE_BUCKET}/`)) {
    path = path.replace(`${STORAGE_BUCKET}/`, "");
  }

  return decodeURIComponent(path.replace(/^\/+/, ""));
}

async function deleteRowsByColumn(supabaseAdmin, tableName, columnName, value) {
  if (!value) {
    return;
  }

  const { error } = await supabaseAdmin
    .from(tableName)
    .delete()
    .eq(columnName, value);

  if (error) {
    throw new Error(`${tableName}: ${error.message}`);
  }
}

async function deleteRowsInColumn(supabaseAdmin, tableName, columnName, values) {
  const cleanValues = uniqueValues(values);

  if (cleanValues.length === 0) {
    return;
  }

  const { error } = await supabaseAdmin
    .from(tableName)
    .delete()
    .in(columnName, cleanValues);

  if (error) {
    throw new Error(`${tableName}: ${error.message}`);
  }
}

async function selectRowsByColumn(
  supabaseAdmin,
  tableName,
  columns,
  columnName,
  value
) {
  if (!value) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from(tableName)
    .select(columns)
    .eq(columnName, value);

  if (error) {
    throw new Error(`${tableName}: ${error.message}`);
  }

  return data || [];
}

async function selectRowsInColumn(
  supabaseAdmin,
  tableName,
  columns,
  columnName,
  values
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
    throw new Error(`${tableName}: ${error.message}`);
  }

  return data || [];
}

async function removeStorageFiles(supabaseAdmin, paths) {
  const cleanPaths = uniqueValues(
    (paths || []).map((path) => normalizeStoragePath(path)).filter(Boolean)
  );

  if (cleanPaths.length === 0) {
    return;
  }

  const chunkSize = 100;

  for (let index = 0; index < cleanPaths.length; index += chunkSize) {
    const chunk = cleanPaths.slice(index, index + chunkSize);

    const { error } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .remove(chunk);

    if (error) {
      throw new Error(`${STORAGE_BUCKET} storage: ${error.message}`);
    }
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
      "id",
      "user_id",
      userId
    );

    const brandIds = uniqueValues(brands.map((brand) => brand.id));

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
    const imagePaths = uniqueValues(
      posts.map((post) => post.image_storage_path).filter(Boolean)
    );

    await removeStorageFiles(supabaseAdmin, imagePaths);

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
      "brand_analysis_runs",
      "user_id",
      userId
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

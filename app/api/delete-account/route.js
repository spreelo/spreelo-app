import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getBearerToken(request) {
  const authHeader = request.headers.get("authorization") || "";

  if (!authHeader.startsWith("Bearer ")) {
    return "";
  }

  return authHeader.replace("Bearer ", "").trim();
}

async function deleteRowsByColumn(supabaseAdmin, tableName, columnName, value) {
  const { error } = await supabaseAdmin
    .from(tableName)
    .delete()
    .eq(columnName, value);

  if (error) {
    throw new Error(`${tableName}: ${error.message}`);
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

    const supabaseAdmin = createClient(
      supabaseUrl,
      supabaseServiceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { data: brands, error: brandsError } = await supabaseAdmin
      .from("brand_profiles")
      .select("id")
      .eq("user_id", userId);

    if (brandsError) {
      throw new Error(`brand_profiles: ${brandsError.message}`);
    }

    const brandIds = (brands || []).map((brand) => brand.id);

    let ruleIds = [];
    let postIds = [];
    let imagePaths = [];

    if (brandIds.length > 0) {
      const { data: rules, error: rulesError } = await supabaseAdmin
        .from("automation_rules")
        .select("id")
        .in("brand_profile_id", brandIds);

      if (rulesError) {
        throw new Error(`automation_rules: ${rulesError.message}`);
      }

      ruleIds = (rules || []).map((rule) => rule.id);

      const { data: posts, error: postsError } = await supabaseAdmin
        .from("posts")
        .select("id, image_storage_path")
        .in("brand_profile_id", brandIds);

      if (postsError) {
        throw new Error(`posts: ${postsError.message}`);
      }

      postIds = (posts || []).map((post) => post.id);
      imagePaths = (posts || [])
        .map((post) => post.image_storage_path)
        .filter(Boolean);
    }

    if (ruleIds.length > 0) {
      const { error } = await supabaseAdmin
        .from("website_content_history")
        .delete()
        .in("automation_rule_id", ruleIds);

      if (error) {
        throw new Error(`website_content_history: ${error.message}`);
      }
    }

    if (postIds.length > 0) {
      const { error } = await supabaseAdmin
        .from("website_content_history")
        .delete()
        .in("post_id", postIds);

      if (error) {
        throw new Error(`website_content_history: ${error.message}`);
      }
    }

    if (imagePaths.length > 0) {
      const { error } = await supabaseAdmin.storage
        .from("post-images")
        .remove(imagePaths);

      if (error) {
        throw new Error(`post-images storage: ${error.message}`);
      }
    }

    if (brandIds.length > 0) {
      const brandLinkedTables = [
        "brand_campaign_opportunities",
        "automation_rules",
        "posts",
        "social_connections",
      ];

      for (const tableName of brandLinkedTables) {
        const { error } = await supabaseAdmin
          .from(tableName)
          .delete()
          .in("brand_profile_id", brandIds);

        if (error) {
          throw new Error(`${tableName}: ${error.message}`);
        }
      }
    }

    await deleteRowsByColumn(
      supabaseAdmin,
      "brand_profiles",
      "user_id",
      userId
    );

    await deleteRowsByColumn(
      supabaseAdmin,
      "user_credit_balances",
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

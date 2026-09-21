import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  createSupabaseAdminClient,
  getShopifyEnv,
  shopifyGraphqlForBrand,
} from "../../../../lib/shopifyOAuth.js";

function getUserClient(authorizationHeader) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorizationHeader } },
  });
}

const PRODUCTS_QUERY = `#graphql
query SpreeloProducts($first: Int!, $after: String) {
  products(first: $first, after: $after, sortKey: UPDATED_AT, reverse: true) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      handle
      title
      description
      descriptionHtml
      onlineStoreUrl
      productType
      vendor
      status
      tags
      featuredMedia { preview { image { url altText width height } } }
      priceRangeV2 { minVariantPrice { amount currencyCode } maxVariantPrice { amount currencyCode } }
      variants(first: 50) {
        nodes { id title sku availableForSale price image { url altText width height } }
      }
    }
  }
}`;

export async function GET(request) {
  try {
    const authorizationHeader = request.headers.get("authorization") || "";
    if (!authorizationHeader.startsWith("Bearer ")) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const supabase = getUserClient(authorizationHeader);
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.id) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const brandProfileId = String(url.searchParams.get("brand_profile_id") || "").trim();
    if (!brandProfileId) return NextResponse.json({ ok: false, error: "Missing brand" }, { status: 400 });
    const { data: brand } = await supabase.from("brand_profiles").select("id").eq("id", brandProfileId).eq("user_id", user.id).maybeSingle();
    if (!brand?.id) return NextResponse.json({ ok: false, error: "Invalid brand" }, { status: 403 });

    const admin = createSupabaseAdminClient();
    const env = getShopifyEnv();
    const first = Math.min(100, Math.max(1, Number(url.searchParams.get("first") || 50)));
    const after = url.searchParams.get("after") || null;
    const { data, connection } = await shopifyGraphqlForBrand({
      supabaseAdmin: admin,
      brandProfileId,
      apiVersion: env.apiVersion,
      query: PRODUCTS_QUERY,
      variables: { first, after },
    });
    return NextResponse.json({ ok: true, shop: connection.shop_domain, ...data.products });
  } catch (error) {
    console.error("Shopify products request failed", error);
    return NextResponse.json({ ok: false, error: error?.requiresReconnect ? "SHOPIFY_RECONNECT_REQUIRED" : (error?.message || "Could not load Shopify products") }, { status: error?.requiresReconnect ? 401 : 500 });
  }
}

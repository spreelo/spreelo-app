import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../../lib/shopifyOAuth.js";

export const dynamic = "force-dynamic";

function noStoreJson(payload, init = {}) {
  const response = NextResponse.json(payload, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request) {
  try {
    const sessionId = String(request.cookies.get("spreelo_shopify_onboarding")?.value || "").trim();
    if (!sessionId) return noStoreJson({ ok: false, error: "SHOPIFY_ONBOARDING_SESSION_MISSING" }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const { data: onboarding, error } = await admin
      .from("shopify_onboarding_sessions")
      .select("id,shop_domain,shop_name,installer_email,installer_email_verified,installer_locale,status,expires_at")
      .eq("id", sessionId)
      .maybeSingle();
    if (error) throw error;
    if (!onboarding?.id || onboarding.status !== "ready_to_claim") {
      return noStoreJson({ ok: false, error: "SHOPIFY_ONBOARDING_NOT_READY" }, { status: 409 });
    }
    if (new Date(onboarding.expires_at || 0).getTime() <= Date.now()) {
      return noStoreJson({ ok: false, error: "SHOPIFY_ONBOARDING_SESSION_EXPIRED" }, { status: 410 });
    }
    if (!onboarding.installer_email_verified || !onboarding.installer_email) {
      return noStoreJson({ ok: false, error: "SHOPIFY_EMAIL_NOT_VERIFIED" }, { status: 403 });
    }

    const metadata = {
      signup_source: "shopify_app_store",
      shopify_shop: onboarding.shop_domain,
    };
    const redirectTo = `${new URL(request.url).origin}/shopify/onboarding`;
    let linkResult = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: onboarding.installer_email,
      options: { redirectTo, data: metadata },
    });
    if (linkResult.error && /not found|does not exist/i.test(String(linkResult.error.message || ""))) {
      linkResult = await admin.auth.admin.generateLink({
        type: "signup",
        email: onboarding.installer_email,
        password: crypto.randomUUID(),
        options: { redirectTo, data: metadata },
      });
    }
    if (linkResult.error) throw linkResult.error;

    const tokenHash = String(
      linkResult.data?.properties?.hashed_token ||
      linkResult.data?.properties?.hashedToken ||
      ""
    ).trim();
    if (!tokenHash) throw new Error("Could not create seamless Spreelo session from Shopify identity");

    await admin.from("shopify_onboarding_sessions").update({
      auth_bootstrap_issued_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", onboarding.id);

    return noStoreJson({
      ok: true,
      token_hash: tokenHash,
      verification_type: "email",
      shop: {
        domain: onboarding.shop_domain,
        name: onboarding.shop_name || "Shopify Store",
      },
      locale: String(onboarding.installer_locale || "").trim(),
    });
  } catch (error) {
    console.error("Shopify onboarding bootstrap failed", error);
    return noStoreJson({ ok: false, error: error?.message || "Could not prepare Shopify onboarding." }, { status: 500 });
  }
}

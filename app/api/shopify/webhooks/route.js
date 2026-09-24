import {
  claimShopifyWebhookEvent,
  completeShopifyWebhookEvent,
  failShopifyWebhookEvent,
  getShopifyWebhookMetadata,
  isSupportedShopifyWebhookTopic,
  processShopifyWebhook,
  verifyShopifyWebhookHmac,
} from "../../../../lib/shopifyWebhooks.js";
import { createSupabaseAdminClient, getShopifyEnv } from "../../../../lib/shopifyOAuth.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function noStoreJson(body, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Cache-Control", "no-store, max-age=0");
  return Response.json(body, { ...init, headers });
}

export async function POST(request) {
  const rawBytes = Buffer.from(await request.arrayBuffer());
  const rawBody = rawBytes.toString("utf8");
  const env = getShopifyEnv();
  if (!env.clientSecret) {
    console.error("Shopify webhook rejected because SHOPIFY_CLIENT_SECRET is missing");
    return noStoreJson({ ok: false, error: "Shopify webhook verification is not configured." }, { status: 500 });
  }

  const providedHmac = request.headers.get("x-shopify-hmac-sha256");
  if (!verifyShopifyWebhookHmac(rawBytes, providedHmac, env.clientSecret)) {
    console.warn("Shopify webhook HMAC rejected");
    return noStoreJson({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const metadata = getShopifyWebhookMetadata(request.headers);
  if (!metadata.shopDomain) {
    return noStoreJson({ ok: false, error: "Invalid Shopify shop domain." }, { status: 400 });
  }

  let payload;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return noStoreJson({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const payloadShop = payload?.shop_domain ? String(payload.shop_domain).trim().toLowerCase() : "";
  if (payloadShop && payloadShop !== metadata.shopDomain) {
    console.warn("Shopify webhook shop-domain mismatch", {
      topic: metadata.topic,
      headerShop: metadata.shopDomain,
      payloadShop,
    });
    return noStoreJson({ ok: false, error: "Shop domain mismatch." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  let claim = null;
  try {
    claim = await claimShopifyWebhookEvent(admin, metadata, rawBytes);
    if (claim?.already_processed || claim?.busy) {
      return noStoreJson({ ok: true, duplicate: true });
    }

    if (!isSupportedShopifyWebhookTopic(metadata.topic)) {
      console.info("Ignoring authenticated Shopify webhook topic", {
        topic: metadata.topic,
        shopDomain: metadata.shopDomain,
        webhookId: claim?.webhookId || metadata.webhookId || null,
      });
      await completeShopifyWebhookEvent(admin, claim.webhookId);
      return noStoreJson({ ok: true, ignored: true });
    }

    const result = await processShopifyWebhook(admin, metadata);
    await completeShopifyWebhookEvent(admin, claim.webhookId);
    console.info("Shopify webhook processed", {
      topic: metadata.topic,
      shopDomain: metadata.shopDomain,
      webhookId: claim.webhookId,
      connectionCount: Number(result?.connectionCount || 0),
      affectedBrandCount: Array.isArray(result?.brandIds) ? result.brandIds.length : 0,
    });
    return noStoreJson({ ok: true });
  } catch (error) {
    await failShopifyWebhookEvent(admin, claim?.webhookId, error?.message);
    console.error("Shopify webhook processing failed", {
      topic: metadata.topic,
      shopDomain: metadata.shopDomain,
      webhookId: claim?.webhookId || metadata.webhookId || null,
      message: error?.message || String(error),
    });
    return noStoreJson({ ok: false, error: "Webhook processing failed." }, { status: 500 });
  }
}

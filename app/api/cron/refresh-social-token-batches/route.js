import { NextResponse } from "next/server";
import { scaledSocialEnabled, SCALED_SOCIAL_BATCH_HEADER, socialPlatformForMinute } from "../../../../lib/scaledSocialMaintenance.mjs";
import { GET as instagram } from "../refresh-instagram-tokens/route.js";
import { GET as threads } from "../refresh-threads-tokens/route.js";
import { GET as pinterest } from "../refresh-pinterest-tokens/route.js";
import { GET as youtube } from "../refresh-youtube-tokens/route.js";
import { GET as tiktok } from "../refresh-tiktok-tokens/route.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const handlers = { instagram, threads, pinterest, youtube, tiktok };

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!scaledSocialEnabled()) {
    return NextResponse.json({ ok: true, skipped: true, reason: "feature_disabled" });
  }
  const platform = socialPlatformForMinute(new Date().getUTCMinutes());
  if (!platform) return NextResponse.json({ ok: true, skipped: true, reason: "outside_slot" });

  // Delegate to the original tested provider logic with the same cron auth.
  // One provider per tick, at most 25 connections, no DB migration or parallel token refresh.
  const headers = new Headers(request.headers);
  headers.set(SCALED_SOCIAL_BATCH_HEADER, "1");
  const delegated = new Request(request.url, { method: "GET", headers });
  return handlers[platform](delegated);
}

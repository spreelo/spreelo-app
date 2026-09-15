import { NextResponse } from "next/server";
import { buildSocialOAuthResultUrl } from "../../../../../lib/socialOAuthResult.js";
import { authorizeSocialConnectionForTrial, getTrialRestrictionCode, preflightSocialConnectionForTrial } from "../../../../../lib/freeTrial.js";
import {
  createSupabaseAdminClient,
  exchangeTikTokCode,
  fetchTikTokCreatorInfo,
  fetchTikTokUser,
  getTikTokEnv,
  getTikTokRefreshTokenExpiresAt,
  getTikTokTokenExpiresAt,
  saveTikTokConnection,
  verifyAndDecodeTikTokState,
  verifyBrandBelongsToUser,
} from "../../../../../lib/tiktokOAuth.js";

export async function GET(request) {
  const { clientKey, clientSecret, redirectUri } = getTikTokEnv();
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const providerError = searchParams.get("error");
  const baseUrl = new URL(request.url).origin;

  if (providerError) {
    return NextResponse.redirect(buildSocialOAuthResultUrl(baseUrl, { error: "tiktok_cancelled" }));
  }
  if (!clientKey || !clientSecret || !redirectUri) {
    return NextResponse.redirect(buildSocialOAuthResultUrl(baseUrl, { error: "missing_tiktok_env" }));
  }
  if (!code || !state) {
    return NextResponse.redirect(buildSocialOAuthResultUrl(baseUrl, { error: "missing_tiktok_code" }));
  }

  const cookieState = request.cookies.get("spreelo_tiktok_oauth_state")?.value;
  if (!cookieState || cookieState !== state) {
    return NextResponse.redirect(buildSocialOAuthResultUrl(baseUrl, { error: "invalid_tiktok_state" }));
  }
  const decodedState = verifyAndDecodeTikTokState(state, clientSecret);
  if (!decodedState?.userId || !decodedState?.brandProfileId) {
    return NextResponse.redirect(buildSocialOAuthResultUrl(baseUrl, { error: "invalid_tiktok_state_payload" }));
  }

  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const brandIsValid = await verifyBrandBelongsToUser({
      supabaseAdmin,
      userId: decodedState.userId,
      brandProfileId: decodedState.brandProfileId,
    });
    if (!brandIsValid) {
      return NextResponse.redirect(buildSocialOAuthResultUrl(baseUrl, { error: "invalid_brand" }));
    }

    const token = await exchangeTikTokCode({
      code,
      clientKey,
      clientSecret,
      redirectUri: decodedState.redirectUri || redirectUri,
    });
    const grantedScopes = String(token.scope || "").split(",").map((item) => item.trim()).filter(Boolean);
    if (!grantedScopes.includes("video.publish")) {
      return NextResponse.redirect(buildSocialOAuthResultUrl(baseUrl, { error: "tiktok_publish_scope_denied" }));
    }

    const [profile, creatorInfo] = await Promise.all([
      fetchTikTokUser(token.access_token),
      fetchTikTokCreatorInfo(token.access_token),
    ]);

    await preflightSocialConnectionForTrial({
      supabaseAdmin,
      userId: decodedState.userId,
      brandProfileId: decodedState.brandProfileId,
      platform: "tiktok",
      externalAccountId: token.open_id,
    });

    await saveTikTokConnection({
      supabaseAdmin,
      userId: decodedState.userId,
      brandProfileId: decodedState.brandProfileId,
      openId: token.open_id,
      displayName: creatorInfo?.creator_nickname || profile?.display_name || "TikTok account",
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      tokenExpiresAt: getTikTokTokenExpiresAt(token.expires_in),
      refreshTokenExpiresAt: getTikTokRefreshTokenExpiresAt(token.refresh_expires_in),
      permissions: grantedScopes,
    });

    await authorizeSocialConnectionForTrial({
      supabaseAdmin,
      userId: decodedState.userId,
      brandProfileId: decodedState.brandProfileId,
      platform: "tiktok",
      externalAccountId: token.open_id,
    });

    const response = NextResponse.redirect(buildSocialOAuthResultUrl(baseUrl, { connected: "tiktok" }));
    response.cookies.delete("spreelo_tiktok_oauth_state");
    return response;
  } catch (error) {
    console.error("TikTok callback failed", error);
    const trialCode = getTrialRestrictionCode(error);
    const code = trialCode || (error?.requiresReconnect ? "tiktok_token_failed" : "tiktok_callback_failed");
    const response = NextResponse.redirect(buildSocialOAuthResultUrl(baseUrl, { error: code }));
    response.cookies.delete("spreelo_tiktok_oauth_state");
    return response;
  }
}

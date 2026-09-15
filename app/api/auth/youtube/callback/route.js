import { NextResponse } from "next/server";
import { buildSocialOAuthResultUrl } from "../../../../../lib/socialOAuthResult.js";
import { authorizeSocialConnectionForTrial, getTrialRestrictionCode, preflightSocialConnectionForTrial } from "../../../../../lib/freeTrial.js";
import {
  createSupabaseAdminClient,
  exchangeYouTubeCode,
  fetchYouTubeChannel,
  getYouTubeEnv,
  getYouTubeTokenExpiresAt,
  saveYouTubeConnection,
  verifyAndDecodeYouTubeState,
  verifyBrandBelongsToUser,
} from "../../../../../lib/youtubeOAuth.js";

export async function GET(request) {
  const baseUrl = new URL(request.url).origin;
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error") || searchParams.get("error_description");
  const { clientId, clientSecret, redirectUri } = getYouTubeEnv();

  if (oauthError) return NextResponse.redirect(buildSocialOAuthResultUrl(baseUrl, { error: "youtube_cancelled" }));
  if (!clientId || !clientSecret || !redirectUri) return NextResponse.redirect(buildSocialOAuthResultUrl(baseUrl, { error: "missing_youtube_env" }));
  if (!code || !state) return NextResponse.redirect(buildSocialOAuthResultUrl(baseUrl, { error: "missing_youtube_code" }));

  const cookieState = request.cookies.get("spreelo_youtube_oauth_state")?.value;
  if (!cookieState || cookieState !== state) {
    return NextResponse.redirect(buildSocialOAuthResultUrl(baseUrl, { error: "invalid_youtube_state" }));
  }

  const decoded = verifyAndDecodeYouTubeState(state, clientSecret);
  if (!decoded?.userId || !decoded?.brandProfileId) {
    return NextResponse.redirect(buildSocialOAuthResultUrl(baseUrl, { error: "invalid_youtube_state_payload" }));
  }

  let callbackStage = "initializing";
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    callbackStage = "brand";
    const validBrand = await verifyBrandBelongsToUser({
      supabaseAdmin,
      userId: decoded.userId,
      brandProfileId: decoded.brandProfileId,
    });
    if (!validBrand) return NextResponse.redirect(buildSocialOAuthResultUrl(baseUrl, { error: "invalid_brand" }));

    callbackStage = "token";
    const token = await exchangeYouTubeCode({
      code,
      clientId,
      clientSecret,
      redirectUri: decoded.redirectUri || redirectUri,
    });

    callbackStage = "channel";
    let channel;
    try {
      channel = await fetchYouTubeChannel(token.access_token);
    } catch (error) {
      if (error?.code === "no_youtube_channel") {
        const response = NextResponse.redirect(buildSocialOAuthResultUrl(baseUrl, { error: "no_youtube_channel" }));
        response.cookies.delete("spreelo_youtube_oauth_state");
        return response;
      }
      throw error;
    }

    callbackStage = "trial_preflight";
    await preflightSocialConnectionForTrial({
      supabaseAdmin, userId: decoded.userId, brandProfileId: decoded.brandProfileId,
      platform: "youtube", externalAccountId: channel.id,
    });

    callbackStage = "save";
    await saveYouTubeConnection({
      supabaseAdmin,
      userId: decoded.userId,
      brandProfileId: decoded.brandProfileId,
      channel,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      tokenExpiresAt: getYouTubeTokenExpiresAt(token.expires_in),
    });

    callbackStage = "trial";
    await authorizeSocialConnectionForTrial({
      supabaseAdmin, userId: decoded.userId, brandProfileId: decoded.brandProfileId,
      platform: "youtube", externalAccountId: channel.id,
    });

    const response = NextResponse.redirect(buildSocialOAuthResultUrl(baseUrl, { connected: "youtube" }));
    response.cookies.delete("spreelo_youtube_oauth_state");
    return response;
  } catch (error) {
    console.error(`YouTube OAuth callback failed at ${callbackStage}`, {
      message: error?.message,
      stack: error?.stack,
    });
    const trialCode = getTrialRestrictionCode(error);
    const response = NextResponse.redirect(buildSocialOAuthResultUrl(baseUrl, { error: trialCode || "youtube_callback_failed" }));
    response.cookies.delete("spreelo_youtube_oauth_state");
    return response;
  }
}

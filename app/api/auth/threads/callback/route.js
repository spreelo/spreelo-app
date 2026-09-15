import { NextResponse } from "next/server";
import { buildSocialOAuthResultUrl } from "../../../../../lib/socialOAuthResult";
import { authorizeSocialConnectionForTrial, getTrialRestrictionCode, preflightSocialConnectionForTrial } from "../../../../../lib/freeTrial.js";
import {
  createSupabaseAdminClient,
  exchangeThreadsCodeForShortToken,
  exchangeThreadsShortTokenForLongToken,
  getThreadsEnv,
  getThreadsProfile,
  getThreadsTokenExpiresAt,
  saveThreadsConnection,
  verifyAndDecodeThreadsState,
  verifyBrandBelongsToUser,
} from "../../../../../lib/threadsOAuth";

export async function GET(request) {
  const baseUrl = new URL(request.url).origin;
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error") || searchParams.get("error_description");
  const { appId, appSecret, redirectUri } = getThreadsEnv();

  if (oauthError) return NextResponse.redirect(buildSocialOAuthResultUrl(baseUrl, { error: "threads_cancelled" }));
  if (!appId || !appSecret || !redirectUri) return NextResponse.redirect(buildSocialOAuthResultUrl(baseUrl, { error: "missing_threads_env" }));
  if (!code || !state) return NextResponse.redirect(buildSocialOAuthResultUrl(baseUrl, { error: "missing_threads_code" }));

  const cookieState = request.cookies.get("spreelo_threads_oauth_state")?.value;
  if (!cookieState || cookieState !== state) {
    return NextResponse.redirect(buildSocialOAuthResultUrl(baseUrl, { error: "invalid_threads_state" }));
  }

  const decoded = verifyAndDecodeThreadsState(state, appSecret);
  if (!decoded?.userId || !decoded?.brandProfileId) {
    return NextResponse.redirect(buildSocialOAuthResultUrl(baseUrl, { error: "invalid_threads_state_payload" }));
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
    const shortToken = await exchangeThreadsCodeForShortToken({
      code,
      appId,
      appSecret,
      redirectUri: decoded.redirectUri || redirectUri,
    });

    callbackStage = "long_token";
    const longToken = await exchangeThreadsShortTokenForLongToken({
      shortLivedToken: shortToken.accessToken,
      appSecret,
    });

    callbackStage = "profile";
    const profile = await getThreadsProfile(longToken.accessToken);
    const threadsUserId = profile?.id || shortToken.userId;
    if (!threadsUserId) throw new Error("Threads profile did not return a user id");

    callbackStage = "trial_preflight";
    await preflightSocialConnectionForTrial({
      supabaseAdmin, userId: decoded.userId, brandProfileId: decoded.brandProfileId,
      platform: "threads", externalAccountId: threadsUserId,
    });

    callbackStage = "save";
    await saveThreadsConnection({
      supabaseAdmin,
      userId: decoded.userId,
      brandProfileId: decoded.brandProfileId,
      threadsUserId,
      username: profile?.username,
      accessToken: longToken.accessToken,
      tokenExpiresAt: getThreadsTokenExpiresAt(longToken.expiresIn),
    });

    callbackStage = "trial";
    await authorizeSocialConnectionForTrial({
      supabaseAdmin, userId: decoded.userId, brandProfileId: decoded.brandProfileId,
      platform: "threads", externalAccountId: threadsUserId,
    });

    const response = NextResponse.redirect(buildSocialOAuthResultUrl(baseUrl, { connected: "threads" }));
    response.cookies.delete("spreelo_threads_oauth_state");
    return response;
  } catch (error) {
    console.error(`Threads OAuth callback failed at ${callbackStage}`, {
      message: error?.message,
      stack: error?.stack,
    });
    const trialCode = getTrialRestrictionCode(error);
    const response = NextResponse.redirect(buildSocialOAuthResultUrl(baseUrl, { error: trialCode || "threads_callback_failed" }));
    response.cookies.delete("spreelo_threads_oauth_state");
    return response;
  }
}

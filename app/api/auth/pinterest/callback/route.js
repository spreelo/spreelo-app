import { NextResponse } from "next/server";
import { buildSocialOAuthResultUrl } from "../../../../../lib/socialOAuthResult";
import { getTrialRestrictionCode, preflightSocialConnectionForTrial } from "../../../../../lib/freeTrial.js";
import {
  createSupabaseAdminClient,
  exchangePinterestCode,
  fetchPinterestUserAccount,
  getPinterestEnv,
  savePendingPinterestConnection,
  isPinterestSchemaError,
  verifyAndDecodePinterestState,
  verifyBrandBelongsToUser,
} from "../../../../../lib/pinterestOAuth";

export async function GET(request) {
  const baseUrl = new URL(request.url).origin;
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error") || searchParams.get("error_description");
  const { appId, appSecret, redirectUri } = getPinterestEnv();

  if (oauthError) return NextResponse.redirect(buildSocialOAuthResultUrl(baseUrl, { error: "pinterest_cancelled" }));
  if (!appId || !appSecret || !redirectUri) return NextResponse.redirect(buildSocialOAuthResultUrl(baseUrl, { error: "missing_pinterest_env" }));
  if (!code || !state) return NextResponse.redirect(buildSocialOAuthResultUrl(baseUrl, { error: "missing_pinterest_code" }));

  const cookieState = request.cookies.get("spreelo_pinterest_oauth_state")?.value;
  if (!cookieState || cookieState !== state) return NextResponse.redirect(buildSocialOAuthResultUrl(baseUrl, { error: "invalid_pinterest_state" }));

  const decoded = verifyAndDecodePinterestState(state, appSecret);
  if (!decoded?.userId || !decoded?.brandProfileId) return NextResponse.redirect(buildSocialOAuthResultUrl(baseUrl, { error: "invalid_pinterest_state_payload" }));

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
    const token = await exchangePinterestCode({
      code,
      appId,
      appSecret,
      redirectUri: decoded.redirectUri || redirectUri,
    });

    callbackStage = "account";
    const account = await fetchPinterestUserAccount(token.access_token);

    callbackStage = "trial_preflight";
    await preflightSocialConnectionForTrial({
      supabaseAdmin,
      userId: decoded.userId,
      brandProfileId: decoded.brandProfileId,
      platform: "pinterest",
      externalAccountId: String(account?.id || account?.username || "").trim(),
    });

    callbackStage = "save";
    const connectionId = await savePendingPinterestConnection({
      supabaseAdmin,
      userId: decoded.userId,
      brandProfileId: decoded.brandProfileId,
      account,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresIn: token.expires_in,
      refreshTokenExpiresIn: token.refresh_token_expires_in,
      refreshTokenExpiresAt: token.refresh_token_expires_at,
      scope: token.scope,
    });

    const response = NextResponse.redirect(
      `${baseUrl}/social-channels/pinterest/select?connection_id=${encodeURIComponent(connectionId)}`
    );
    response.cookies.delete("spreelo_pinterest_oauth_state");
    return response;
  } catch (error) {
    console.error(`Pinterest OAuth callback failed at ${callbackStage}`, error);
    const trialCode = getTrialRestrictionCode(error);
    const errorCode = trialCode || (callbackStage === "token"
      ? "pinterest_token_failed"
      : callbackStage === "account"
        ? "pinterest_account_failed"
        : callbackStage === "save" && isPinterestSchemaError(error)
          ? "pinterest_schema_missing"
          : callbackStage === "save"
            ? "pinterest_save_failed"
            : "pinterest_callback_failed");
    const response = NextResponse.redirect(buildSocialOAuthResultUrl(baseUrl, { error: errorCode }));
    response.cookies.delete("spreelo_pinterest_oauth_state");
    return response;
  }
}

import { NextResponse } from "next/server";
import {
  createSupabaseAdminClient,
  exchangeInstagramCodeForShortToken,
  exchangeInstagramShortTokenForLongToken,
  getInstagramEnv,
  getInstagramProfile,
  getInstagramTokenExpiresAt,
  saveInstagramConnection,
  verifyAndDecodeInstagramState,
  verifyBrandBelongsToUser,
} from "../../../../../lib/instagramOAuth";

function getInstagramProfileId(profile, fallbackUserId) {
  return (
    profile?.user_id ||
    profile?.id ||
    fallbackUserId ||
    null
  );
}

export async function GET(request) {
  const { appId, appSecret, redirectUri } = getInstagramEnv();
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorReason = searchParams.get("error_reason");

  const baseUrl = new URL(request.url).origin;

  if (error || errorReason) {
    return NextResponse.redirect(
      `${baseUrl}/social-channels?error=instagram_cancelled`
    );
  }

  if (!appId || !appSecret) {
    return NextResponse.redirect(
      `${baseUrl}/social-channels?error=missing_instagram_env`
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${baseUrl}/social-channels?error=missing_instagram_code`
    );
  }

  const cookieState = request.cookies.get("spreelo_instagram_oauth_state")?.value;

  if (!cookieState || cookieState !== state) {
    return NextResponse.redirect(
      `${baseUrl}/social-channels?error=invalid_instagram_state`
    );
  }

  const decodedState = verifyAndDecodeInstagramState(state, appSecret);

  if (!decodedState?.userId) {
    return NextResponse.redirect(
      `${baseUrl}/social-channels?error=invalid_instagram_state_payload`
    );
  }

  if (!decodedState?.brandProfileId) {
    return NextResponse.redirect(
      `${baseUrl}/social-channels?error=missing_brand`
    );
  }

  try {
    const supabaseAdmin = createSupabaseAdminClient();

    const brandIsValid = await verifyBrandBelongsToUser({
      supabaseAdmin,
      userId: decodedState.userId,
      brandProfileId: decodedState.brandProfileId,
    });

    if (!brandIsValid) {
      return NextResponse.redirect(
        `${baseUrl}/social-channels?error=invalid_brand`
      );
    }

    const shortTokenResult = await exchangeInstagramCodeForShortToken({
      code,
      appId,
      appSecret,
      redirectUri,
    });

    const longTokenResult = await exchangeInstagramShortTokenForLongToken({
      shortLivedToken: shortTokenResult.accessToken,
      appSecret,
    });

    const profile = await getInstagramProfile(longTokenResult.accessToken);
    const instagramUserId = getInstagramProfileId(profile, shortTokenResult.userId);

    if (!instagramUserId) {
      throw new Error("Instagram profile did not return a user id");
    }

    const tokenExpiresAt = getInstagramTokenExpiresAt(longTokenResult.expiresIn);

    await saveInstagramConnection({
      supabaseAdmin,
      userId: decodedState.userId,
      brandProfileId: decodedState.brandProfileId,
      instagramUserId,
      username: profile?.username,
      accessToken: longTokenResult.accessToken,
      tokenExpiresAt,
      permissions: [
        "instagram_business_basic",
        "instagram_business_content_publish",
      ],
      profile,
    });

    const response = NextResponse.redirect(
      `${baseUrl}/social-channels?connected=instagram`
    );

    response.cookies.delete("spreelo_instagram_oauth_state");

    return response;
  } catch (callbackError) {
    console.error("Instagram callback error:", callbackError);

    return NextResponse.redirect(
      `${baseUrl}/social-channels?error=instagram_callback_failed`
    );
  }
}

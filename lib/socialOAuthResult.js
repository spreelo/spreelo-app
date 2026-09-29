export const SOCIAL_OAUTH_RESULT_PATH = "/social-channels/oauth-complete";

export function buildSocialOAuthResultUrl(baseUrl, { connected = "", error = "", pinterestTestPin = "", trialNotice = "" } = {}) {
  const url = new URL(SOCIAL_OAUTH_RESULT_PATH, baseUrl);
  if (connected) url.searchParams.set("connected", connected);
  if (error) url.searchParams.set("error", error);
  if (pinterestTestPin) url.searchParams.set("pinterest_test_pin", pinterestTestPin);
  if (trialNotice) url.searchParams.set("trial_notice", trialNotice);
  return url.toString();
}

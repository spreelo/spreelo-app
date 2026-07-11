import { assertPublicHttpUrl } from "./security.js";

export const WEBSITE_FETCH_TIMEOUT_MS = 20000;
export const WEBSITE_FETCH_TOTAL_TIMEOUT_MS = 45000;
export const WEBSITE_FETCH_MAX_ATTEMPTS = 4;
export const WEBSITE_FETCH_MAX_REDIRECTS = 8;

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "sv-SE,sv;q=0.9,en-US;q=0.8,en;q=0.7,*;q=0.5",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
};

const CRAWLER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (compatible; SpreeloBot/1.1; +https://app.spreelo.com)",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "*",
};

function normalizePositiveInteger(value, fallback, minimum = 1, maximum = 120000) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(number)));
}

function toggleWwwHostname(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname.toLowerCase().startsWith("www.")) {
      parsed.hostname = parsed.hostname.slice(4);
    } else {
      parsed.hostname = `www.${parsed.hostname}`;
    }
    return parsed.toString();
  } catch {
    return "";
  }
}

export function buildWebsiteFetchAttemptPlan(rawUrl, maxAttempts = WEBSITE_FETCH_MAX_ATTEMPTS) {
  const alternateUrl = toggleWwwHostname(rawUrl);
  const urls = [...new Set([rawUrl, alternateUrl].filter(Boolean))];
  const plan = [];

  for (const url of urls) {
    plan.push({ url, profile: "browser", headers: BROWSER_HEADERS });
  }
  for (const url of urls) {
    plan.push({ url, profile: "crawler", headers: CRAWLER_HEADERS });
  }

  return plan.slice(0, normalizePositiveInteger(maxAttempts, WEBSITE_FETCH_MAX_ATTEMPTS, 1, 8));
}

function isRedirectStatus(status) {
  return [301, 302, 303, 307, 308].includes(Number(status));
}

function looksLikeHtml(value) {
  return /^\s*(?:<!doctype\s+html|<html|<head|<body)/iu.test(String(value || ""));
}

function formatAttemptFailure(error) {
  if (error?.name === "AbortError") return "timeout";
  return String(error?.message || "fetch failed").replace(/\s+/gu, " ").slice(0, 240);
}

async function fetchWithSafeRedirects({ url, headers, signal, maxRedirects }) {
  let currentUrl = await assertPublicHttpUrl(url);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await fetch(currentUrl, {
      method: "GET",
      redirect: "manual",
      signal,
      headers,
    });

    if (!isRedirectStatus(response.status)) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new Error(`Website returned redirect ${response.status} without a location`);
    }
    if (redirectCount >= maxRedirects) {
      throw new Error(`Website exceeded ${maxRedirects} redirects`);
    }

    const redirectUrl = new URL(location, currentUrl).toString();
    currentUrl = await assertPublicHttpUrl(redirectUrl);
  }

  throw new Error("Website redirect handling failed");
}

/**
 * Fetches HTML with bounded retries. Calls that pass an explicit short timeout
 * default to one attempt, keeping product/context-page probing inexpensive.
 * The homepage call uses four attempts inside one shared 45-second budget.
 */
export async function fetchWebsiteHtmlRobust(websiteUrl, options = {}) {
  const normalizedUrl = String(websiteUrl || "").trim();
  if (!normalizedUrl) throw new Error("Website URL is required");

  const timeoutMs = normalizePositiveInteger(
    options.timeoutMs,
    WEBSITE_FETCH_TIMEOUT_MS,
    1000,
    60000
  );
  const defaultAttempts = options.timeoutMs ? 1 : WEBSITE_FETCH_MAX_ATTEMPTS;
  const maxAttempts = normalizePositiveInteger(
    options.maxAttempts,
    defaultAttempts,
    1,
    8
  );
  const totalTimeoutMs = normalizePositiveInteger(
    options.totalTimeoutMs,
    maxAttempts === 1 ? timeoutMs : WEBSITE_FETCH_TOTAL_TIMEOUT_MS,
    1000,
    120000
  );
  const maxRedirects = normalizePositiveInteger(
    options.maxRedirects,
    WEBSITE_FETCH_MAX_REDIRECTS,
    1,
    12
  );
  const deadline = Date.now() + totalTimeoutMs;
  const attempts = buildWebsiteFetchAttemptPlan(normalizedUrl, maxAttempts);
  const failures = [];

  for (let index = 0; index < attempts.length; index += 1) {
    const remainingMs = deadline - Date.now();
    if (remainingMs < 500) break;

    const attempt = attempts[index];
    const controller = new AbortController();
    const attemptTimeoutMs = Math.min(timeoutMs, remainingMs);
    const timeoutId = setTimeout(() => controller.abort(), attemptTimeoutMs);

    try {
      const response = await fetchWithSafeRedirects({
        url: attempt.url,
        headers: attempt.headers,
        signal: controller.signal,
        maxRedirects,
      });

      if (!response.ok) {
        throw new Error(`Website returned ${response.status}`);
      }

      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      const html = await response.text();
      const readableTextContent =
        Boolean(options.allowReadableText) &&
        /(?:application\/(?:xhtml\+xml|xml)|text\/(?:html|xml|plain))/iu.test(contentType);
      if (!contentType.includes("text/html") && !looksLikeHtml(html) && !readableTextContent) {
        throw new Error(`Website did not return HTML (${contentType || "unknown content type"})`);
      }
      if (!html.trim()) {
        throw new Error("Website returned empty HTML");
      }

      return {
        url: response.url || attempt.url,
        html,
        fetch: {
          attempt_count: index + 1,
          profile: attempt.profile,
          used_www_fallback: attempt.url !== normalizedUrl,
        },
      };
    } catch (error) {
      failures.push({
        attempt: index + 1,
        profile: attempt.profile,
        url: attempt.url,
        reason: formatAttemptFailure(error),
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  const summary = failures
    .map((failure) => `#${failure.attempt} ${failure.profile}: ${failure.reason}`)
    .join("; ")
    .slice(0, 1400);
  throw new Error(
    `Website fetch failed after ${failures.length || attempts.length} bounded attempts.${summary ? ` ${summary}` : ""}`
  );
}

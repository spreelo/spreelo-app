import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const DEFAULT_TIME_ZONE = "Europe/Stockholm";
const BATCH_SIZE = 25;
const APP_URL = "https://app.spreelo.com";
const RESEND_FROM_EMAIL = "Spreelo <noreply@spreelo.com>";
const WEBSITE_FETCH_TIMEOUT_MS = 12000;
const WEBSITE_MAX_PAGES = 8;
const WEBSITE_MAX_TEXT_CHARS_PER_PAGE = 6500;
const WEBSITE_MAX_TOTAL_TEXT_CHARS = 22000;
const WEBSITE_MAX_IMAGE_CANDIDATES = 40;

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function getRuleTimeZone(rule) {
  return rule?.timezone || DEFAULT_TIME_ZONE;
}

function normalizeTime(value) {
  return String(value || "").slice(0, 5);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatPostContentForHtml(content) {
  return escapeHtml(content).replace(/\n/g, "<br />");
}

function getDateYYYYMMDDInTimeZone(
  date = new Date(),
  timeZone = DEFAULT_TIME_ZONE
) {
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(date);
}

function getWeekdayInTimeZone(date = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone,
  }).format(date);
}

function getTimeHHMMInTimeZone(date = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  return new Intl.DateTimeFormat("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(date);
}

function getDatePartsInTimeZone(
  date = new Date(),
  timeZone = DEFAULT_TIME_ZONE
) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).formatToParts(date);

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function getTimeZoneOffsetMs(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).formatToParts(date);

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );

  return asUtc - date.getTime();
}

function zonedLocalToUtcDate({
  year,
  month,
  day,
  hour = 0,
  minute = 0,
  second = 0,
  timeZone = DEFAULT_TIME_ZONE,
}) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);

  let offset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  let utcTime = utcGuess - offset;

  const correctedOffset = getTimeZoneOffsetMs(new Date(utcTime), timeZone);

  if (correctedOffset !== offset) {
    utcTime = utcGuess - correctedOffset;
  }

  return new Date(utcTime);
}

function hasAlreadyRunToday(rule, now = new Date()) {
  if (!rule.last_run_at) return false;

  const timeZone = getRuleTimeZone(rule);

  const lastRunDate = getDateYYYYMMDDInTimeZone(
    new Date(rule.last_run_at),
    timeZone
  );

  const today = getDateYYYYMMDDInTimeZone(now, timeZone);

  return lastRunDate === today;
}

function isRuleDueByOldSchedule(rule, now = new Date()) {
  const publishTime = normalizeTime(rule.publish_time);
  const timeZone = getRuleTimeZone(rule);

  if (!rule.is_active) return false;
  if (!publishTime) return false;

  const today = getDateYYYYMMDDInTimeZone(now, timeZone);
  const currentWeekday = getWeekdayInTimeZone(now, timeZone);
  const currentTime = getTimeHHMMInTimeZone(now, timeZone);

  if (rule.schedule_type === "once") {
    if (!rule.run_date) return false;

    if (rule.run_date < today) return true;

    return rule.run_date === today && publishTime <= currentTime;
  }

  if (rule.schedule_type === "weekly") {
    if (!rule.weekday) return false;

    return (
      String(rule.weekday).toLowerCase() ===
        String(currentWeekday).toLowerCase() && publishTime <= currentTime
    );
  }

  return false;
}

function getNextWeeklyRunAtIso(rule, now = new Date()) {
  const publishTime = normalizeTime(rule.publish_time);
  const timeZone = getRuleTimeZone(rule);

  if (!rule.weekday || !publishTime) {
    return null;
  }

  const [hourValue, minuteValue] = publishTime.split(":");

  const hour = Number(hourValue);
  const minute = Number(minuteValue);

  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  const targetWeekdayIndex = WEEKDAYS.findIndex(
    (weekday) => weekday.toLowerCase() === String(rule.weekday).toLowerCase()
  );

  if (targetWeekdayIndex === -1) {
    return null;
  }

  const currentWeekday = getWeekdayInTimeZone(now, timeZone);

  const currentWeekdayIndex = WEEKDAYS.findIndex(
    (weekday) =>
      weekday.toLowerCase() === String(currentWeekday).toLowerCase()
  );

  if (currentWeekdayIndex === -1) {
    return null;
  }

  let daysUntilNextRun =
    (targetWeekdayIndex - currentWeekdayIndex + 7) % 7;

  if (daysUntilNextRun === 0) {
    daysUntilNextRun = 7;
  }

  const localParts = getDatePartsInTimeZone(now, timeZone);

  const nextRunUtcDate = zonedLocalToUtcDate({
    year: localParts.year,
    month: localParts.month,
    day: localParts.day + daysUntilNextRun,
    hour,
    minute,
    second: 0,
    timeZone,
  });

  return nextRunUtcDate.toISOString();
}

function getRuleUpdatePayloadAfterSuccess(rule, nowIso, now) {
  const payload = {
    last_run_at: nowIso,
    last_error: null,
    updated_at: nowIso,
  };

  if (rule.schedule_type === "once") {
    payload.is_active = false;
    payload.next_run_at = null;
  }

  if (rule.schedule_type === "weekly") {
    payload.next_run_at = getNextWeeklyRunAtIso(rule, now);
  }

  return payload;
}

function getLanguageInstruction(language) {
  if (!language || language === "Auto") {
    return `
Language: Auto-detect from the user's instruction.

Important language rule:
- Write the final post in the same language as the user's instruction.
- If the user's instruction is in Swedish, write the post in Swedish.
- If the user's instruction is in English, write the post in English.
- If the user's instruction is in Danish, Norwegian, German, Spanish, French or any other language, write the post in that same language.
- Do not translate to English unless the user specifically asks for English.
`.trim();
  }

  if (language === "English") {
    return `
Language: English.

Important language rule:
- Write the final post in English, even if the user's instruction is written in another language.
`.trim();
  }

  return `
Language: ${language}.

Important language rule:
- Write the final post in ${language}.
`.trim();
}

function formatBrandProfileForPrompt(brandProfile) {
  if (!brandProfile) {
    return `
No brand profile was found for this user.

Important:
- Do not invent a random business.
- Use only the user instruction and automation settings.
- If the user instruction is too generic, keep the post broadly useful but avoid pretending to know a specific industry.
`.trim();
  }

  return `
Business name: ${brandProfile.business_name || "Not provided"}
Website URL: ${brandProfile.website_url || "Not provided"}
Industry / business type: ${brandProfile.industry || "Not provided"}
Target audience: ${brandProfile.target_audience || "Not provided"}
`.trim();
}

function formatWebsiteItemForPrompt(websiteItem) {
  if (!websiteItem) {
    return "No specific website item was selected.";
  }

  return `
Selected website item:
Title: ${websiteItem.title || "Not provided"}
Type: ${websiteItem.type || "Not provided"}
URL: ${websiteItem.url || "Not provided"}
Description: ${websiteItem.description || "Not provided"}
Price: ${websiteItem.price || "Not provided"}
Image URL: ${websiteItem.image_url || "Not provided"}

Important website item rules:
- Base this post on the selected website item above.
- Use only details that are present in the selected item information.
- Do not invent prices, discounts, guarantees, availability, dates, addresses, square meters, specifications or claims.
- If a price is provided above, you may mention it in the post.
- If no price is provided above, do not mention a price.
- If information is missing, write around the value and benefit instead of inventing facts.
`.trim();
}

function buildAutomationPrompt(rule) {
  const brandProfileText = formatBrandProfileForPrompt(rule.brand_profile);
  const websiteItemText = formatWebsiteItemForPrompt(rule.website_item);

  return `
Create a ready-to-publish social media post.

Brand profile:
${brandProfileText}

${
  rule.uses_website_content
    ? `
Website content mode:
This automation rule is supposed to promote one concrete product, service, listing, offer or other sellable item from the business website.

${websiteItemText}
`.trim()
    : ""
}

Platform: ${rule.platform || "Instagram"}
${getLanguageInstruction(rule.language)}
Tone: ${rule.tone || "Professional"}
Post type: ${rule.post_type || "General post"}
Length: ${rule.length || "Medium"}
CTA type: ${rule.cta_type || "Soft CTA"}
Website URL: ${
    rule.brand_profile?.website_url || rule.website_url || "Not provided"
  }

Include emojis: ${rule.include_emojis ? "Yes" : "No"}
Include hashtags: ${rule.include_hashtags ? "Yes" : "No"}

User instruction:
${rule.prompt || ""}

Critical brand relevance rules:
- The post must clearly fit the Brand profile.
- Do not invent another type of business.
- Do not write generic advice that could apply to any random company.
- Do not write about shopping, product care, cars, restaurants, salons, real estate or other unrelated industries unless the Brand profile says that is the business.
- Use the User instruction as the content angle or post type, but always adapt it to the Brand profile.
- If this is Website content mode, focus on the selected website item.
- If the User instruction says "common mistakes", write common mistakes related to this specific business, industry and audience.
- If the User instruction says "tips", write tips related to this specific business, industry and audience.
- If the User instruction says "FAQ", answer a question that would make sense for this specific business, industry and audience.
- If the User instruction says "behind the scenes", describe something that would realistically happen in this specific business.
- Keep the content useful, specific and trustworthy.

Output rules:
- Return only the final post text.
- Do not explain anything.
- Make it suitable for the selected platform.
- If emojis are disabled, do not use emojis.
- If hashtags are enabled, include relevant hashtags at the end.
- If hashtags are disabled, do not include hashtags.
`.trim();
}

function pickVisualConcept(rule, postContent) {
  const concepts = [
    {
      name: "Environment / setting",
      instruction:
        "Show a relevant environment or setting connected to the business, service or topic. Make it feel natural, professional and brand-appropriate.",
    },
    {
      name: "Detail / close-up",
      instruction:
        "Show a close-up detail that represents the business, service, product or topic. Focus on atmosphere, texture, quality and visual clarity.",
    },
    {
      name: "Human situation",
      instruction:
        "Show a realistic human situation connected to the post topic. The scene should feel natural, respectful and not overly staged. Avoid showing faces clearly unless it fits naturally.",
    },
    {
      name: "Service in focus",
      instruction:
        "Visualize the service or value being provided, without making unrealistic claims. Show the benefit or context in a professional and believable way.",
    },
    {
      name: "Before / after feeling",
      instruction:
        "Create a visual sense of improvement, change, clarity or progress. Do not use split-screen before/after unless explicitly requested.",
    },
    {
      name: "Local / seasonal context",
      instruction:
        "Use a local, seasonal or time-specific feeling if it fits the post. Make it relevant without adding text or obvious clichés.",
    },
    {
      name: "Symbolic / conceptual",
      instruction:
        "Create a symbolic or conceptual image that supports the message in a tasteful, premium and easy-to-understand way.",
    },
    {
      name: "Behind the scenes",
      instruction:
        "Show a behind-the-scenes style image connected to the business or process. It should feel authentic, calm and trustworthy.",
    },
  ];

  const seed = `${rule.id || ""}-${rule.last_run_at || ""}-${
    rule.next_run_at || ""
  }-${postContent || ""}`;

  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(index);
    hash |= 0;
  }

  const selectedIndex = Math.abs(hash) % concepts.length;

  return concepts[selectedIndex];
}

function buildImagePrompt(rule, postContent) {
  const hasCustomImagePrompt = Boolean(
    rule.image_prompt && String(rule.image_prompt).trim()
  );

  const visualConcept = pickVisualConcept(rule, postContent);
  const brandProfileText = formatBrandProfileForPrompt(rule.brand_profile);
  const websiteItemText = formatWebsiteItemForPrompt(rule.website_item);

  return `
Create one high-quality square social media image for a business post.

Brand profile:
${brandProfileText}

${
  rule.uses_website_content
    ? `
Website content mode:
${websiteItemText}
`.trim()
    : ""
}

This image must be adapted to the specific business, industry, post topic and audience.
Do not create a generic stock-photo image unless that clearly fits the business.
Do not invent a different type of company than the one described in the Brand profile.

Platform: ${rule.platform || "Facebook"}
Tone: ${rule.tone || "Professional"}
Post type: ${rule.post_type || "General post"}
Language context: ${rule.language || "Auto"}
Website URL: ${rule.brand_profile?.website_url || "Not provided"}

Selected visual concept:
${visualConcept.name}

Visual concept instruction:
${visualConcept.instruction}

User's post instruction:
${rule.prompt || "Not provided"}

Final post text this image should support:
${postContent}

${
  hasCustomImagePrompt
    ? `
Customer's visual direction:
${rule.image_prompt}

Follow this visual direction closely, but do not repeat the exact same scene every time.
Use the selected visual concept above to create variation.
`.trim()
    : `
No custom visual direction was provided.

Create a professional marketing image that fits the business and post naturally.
Infer the visual style from the brand profile, selected website item, user instruction, post text, platform, tone, post type and selected visual concept.
`.trim()
}

Image quality rules:
- The image must feel relevant to the specific business and post, not random.
- Use a clear visual subject or scene that supports the message.
- Make it visually attractive, polished and suitable for social media.
- Avoid repeating the same composition every time.
- Avoid cluttered compositions.
- Avoid fake-looking generic stock photo style when possible.
- Avoid exaggerated, misleading or unrealistic visuals.
- Do not include logos unless explicitly requested.
- Do not include readable text in the image unless explicitly requested.
- Do not include watermarks.
- Do not add UI elements, buttons, mockups or app screens unless explicitly requested.
- Do not use cartoon style unless explicitly requested.
- Make the image suitable for both Facebook and Instagram feed use.
- Keep the image clean, premium and easy to understand at a glance.

Product image safety rules:
- If this post is based on a specific website item but no real website image is being used, do not recreate, imitate or invent a product image.
- Do not create fake versions of branded products, packaging, logos, mascots, characters, toy designs or trademarked styles.
- Do not create fake LEGO, DUPLO, Paw Patrol, Disney, Marvel, Barbie, Pokemon, Nintendo or other branded product images.
- If a real product image is not available from the website, create a generic unbranded lifestyle or campaign image that supports the occasion, feeling or use case instead.
- The fallback image should not focus on the exact selected product. It should focus on the broader campaign theme, such as family time, gift giving, play, celebration, shopping inspiration or seasonal atmosphere.
- For product-based website posts, never make the AI image look like an official product photo unless the image is the original website image.

Output only the image.
`.trim();
}

function createEmptySummary() {
  return {
    processed: 0,
    generated: 0,
    skipped: 0,
    errors: 0,
    warnings: 0,
    pending_approval: 0,
    draft: 0,
    image_generated: 0,
    image_generation_failed: 0,
    not_enough_credits: 0,
    no_credit_balance: 0,
    emails_sent: 0,
    emails_failed: 0,
    facebook_publish_checked: 0,
    facebook_published: 0,
    facebook_publish_failed: 0,
    facebook_publish_skipped_no_config: 0,
    brand_profile_found: 0,
    brand_profile_missing: 0,
    website_content_rules: 0,
    website_content_success: 0,
    website_content_failed: 0,
    website_items_found: 0,
    website_items_reused_cycle: 0,
    website_image_used: 0,
website_image_missing_ai_fallback: 0,
website_web_search_success: 0,
website_web_search_failed: 0,
website_web_search_fallback_used: 0,
  };
}

function buildApprovalEmailHtml({
  rule,
  postContent,
  approveUrl,
  imageUrl,
}) {
  const platform = escapeHtml(rule.platform || "Social media");
  const postType = escapeHtml(rule.post_type || "Post");
  const safeImageUrl = imageUrl ? escapeHtml(imageUrl) : "";

  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f3ee;font-family:Arial,sans-serif;color:#111827;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ee;padding:32px 16px;">
      <tr>
        <td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:18px;border:1px solid #e5e7eb;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 18px;">
                <p style="margin:0 0 8px;color:#6b7280;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;font-weight:700;">
                  Spreelo approval
                </p>

                <h1 style="margin:0 0 12px;font-size:26px;line-height:1.25;color:#111827;">
                  Your post is ready to review
                </h1>

                <p style="margin:0;color:#4b5563;font-size:15px;line-height:1.6;">
                  Spreelo has generated a new ${platform} ${postType.toLowerCase()} for you.
                  Review the content below and approve it if it looks good.
                </p>
              </td>
            </tr>

            ${
              safeImageUrl
                ? `
            <tr>
              <td style="padding:0 28px 20px;">
                <img
                  src="${safeImageUrl}"
                  alt="Generated post image"
                  style="display:block;width:100%;max-width:584px;border-radius:14px;border:1px solid #e5e7eb;"
                />
              </td>
            </tr>
            `
                : ""
            }

            <tr>
              <td style="padding:0 28px 20px;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:14px;">
                  <tr>
                    <td style="padding:18px 20px;">
                      <p style="margin:0 0 10px;color:#6b7280;font-size:13px;font-weight:700;">
                        Generated post
                      </p>

                      <div style="font-size:15px;line-height:1.7;color:#111827;">
                        ${formatPostContentForHtml(postContent)}
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td align="center" style="padding:4px 28px 28px;">
                <a href="${approveUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:999px;">
                  Approve post
                </a>

                <p style="margin:18px 0 0;color:#6b7280;font-size:13px;line-height:1.5;">
                  After approval, Spreelo will publish this post automatically within a few minutes.
                </p>
              </td>
            </tr>
          </table>

          <p style="margin:18px 0 0;color:#9ca3af;font-size:12px;">
            You received this email because you have an active Spreelo automation.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>
`.trim();
}

function buildApprovalEmailText({
  rule,
  postContent,
  approveUrl,
  imageUrl,
}) {
  return `
Your Spreelo post is ready to review.

Platform: ${rule.platform || "Social media"}
Post type: ${rule.post_type || "Post"}

${imageUrl ? `Image: ${imageUrl}\n` : ""}Generated post:
${postContent}

Approve post:
${approveUrl}

After approval, Spreelo will publish this post automatically within a few minutes.
`.trim();
}

async function setRuleError(supabase, ruleId, message) {
  await supabase
    .from("automation_rules")
    .update({
      last_error: message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ruleId);
}

async function getBrandProfileForRule(supabase, rule) {
  if (!rule?.brand_profile_id) {
    console.error("Automation rule has no brand_profile_id", {
      ruleId: rule?.id,
      userId: rule?.user_id,
    });

    return null;
  }

  const { data, error } = await supabase
    .from("brand_profiles")
    .select(
      "id, business_name, website_url, brand_description, industry, target_audience"
    )
    .eq("id", rule.brand_profile_id)
    .eq("user_id", rule.user_id)
    .maybeSingle();

  if (error) {
    console.error("Could not load brand profile for rule", {
      ruleId: rule.id,
      userId: rule.user_id,
      brandProfileId: rule.brand_profile_id,
      message: error.message,
    });

    return null;
  }

  return data || null;
}
function normalizeWebsiteUrl(value) {
  const trimmedValue = String(value || "").trim();

  if (!trimmedValue) {
    return "";
  }

  if (
    trimmedValue.startsWith("http://") ||
    trimmedValue.startsWith("https://")
  ) {
    return trimmedValue;
  }

  return `https://${trimmedValue}`;
}

function resolveUrl(value, baseUrl) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isSameOrigin(urlA, urlB) {
  try {
    return new URL(urlA).origin === new URL(urlB).origin;
  } catch {
    return false;
  }
}

function truncateText(value, maxLength) {
  const text = String(value || "").trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ");
}

function stripHtmlToText(html) {
  return decodeHtmlEntities(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<header[\s\S]*?<\/header>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function getMetaContent(html, propertyNames) {
  for (const name of propertyNames) {
    const propertyRegex = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i"
    );

    const propertyMatch = String(html || "").match(propertyRegex);

    if (propertyMatch?.[1]) {
      return decodeHtmlEntities(propertyMatch[1]);
    }

    const reversedRegex = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["'][^>]*>`,
      "i"
    );

    const reversedMatch = String(html || "").match(reversedRegex);

    if (reversedMatch?.[1]) {
      return decodeHtmlEntities(reversedMatch[1]);
    }
  }

  return "";
}

function extractPageTitle(html) {
  const ogTitle = getMetaContent(html, ["og:title", "twitter:title"]);

  if (ogTitle) {
    return ogTitle;
  }

  const titleMatch = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);

  if (titleMatch?.[1]) {
    return decodeHtmlEntities(titleMatch[1].replace(/\s+/g, " ").trim());
  }

  return "";
}

function extractImageCandidates(html, pageUrl) {
  const candidates = [];
  const seen = new Set();

  const addCandidate = ({ url, alt = "", source = "image", score = 0 }) => {
    const resolvedUrl = resolveUrl(url, pageUrl);

    if (!resolvedUrl || !isHttpUrl(resolvedUrl)) {
      return;
    }

    if (seen.has(resolvedUrl)) {
      return;
    }

    const lowerUrl = resolvedUrl.toLowerCase();
    const lowerAlt = String(alt || "").toLowerCase();

    if (
      lowerUrl.includes("logo") ||
      lowerUrl.includes("favicon") ||
      lowerUrl.includes("icon") ||
      lowerUrl.includes("sprite") ||
      lowerUrl.endsWith(".svg")
    ) {
      score -= 30;
    }

    if (
      lowerUrl.includes("product") ||
      lowerUrl.includes("service") ||
      lowerUrl.includes("listing") ||
      lowerUrl.includes("property") ||
      lowerUrl.includes("bostad") ||
      lowerUrl.includes("objekt") ||
      lowerUrl.includes("offer") ||
      lowerUrl.includes("shop") ||
      lowerAlt.includes("product") ||
      lowerAlt.includes("service") ||
      lowerAlt.includes("bostad") ||
      lowerAlt.includes("property")
    ) {
      score += 20;
    }

    if (
      lowerUrl.includes("banner") ||
      lowerUrl.includes("hero") ||
      lowerUrl.includes("background") ||
      lowerUrl.includes("header")
    ) {
      score -= 12;
    }

    seen.add(resolvedUrl);
    candidates.push({
      url: resolvedUrl,
      alt: decodeHtmlEntities(alt),
      source,
      score,
      page_url: pageUrl,
    });
  };

  const ogImage = getMetaContent(html, ["og:image", "twitter:image"]);

  if (ogImage) {
    addCandidate({
      url: ogImage,
      alt: "Open graph image",
      source: "og:image",
      score: 5,
    });
  }

  const imageRegex = /<img\b[^>]*>/gi;
  const srcRegex = /\bsrc=["']([^"']+)["']/i;
  const dataSrcRegex = /\bdata-src=["']([^"']+)["']/i;
  const srcsetRegex = /\bsrcset=["']([^"']+)["']/i;
  const altRegex = /\balt=["']([^"']*)["']/i;

  const matches = String(html || "").match(imageRegex) || [];

  for (const tag of matches) {
    const srcMatch = tag.match(srcRegex) || tag.match(dataSrcRegex);
    const srcsetMatch = tag.match(srcsetRegex);
    const altMatch = tag.match(altRegex);

    let imageUrl = srcMatch?.[1] || "";

    if (!imageUrl && srcsetMatch?.[1]) {
      imageUrl = srcsetMatch[1].split(",")[0]?.trim().split(" ")[0] || "";
    }

    addCandidate({
      url: imageUrl,
      alt: altMatch?.[1] || "",
      source: "img",
      score: 0,
    });
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, WEBSITE_MAX_IMAGE_CANDIDATES);
}

function extractLinks(html, pageUrl) {
  const links = [];
  const seen = new Set();
  const linkRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while ((match = linkRegex.exec(String(html || ""))) !== null) {
    const href = match[1];
    const rawText = match[2] || "";
    const text = stripHtmlToText(rawText);
    const resolvedUrl = resolveUrl(href, pageUrl);

    if (!resolvedUrl || !isHttpUrl(resolvedUrl)) {
      continue;
    }

    if (!isSameOrigin(resolvedUrl, pageUrl)) {
      continue;
    }

    const cleanUrl = resolvedUrl.split("#")[0];

    if (seen.has(cleanUrl)) {
      continue;
    }

    seen.add(cleanUrl);

    const lower = `${cleanUrl} ${text}`.toLowerCase();

    let score = 0;

    const positiveKeywords = [
      "product",
      "products",
      "service",
      "services",
      "shop",
      "store",
      "offer",
      "offers",
      "listing",
      "listings",
      "property",
      "properties",
      "bostad",
      "bostader",
      "bostäder",
      "objekt",
      "tjanst",
      "tjänst",
      "tjanster",
      "tjänster",
      "behandling",
      "behandlingar",
      "menu",
      "meny",
      "course",
      "courses",
      "package",
      "packages",
      "pris",
      "price",
    ];

    const negativeKeywords = [
      "privacy",
      "cookie",
      "terms",
      "login",
      "sign-in",
      "cart",
      "checkout",
      "kontakt",
      "contact",
      "about",
      "om-oss",
      "policy",
      "blog",
      "news",
      "nyheter",
    ];

    for (const keyword of positiveKeywords) {
      if (lower.includes(keyword)) {
        score += 8;
      }
    }

    for (const keyword of negativeKeywords) {
      if (lower.includes(keyword)) {
        score -= 8;
      }
    }

    if (score > -10) {
      links.push({
        url: cleanUrl,
        text,
        score,
      });
    }
  }

  return links.sort((a, b) => b.score - a.score);
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WEBSITE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SpreeloBot/1.0; +https://app.spreelo.com)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(`Website returned ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.toLowerCase().includes("text/html")) {
      throw new Error("Website did not return HTML");
    }

    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchWebsitePages(websiteUrl) {
  const normalizedWebsiteUrl = normalizeWebsiteUrl(websiteUrl);

  if (!normalizedWebsiteUrl) {
    throw new Error("Brand profile has no website URL");
  }

  const homeHtml = await fetchHtml(normalizedWebsiteUrl);
  const homeTitle = extractPageTitle(homeHtml);
  const homeText = truncateText(
    stripHtmlToText(homeHtml),
    WEBSITE_MAX_TEXT_CHARS_PER_PAGE
  );
  const homeImages = extractImageCandidates(homeHtml, normalizedWebsiteUrl);
  const links = extractLinks(homeHtml, normalizedWebsiteUrl);

  const pages = [
    {
      url: normalizedWebsiteUrl,
      title: homeTitle,
      text: homeText,
      images: homeImages,
    },
  ];

  const candidateLinks = links
    .filter((link) => link.score > 0)
    .slice(0, WEBSITE_MAX_PAGES - 1);

  for (const link of candidateLinks) {
    try {
      const html = await fetchHtml(link.url);

      pages.push({
        url: link.url,
        title: extractPageTitle(html) || link.text,
        text: truncateText(stripHtmlToText(html), WEBSITE_MAX_TEXT_CHARS_PER_PAGE),
        images: extractImageCandidates(html, link.url),
      });
    } catch (error) {
      console.error("Could not fetch website subpage", {
        url: link.url,
        message: error.message,
      });
    }
  }

  return pages;
}

function buildWebsiteAnalysisInput({ brandProfile, pages }) {
  const pageBlocks = [];
  let totalChars = 0;

  for (const page of pages) {
    const imageLines = (page.images || [])
      .slice(0, 10)
      .map(
        (image, index) =>
          `${index + 1}. url: ${image.url} | alt: ${image.alt || ""} | source: ${
            image.source || ""
          }`
      )
      .join("\n");

    const block = `
Page URL: ${page.url}
Page title: ${page.title || "Not provided"}

Page text:
${page.text || ""}

Image candidates on this page:
${imageLines || "No images found"}
`.trim();

    if (totalChars + block.length > WEBSITE_MAX_TOTAL_TEXT_CHARS) {
      break;
    }

    pageBlocks.push(block);
    totalChars += block.length;
  }

  return `
Brand profile:
${formatBrandProfileForPrompt(brandProfile)}

Website pages:
${pageBlocks.join("\n\n---\n\n")}
`.trim();
}

function buildWebsiteItemSelectionContext(rule) {
  const prompt = String(rule?.prompt || "").trim();

  if (!prompt) {
    return `
No specific automation prompt was provided.

Choose website items that are generally relevant to the brand and content type.
`.trim();
  }

  return `
Current automation / campaign prompt:
${truncateText(prompt, 3000)}

Important:
- If the prompt contains a "Product selection hint", treat that hint as high priority.
- The selected website item must fit the campaign, occasion, buyer intent, recipient and audience.
- Do not choose a random product or service just because it exists on the website.
`.trim();
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    const match = String(value || "").match(/\{[\s\S]*\}/);

    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function normalizeItemKeyPart(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "")
    .replace(/\?.*$/, "")
    .replace(/#.*$/, "")
    .replace(/\s+/g, " ");
}

function createItemKey(item) {
  const normalizedUrl = normalizeItemKeyPart(item?.url);
  const normalizedTitle = normalizeItemKeyPart(item?.title);
  const normalizedType = normalizeItemKeyPart(item?.type);
  const normalizedDescription = normalizeItemKeyPart(item?.description);

  let base = "";

  if (normalizedUrl) {
    base = `url:${normalizedUrl}`;
  } else if (normalizedTitle && normalizedType) {
    base = `title-type:${normalizedTitle}|${normalizedType}`;
  } else if (normalizedTitle) {
    base = `title:${normalizedTitle}`;
  } else {
    base = `fallback:${normalizedDescription}`;
  }

  return crypto.createHash("sha256").update(base).digest("hex");
}

function normalizeWebsiteItem(item, websiteUrl) {
  const title = String(item?.title || "").trim();
  const description = String(item?.description || "").trim();
  const type = String(item?.type || "website_item").trim();
  const url = item?.url ? resolveUrl(item.url, websiteUrl) : websiteUrl;
  const imageUrl = item?.image_url ? resolveUrl(item.image_url, websiteUrl) : null;
const price = String(item?.price || "").trim();
  if (!title || !description) {
    return null;
  }

return {
  title,
  description: truncateText(description, 900),
  price,
  type,
  url: url || websiteUrl,
  image_url: imageUrl && isHttpUrl(imageUrl) ? imageUrl : null,
};
}

async function extractWebsiteItems(openai, brandProfile, pages, rule = null) {
  const websiteUrl = normalizeWebsiteUrl(brandProfile?.website_url);
const analysisInput = buildWebsiteAnalysisInput({ brandProfile, pages });
const selectionContext = buildWebsiteItemSelectionContext(rule);
  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content:
          "You extract concrete website items for social media promotion. Return strict JSON only.",
      },
      {
        role: "user",
        content: `
Analyze the website content below.

Find concrete items that could become individual social media posts.

Current automation context:
${selectionContext}
An item can be:
- product
- service
- property/listing
- treatment
- offer
- course
- menu item
- package
- event
- other specific sellable item

Rules:
- Do not invent items.
- Only use information that appears in the website content.
- Prefer specific product/service/listing pages over generic homepage claims.
- Do not use privacy policy, cookie policy, blog posts or generic about pages as items.
- Avoid generic company descriptions unless the website only offers one clear service.
- For image_url, only choose a real image URL from the website that clearly shows the selected product, service, listing or item.
- For product pages, prefer the main product image from the product page.
- The image_url must be used exactly as found on the website. Do not describe, modify, recreate or invent a product image.
- Do not use logos, brand logos, franchise logos, mascot images, category graphics, navigation graphics, decorative banners, hero images or generic campaign artwork as image_url.
- Do not use an image_url if the image mainly shows a logo, brand mark, character artwork or campaign graphic without a clearly identifiable purchasable product.
- If no real product/item image is clearly available for the selected item, set image_url to null.
- If a clear product price is visible in the website content, include it in price.
- If the price is not clearly visible, use an empty string for price.
- Rank the returned items from strongest campaign match to weakest campaign match for the current automation context.
- Do not rank by what appears first on the website.
- Do not rank by which image is largest or most visually prominent.
- Do not rank by which product is currently shown in a campaign banner unless it is also the strongest match for the current campaign.
- If the automation context contains a Product selection hint, treat that hint as high priority when deciding which items are relevant.
- First identify the campaign, holiday, theme day, season or occasion.
- Then identify the likely buyer, the likely recipient, the buying intent and the emotional or practical reason to buy.
- Before selecting an item, infer the most likely product categories that fit that campaign or occasion.
- Choose the item that best fits the recipient, buyer intent and campaign theme.
- Prefer the strongest thematic match, not just any item that could loosely work.
- If several products are available, rank the one with the clearest gift, seasonal, practical or emotional use case highest.
- For gift days and shopping occasions, consider who buys the item, who receives it, and why the item fits the occasion.
- Avoid choosing products mainly aimed at a different recipient when a stronger match exists.
- Do not return unrelated random products just because they exist on the website.

Campaign-specific product guidance:
- For Father's Day, prefer items that feel suitable as a gift for a father or as a shared father-child activity. For toy or game stores, prefer adult-friendly and family-friendly gifts such as board games, party games, music games like Hitster, quiz games, family games, building sets, model kits, hobby kits, outdoor play, sports-related toys, vehicle/tech-themed sets or products children and parents can enjoy together. Avoid toddler products, baby toys or products mainly aimed at very young children when stronger father/gift/family options exist.
- For Mother's Day, prefer thoughtful gifts, self-care, beauty, flowers, home decor, jewelry, premium food, family-oriented gifts or emotionally meaningful products when available.
- For Valentine's Day, prefer romantic gifts, sweets, flowers, beauty, fragrance, date-night products, dinner-related items, matching items or emotionally meaningful gifts when available.
- For Halloween, prefer costumes, decorations, candy, spooky-themed products, party products, masks, makeup, pumpkins, lights, games or products that help customers create a Halloween feeling.
- For Christmas, prefer gifts, decorations, festive food, premium treats, toys, games, gift cards, partywear, cozy products or products that are naturally bought as Christmas presents.
- For Easter, prefer candy, eggs, decorations, spring products, flowers, family activities, food, gifts or products connected to Easter celebrations.
- For Black Friday, Cyber Monday or sales campaigns, prefer products with clear offer, discount, high demand, gift potential, seasonal relevance or strong buying intent.
- For back-to-school campaigns, prefer school supplies, backpacks, clothing, shoes, lunch boxes, tech, books, sports items or products useful for children, students or parents preparing for school.
- For graduation campaigns, prefer gifts, partywear, flowers, celebration products, jewelry, beauty, accessories, premium food, decorations or keepsakes.
- For wedding season campaigns, prefer outfits, shoes, accessories, beauty, gifts, flowers, decor, photography, services or products connected to weddings and guests.
- For summer campaigns, prefer outdoor products, travel items, swimwear, grilling, picnic items, cold drinks, sunscreen, summer fashion, toys, garden products or seasonal services.
- For winter campaigns, prefer warm clothing, cozy products, lighting, indoor activities, gifts, seasonal food, winter gear or services connected to the season.
- For grocery stores or supermarkets, choose products that naturally support the campaign occasion, such as themed treats, flowers, dinner ingredients, dessert items, coffee, chocolate, breakfast, grilling or gift-style bundles, depending on the campaign.
- If the campaign is broad and several products could fit, choose the item with the strongest practical or emotional reason to buy for that occasion.
- If no website item fits the automation context, still return generally usable items, but put the closest matches first.
- Return 3 to 15 items if possible.

Return JSON in this exact shape:
{
  "items": [
    {
      "title": "Item title",
      "type": "product | service | listing | property | treatment | offer | course | menu_item | package | event | other",
      "url": "Full URL if known",
"description": "Specific factual description based only on the website",
"price": "Visible price if clearly found on the website, otherwise empty string",
"image_url": "Full image URL if clearly relevant, otherwise null"
    }
  ]
}

Website content:
${analysisInput}
`.trim(),
      },
    ],
    temperature: 0.2,
  });

  const content = completion.choices?.[0]?.message?.content || "";
  const parsed = safeJsonParse(content);

  const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];

  return rawItems
    .map((item) => normalizeWebsiteItem(item, websiteUrl))
    .filter(Boolean)
    .map((item) => ({
      ...item,
      item_key: createItemKey(item),
    }));
}

async function getCurrentWebsiteCycle({
  supabase,
  userId,
  brandProfileId,
  sourceUrl,
  contentType,
}) {
  const { data, error } = await supabase
    .from("website_content_history")
    .select("cycle_number")
    .eq("user_id", userId)
    .eq("brand_profile_id", brandProfileId)
    .eq("source_url", sourceUrl)
    .eq("content_type", contentType)
    .order("cycle_number", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(error.message || "Could not load website content history");
  }

  return Number(data?.[0]?.cycle_number || 1);
}

function normalizeComparableValue(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\?.*$/, "")
    .replace(/#.*$/, "")
    .replace(/\/$/, "")
    .replace(/\s+/g, " ");
}

function isWeakItemUrl(itemUrl, sourceUrl) {
  const normalizedItemUrl = normalizeComparableValue(itemUrl);
  const normalizedSourceUrl = normalizeComparableValue(sourceUrl);

  if (!normalizedItemUrl) {
    return true;
  }

  return normalizedItemUrl === normalizedSourceUrl;
}

async function getUsedWebsiteItems({
  supabase,
  userId,
  brandProfileId,
  sourceUrl,
  contentType,
  cycleNumber,
}) {
const { data, error } = await supabase
  .from("website_content_history")
  .select("item_key, item_url, item_title, item_image_url")
  .eq("user_id", userId)
  .eq("brand_profile_id", brandProfileId)
  .eq("source_url", sourceUrl)
  .eq("content_type", contentType)
  .eq("cycle_number", cycleNumber);

  if (error) {
    throw new Error(error.message || "Could not load used website items");
  }

  return data || [];
}

function hasWebsiteItemAlreadyBeenUsed(item, usedItems, sourceUrl) {
  const itemKey = normalizeComparableValue(item?.item_key);
  const itemUrl = normalizeComparableValue(item?.url);
  const itemTitle = normalizeComparableValue(item?.title);
  const itemImageUrl = normalizeComparableValue(item?.image_url);

  return usedItems.some((usedItem) => {
    const usedKey = normalizeComparableValue(usedItem.item_key);
    const usedUrl = normalizeComparableValue(usedItem.item_url);
    const usedTitle = normalizeComparableValue(usedItem.item_title);
    const usedImageUrl = normalizeComparableValue(usedItem.item_image_url);

    if (itemKey && usedKey && itemKey === usedKey) {
      return true;
    }

    if (
      itemUrl &&
      usedUrl &&
      itemUrl === usedUrl &&
      !isWeakItemUrl(itemUrl, sourceUrl)
    ) {
      return true;
    }

    if (itemTitle && usedTitle && itemTitle === usedTitle) {
      return true;
    }

    if (itemImageUrl && usedImageUrl && itemImageUrl === usedImageUrl) {
      return true;
    }

    return false;
  });
}

async function chooseUnusedWebsiteItem({
  supabase,
  userId,
  brandProfileId,
  sourceUrl,
  contentType,
  items,
  usedWebsiteImageUrlsThisRun = new Set(),
}) {
  const currentCycle = await getCurrentWebsiteCycle({
    supabase,
    userId,
    brandProfileId,
    sourceUrl,
    contentType,
  });

  const usedItems = await getUsedWebsiteItems({
    supabase,
    userId,
    brandProfileId,
    sourceUrl,
    contentType,
    cycleNumber: currentCycle,
  });

  const unusedItems = items.filter(
    (item) => !hasWebsiteItemAlreadyBeenUsed(item, usedItems, sourceUrl)
  );

  function hasFreshWebsiteImage(item) {
    const imageUrl = normalizeComparableValue(item?.image_url);

    if (!imageUrl) {
      return false;
    }

    return !usedWebsiteImageUrlsThisRun.has(imageUrl);
  }

  function hasDuplicateWebsiteImageThisRun(item) {
    const imageUrl = normalizeComparableValue(item?.image_url);

    if (!imageUrl) {
      return false;
    }

    return usedWebsiteImageUrlsThisRun.has(imageUrl);
  }

  const bestUnusedWithFreshImage = unusedItems.find(hasFreshWebsiteImage);

  if (bestUnusedWithFreshImage) {
    return {
      item: bestUnusedWithFreshImage,
      cycleNumber: currentCycle,
      startedNewCycle: false,
      useWebsiteImage: true,
    };
  }

  const bestUnusedWithoutImage = unusedItems.find((item) => !item.image_url);

  if (bestUnusedWithoutImage) {
    return {
      item: bestUnusedWithoutImage,
      cycleNumber: currentCycle,
      startedNewCycle: false,
      useWebsiteImage: false,
    };
  }

  const bestUnusedWithDuplicateImage = unusedItems.find(
    hasDuplicateWebsiteImageThisRun
  );

  if (bestUnusedWithDuplicateImage) {
    return {
      item: bestUnusedWithDuplicateImage,
      cycleNumber: currentCycle,
      startedNewCycle: false,
      useWebsiteImage: false,
    };
  }

  const fallbackItem = items[0];

  return {
    item: fallbackItem,
    cycleNumber: currentCycle + 1,
    startedNewCycle: true,
    useWebsiteImage: hasFreshWebsiteImage(fallbackItem),
  };
}
function getHostnameWithoutWww(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isSameOrSubdomainUrl(candidateUrl, websiteUrl) {
  const candidateHost = getHostnameWithoutWww(candidateUrl);
  const websiteHost = getHostnameWithoutWww(websiteUrl);

  if (!candidateHost || !websiteHost) {
    return false;
  }

  return candidateHost === websiteHost || candidateHost.endsWith(`.${websiteHost}`);
}

function isLikelyNonProductUrl(value, websiteUrl) {
  try {
    const url = new URL(value);
    const path = url.pathname.toLowerCase();

    if (!path || path === "/" || isWeakItemUrl(value, websiteUrl)) {
      return true;
    }

    const blockedPathParts = [
      "/blog",
      "/news",
      "/nyheter",
      "/article",
      "/artiklar",
      "/cart",
      "/checkout",
      "/kundvagn",
      "/kassa",
      "/account",
      "/login",
      "/sign-in",
      "/privacy",
      "/integritet",
      "/cookie",
      "/terms",
      "/villkor",
      "/contact",
      "/kontakt",
      "/about",
      "/om-oss",
      "/search",
      "/sok",
      "/sök",
    ];

    return blockedPathParts.some((part) => path.includes(part));
  } catch {
    return true;
  }
}

function isBadProductImageUrl(value) {
  const lowerUrl = String(value || "").toLowerCase();

  if (!lowerUrl) {
    return true;
  }

  return (
    lowerUrl.includes("logo") ||
    lowerUrl.includes("favicon") ||
    lowerUrl.includes("icon") ||
    lowerUrl.includes("sprite") ||
    lowerUrl.includes("placeholder") ||
    lowerUrl.includes("banner") ||
    lowerUrl.includes("hero") ||
    lowerUrl.includes("background") ||
    lowerUrl.endsWith(".svg")
  );
}

function normalizeJsonLdType(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").toLowerCase());
  }

  return [String(value || "").toLowerCase()];
}

function flattenJsonLd(value) {
  const items = [];

  function walk(node) {
    if (!node) {
      return;
    }

    if (Array.isArray(node)) {
      for (const child of node) {
        walk(child);
      }

      return;
    }

    if (typeof node !== "object") {
      return;
    }

    items.push(node);

    if (Array.isArray(node["@graph"])) {
      walk(node["@graph"]);
    }

    if (Array.isArray(node.itemListElement)) {
      walk(node.itemListElement);
    }
  }

  walk(value);

  return items;
}

function extractJsonLdObjects(html) {
  const objects = [];
  const scriptRegex =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match;

  while ((match = scriptRegex.exec(String(html || ""))) !== null) {
    const rawJson = decodeHtmlEntities(match[1] || "").trim();

    if (!rawJson) {
      continue;
    }

    try {
      const parsed = JSON.parse(rawJson);
      objects.push(...flattenJsonLd(parsed));
    } catch {
      // Ignore invalid JSON-LD blocks.
    }
  }

  return objects;
}

function findJsonLdProduct(html) {
  const objects = extractJsonLdObjects(html);

  return (
    objects.find((item) =>
      normalizeJsonLdType(item?.["@type"]).some((type) => type.includes("product"))
    ) || null
  );
}

function getProductImageFromJsonLd(product, pageUrl) {
  const image = product?.image;

  if (!image) {
    return null;
  }

  let imageUrl = "";

  if (typeof image === "string") {
    imageUrl = image;
  } else if (Array.isArray(image)) {
    const firstImage = image[0];

    if (typeof firstImage === "string") {
      imageUrl = firstImage;
    } else if (firstImage?.url) {
      imageUrl = firstImage.url;
    }
  } else if (image?.url) {
    imageUrl = image.url;
  }

  const resolvedUrl = imageUrl ? resolveUrl(imageUrl, pageUrl) : null;

  if (!resolvedUrl || !isHttpUrl(resolvedUrl) || isBadProductImageUrl(resolvedUrl)) {
    return null;
  }

  return resolvedUrl;
}

function getProductPriceFromJsonLd(product) {
  const offers = Array.isArray(product?.offers)
    ? product.offers[0]
    : product?.offers;

  const price = offers?.price || offers?.lowPrice || offers?.highPrice || "";
  const currency = offers?.priceCurrency || "";

  if (!price) {
    return "";
  }

  return `${price}${currency ? ` ${currency}` : ""}`.trim();
}

function extractProductPriceFromHtml(html) {
  const metaPrice = getMetaContent(html, [
    "product:price:amount",
    "og:price:amount",
    "twitter:data1",
  ]);

  const metaCurrency = getMetaContent(html, [
    "product:price:currency",
    "og:price:currency",
  ]);

  if (metaPrice) {
    return `${metaPrice}${metaCurrency ? ` ${metaCurrency}` : ""}`.trim();
  }

  const text = stripHtmlToText(html);
  const priceMatch = text.match(/(?:\d{1,3}(?:[ .]\d{3})*|\d+)(?:[,.]\d{1,2})?\s?(?:kr|sek|:-)/i);

  return priceMatch?.[0] ? priceMatch[0].trim() : "";
}

function extractBestProductImageFromHtml(html, pageUrl) {
  const product = findJsonLdProduct(html);
  const jsonLdImage = getProductImageFromJsonLd(product, pageUrl);

  if (jsonLdImage) {
    return jsonLdImage;
  }

  const ogImage = getMetaContent(html, ["og:image", "twitter:image"]);
  const resolvedOgImage = ogImage ? resolveUrl(ogImage, pageUrl) : null;

  if (
    resolvedOgImage &&
    isHttpUrl(resolvedOgImage) &&
    !isBadProductImageUrl(resolvedOgImage)
  ) {
    return resolvedOgImage;
  }

  const imageCandidates = extractImageCandidates(html, pageUrl);

  const bestImage = imageCandidates.find(
    (image) => image?.url && !isBadProductImageUrl(image.url)
  );

  return bestImage?.url || null;
}

async function extractProductDataFromProductPage({
  productUrl,
  websiteUrl,
  webSearchProduct,
}) {
  const html = await fetchHtml(productUrl);
  const product = findJsonLdProduct(html);

  const title =
    String(product?.name || "").trim() ||
    String(webSearchProduct?.title || "").trim() ||
    extractPageTitle(html);

  const metaDescription = getMetaContent(html, [
    "description",
    "og:description",
    "twitter:description",
  ]);

  const description =
    String(product?.description || "").trim() ||
    String(metaDescription || "").trim() ||
    truncateText(stripHtmlToText(html), 700);

 const price =
  String(webSearchProduct?.price || "").trim() ||
  getProductPriceFromJsonLd(product) ||
  extractProductPriceFromHtml(html);

if (!price) {
  console.error("Product page candidate rejected because no clear price was found", {
    productUrl,
    title,
  });

  return null;
}

const imageUrl = extractBestProductImageFromHtml(html, productUrl);

  const normalizedItem = normalizeWebsiteItem(
    {
      title,
      type: "product",
      url: productUrl,
      description,
      price,
      image_url: imageUrl,
    },
    websiteUrl
  );

  if (!normalizedItem) {
    return null;
  }

  if (!normalizedItem.image_url) {
    return null;
  }

  return {
    ...normalizedItem,
    item_key: createItemKey(normalizedItem),
  };
}
function isLikelyBadDiscoveryPageUrl(value, websiteUrl) {
  try {
    const url = new URL(value);
    const path = url.pathname.toLowerCase();

    if (!path || path === "/" || isWeakItemUrl(value, websiteUrl)) {
      return true;
    }

    const blockedPathParts = [
      "/blog",
      "/news",
      "/nyheter",
      "/article",
      "/artiklar",
      "/cart",
      "/checkout",
      "/kundvagn",
      "/kassa",
      "/account",
      "/login",
      "/sign-in",
      "/privacy",
      "/integritet",
      "/cookie",
      "/terms",
      "/villkor",
      "/contact",
      "/kontakt",
      "/about",
      "/om-oss",
      "/search",
      "/sok",
      "/sök",
      "/kundservice",
      "/faq",
    ];

    return blockedPathParts.some((part) => path.includes(part));
  } catch {
    return true;
  }
}

function dedupeUrlItems(items) {
  const seen = new Set();
  const result = [];

  for (const item of items || []) {
    const normalizedUrl = normalizeComparableValue(item?.url);

    if (!normalizedUrl || seen.has(normalizedUrl)) {
      continue;
    }

    seen.add(normalizedUrl);
    result.push(item);
  }

  return result;
}

function scorePossibleProductLink({ url, text, campaignPrompt }) {
  const lower = `${url || ""} ${text || ""}`.toLowerCase();
  const lowerCampaign = String(campaignPrompt || "").toLowerCase();

  let score = 0;

  const strongProductSignals = [
    "/produkt",
    "/produkter",
    "/product",
    "/p/",
    "/lego-",
    "/spel",
    "/sallskapsspel",
    "/sällskapsspel",
    "/familjespel",
    "/bradspel",
    "/brädspel",
    "/quiz",
    "/hitster",
    "/bygg",
  ];

  const weakOrBadSignals = [
    "/varumarken",
    "/varumärken",
    "/kategori",
    "/category",
    "/collections",
    "/kundservice",
    "/faq",
    "/blog",
    "/news",
    "/nyheter",
    "/cart",
    "/checkout",
    "/kundvagn",
    "/kassa",
    "/search",
    "/sok",
    "/sök",
  ];

  for (const signal of strongProductSignals) {
    if (lower.includes(signal)) {
      score += 12;
    }
  }

  for (const signal of weakOrBadSignals) {
    if (lower.includes(signal)) {
      score -= 20;
    }
  }

  const campaignBoostWords = [
    "fars dag",
    "pappa",
    "father",
    "dad",
    "spel",
    "game",
    "quiz",
    "hitster",
    "lego",
    "bygg",
    "familj",
    "family",
    "sällskap",
    "sallskap",
  ];

  for (const word of campaignBoostWords) {
    if (lowerCampaign.includes(word) && lower.includes(word)) {
      score += 10;
    }
  }

  if (text && String(text).trim().length >= 4) {
    score += 3;
  }

  return score;
}

function extractProductLinksFromDiscoveryPage({
  html,
  pageUrl,
  websiteUrl,
  campaignPrompt,
}) {
  const links = extractLinks(html, pageUrl);
  const candidates = [];

  for (const link of links) {
    const url = link?.url;

    if (!url || !isHttpUrl(url)) {
      continue;
    }

    if (!isSameOrSubdomainUrl(url, websiteUrl)) {
      continue;
    }

    if (isLikelyNonProductUrl(url, websiteUrl)) {
      continue;
    }

    const score = scorePossibleProductLink({
      url,
      text: link.text || "",
      campaignPrompt,
    });

    if (score < 0) {
      continue;
    }

    candidates.push({
      title: link.text || "",
      url,
      price: "",
      reason: `Product link found on discovery page: ${pageUrl}`,
      score,
    });
  }

  return dedupeUrlItems(candidates)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}

async function findProductCandidatesFromDiscoveryPages({
  discoveryPages,
  websiteUrl,
  campaignPrompt,
}) {
  const candidates = [];

  for (const page of discoveryPages || []) {
    try {
      const html = await fetchHtml(page.url);

      const pageCandidates = extractProductLinksFromDiscoveryPage({
        html,
        pageUrl: page.url,
        websiteUrl,
        campaignPrompt,
      });

      candidates.push(...pageCandidates);
    } catch (error) {
      console.error("Could not fetch discovery page for product links", {
        discoveryPageUrl: page.url,
        message: error.message,
      });
    }
  }

  return dedupeUrlItems(candidates)
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, 12);
}
async function findProductUrlWithWebSearch({
  openai,
  brandProfile,
  rule,
  attempt = "best_match",
}) {
  const websiteUrl = normalizeWebsiteUrl(brandProfile?.website_url);

  if (!websiteUrl) {
    return {
      products: [],
      discoveryPages: [],
    };
  }

  const websiteHost = getHostnameWithoutWww(websiteUrl);
  const campaignPrompt = String(rule?.prompt || "").trim();

  if (!websiteHost) {
    return {
      products: [],
      discoveryPages: [],
    };
  }

  const isBackupAttempt = attempt === "backup_broad";

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    tools: [{ type: "web_search" }],
    tool_choice: "required",
    input: `
You are a product researcher for a social media automation app.

Your job:
Find real, concrete products from the customer's website that can be promoted in a social media post.

Customer website:
${websiteUrl}

Allowed domain:
${websiteHost}

Brand profile:
${formatBrandProfileForPrompt(brandProfile)}

Campaign / automation prompt:
${campaignPrompt || "No specific campaign prompt was provided. Find a concrete product from the customer website that would work well in a social media sales post."}

Research mode:
${
  isBackupAttempt
    ? `
This is a backup attempt.

The first attempt did not find a usable product page.

Now broaden the search, but still return ONLY real product pages.
If the perfect campaign match is hard to find, choose the best concrete product from the customer website that is still reasonably useful for the campaign.
Do not return category pages, brand pages, gift guide pages, age pages or campaign pages.
`.trim()
    : `
This is the primary attempt.

Find the strongest product match for the campaign.
`.trim()
}

Before searching, analyze the campaign like a marketing strategist.

Campaign analysis:
- What is the campaign, holiday, season, theme day or sales angle?
- Who is the likely buyer?
- Who is the likely recipient or end user?
- Is the product meant as a gift, shared activity, seasonal need, celebration item, practical purchase, impulse buy, premium purchase, problem-solver or inspiration?
- What age group, life situation, interest, relationship or occasion does the campaign imply?
- What product categories naturally fit this intent?
- What product types would feel wrong, too random, too childish, too adult, too generic, too expensive, too cheap or aimed at the wrong person?

Then search like a human researcher.

Use several targeted searches based on your campaign analysis.
Do not only open the homepage.
Do not only choose the first result.
Do not choose a product just because it exists on the website.
Choose products because they match the campaign intent.

Search strategy:
- Search for specific product categories that fit the campaign.
- Search for recipient-based product ideas.
- Search for occasion-based product ideas.
- Search for use-case-based product ideas.
- Search for gift/activity/seasonal/sales intent when relevant.
- Prefer concrete product pages over category, brand or listing pages.

Product quality rules:
- Return only real product pages from the allowed customer domain.
- A product page must be about one specific product that a customer can buy, book or order.
- Do not return the homepage.
- Do not return brand pages.
- Do not return category pages.
- Do not return gift guide pages.
- Do not return age collection pages.
- Do not return campaign landing pages.
- Do not return customer service pages.
- Do not return FAQ pages.
- Do not return blog/news pages.
- Do not return search pages.
- Do not return cart or checkout pages.
- Do not return images by themselves.
- Do not return another company's website.
- Do not guess URLs.
- Prefer products that likely have a clear product image.
- If you cannot find the perfect campaign match, still choose the best real concrete product from the customer website rather than returning a category, brand or guide page.

Ranking rules:
- Rank products by campaign fit, not by what appears first.
- Prefer products that match the likely buyer, recipient and reason to buy.
- Prefer products that create a clear social media angle.
- Prefer products with strong emotional, practical, seasonal or gift relevance.
- Avoid products aimed at the wrong recipient or wrong age group if better options exist.
- Avoid generic products that only loosely match the theme.
- If several products fit, prefer the one that is easiest to explain in a clear, useful and attractive post.

For toy, game and family stores:
- If the campaign implies a family gift, shared activity or parent/child moment, prefer products that both adults and children can enjoy.
- Prefer family games, board games, quiz games, party games, creative building, hobby kits, outdoor activities, role play or products with a clear shared-use angle when those fit the campaign.
- Avoid baby/toddler products if the campaign implies an older child, adult recipient, family activity or gift for a parent.
- Do not choose character-branded products just because the image is prominent; choose them only if they match the campaign intent.

For beauty, wellness and self-care businesses:
- If the campaign implies a thoughtful gift or personal treat, prefer products/services connected to relaxation, care, confidence, pampering or visible value.
- Avoid random everyday items if more emotionally relevant options exist.

For food, grocery, café or restaurant businesses:
- If the campaign implies celebration, season or gift, prefer products connected to meals, treats, desserts, flowers, drinks, breakfast, dinner, sharing or hosting.
- Avoid random staples unless the campaign is practical or price-focused.

For fashion, home, decor or lifestyle businesses:
- Match the product to the occasion, season, recipient, style and likely buying intent.
- Prefer items with a clear visual or giftable angle.

For sales campaigns:
- Prefer products with strong demand, high perceived value, gift potential, seasonal relevance or clear buying intent.
- If discount information is not clearly visible, do not invent a discount.

Output:
Return strict JSON only.
Do not explain.
Do not include markdown.

JSON shape:
{
  "products": [
    {
      "title": "Exact product title",
      "url": "Full product page URL",
      "price": "Visible price if clearly found, otherwise empty string",
      "reason": "Short reason why this product fits the campaign, buyer and recipient"
    }
  ],
  "discovery_pages": []
}

Return 1 to 5 real product pages if possible.
`.trim(),
  });

  const content = response.output_text || "";
  const parsed = safeJsonParse(content);

  const rawProducts = Array.isArray(parsed?.products) ? parsed.products : [];

  const validProducts = [];

  for (const product of rawProducts) {
    const productUrl = String(product?.url || "").trim();

    if (!productUrl || !isHttpUrl(productUrl)) {
      continue;
    }

    if (!isSameOrSubdomainUrl(productUrl, websiteUrl)) {
      console.error("Product researcher returned product from wrong domain", {
        ruleId: rule?.id,
        websiteUrl,
        productUrl,
        attempt,
      });

      continue;
    }

    if (isLikelyNonProductUrl(productUrl, websiteUrl)) {
      console.error("Product researcher returned weak or non-product URL", {
        ruleId: rule?.id,
        websiteUrl,
        productUrl,
        attempt,
      });

      continue;
    }

    if (isLikelyBadDiscoveryPageUrl(productUrl, websiteUrl)) {
      console.error("Product researcher returned discovery/category URL instead of product URL", {
        ruleId: rule?.id,
        websiteUrl,
        productUrl,
        attempt,
      });

      continue;
    }

    validProducts.push({
      title: String(product?.title || "").trim(),
      url: productUrl,
      price: String(product?.price || "").trim(),
      reason: String(product?.reason || "").trim(),
    });
  }

  if (!validProducts.length) {
    console.error("Product researcher returned no valid product URLs", {
      ruleId: rule?.id,
      brandProfileId: rule?.brand_profile_id,
      websiteUrl,
      attempt,
      rawResponse: truncateText(content, 1200),
    });
  }

  return {
    products: dedupeUrlItems(validProducts).slice(0, 5),
    discoveryPages: [],
  };
}

async function findWebsiteProductWithWebSearch({
  openai,
  brandProfile,
  rule,
  websiteUrl,
}) {
  const attempts = ["best_match", "backup_broad"];

  for (const attempt of attempts) {
    const searchResult = await findProductUrlWithWebSearch({
      openai,
      brandProfile,
      rule,
      attempt,
    });

    const webSearchProducts = Array.isArray(searchResult?.products)
      ? searchResult.products
      : [];

    if (!webSearchProducts.length) {
      console.error("Product researcher found no usable product candidates", {
        ruleId: rule?.id,
        brandProfileId: rule?.brand_profile_id,
        websiteUrl,
        attempt,
      });

      continue;
    }

    for (const webSearchProduct of webSearchProducts) {
      try {
        const websiteItem = await extractProductDataFromProductPage({
          productUrl: webSearchProduct.url,
          websiteUrl,
          webSearchProduct,
        });

        if (!websiteItem?.image_url) {
          console.error("Product researcher candidate had no usable product image", {
            ruleId: rule?.id,
            productUrl: webSearchProduct.url,
            title: webSearchProduct.title,
            attempt,
          });

          continue;
        }

        console.log("Product researcher selected website product", {
          ruleId: rule?.id,
          productUrl: websiteItem.url,
          title: websiteItem.title,
          imageUrl: websiteItem.image_url,
          attempt,
        });

        return websiteItem;
      } catch (candidateError) {
        console.error("Could not extract product data from researcher result", {
          ruleId: rule?.id,
          productUrl: webSearchProduct.url,
          title: webSearchProduct.title,
          attempt,
          message: candidateError.message,
        });
      }
    }

    console.error("No product researcher candidates passed product page extraction", {
      ruleId: rule?.id,
      brandProfileId: rule?.brand_profile_id,
      websiteUrl,
      attempt,
      candidateCount: webSearchProducts.length,
    });
  }

  return null;
}
function createSafeWebsiteCampaignFallbackItem({ brandProfile, rule, websiteUrl }) {
  const businessName = String(brandProfile?.business_name || "the business").trim();
  const prompt = String(rule?.prompt || "").trim();

  const title = prompt
    ? `Campaign inspiration: ${prompt}`
    : `Campaign inspiration from ${businessName}`;

  const description = `
This fallback item is used because no verified product page with a safe product image was found.

Create a general campaign post for ${businessName}.
Base the post on the campaign instruction and brand profile.
Do not mention a specific product.
Do not invent a product, price, discount, stock status or product details.
Do not claim that a specific item is available.
Invite people to explore the website for relevant options.
`.trim();

  const item = normalizeWebsiteItem(
    {
      title,
      type: "campaign_fallback",
      url: websiteUrl,
      description,
      price: "",
      image_url: null,
    },
    websiteUrl
  );

  if (!item) {
    return null;
  }

  return {
    ...item,
    item_key: createItemKey(item),
  };
}
async function prepareWebsiteContentForRule({
  supabase,
  openai,
  rule,
  brandProfile,
  summary,
  usedWebsiteImageUrlsThisRun = new Set(),
}) {
  if (!rule.uses_website_content) {
    return {
      websiteItem: null,
      websiteSourceUrl: null,
      websiteCycleNumber: null,
      useWebsiteImage: false,
    };
  }

  summary.website_content_rules += 1;

  const websiteUrl = normalizeWebsiteUrl(brandProfile?.website_url);

  if (!websiteUrl) {
    throw new Error("This automation requires a website URL in Brand profile");
  }

  try {
    const webSearchItem = await findWebsiteProductWithWebSearch({
      openai,
      brandProfile,
      rule,
      websiteUrl,
    });

    if (webSearchItem) {
      const selected = await chooseUnusedWebsiteItem({
        supabase,
        userId: rule.user_id,
        brandProfileId: rule.brand_profile_id,
        sourceUrl: websiteUrl,
        contentType: rule.content_type_id || "website_item",
        items: [webSearchItem],
        usedWebsiteImageUrlsThisRun,
      });

      if (selected.startedNewCycle) {
        summary.website_items_reused_cycle += 1;
      }

      summary.website_items_found += 1;
      summary.website_content_success += 1;
      summary.website_web_search_success += 1;

      return {
        websiteItem: selected.item,
        websiteSourceUrl: websiteUrl,
        websiteCycleNumber: selected.cycleNumber,
        useWebsiteImage: selected.useWebsiteImage,
      };
    }
  } catch (webSearchError) {
    console.error("Website product research failed", {
      ruleId: rule.id,
      brandProfileId: rule.brand_profile_id,
      websiteUrl,
      message: webSearchError.message,
    });

    summary.website_web_search_failed += 1;
  }

  summary.website_web_search_fallback_used += 1;

  console.error("No verified website product found. Using safe text-only campaign fallback.", {
    ruleId: rule.id,
    brandProfileId: rule.brand_profile_id,
    websiteUrl,
  });

  const fallbackItem = createSafeWebsiteCampaignFallbackItem({
    brandProfile,
    rule,
    websiteUrl,
  });

  if (!fallbackItem) {
    throw new Error("Could not create safe website campaign fallback item");
  }

  summary.website_items_found += 1;
  summary.website_content_success += 1;

  return {
    websiteItem: fallbackItem,
    websiteSourceUrl: websiteUrl,
    websiteCycleNumber: 1,
    useWebsiteImage: false,
  };
}

async function saveWebsiteContentHistory({
  supabase,
  rule,
  postId,
  sourceUrl,
  websiteItem,
  cycleNumber,
}) {
  if (!rule.uses_website_content || !websiteItem || !sourceUrl) {
    return;
  }

  const { error } = await supabase.from("website_content_history").insert({
    user_id: rule.user_id,
    brand_profile_id: rule.brand_profile_id,
    automation_rule_id: rule.id,
    post_id: postId,
    source_url: sourceUrl,
    source_type: "website",
    content_type: rule.content_type_id || "website_item",
    item_key: websiteItem.item_key,
    item_url: websiteItem.url || null,
    item_title: websiteItem.title || null,
    item_description: websiteItem.description || null,
    item_image_url: websiteItem.image_url || null,
    cycle_number: cycleNumber || 1,
  });

  if (error) {
    throw new Error(error.message || "Could not save website content history");
  }
}

async function generateAutomationPost(openai, rule) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content:
          "You are an expert social media copywriter. You write clear, useful and ready-to-publish social media posts. You must always follow the provided brand profile and never invent a different industry.",
      },
      {
        role: "user",
        content: buildAutomationPrompt(rule),
      },
    ],
    temperature: 0.75,
  });

  return completion.choices?.[0]?.message?.content?.trim() || "";
}

async function generateAutomationImage(openai, rule, postContent) {
  const prompt = buildImagePrompt(rule, postContent);

  const response = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    size: "1024x1024",
  });

  const imageBase64 = response?.data?.[0]?.b64_json;

  if (!imageBase64) {
    throw new Error("OpenAI image generation returned empty image data");
  }

  return {
    imageBase64,
    imagePrompt: prompt,
  };
}

async function uploadGeneratedImageToStorage({
  supabase,
  imageBase64,
  userId,
  postId,
}) {
  const filePath = `${userId}/${postId}.png`;
  const fileBuffer = Buffer.from(imageBase64, "base64");

  const { error: uploadError } = await supabase.storage
    .from("post-images")
    .upload(filePath, fileBuffer, {
      contentType: "image/png",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(uploadError.message || "Could not upload image");
  }

  const { data: publicUrlData } = supabase.storage
    .from("post-images")
    .getPublicUrl(filePath);

  return {
    imageUrl: publicUrlData?.publicUrl || null,
    imageStoragePath: filePath,
  };
}

async function getUserEmail(supabase, userId) {
  const { data, error } = await supabase.auth.admin.getUserById(userId);

  if (error || !data?.user?.email) {
    return null;
  }

  return data.user.email;
}

async function sendApprovalEmail({
  resendApiKey,
  to,
  rule,
  postContent,
  approvalToken,
  imageUrl,
}) {
  const approveUrl = `${APP_URL}/api/approve-post?token=${approvalToken}`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to,
      subject: "Your Spreelo post is ready to approve",
      html: buildApprovalEmailHtml({
        rule,
        postContent,
        approveUrl,
        imageUrl,
      }),
      text: buildApprovalEmailText({
        rule,
        postContent,
        approveUrl,
        imageUrl,
      }),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Resend email request failed");
  }

  return response.json();
}

async function publishTextPostToFacebook({ pageId, pageAccessToken, message }) {
  const response = await fetch(
    `https://graph.facebook.com/v19.0/${pageId}/feed`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        access_token: pageAccessToken,
      }),
    }
  );

  const result = await response.json();

  if (!response.ok) {
    const facebookMessage =
      result?.error?.message || "Facebook publishing failed";

    const facebookType = result?.error?.type || "unknown";
    const facebookCode = result?.error?.code || "unknown";
    const facebookSubcode = result?.error?.error_subcode || "none";
    const facebookTrace = result?.error?.fbtrace_id || "none";

    throw new Error(
      `${facebookMessage} | type: ${facebookType} | code: ${facebookCode} | subcode: ${facebookSubcode} | trace: ${facebookTrace}`
    );
  }

  return result;
}

async function publishImagePostToFacebook({
  pageId,
  pageAccessToken,
  imageUrl,
  caption,
}) {
  const response = await fetch(
    `https://graph.facebook.com/v19.0/${pageId}/photos`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: imageUrl,
        caption,
        access_token: pageAccessToken,
      }),
    }
  );

  const result = await response.json();

  if (!response.ok) {
    const facebookMessage =
      result?.error?.message || "Facebook image publishing failed";

    const facebookType = result?.error?.type || "unknown";
    const facebookCode = result?.error?.code || "unknown";
    const facebookSubcode = result?.error?.error_subcode || "none";
    const facebookTrace = result?.error?.fbtrace_id || "none";

    throw new Error(
      `${facebookMessage} | type: ${facebookType} | code: ${facebookCode} | subcode: ${facebookSubcode} | trace: ${facebookTrace}`
    );
  }

  return result;
}

async function getFacebookConnectionForBrand({
  supabase,
  userId,
  brandProfileId,
}) {
  if (!userId || !brandProfileId) {
    return null;
  }

  const { data, error } = await supabase
    .from("social_connections")
    .select("id, page_id, page_name, page_access_token, status")
    .eq("user_id", userId)
    .eq("brand_profile_id", brandProfileId)
    .eq("platform", "facebook")
    .eq("status", "connected")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Could not load Facebook connection for brand", {
      userId,
      brandProfileId,
      message: error.message,
    });

    return null;
  }

  return data || null;
}

async function publishApprovedFacebookPosts({
  supabase,
  nowIso,
  summary,
}) {
  const { data: posts, error } = await supabase
    .from("posts")
    .select(
      "id, user_id, brand_profile_id, content, platform, status, published_at, approved_at, image_url"
    )
    .eq("status", "approved")
    .eq("platform", "Facebook")
    .is("published_at", null)
    .order("approved_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error("Could not load approved Facebook posts", {
      message: error.message,
    });

    summary.facebook_publish_failed += 1;
    return;
  }

  const approvedPosts = posts || [];
  summary.facebook_publish_checked += approvedPosts.length;

  for (const post of approvedPosts) {
    try {
      if (!post.content) {
        summary.facebook_publish_failed += 1;
        continue;
      }

      if (!post.brand_profile_id) {
        console.error("Approved Facebook post is missing brand_profile_id", {
          postId: post.id,
          userId: post.user_id,
        });

        await supabase
          .from("posts")
          .update({
            status: "failed",
            updated_at: nowIso,
          })
          .eq("id", post.id);

        summary.facebook_publish_failed += 1;
        continue;
      }

      const facebookConnection = await getFacebookConnectionForBrand({
        supabase,
        userId: post.user_id,
        brandProfileId: post.brand_profile_id,
      });

      if (
        !facebookConnection?.page_id ||
        !facebookConnection?.page_access_token
      ) {
        console.error("No connected Facebook page found for post brand", {
          postId: post.id,
          userId: post.user_id,
          brandProfileId: post.brand_profile_id,
        });

        await supabase
          .from("posts")
          .update({
            status: "failed",
            updated_at: nowIso,
          })
          .eq("id", post.id);

        summary.facebook_publish_skipped_no_config += 1;
        continue;
      }

      if (post.image_url) {
        await publishImagePostToFacebook({
          pageId: facebookConnection.page_id,
          pageAccessToken: facebookConnection.page_access_token,
          imageUrl: post.image_url,
          caption: post.content,
        });
      } else {
        await publishTextPostToFacebook({
          pageId: facebookConnection.page_id,
          pageAccessToken: facebookConnection.page_access_token,
          message: post.content,
        });
      }

      const { error: updateError } = await supabase
        .from("posts")
        .update({
          status: "published",
          published_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", post.id);

      if (updateError) {
        summary.facebook_publish_failed += 1;
        continue;
      }

      summary.facebook_published += 1;
    } catch (error) {
      console.error("Facebook publish failed", {
        postId: post.id,
        userId: post.user_id,
        brandProfileId: post.brand_profile_id,
        message: error.message,
      });

      await supabase
        .from("posts")
        .update({
          status: "failed",
          updated_at: nowIso,
        })
        .eq("id", post.id);

      summary.facebook_publish_failed += 1;
    }
  }
}

async function getRulesToProcess({ supabase, nowIso, now }) {
  const { data: dueRules, error: dueRulesError } = await supabase
    .from("automation_rules")
    .select("*")
    .eq("is_active", true)
    .not("next_run_at", "is", null)
    .lte("next_run_at", nowIso)
    .order("next_run_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (dueRulesError) {
    throw new Error(dueRulesError.message);
  }

  const rules = dueRules || [];

  if (rules.length >= BATCH_SIZE) {
    return rules;
  }

  const remainingLimit = BATCH_SIZE - rules.length;

  const { data: fallbackRules, error: fallbackRulesError } = await supabase
    .from("automation_rules")
    .select("*")
    .eq("is_active", true)
    .is("next_run_at", null)
    .limit(remainingLimit);

  if (fallbackRulesError) {
    throw new Error(fallbackRulesError.message);
  }

  const oldRulesThatAreDue = (fallbackRules || []).filter((rule) =>
    isRuleDueByOldSchedule(rule, now)
  );

  const uniqueRules = new Map();

  for (const rule of [...rules, ...oldRulesThatAreDue]) {
    uniqueRules.set(rule.id, rule);
  }

  return Array.from(uniqueRules.values()).slice(0, BATCH_SIZE);
}

function isAuthorizedCronRequest(request, cronSecret) {
  const authorizationHeader = request.headers.get("authorization");
  const expectedAuthorizationHeader = `Bearer ${cronSecret}`;

  return authorizationHeader === expectedAuthorizationHeader;
}

export async function GET(request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const cronSecret = process.env.CRON_SECRET;
    const resendApiKey = process.env.RESEND_API_KEY;


    if (!supabaseUrl || !serviceRoleKey || !openaiApiKey || !cronSecret) {
      return Response.json(
        {
          ok: false,
          error:
            "Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY or CRON_SECRET.",
        },
        { status: 500 }
      );
    }

    if (!isAuthorizedCronRequest(request, cronSecret)) {
      return Response.json(
        {
          ok: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const openai = new OpenAI({
      apiKey: openaiApiKey,
    });

    const now = new Date();
    const nowIso = now.toISOString();

    const summary = createEmptySummary();
    const usedWebsiteImageUrlsThisRun = new Set();

   await publishApprovedFacebookPosts({
  supabase,
  nowIso,
  summary,
});

    const rules = await getRulesToProcess({
      supabase,
      nowIso,
      now,
    });

    for (const rule of rules || []) {
      summary.processed += 1;

      try {
        if (hasAlreadyRunToday(rule, now)) {
          summary.skipped += 1;
          continue;
        }

        const creditCost = Number(rule.credit_cost || 1);

        const { data: balance, error: balanceError } = await supabase
          .from("user_credit_balances")
          .select("credits_remaining, monthly_credit_limit, plan_name")
          .eq("user_id", rule.user_id)
          .single();

        if (balanceError || !balance) {
          const message = "No credit balance found";

          await setRuleError(supabase, rule.id, message);

          summary.skipped += 1;
          summary.no_credit_balance += 1;
          continue;
        }

        const creditsRemaining = Number(balance.credits_remaining || 0);

        if (creditsRemaining < creditCost) {
          const message = "Not enough credits";

          await setRuleError(supabase, rule.id, message);

          summary.skipped += 1;
          summary.not_enough_credits += 1;
          continue;
        }

const brandProfile = await getBrandProfileForRule(supabase, rule);

        if (brandProfile) {
          summary.brand_profile_found += 1;
        } else {
          summary.brand_profile_missing += 1;
        }

let websiteItem = null;
let websiteSourceUrl = null;
let websiteCycleNumber = null;
let useWebsiteImage = false;

        if (rule.uses_website_content) {
          try {
           const preparedWebsiteContent = await prepareWebsiteContentForRule({
  supabase,
  openai,
  rule,
  brandProfile,
  summary,
  usedWebsiteImageUrlsThisRun,
});
            websiteItem = preparedWebsiteContent.websiteItem;
            websiteSourceUrl = preparedWebsiteContent.websiteSourceUrl;
            websiteCycleNumber = preparedWebsiteContent.websiteCycleNumber;
            useWebsiteImage = Boolean(preparedWebsiteContent.useWebsiteImage);
          } catch (websiteError) {
            summary.website_content_failed += 1;

            throw websiteError;
          }
        }

        const ruleWithBrandProfile = {
          ...rule,
          brand_profile: brandProfile,
          website_item: websiteItem,
        };

        const generatedContent = await generateAutomationPost(
          openai,
          ruleWithBrandProfile
        );

        if (!generatedContent) {
          const message = "OpenAI returned empty content";

          await setRuleError(supabase, rule.id, message);

          summary.errors += 1;
          continue;
        }

        const approvalRequired = Boolean(rule.approval_required);
        const approvalToken = crypto.randomBytes(32).toString("hex");
        const postStatus = approvalRequired ? "pending_approval" : "draft";
        const wantsImage = Boolean(rule.generate_image);

const { data: post, error: postError } = await supabase
  .from("posts")
  .insert({
    user_id: rule.user_id,
    brand_profile_id: rule.brand_profile_id,

            content: generatedContent,
            platform: rule.platform || null,
            tone: rule.tone || null,
            language: rule.language || null,
            post_type: rule.post_type || null,
            website_url:
              brandProfile?.website_url || rule.website_url || websiteSourceUrl || null,
            length: rule.length || null,
            include_emojis: Boolean(rule.include_emojis),
            include_hashtags: Boolean(rule.include_hashtags),
            cta_type: rule.cta_type || null,

            source: "automation",
            source_label: rule.uses_website_content
              ? "Generated from website"
              : "Generated by automation",
            automation_rule_id: rule.id,

            status: postStatus,
            approval_required: approvalRequired,
            approval_token: approvalToken,
            scheduled_for: nowIso,

            image_status: wantsImage ? "generating" : "none",
            image_prompt: wantsImage ? rule.image_prompt || null : null,
          })
          .select("id")
          .single();

        if (postError || !post) {
          const message = postError?.message || "Could not save post";

          await setRuleError(supabase, rule.id, message);

          summary.errors += 1;
          continue;
        }

        let imageUrl = null;
        let imageStoragePath = null;
        let finalImagePrompt = wantsImage ? rule.image_prompt || null : null;

        if (wantsImage && websiteItem?.image_url && useWebsiteImage) {
          imageUrl = websiteItem.image_url;
          finalImagePrompt =
            "Website image selected because it appears connected to the selected website item.";

          const { error: websiteImageUpdateError } = await supabase
            .from("posts")
            .update({
              image_url: imageUrl,
              image_storage_path: null,
              image_status: "ready",
              image_prompt: finalImagePrompt,
              updated_at: nowIso,
            })
            .eq("id", post.id);

          if (websiteImageUpdateError) {
            throw new Error(
              websiteImageUpdateError.message ||
                "Could not update post with website image"
            );
          }

          usedWebsiteImageUrlsThisRun.add(
  normalizeComparableValue(websiteItem.image_url)
);
          summary.website_image_used += 1;
       } else if (wantsImage && rule.uses_website_content) {
  summary.website_image_missing_ai_fallback += 1;

  finalImagePrompt =
    "No verified website product image was found. AI image fallback is disabled for website product posts.";

  const { error: noWebsiteImageUpdateError } = await supabase
    .from("posts")
    .update({
      image_url: null,
      image_storage_path: null,
      image_status: "none",
      image_prompt: finalImagePrompt,
      updated_at: nowIso,
    })
    .eq("id", post.id);

  if (noWebsiteImageUpdateError) {
    throw new Error(
      noWebsiteImageUpdateError.message ||
        "Could not update post without website image"
    );
  }
} else if (wantsImage) {
  try {
    const { imageBase64, imagePrompt } = await generateAutomationImage(
      openai,
      ruleWithBrandProfile,
      generatedContent
    );

    const uploadedImage = await uploadGeneratedImageToStorage({
      supabase,
      imageBase64,
      userId: rule.user_id,
      postId: post.id,
    });

    imageUrl = uploadedImage.imageUrl;
    imageStoragePath = uploadedImage.imageStoragePath;
    finalImagePrompt = imagePrompt;

    const { error: imageUpdateError } = await supabase
      .from("posts")
      .update({
        image_url: imageUrl,
        image_storage_path: imageStoragePath,
        image_status: "ready",
        image_prompt: finalImagePrompt,
        updated_at: nowIso,
      })
      .eq("id", post.id);

    if (imageUpdateError) {
      throw new Error(
        imageUpdateError.message || "Could not update post with image"
      );
    }

    summary.image_generated += 1;
  } catch (imageError) {
    console.error("Image generation failed", {
      ruleId: rule.id,
      postId: post.id,
      message: imageError.message,
    });

    await supabase
      .from("posts")
      .update({
        image_status: "failed",
        image_prompt: finalImagePrompt,
        updated_at: nowIso,
      })
      .eq("id", post.id);

    summary.image_generation_failed += 1;
    summary.warnings += 1;
  }
}

        if (rule.uses_website_content && websiteItem) {
          try {
            await saveWebsiteContentHistory({
              supabase,
              rule,
              postId: post.id,
              sourceUrl: websiteSourceUrl,
              websiteItem,
              cycleNumber: websiteCycleNumber,
            });
          } catch (historyError) {
            console.error("Could not save website content history", {
              ruleId: rule.id,
              postId: post.id,
              message: historyError.message,
            });

            summary.warnings += 1;
          }
        }

        if (postStatus === "pending_approval") {
          if (!resendApiKey) {
            summary.warnings += 1;
            summary.emails_failed += 1;
          } else {
            try {
              const userEmail = await getUserEmail(supabase, rule.user_id);

              if (!userEmail) {
                summary.warnings += 1;
                summary.emails_failed += 1;
              } else {
                await sendApprovalEmail({
                  resendApiKey,
                  to: userEmail,
                  rule,
                  postContent: generatedContent,
                  approvalToken,
                  imageUrl,
                });

                summary.emails_sent += 1;
              }
            } catch {
              summary.warnings += 1;
              summary.emails_failed += 1;
            }
          }
        }

        const newCreditsRemaining = creditsRemaining - creditCost;

        const { error: creditUpdateError } = await supabase
          .from("user_credit_balances")
          .update({
            credits_remaining: newCreditsRemaining,
            updated_at: nowIso,
          })
          .eq("user_id", rule.user_id);

        if (creditUpdateError) {
          const message =
            creditUpdateError.message || "Could not update credit balance";

          await setRuleError(supabase, rule.id, message);

          summary.errors += 1;
          continue;
        }

        const { error: transactionError } = await supabase
          .from("credit_transactions")
          .insert({
            user_id: rule.user_id,
            amount: -creditCost,
            reason: rule.uses_website_content
              ? "Automation website post generated"
              : wantsImage
              ? "Automation post with image generated"
              : "Automation post generated",
            reference_type: "post",
            reference_id: post.id,
          });

        if (transactionError) {
          const message =
            transactionError.message || "Could not create credit transaction";

          await setRuleError(supabase, rule.id, message);

          summary.errors += 1;
          continue;
        }

        const ruleUpdatePayload = getRuleUpdatePayloadAfterSuccess(
          rule,
          nowIso,
          now
        );

        const { error: ruleUpdateError } = await supabase
          .from("automation_rules")
          .update(ruleUpdatePayload)
          .eq("id", rule.id);

        if (ruleUpdateError) {
          summary.warnings += 1;
          continue;
        }

        summary.generated += 1;

        if (postStatus === "pending_approval") {
          summary.pending_approval += 1;
        }

        if (postStatus === "draft") {
          summary.draft += 1;
        }
      } catch (error) {
        const message = error.message || "Unknown automation error";

        await setRuleError(supabase, rule.id, message);

        summary.errors += 1;
      }
    }

    return Response.json({
      ok: true,
      mode: "live_text_image_facebook_brand_profile_website_content_history",
      checked_at: nowIso,
      batch_size: BATCH_SIZE,
      fetched_rules: rules?.length || 0,
      summary,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error.message || "Unknown cron error",
      },
      { status: 500 }
    );
  }
}

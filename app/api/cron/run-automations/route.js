import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const DEFAULT_TIME_ZONE = "Europe/Stockholm";
const BATCH_SIZE = 25;
const APP_URL = "https://app.spreelo.com";
const RESEND_FROM_EMAIL = "Spreelo <noreply@spreelo.com>";

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

function buildAutomationPrompt(rule) {
  return `
Create a ready-to-publish social media post.

Platform: ${rule.platform || "Instagram"}
${getLanguageInstruction(rule.language)}
Tone: ${rule.tone || "Professional"}
Post type: ${rule.post_type || "General post"}
Length: ${rule.length || "Medium"}
CTA type: ${rule.cta_type || "Soft CTA"}
Website URL: ${rule.website_url || "Not provided"}

Include emojis: ${rule.include_emojis ? "Yes" : "No"}
Include hashtags: ${rule.include_hashtags ? "Yes" : "No"}

User instruction:
${rule.prompt || ""}

Important:
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

  return `
Create one high-quality square social media image for a business post.

This image must be adapted to the specific business, industry, post topic and audience.
Do not create a generic stock-photo image unless that clearly fits the business.

Platform: ${rule.platform || "Facebook"}
Tone: ${rule.tone || "Professional"}
Post type: ${rule.post_type || "General post"}
Language context: ${rule.language || "Auto"}
Website URL: ${rule.website_url || "Not provided"}

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
Infer the visual style from the user instruction, post text, platform, tone, post type and selected visual concept.
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

async function generateAutomationPost(openai, rule) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content:
          "You are an expert social media copywriter. You write clear, useful and ready-to-publish social media posts.",
      },
      {
        role: "user",
        content: buildAutomationPrompt(rule),
      },
    ],
    temperature: 0.8,
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

async function publishApprovedFacebookPosts({
  supabase,
  pageId,
  pageAccessToken,
  nowIso,
  summary,
}) {
  if (!pageId || !pageAccessToken) {
    summary.facebook_publish_skipped_no_config += 1;
    return;
  }

  const { data: posts, error } = await supabase
    .from("posts")
    .select("id, content, platform, status, published_at, approved_at, image_url")
    .eq("status", "approved")
    .eq("platform", "Facebook")
    .is("published_at", null)
    .order("approved_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
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

      if (post.image_url) {
        await publishImagePostToFacebook({
          pageId,
          pageAccessToken,
          imageUrl: post.image_url,
          caption: post.content,
        });
      } else {
        await publishTextPostToFacebook({
          pageId,
          pageAccessToken,
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
        message: error.message,
      });

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
    const facebookPageId = process.env.FACEBOOK_PAGE_ID;
    const facebookPageAccessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

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

    await publishApprovedFacebookPosts({
      supabase,
      pageId: facebookPageId,
      pageAccessToken: facebookPageAccessToken,
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

        const generatedContent = await generateAutomationPost(openai, rule);

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

            content: generatedContent,
            platform: rule.platform || null,
            tone: rule.tone || null,
            language: rule.language || null,
            post_type: rule.post_type || null,
            website_url: rule.website_url || null,
            length: rule.length || null,
            include_emojis: Boolean(rule.include_emojis),
            include_hashtags: Boolean(rule.include_hashtags),
            cta_type: rule.cta_type || null,

            source: "automation",
            source_label: "Generated by automation",
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

        if (wantsImage) {
          try {
            const { imageBase64, imagePrompt } = await generateAutomationImage(
              openai,
              rule,
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
            reason: wantsImage
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
      mode: "live_text_and_image_protected_batched_header_auth_timezone_email_language_auto_facebook_publish",
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

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const STOCKHOLM_TIME_ZONE = "Europe/Stockholm";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function getStockholmDateYYYYMMDD(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: STOCKHOLM_TIME_ZONE,
  }).format(date);
}

function getCurrentWeekday(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: STOCKHOLM_TIME_ZONE,
  }).format(date);
}

function getCurrentTimeHHMM(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: STOCKHOLM_TIME_ZONE,
  }).format(date);
}

function getStockholmDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone: STOCKHOLM_TIME_ZONE,
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

function stockholmLocalToUtcDate({
  year,
  month,
  day,
  hour = 0,
  minute = 0,
  second = 0,
}) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);

  let offset = getTimeZoneOffsetMs(
    new Date(utcGuess),
    STOCKHOLM_TIME_ZONE
  );

  let utcTime = utcGuess - offset;

  const correctedOffset = getTimeZoneOffsetMs(
    new Date(utcTime),
    STOCKHOLM_TIME_ZONE
  );

  if (correctedOffset !== offset) {
    utcTime = utcGuess - correctedOffset;
  }

  return new Date(utcTime);
}

function normalizeTime(value) {
  return String(value || "").slice(0, 5);
}

function hasAlreadyRunToday(rule, today) {
  if (!rule.last_run_at) return false;

  const lastRunDate = getStockholmDateYYYYMMDD(new Date(rule.last_run_at));

  return lastRunDate === today;
}

function isRuleDue(rule, today, currentWeekday, currentTime) {
  const publishTime = normalizeTime(rule.publish_time);

  if (!rule.is_active) return false;
  if (!publishTime) return false;

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
    (weekday) =>
      weekday.toLowerCase() === String(rule.weekday).toLowerCase()
  );

  if (targetWeekdayIndex === -1) {
    return null;
  }

  const currentWeekday = getCurrentWeekday(now);

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

  const stockholmParts = getStockholmDateParts(now);

  const nextRunUtcDate = stockholmLocalToUtcDate({
    year: stockholmParts.year,
    month: stockholmParts.month,
    day: stockholmParts.day + daysUntilNextRun,
    hour,
    minute,
    second: 0,
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

function buildAutomationPrompt(rule) {
  return `
Create a ready-to-publish social media post.

Platform: ${rule.platform || "Instagram"}
Language: ${rule.language || "English"}
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

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (!supabaseUrl || !serviceRoleKey || !openaiApiKey) {
      return Response.json(
        {
          ok: false,
          error:
            "Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or OPENAI_API_KEY.",
        },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const openai = new OpenAI({
      apiKey: openaiApiKey,
    });

    const now = new Date();
    const nowIso = now.toISOString();

    const today = getStockholmDateYYYYMMDD(now);
    const currentWeekday = getCurrentWeekday(now);
    const currentTime = getCurrentTimeHHMM(now);

    const { data: rules, error: rulesError } = await supabase
      .from("automation_rules")
      .select("*")
      .eq("is_active", true);

    if (rulesError) {
      return Response.json(
        {
          ok: false,
          error: rulesError.message,
        },
        { status: 500 }
      );
    }

    const results = [];

    for (const rule of rules || []) {
      const publishTime = normalizeTime(rule.publish_time);

      const baseResult = {
        rule_id: rule.id,
        name: rule.name,
        user_id: rule.user_id,
        schedule_type: rule.schedule_type,
        weekday: rule.weekday,
        run_date: rule.run_date,
        publish_time: publishTime,
      };

      try {
        const due = isRuleDue(rule, today, currentWeekday, currentTime);

        if (!due) {
          results.push({
            ...baseResult,
            status: "skipped",
            reason: "Rule is not due",
          });

          continue;
        }

        if (hasAlreadyRunToday(rule, today)) {
          results.push({
            ...baseResult,
            status: "skipped",
            reason: "Rule has already run today",
          });

          continue;
        }

        if (rule.generate_image) {
          const message = "Image automation is not enabled yet";

          await setRuleError(supabase, rule.id, message);

          results.push({
            ...baseResult,
            status: "skipped",
            reason: message,
          });

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

          results.push({
            ...baseResult,
            status: "skipped",
            reason: message,
          });

          continue;
        }

        const creditsRemaining = Number(balance.credits_remaining || 0);

        if (creditsRemaining < creditCost) {
          const message = "Not enough credits";

          await setRuleError(supabase, rule.id, message);

          results.push({
            ...baseResult,
            status: "skipped",
            reason: message,
            credits_remaining: creditsRemaining,
            credit_cost: creditCost,
          });

          continue;
        }

        const generatedContent = await generateAutomationPost(openai, rule);

        if (!generatedContent) {
          const message = "OpenAI returned empty content";

          await setRuleError(supabase, rule.id, message);

          results.push({
            ...baseResult,
            status: "error",
            reason: message,
          });

          continue;
        }

        const approvalRequired = Boolean(rule.approval_required);
        const approvalToken = crypto.randomBytes(32).toString("hex");

        const postStatus = approvalRequired ? "pending_approval" : "draft";

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
          })
          .select()
          .single();

        if (postError || !post) {
          const message = postError?.message || "Could not save post";

          await setRuleError(supabase, rule.id, message);

          results.push({
            ...baseResult,
            status: "error",
            reason: message,
          });

          continue;
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

          results.push({
            ...baseResult,
            status: "error",
            reason: message,
            post_id: post.id,
          });

          continue;
        }

        const { error: transactionError } = await supabase
          .from("credit_transactions")
          .insert({
            user_id: rule.user_id,
            amount: -creditCost,
            reason: "Automation post generated",
            reference_type: "post",
            reference_id: post.id,
          });

        if (transactionError) {
          const message =
            transactionError.message || "Could not create credit transaction";

          await setRuleError(supabase, rule.id, message);

          results.push({
            ...baseResult,
            status: "error",
            reason: message,
            post_id: post.id,
          });

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
          results.push({
            ...baseResult,
            status: "warning",
            reason:
              "Post was generated and credits were used, but the automation rule could not be updated",
            details: ruleUpdateError.message,
            post_id: post.id,
            credits_used: creditCost,
            credits_remaining: newCreditsRemaining,
          });

          continue;
        }

        results.push({
          ...baseResult,
          status: "generated",
          reason: approvalRequired
            ? "Post generated and saved as pending approval"
            : "Post generated and saved as draft",
          post_id: post.id,
          post_status: postStatus,
          approval_required: approvalRequired,
          next_run_at: ruleUpdatePayload.next_run_at || null,
          credits_used: creditCost,
          credits_remaining: newCreditsRemaining,
        });
      } catch (error) {
        const message = error.message || "Unknown automation error";

        await setRuleError(supabase, rule.id, message);

        results.push({
          ...baseResult,
          status: "error",
          reason: message,
        });
      }
    }

    return Response.json({
      ok: true,
      mode: "live_text_only",
      message:
        "Cron route checked active automation rules. Text-only due rules can now generate posts and use credits.",
      checked_at: nowIso,
      today,
      currentWeekday,
      currentTime,
      total_rules: rules?.length || 0,
      results,
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

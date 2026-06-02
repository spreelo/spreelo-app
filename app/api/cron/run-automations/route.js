import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getCurrentWeekday() {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "Europe/Stockholm",
  }).format(new Date());
}

function getCurrentTimeHHMM() {
  return new Intl.DateTimeFormat("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Stockholm",
  }).format(new Date());
}

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return Response.json(
        {
          ok: false,
          error:
            "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
        },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const currentWeekday = getCurrentWeekday();
    const currentTime = getCurrentTimeHHMM();

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

    const dueRules = (rules || []).filter((rule) => {
      const publishTime = String(rule.publish_time || "").slice(0, 5);

      if (!publishTime) return false;

      if (rule.schedule_type === "once") {
        return rule.run_date === today && publishTime <= currentTime;
      }

      return rule.weekday === currentWeekday && publishTime <= currentTime;
    });

    const results = [];

    for (const rule of dueRules) {
      const { data: balance, error: balanceError } = await supabase
        .from("user_credit_balances")
        .select("credits_remaining, monthly_credit_limit, plan_name")
        .eq("user_id", rule.user_id)
        .single();

      if (balanceError || !balance) {
        results.push({
          rule_id: rule.id,
          status: "skipped",
          reason: "No credit balance found",
        });

        continue;
      }

      const creditCost = rule.credit_cost || 1;

      if (balance.credits_remaining < creditCost) {
        results.push({
          rule_id: rule.id,
          status: "skipped",
          reason: "Not enough credits",
          credits_remaining: balance.credits_remaining,
          credit_cost: creditCost,
        });

        continue;
      }

      results.push({
        rule_id: rule.id,
        status: "ready",
        name: rule.name,
        user_id: rule.user_id,
        schedule_type: rule.schedule_type,
        weekday: rule.weekday,
        run_date: rule.run_date,
        publish_time: publishTime,
        credit_cost: creditCost,
        credits_remaining: balance.credits_remaining,
      });
    }

    return Response.json({
      ok: true,
      mode: "dry_run",
      message:
        "Cron route works. No posts were generated and no credits were used.",
      checked_at: now.toISOString(),
      today,
      currentWeekday,
      currentTime,
      total_rules: rules?.length || 0,
      due_rules: dueRules.length,
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

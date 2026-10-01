import { adminContextError, getAdminContext } from "../../../../../lib/adminAuth";
import { buildBrand429RescueUpdate } from "../../../../../lib/brandWebsiteRescue.js";

export const dynamic = "force-dynamic";

function normalizeDateRange(request) {
  const url = new URL(request.url);
  const now = new Date();
  const fallbackFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const fallbackTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const parsedFrom = new Date(url.searchParams.get("from") || fallbackFrom.toISOString());
  const parsedTo = new Date(url.searchParams.get("to") || fallbackTo.toISOString());
  return {
    from: Number.isFinite(parsedFrom.getTime()) ? parsedFrom.toISOString() : fallbackFrom.toISOString(),
    to: Number.isFinite(parsedTo.getTime()) ? parsedTo.toISOString() : fallbackTo.toISOString(),
  };
}

async function safeRows(label, query, warnings) {
  try {
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (error) {
    warnings.push({ key: label, message: error.message || `Could not load ${label}.` });
    return [];
  }
}

async function safeSingle(label, query, warnings) {
  try {
    const { data, error } = await query;
    if (error) throw error;
    return data || null;
  } catch (error) {
    warnings.push({ key: label, message: error.message || `Could not load ${label}.` });
    return null;
  }
}

function getDisplayName(user) {
  const metadata = user?.user_metadata || {};
  return String(
    metadata.full_name || metadata.name || metadata.display_name || metadata.company_name || ""
  ).trim();
}

function summarize({ posts, occurrences, brands, rules }) {
  const completed = occurrences.filter((row) => row.status === "completed");
  const failed = occurrences.filter((row) => row.status === "failed_terminal");
  const running = occurrences.filter((row) => row.status === "running");
  const published = posts.filter((row) => row.status === "published");
  const publishFailed = posts.filter(
    (row) => row.status === "failed" && (row.last_publish_error || row.publish_attempts)
  );
  const refunds = failed.reduce(
    (sum, row) => sum + Math.max(0, Number(row.refunded_credits || 0)),
    0
  );
  const reruns = occurrences.reduce(
    (sum, row) => sum + Math.max(0, Number(row.automatic_run_count || 1) - 1),
    0
  );
  const failureReasons = {};
  for (const row of failed) {
    const key = row.failure_code || "unknown";
    failureReasons[key] = (failureReasons[key] || 0) + 1;
  }

  return {
    brandCount: brands.length,
    activeAutomationCount: rules.filter((row) => row.is_active).length,
    pausedAutomationCount: rules.filter((row) => !row.is_active).length,
    postsCreated: posts.length,
    publishedPosts: published.length,
    publishFailed: publishFailed.length,
    completedOccurrences: completed.length,
    failedOccurrences: failed.length,
    runningOccurrences: running.length,
    refundedCredits: refunds,
    unexpectedAutomaticReruns: reruns,
    creationSuccessRate:
      completed.length + failed.length > 0
        ? Math.round((completed.length / (completed.length + failed.length)) * 1000) / 10
        : null,
    failureReasons,
    blockedBrandCount: brands.filter((row) => row.website_access_status === "security_blocked").length,
    rescue429BrandCount: brands.filter((row) => row.website_access_status === "rate_limited_rescue").length,
  };
}

export async function GET(request, { params }) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);

  try {
    const { id } = await params;
    const userId = String(id || "").trim();
    if (!userId) {
      return Response.json({ ok: false, error: "Customer ID is required." }, { status: 400 });
    }

    const { data: authData, error: authError } = await context.admin.auth.admin.getUserById(userId);
    if (authError || !authData?.user) {
      return Response.json({ ok: false, error: "Customer account not found." }, { status: 404 });
    }

    const range = normalizeDateRange(request);
    const warnings = [];
    const user = authData.user;

    const [balance, brands, rules, posts, occurrences, reservationEvents, creditTransactions, adjustments, notifications, runLogs, growthAgentSetting, growthAgentShadowRuns, growthAgentProfiles, growthAgentExperiments, growthAgentOpportunities, growthAgentCommerceProfiles, growthAgentClosedLoopCycles] = await Promise.all([
      safeSingle(
        "credit balance",
        context.admin
          .from("user_credit_balances")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle(),
        warnings
      ),
      safeRows(
        "brands",
        context.admin
          .from("brand_profiles")
          .select("id, user_id, business_name, website_url, industry, target_audience, content_market, country_code, content_language, website_product_mode_available, website_product_source_url, website_access_status, website_security_provider, website_security_confidence, website_access_status_code, website_access_message, website_access_checked_at, admin_review_required, created_at, updated_at")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false }),
        warnings
      ),
      safeRows(
        "automation rules",
        context.admin
          .from("automation_rules")
          .select("id, user_id, brand_profile_id, name, content_type_id, content_type_label, content_format, post_type, platform, schedule_type, is_active, next_run_at, last_run_at, last_error, credit_cost, credit_reservation_status, credit_reserved_amount, generation_occurrence_status, generation_occurrence_scheduled_for, generation_started_at, generation_finished_at, generation_failure_code, generation_customer_message, generation_failure_stage, generation_refunded_credits, generation_notification_status, generation_notification_sent_at, created_at, updated_at")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(500),
        warnings
      ),
      safeRows(
        "posts",
        context.admin
          .from("posts")
          .select("id, user_id, brand_profile_id, automation_rule_id, status, platform, post_type, content_format, source, source_label, scheduled_for, created_at, updated_at, approved_at, published_at, image_status, video_status, last_publish_error, publish_attempts, text_model_used, image_model_used, product_research_model_used")
          .eq("user_id", userId)
          .gte("created_at", range.from)
          .lt("created_at", range.to)
          .order("created_at", { ascending: false })
          .limit(1000),
        warnings
      ),
      safeRows(
        "automation occurrences",
        context.admin
          .from("automation_occurrences")
          .select("*")
          .eq("user_id", userId)
          .gte("started_at", range.from)
          .lt("started_at", range.to)
          .order("started_at", { ascending: false })
          .limit(1000),
        warnings
      ),
      safeRows(
        "credit reservation events",
        context.admin
          .from("credit_reservation_events")
          .select("*")
          .eq("user_id", userId)
          .gte("created_at", range.from)
          .lt("created_at", range.to)
          .order("created_at", { ascending: false })
          .limit(1000),
        warnings
      ),
      safeRows(
        "credit transactions",
        context.admin
          .from("credit_transactions")
          .select("*")
          .eq("user_id", userId)
          .gte("created_at", range.from)
          .lt("created_at", range.to)
          .order("created_at", { ascending: false })
          .limit(1000),
        warnings
      ),
      safeRows(
        "admin credit adjustments",
        context.admin
          .from("admin_credit_adjustments")
          .select("*")
          .eq("target_user_id", userId)
          .gte("created_at", range.from)
          .lt("created_at", range.to)
          .order("created_at", { ascending: false })
          .limit(500),
        warnings
      ),
      safeRows(
        "customer notifications",
        context.admin
          .from("customer_notifications")
          .select("*")
          .eq("user_id", userId)
          .gte("created_at", range.from)
          .lt("created_at", range.to)
          .order("created_at", { ascending: false })
          .limit(500),
        warnings
      ),
      safeRows(
        "automation run logs",
        context.admin
          .from("automation_run_logs")
          .select("id, user_id, brand_profile_id, brand_name, brand_website_url, rule_id, rule_name, campaign_title, post_id, occurrence_id, status, attempt_kind, scheduled_for, started_at, finished_at, duration_ms, error_message, failure_code, failure_customer_message, refunded_credits, notification_status, content_type_id, content_format, products_selected, search_methods, product_titles, product_urls, metadata")
          .eq("user_id", userId)
          .gte("started_at", range.from)
          .lt("started_at", range.to)
          .order("started_at", { ascending: false })
          .limit(1000),
        warnings
      ),
      safeSingle(
        "growth agent setting",
        context.admin.from("growth_agent_settings").select("mode, updated_at, updated_by_user_id").eq("user_id", userId).maybeSingle(),
        warnings
      ),
      safeRows(
        "growth agent shadow runs",
        context.admin.from("growth_agent_shadow_runs").select("id, brand_profile_id, goal_id, selected_platforms, baseline_plan, growth_plan, growth_context, baseline_source, growth_source, model, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
        warnings
      ),
      safeRows(
        "growth agent profiles",
        context.admin.from("growth_agent_profiles").select("brand_profile_id, profile_version, learning_state, data_quality, observation_count, evidence_count, average_confidence, profile_json, updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(50),
        warnings
      ),
      safeRows(
        "growth agent experiments",
        context.admin.from("growth_agent_experiments").select("id, brand_profile_id, experiment_version, experiment_key, kind, content_type_id, goal_id, hypothesis, max_plan_share, status, baseline_observations, baseline_score, baseline_confidence, latest_observations, latest_score, latest_confidence, outcome, activated_at, completed_at, updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(100),
        warnings
      ),
      safeRows(
        "growth agent opportunities",
        context.admin.from("growth_agent_opportunities").select("id, brand_profile_id, opportunity_version, opportunity_key, kind, priority, title, reason, content_type_id, product_title, product_url, campaign_title, campaign_goal, status, details, last_detected_at, updated_at").eq("user_id", userId).eq("status", "open").order("priority", { ascending: false }).order("updated_at", { ascending: false }).limit(100),
        warnings
      ),
      safeRows(
        "growth agent commerce profiles",
        context.admin.from("growth_agent_commerce_profiles").select("brand_profile_id, commerce_version, learning_state, data_quality, provider, commerce_event_count, attributed_event_count, purchase_like_event_count, total_revenue, average_attribution_confidence, profile_json, updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(50),
        warnings
      ),
      safeRows(
        "growth agent closed loop cycles",
        context.admin.from("growth_agent_closed_loop_cycles").select("id, brand_profile_id, closed_loop_version, mode, goal_id, selected_platforms, plan_source, selected_content_type_ids, selected_product_focus, decision_snapshot, baseline_snapshot, status, feedback_observation_gain, feedback_commerce_event_gain, feedback_snapshot, planned_at, feedback_at, updated_at").eq("user_id", userId).order("planned_at", { ascending: false }).limit(100),
        warnings
      ),
    ]);

    const creditLedger = [
      ...reservationEvents.map((row) => ({
        id: row.id,
        source: "reservation",
        created_at: row.created_at,
        amount: Number(row.amount || 0),
        event_type: row.event_type,
        reason: row.reason,
        automation_rule_id: row.automation_rule_id,
        brand_profile_id: row.brand_profile_id,
        metadata: row.metadata || {},
      })),
      ...creditTransactions.map((row) => ({
        id: row.id,
        source: "transaction",
        created_at: row.created_at,
        amount: Number(row.amount || 0),
        event_type: row.reason || "credit_transaction",
        reason: row.reason,
        automation_rule_id: null,
        brand_profile_id: null,
        metadata: { reference_type: row.reference_type, reference_id: row.reference_id },
      })),
      ...adjustments.map((row) => ({
        id: row.id,
        source: "admin_adjustment",
        created_at: row.created_at,
        amount: Number(row.amount || 0),
        event_type: "manual_adjustment",
        reason: row.reason,
        automation_rule_id: null,
        brand_profile_id: null,
        metadata: {
          admin_email: row.admin_email,
          previous_balance: row.previous_balance,
          new_balance: row.new_balance,
        },
      })),
    ].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    const models = new Set();
    for (const post of posts) {
      [post.text_model_used, post.image_model_used, post.product_research_model_used]
        .filter(Boolean)
        .forEach((model) => models.add(model));
    }
    for (const log of runLogs) {
      const details = Array.isArray(log.metadata?.product_details) ? log.metadata.product_details : [];
      details.forEach((item) => {
        if (item?.ai_campaign_fit_model) models.add(item.ai_campaign_fit_model);
      });
    }

    return Response.json({
      ok: true,
      partial: warnings.length > 0,
      warnings,
      range,
      customer: {
        id: user.id,
        email: user.email || null,
        name: getDisplayName(user),
        phone: user.phone || null,
        createdAt: user.created_at || null,
        lastSignInAt: user.last_sign_in_at || null,
        appMetadata: {
          provider: user.app_metadata?.provider || null,
          providers: user.app_metadata?.providers || [],
        },
        balance,
      },
      summary: summarize({ posts, occurrences, brands, rules }),
      brands,
      rules,
      posts,
      occurrences,
      creditLedger,
      notifications,
      runLogs,
      growthAgent: { mode: growthAgentSetting?.mode || "off", updatedAt: growthAgentSetting?.updated_at || null, updatedByUserId: growthAgentSetting?.updated_by_user_id || null, shadowRuns: growthAgentShadowRuns || [], profiles: growthAgentProfiles || [], experiments: growthAgentExperiments || [], opportunities: growthAgentOpportunities || [], commerceProfiles: growthAgentCommerceProfiles || [], closedLoopCycles: growthAgentClosedLoopCycles || [] },
      technical: {
        modelsUsed: Array.from(models).sort(),
        totalRunDurationMs: runLogs.reduce((sum, row) => sum + Math.max(0, Number(row.duration_ms || 0)), 0),
        totalProductsSelected: runLogs.reduce((sum, row) => sum + Math.max(0, Number(row.products_selected || 0)), 0),
        exactAiCostAvailable: false,
      },
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error.message || "Could not load the customer card." },
      { status: 500 }
    );
  }
}

export async function PATCH(request, { params }) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);

  try {
    const { id } = await params;
    const userId = String(id || "").trim();
    const body = await request.json().catch(() => ({}));

    if (body?.action === "set_growth_agent_mode") {
      const mode = String(body?.mode || "").trim().toLowerCase();
      if (!["off", "shadow", "active"].includes(mode)) return Response.json({ ok: false, error: "Invalid Growth Agent mode." }, { status: 400 });
      const { data, error } = await context.admin.from("growth_agent_settings").upsert({ user_id: userId, mode, updated_by_user_id: context.user?.id || null, updated_at: new Date().toISOString() }, { onConflict: "user_id" }).select("mode, updated_at, updated_by_user_id").single();
      if (error) throw error;
      return Response.json({ ok: true, growthAgent: data });
    }

    if (body?.action !== "set_brand_429_rescue") {
      return Response.json({ ok: false, error: "Unsupported customer action." }, { status: 400 });
    }

    const brandProfileId = String(body?.brand_profile_id || "").trim();
    if (!userId || !brandProfileId) {
      return Response.json({ ok: false, error: "Customer and brand are required." }, { status: 400 });
    }

    const enabled = body?.enabled === true;
    const payload = buildBrand429RescueUpdate({ enabled });
    const { data, error } = await context.admin
      .from("brand_profiles")
      .update(payload)
      .eq("id", brandProfileId)
      .eq("user_id", userId)
      .select("id, website_access_status, website_access_status_code, website_access_message, website_access_checked_at, updated_at")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return Response.json({ ok: false, error: "Brand not found for this customer." }, { status: 404 });
    }

    return Response.json({ ok: true, brand: data });
  } catch (error) {
    return Response.json(
      { ok: false, error: error.message || "Could not update 429 Rescue." },
      { status: 500 }
    );
  }
}

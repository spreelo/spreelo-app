import { adminContextError, getAdminContext } from "../../../../lib/adminAuth";

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
    search: String(url.searchParams.get("search") || "").trim().toLowerCase(),
    filter: String(url.searchParams.get("filter") || "all").trim().toLowerCase(),
  };
}

async function listAllUsers(admin) {
  const users = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 500 });
    if (error) throw error;
    const rows = data?.users || [];
    users.push(...rows);
    if (rows.length < 500) break;
  }
  return users;
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

function getUserDisplayName(user) {
  const metadata = user?.user_metadata || {};
  return String(
    metadata.full_name ||
      metadata.name ||
      metadata.display_name ||
      metadata.company_name ||
      ""
  ).trim();
}

function maxDate(...values) {
  const valid = values
    .flat()
    .map((value) => new Date(value || 0))
    .filter((value) => Number.isFinite(value.getTime()));
  if (!valid.length) return null;
  return new Date(Math.max(...valid.map((value) => value.getTime()))).toISOString();
}

export async function GET(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);

  try {
    const range = normalizeDateRange(request);
    const warnings = [];
    const users = await listAllUsers(context.admin);
    const userIds = users.map((user) => user.id).filter(Boolean);

    if (!userIds.length) {
      return Response.json({ ok: true, customers: [], summary: {}, range, warnings });
    }

    const [balances, brands, posts, occurrences] = await Promise.all([
      safeRows(
        "credit balances",
        context.admin
          .from("user_credit_balances")
          .select("user_id, credits_remaining, monthly_credit_limit, plan_name, subscription_status, subscription_plan, updated_at")
          .in("user_id", userIds),
        warnings
      ),
      safeRows(
        "brands",
        context.admin
          .from("brand_profiles")
          .select("id, user_id, business_name, website_url, website_access_status, website_security_provider, updated_at")
          .in("user_id", userIds),
        warnings
      ),
      safeRows(
        "posts",
        context.admin
          .from("posts")
          .select("id, user_id, brand_profile_id, status, content_format, created_at, published_at")
          .in("user_id", userIds)
          .gte("created_at", range.from)
          .lt("created_at", range.to),
        warnings
      ),
      safeRows(
        "automation occurrences",
        context.admin
          .from("automation_occurrences")
          .select("id, user_id, brand_profile_id, status, automatic_run_count, refunded_credits, failure_code, started_at, finished_at, notification_status")
          .in("user_id", userIds)
          .gte("started_at", range.from)
          .lt("started_at", range.to),
        warnings
      ),
    ]);

    const balanceByUser = new Map(balances.map((row) => [row.user_id, row]));
    const brandsByUser = new Map();
    const postsByUser = new Map();
    const occurrencesByUser = new Map();

    for (const row of brands) {
      const values = brandsByUser.get(row.user_id) || [];
      values.push(row);
      brandsByUser.set(row.user_id, values);
    }
    for (const row of posts) {
      const values = postsByUser.get(row.user_id) || [];
      values.push(row);
      postsByUser.set(row.user_id, values);
    }
    for (const row of occurrences) {
      const values = occurrencesByUser.get(row.user_id) || [];
      values.push(row);
      occurrencesByUser.set(row.user_id, values);
    }

    let customers = users.map((user) => {
      const balance = balanceByUser.get(user.id) || null;
      const customerBrands = brandsByUser.get(user.id) || [];
      const customerPosts = postsByUser.get(user.id) || [];
      const customerOccurrences = occurrencesByUser.get(user.id) || [];
      const failed = customerOccurrences.filter((row) => row.status === "failed_terminal");
      const completed = customerOccurrences.filter((row) => row.status === "completed");
      const running = customerOccurrences.filter((row) => row.status === "running");
      const published = customerPosts.filter((row) => row.status === "published");
      const refunds = failed.reduce((sum, row) => sum + Math.max(0, Number(row.refunded_credits || 0)), 0);
      const reruns = customerOccurrences.reduce(
        (sum, row) => sum + Math.max(0, Number(row.automatic_run_count || 1) - 1),
        0
      );
      const blockedBrands = customerBrands.filter(
        (row) => row.website_access_status === "security_blocked"
      );
      const rescue429Brands = customerBrands.filter(
        (row) => row.website_access_status === "rate_limited_rescue"
      );
      const successRate = completed.length + failed.length > 0
        ? Math.round((completed.length / (completed.length + failed.length)) * 1000) / 10
        : null;

      return {
        id: user.id,
        email: user.email || null,
        name: getUserDisplayName(user),
        createdAt: user.created_at || null,
        lastSignInAt: user.last_sign_in_at || null,
        lastActivityAt: maxDate(
          user.last_sign_in_at,
          balance?.updated_at,
          customerBrands.map((row) => row.updated_at),
          customerPosts.map((row) => row.published_at || row.created_at),
          customerOccurrences.map((row) => row.finished_at || row.started_at)
        ),
        planName: balance?.subscription_plan || balance?.plan_name || "—",
        subscriptionStatus: balance?.subscription_status || "unknown",
        creditsRemaining: Number(balance?.credits_remaining || 0),
        monthlyCreditLimit: Number(balance?.monthly_credit_limit || 0),
        brandCount: customerBrands.length,
        blockedBrandCount: blockedBrands.length,
        rescue429BrandCount: rescue429Brands.length,
        postCount: customerPosts.length,
        publishedCount: published.length,
        completedCount: completed.length,
        failedCount: failed.length,
        runningCount: running.length,
        refundedCredits: refunds,
        automaticReruns: reruns,
        successRate,
        brandSearchText: customerBrands
          .flatMap((row) => [row.business_name, row.website_url])
          .filter(Boolean)
          .join(" "),
        warningCodes: [
          rescue429Brands.length ? "website_rate_limit_rescue" : null,
          blockedBrands.length ? "website_blocked" : null,
          failed.length ? "creation_failed" : null,
          refunds ? "credits_refunded" : null,
          reruns ? "unexpected_rerun" : null,
        ].filter(Boolean),
      };
    });

    if (range.search) {
      customers = customers.filter((customer) =>
        [customer.email, customer.name, customer.planName, customer.brandSearchText]
          .join(" ")
          .toLowerCase()
          .includes(range.search)
      );
    }

    if (range.filter === "failed") customers = customers.filter((row) => row.failedCount > 0);
    if (range.filter === "refunded") customers = customers.filter((row) => row.refundedCredits > 0);
    if (range.filter === "blocked") customers = customers.filter((row) => row.blockedBrandCount > 0);
    if (range.filter === "rescue429") customers = customers.filter((row) => row.rescue429BrandCount > 0);
    if (range.filter === "reruns") customers = customers.filter((row) => row.automaticReruns > 0);

    customers = customers.map(({ brandSearchText, ...customer }) => customer);

    customers.sort((a, b) => {
      const warningDiff = b.warningCodes.length - a.warningCodes.length;
      if (warningDiff) return warningDiff;
      return new Date(b.lastActivityAt || 0).getTime() - new Date(a.lastActivityAt || 0).getTime();
    });

    const totalCompleted = occurrences.filter((row) => row.status === "completed").length;
    const totalFailed = occurrences.filter((row) => row.status === "failed_terminal").length;
    const totalRefunded = occurrences.reduce(
      (sum, row) => sum + Math.max(0, Number(row.refunded_credits || 0)),
      0
    );
    const totalReruns = occurrences.reduce(
      (sum, row) => sum + Math.max(0, Number(row.automatic_run_count || 1) - 1),
      0
    );

    return Response.json({
      ok: true,
      partial: warnings.length > 0,
      warnings,
      range,
      summary: {
        customerCount: customers.length,
        brandCount: brands.length,
        rescue429BrandCount: brands.filter((row) => row.website_access_status === "rate_limited_rescue").length,
        createdPosts: posts.length,
        publishedPosts: posts.filter((row) => row.status === "published").length,
        completedOccurrences: totalCompleted,
        failedOccurrences: totalFailed,
        refundedCredits: totalRefunded,
        unexpectedAutomaticReruns: totalReruns,
        creationSuccessRate:
          totalCompleted + totalFailed > 0
            ? Math.round((totalCompleted / (totalCompleted + totalFailed)) * 1000) / 10
            : null,
      },
      customers,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error.message || "Could not load customers." },
      { status: 500 }
    );
  }
}

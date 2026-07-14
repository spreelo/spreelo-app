import { adminContextError, getAdminContext } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function findUserByEmail(admin, email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 500 });
    if (error) throw error;

    const users = data?.users || [];
    const found = users.find(
      (candidate) => normalizeEmail(candidate.email) === normalizedEmail
    );
    if (found) return found;
    if (users.length < 500) break;
  }

  return null;
}

async function loadCreditAccount(admin, user) {
  const { data: balance, error: balanceError } = await admin
    .from("user_credit_balances")
    .select(
      "user_id, credits_remaining, monthly_credit_limit, plan_name, subscription_status, subscription_plan, current_period_start, current_period_end, trial_start, trial_end, updated_at"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (balanceError) throw balanceError;

  const { count: brandCount, error: brandError } = await admin
    .from("brand_profiles")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (brandError) throw brandError;

  return {
    id: user.id,
    email: user.email || null,
    createdAt: user.created_at || null,
    lastSignInAt: user.last_sign_in_at || null,
    brandCount: Number(brandCount || 0),
    balance: balance || null,
  };
}

async function loadRecentAdjustments(admin) {
  const { data, error } = await admin
    .from("admin_credit_adjustments")
    .select(
      "id, admin_email, target_user_id, target_email, amount, previous_balance, new_balance, reason, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) throw error;
  return data || [];
}

export async function GET(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);

  try {
    const email = normalizeEmail(new URL(request.url).searchParams.get("email"));
    const recentAdjustments = await loadRecentAdjustments(context.admin);

    if (!email) {
      return Response.json({ ok: true, recentAdjustments });
    }

    const user = await findUserByEmail(context.admin, email);
    if (!user) {
      return Response.json(
        { ok: false, error: "No Spreelo account was found with that exact email address." },
        { status: 404 }
      );
    }

    const account = await loadCreditAccount(context.admin, user);
    return Response.json({ ok: true, account, recentAdjustments });
  } catch (error) {
    return Response.json(
      { ok: false, isAdmin: true, error: error.message || "Could not load the credit account." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  const context = await getAdminContext(request);
  if (context.error) return adminContextError(context);

  try {
    const body = await request.json().catch(() => ({}));
    const email = normalizeEmail(body?.email);
    const amount = Number(body?.amount);
    const reason = String(body?.reason || "").replace(/\s+/g, " ").trim().slice(0, 500);

    if (!email) {
      return Response.json({ ok: false, error: "Enter the account email address." }, { status: 400 });
    }

    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 100000) {
      return Response.json(
        { ok: false, error: "Credit adjustment must be a whole number between -100000 and 100000, excluding zero." },
        { status: 400 }
      );
    }

    if (reason.length < 3) {
      return Response.json({ ok: false, error: "Add a short reason for the adjustment." }, { status: 400 });
    }

    const user = await findUserByEmail(context.admin, email);
    if (!user) {
      return Response.json(
        { ok: false, error: "No Spreelo account was found with that exact email address." },
        { status: 404 }
      );
    }

    const { data: adjustment, error: adjustmentError } = await context.admin.rpc(
      "admin_adjust_user_credits",
      {
        p_target_user_id: user.id,
        p_target_email: user.email || email,
        p_amount: amount,
        p_reason: reason,
        p_admin_user_id: context.user.id,
        p_admin_email: context.user.email || null,
      }
    );

    if (adjustmentError) throw adjustmentError;

    const [account, recentAdjustments] = await Promise.all([
      loadCreditAccount(context.admin, user),
      loadRecentAdjustments(context.admin),
    ]);

    return Response.json({ ok: true, adjustment, account, recentAdjustments });
  } catch (error) {
    return Response.json(
      { ok: false, isAdmin: true, error: error.message || "Could not adjust credits." },
      { status: 500 }
    );
  }
}

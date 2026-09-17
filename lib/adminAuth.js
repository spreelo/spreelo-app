import { createClient } from "@supabase/supabase-js";

const DEFAULT_PRIMARY_ADMIN_EMAIL = "johan@foldern.com";

export function normalizeAdminEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function getPrimaryAdminEmail() {
  return normalizeAdminEmail(
    process.env.SPREELO_PRIMARY_ADMIN_EMAIL || DEFAULT_PRIMARY_ADMIN_EMAIL
  );
}

export function getConfiguredAdminEmails() {
  const primary = getPrimaryAdminEmail();
  const additional = String(process.env.SPREELO_ADMIN_EMAILS || "")
    .split(/[;,\n\r]+/)
    .map(normalizeAdminEmail)
    .filter(Boolean);

  return [...new Set([primary, ...additional].filter(Boolean))];
}

export function isConfiguredAdminEmail(email) {
  const normalized = normalizeAdminEmail(email);
  return Boolean(normalized && getConfiguredAdminEmails().includes(normalized));
}

export function isPrimaryAdminEmail(email) {
  const normalized = normalizeAdminEmail(email);
  return Boolean(normalized && normalized === getPrimaryAdminEmail());
}

// App metadata is written only by trusted server-side code using the service role.
// This lets invited admins receive the same plan-limit bypass as configured admins
// without making social OAuth routes query the team table on every connection.
export function hasAdminPlanLimitBypass(user) {
  return Boolean(
    isConfiguredAdminEmail(user?.email) || user?.app_metadata?.spreelo_admin === true
  );
}

export function getBearerToken(request) {
  const header = request.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

async function syncAdminPlanLimitBypass(admin, user, isAdmin) {
  if (!admin || !user?.id) return null;
  const currentFlag = user?.app_metadata?.spreelo_admin === true;
  if (currentFlag === isAdmin) return null;

  const nextMetadata = {
    ...(user.app_metadata || {}),
    spreelo_admin: isAdmin,
  };

  const { error } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: nextMetadata,
  });
  return error || null;
}

async function getActiveTeamMembership(admin, user) {
  const email = normalizeAdminEmail(user?.email);
  if (!admin || !user?.id || !email) return { member: null, error: null };

  const { data, error } = await admin
    .from("spreelo_admin_team_members")
    .select("email, user_id, status, accepted_at, revoked_at")
    .eq("email", email)
    .eq("status", "active")
    .maybeSingle();

  // A deployment can briefly run application code before the v144.186 SQL is
  // applied. Configured admins must keep access during that window.
  if (error) return { member: null, error };
  if (!data) return { member: null, error: null };
  if (data.user_id && data.user_id !== user.id) return { member: null, error: null };
  return { member: data, error: null };
}

export async function getAdminContext(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = getBearerToken(request);

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return { error: "Supabase environment variables are missing.", status: 500 };
  }

  if (!token) {
    return { error: "You must be logged in.", status: 401 };
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(token);

  if (userError || !user) {
    return { error: "Your login session is not valid.", status: 401 };
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const configuredAdmin = isConfiguredAdminEmail(user.email);
  let invitedMember = null;
  let membershipError = null;

  if (!configuredAdmin) {
    const membershipResult = await getActiveTeamMembership(admin, user);
    invitedMember = membershipResult.member;
    membershipError = membershipResult.error;

    if (membershipError) {
      console.error("Could not verify Spreelo admin team membership", {
        userId: user.id,
        email: user.email || null,
        message: membershipError.message || String(membershipError),
      });
    }
  }

  const isAdmin = configuredAdmin || Boolean(invitedMember);
  const syncError = await syncAdminPlanLimitBypass(admin, user, isAdmin);

  if (syncError && isAdmin) {
    console.error("Could not sync Spreelo admin plan-limit bypass", {
      userId: user.id,
      email: user.email || null,
      message: syncError.message || String(syncError),
    });
    return {
      error: "Admin access could not be synchronized. Please try again.",
      status: 500,
      user,
    };
  }

  if (syncError) {
    console.error("Could not clear stale Spreelo admin plan-limit bypass", {
      userId: user.id,
      email: user.email || null,
      message: syncError.message || String(syncError),
    });
  }

  if (!isAdmin) {
    return {
      error: "This page is only available to Spreelo administrators.",
      status: 403,
      user,
      membershipError: membershipError || null,
    };
  }

  const isPrimaryAdmin = isPrimaryAdminEmail(user.email);
  return {
    user,
    admin,
    isPrimaryAdmin,
    canManageTeam: isPrimaryAdmin,
    adminSource: configuredAdmin ? "configured" : "team",
  };
}

export function adminContextError(context) {
  return Response.json(
    {
      ok: false,
      isAdmin: false,
      canManage: false,
      canManageTeam: false,
      error: context.error,
      configurationMissing: Boolean(context.configurationMissing),
    },
    { status: context.status || 500 }
  );
}

import { createClient } from "@supabase/supabase-js";

export function getBearerToken(request) {
  const header = request.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function getAdminValues(name) {
  return String(process.env[name] || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
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

  const adminEmails = getAdminValues("SPREELO_ADMIN_EMAILS");
  const adminUserIds = getAdminValues("SPREELO_ADMIN_USER_IDS");
  const email = String(user.email || "").trim().toLowerCase();
  const userId = String(user.id || "").toLowerCase();
  const isConfigured = adminEmails.length > 0 || adminUserIds.length > 0;
  const isAdmin = adminEmails.includes(email) || adminUserIds.includes(userId);

  if (!isConfigured) {
    return {
      error: "Set SPREELO_ADMIN_EMAILS or SPREELO_ADMIN_USER_IDS in Vercel before using admin tools.",
      status: 503,
      configurationMissing: true,
      user,
    };
  }

  if (!isAdmin) {
    return {
      error: "This page is only available to Spreelo administrators.",
      status: 403,
      user,
    };
  }

  return {
    user,
    admin: createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
  };
}

export function adminContextError(context) {
  return Response.json(
    {
      ok: false,
      isAdmin: false,
      canManage: false,
      error: context.error,
      configurationMissing: Boolean(context.configurationMissing),
    },
    { status: context.status || 500 }
  );
}

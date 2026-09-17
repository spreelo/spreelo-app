import { createHash, randomBytes } from "node:crypto";
import {
  getAdminContext,
  getConfiguredAdminEmails,
  getPrimaryAdminEmail,
  normalizeAdminEmail,
} from "../../../../lib/adminAuth";
import { getServerTranslations } from "../../../../lib/i18n/serverUiText";

export const dynamic = "force-dynamic";

const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Spreelo <noreply@spreelo.com>";
const APP_URL = String(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://app.spreelo.com").replace(/\/$/, "");
const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

function hashInviteToken(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function requirePrimaryAdmin(request) {
  const context = await getAdminContext(request);
  if (context.error) return { context, response: Response.json({ ok: false, error: context.error }, { status: context.status || 500 }) };
  if (!context.canManageTeam) {
    return {
      context,
      response: Response.json({ ok: false, error: "Only the primary Spreelo administrator can manage the admin team." }, { status: 403 }),
    };
  }
  return { context, response: null };
}

async function sendInviteEmail({ admin, email, locale, token }) {
  const { t } = await getServerTranslations({
    supabaseAdmin: admin,
    locale: locale || "en",
    namespaces: ["emails"],
  });
  const inviteUrl = `${APP_URL}/admin-invite?token=${encodeURIComponent(token)}`;
  const subject = t("emails.adminInvite.subject");
  const title = t("emails.adminInvite.title");
  const intro = t("emails.adminInvite.intro");
  const button = t("emails.adminInvite.button");
  const expiry = t("emails.adminInvite.expiry");
  const ignore = t("emails.adminInvite.ignore");
  const logoUrl = `${APP_URL}/brand/spreelologo.png`;

  const html = `<!doctype html><html><body style="margin:0;background:#f7f6fb;font-family:Arial,sans-serif;color:#101a44"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" style="max-width:600px;background:#fff;border:1px solid #e7e3f4;border-radius:24px;overflow:hidden"><tr><td style="padding:32px"><img src="${escapeHtml(logoUrl)}" alt="Spreelo" width="118" style="display:block;margin-bottom:28px"><h1 style="font-size:28px;line-height:1.15;margin:0 0 16px">${escapeHtml(title)}</h1><p style="font-size:16px;line-height:1.6;color:#4d5576;margin:0 0 24px">${escapeHtml(intro)}</p><a href="${escapeHtml(inviteUrl)}" style="display:inline-block;background:#5b36e8;color:#fff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px">${escapeHtml(button)}</a><p style="font-size:13px;line-height:1.6;color:#7b819d;margin:24px 0 0">${escapeHtml(expiry)}</p><p style="font-size:13px;line-height:1.6;color:#7b819d;margin:8px 0 0">${escapeHtml(ignore)}</p></td></tr></table></td></tr></table></body></html>`;
  const text = `${title}\n\n${intro}\n\n${inviteUrl}\n\n${expiry}\n${ignore}`;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: RESEND_FROM_EMAIL, to: email, subject, html, text }),
  });
  if (!response.ok) throw new Error(await response.text());
}

export async function GET(request) {
  const gate = await requirePrimaryAdmin(request);
  if (gate.response) return gate.response;
  const { admin } = gate.context;

  const [membersResult, invitesResult] = await Promise.all([
    admin
      .from("spreelo_admin_team_members")
      .select("email, user_id, status, accepted_at, revoked_at, created_at, updated_at")
      .order("created_at", { ascending: true }),
    admin
      .from("spreelo_admin_team_invites")
      .select("id, email, locale, created_at, expires_at, accepted_at, revoked_at, accepted_user_id")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (membersResult.error) return Response.json({ ok: false, error: membersResult.error.message }, { status: 500 });
  if (invitesResult.error) return Response.json({ ok: false, error: invitesResult.error.message }, { status: 500 });

  const configured = getConfiguredAdminEmails().map((email) => ({
    email,
    source: email === getPrimaryAdminEmail() ? "primary" : "configured",
    status: "active",
    revokable: false,
  }));

  return Response.json({
    ok: true,
    primaryEmail: getPrimaryAdminEmail(),
    configured,
    members: (membersResult.data || []).map((item) => ({ ...item, source: "invited", revokable: true })),
    invites: invitesResult.data || [],
  });
}

export async function POST(request) {
  const gate = await requirePrimaryAdmin(request);
  if (gate.response) return gate.response;
  const { admin, user } = gate.context;
  const body = await request.json().catch(() => ({}));
  const email = normalizeAdminEmail(body?.email);
  const locale = String(body?.locale || "en").trim().toLowerCase().slice(0, 16) || "en";

  if (!isValidEmail(email)) return Response.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  if (getConfiguredAdminEmails().includes(email)) {
    return Response.json({ ok: false, error: "This email already has configured administrator access." }, { status: 409 });
  }

  const { data: activeMember, error: memberError } = await admin
    .from("spreelo_admin_team_members")
    .select("email, status")
    .eq("email", email)
    .eq("status", "active")
    .maybeSingle();
  if (memberError) return Response.json({ ok: false, error: memberError.message }, { status: 500 });
  if (activeMember) return Response.json({ ok: false, error: "This email is already an active administrator." }, { status: 409 });

  const nowIso = new Date().toISOString();
  await admin
    .from("spreelo_admin_team_invites")
    .update({ revoked_at: nowIso })
    .eq("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null);

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashInviteToken(token);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
  const { data: invite, error: insertError } = await admin
    .from("spreelo_admin_team_invites")
    .insert({
      email,
      token_hash: tokenHash,
      locale,
      invited_by_user_id: user.id,
      expires_at: expiresAt,
    })
    .select("id, email, locale, created_at, expires_at")
    .single();

  if (insertError) return Response.json({ ok: false, error: insertError.message }, { status: 500 });

  try {
    await sendInviteEmail({ admin, email, locale, token });
  } catch (error) {
    await admin.from("spreelo_admin_team_invites").update({ revoked_at: new Date().toISOString() }).eq("id", invite.id);
    return Response.json({ ok: false, error: error?.message || "The invitation email could not be sent." }, { status: 502 });
  }

  return Response.json({ ok: true, invite });
}

export async function DELETE(request) {
  const gate = await requirePrimaryAdmin(request);
  if (gate.response) return gate.response;
  const { admin } = gate.context;
  const body = await request.json().catch(() => ({}));
  const email = normalizeAdminEmail(body?.email);

  if (!email) return Response.json({ ok: false, error: "Email is required." }, { status: 400 });
  if (getConfiguredAdminEmails().includes(email)) {
    return Response.json({ ok: false, error: "Configured administrators cannot be revoked from this screen." }, { status: 409 });
  }

  const { data: member, error: memberError } = await admin
    .from("spreelo_admin_team_members")
    .select("email, user_id, status")
    .eq("email", email)
    .eq("status", "active")
    .maybeSingle();
  if (memberError) return Response.json({ ok: false, error: memberError.message }, { status: 500 });
  if (!member) return Response.json({ ok: false, error: "Active administrator not found." }, { status: 404 });

  // Remove protected app metadata first. Do not silently continue if this fails:
  // otherwise the user could retain the server-side plan-limit bypass.
  if (member.user_id) {
    const { data: userResult, error: getUserError } = await admin.auth.admin.getUserById(member.user_id);
    if (getUserError || !userResult?.user) {
      return Response.json({ ok: false, error: getUserError?.message || "The administrator account could not be loaded." }, { status: 500 });
    }
    const { error: metadataError } = await admin.auth.admin.updateUserById(member.user_id, {
      app_metadata: { ...(userResult.user.app_metadata || {}), spreelo_admin: false },
    });
    if (metadataError) {
      return Response.json({ ok: false, error: `Admin access could not be revoked safely: ${metadataError.message}` }, { status: 500 });
    }
  }

  const nowIso = new Date().toISOString();
  const { error: revokeError } = await admin
    .from("spreelo_admin_team_members")
    .update({ status: "revoked", revoked_at: nowIso, updated_at: nowIso })
    .eq("email", email)
    .eq("status", "active");
  if (revokeError) return Response.json({ ok: false, error: revokeError.message }, { status: 500 });

  await admin
    .from("spreelo_admin_team_invites")
    .update({ revoked_at: nowIso })
    .eq("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null);

  return Response.json({ ok: true });
}

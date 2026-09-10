import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

type Copy = {
  subject: string;
  title: string;
  intro: string;
  code: string;
  expires: string;
  ignore: string;
};

type HookPayload = {
  user: {
    email?: string;
    user_metadata?: Record<string, unknown>;
  };
  email_data: {
    token?: string;
    redirect_to?: string;
  };
};

// English is the only authored source language. Non-English copy is loaded from
// the same persistent ui_translation_packs cache used by the web application.
const EN_COPY: Copy = {
  subject: "Your Spreelo sign-in code",
  title: "Sign in to Spreelo",
  intro: "Use the verification code below to finish signing in. The code can only be used once.",
  code: "Your sign-in code",
  expires: "This code expires shortly.",
  ignore: "If you did not request this email, you can safely ignore it.",
};

const SUPPORTED_LOCALES = new Set([
  "en", "sv", "es", "pt", "fr", "de", "it", "nl", "da", "no", "fi", "pl",
  "tr", "ar", "hi", "id", "ja", "ko", "zh", "th", "uk", "ru", "bg", "vi",
  "cs", "ro", "hu", "el", "ms", "fil",
]);

const EMAIL_KEYS = {
  subject: "emails.signIn.subject",
  title: "emails.signIn.title",
  intro: "emails.signIn.intro",
  code: "emails.signIn.codeLabel",
  expires: "emails.signIn.expires",
  ignore: "emails.signIn.ignore",
} as const;

function normalizeLocale(value: unknown) {
  const locale = String(value || "").trim().toLowerCase().replace("_", "-");
  const short = locale.split("-")[0];
  return SUPPORTED_LOCALES.has(locale) ? locale : SUPPORTED_LOCALES.has(short) ? short : "en";
}

function getLocale(payload: HookPayload) {
  try {
    const redirect = new URL(payload.email_data.redirect_to || "https://app.spreelo.com");
    const redirectLocale = redirect.searchParams.get("lang");
    if (redirectLocale) return normalizeLocale(redirectLocale);
  } catch {
    // Fall back to the locale stored when a new user is created.
  }

  return normalizeLocale(payload.user.user_metadata?.app_locale);
}

function copyFromLabels(labels: Record<string, unknown> | null | undefined): Copy | null {
  if (!labels || typeof labels !== "object") return null;

  const resolved = Object.fromEntries(
    Object.entries(EMAIL_KEYS).map(([field, key]) => [field, String(labels[key] || "").trim()])
  ) as Record<keyof Copy, string>;

  if (Object.values(resolved).some((value) => !value)) return null;
  return resolved as Copy;
}

async function loadFromAppTranslationCache(locale: string): Promise<Copy | null> {
  const appUrl = String(Deno.env.get("SPREELO_APP_URL") || "https://app.spreelo.com").replace(/\/$/, "");

  try {
    const response = await fetch(
      `${appUrl}/api/ui-translations?locale=${encodeURIComponent(locale)}&namespaces=emails`,
      { headers: { Accept: "application/json" } }
    );
    if (!response.ok) return null;
    const payload = await response.json();
    return copyFromLabels(payload?.labels);
  } catch (error) {
    console.warn("Could not load auth email copy from app translation cache", error);
    return null;
  }
}

async function loadFromDatabase(locale: string): Promise<Copy | null> {
  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  const serviceRoleKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
  if (!supabaseUrl || !serviceRoleKey) return null;

  try {
    const url = new URL(`${supabaseUrl}/rest/v1/ui_translation_packs`);
    url.searchParams.set("locale", `eq.${locale}`);
    url.searchParams.set("namespace", "eq.emails");
    url.searchParams.set("select", "labels,status");
    url.searchParams.set("limit", "1");

    const response = await fetch(url, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: "application/json",
      },
    });
    if (!response.ok) return null;

    const rows = await response.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    return copyFromLabels(row?.labels);
  } catch (error) {
    console.warn("Could not load auth email copy directly from database", error);
    return null;
  }
}

async function getCopy(locale: string): Promise<Copy> {
  if (locale === "en") return EN_COPY;

  // The application endpoint owns source-fingerprint checks, single-flight AI
  // generation and persistence. This call therefore reuses existing DB copy and
  // only invokes AI when this locale/key genuinely does not exist or changed.
  return (
    (await loadFromAppTranslationCache(locale)) ||
    (await loadFromDatabase(locale)) ||
    EN_COPY
  );
}

function renderEmail(copy: Copy, token: string, locale: string) {
  const direction = locale === "ar" ? "rtl" : "ltr";
  return `<!doctype html>
<html lang="${locale}" dir="${direction}">
  <body style="margin:0;background:#eef1f6;font-family:Inter,Arial,sans-serif;color:#111a2e;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 14px;background:#eef1f6;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;overflow:hidden;border:1px solid #dfe4ec;border-radius:24px;background:#ffffff;box-shadow:0 18px 55px rgba(17,26,46,.12);">
          <tr><td style="padding:30px 36px;background:linear-gradient(135deg,#071d32,#123b5d);">
            <img src="https://app.spreelo.com/brand/spreelologo.png" width="145" alt="Spreelo" style="display:block;filter:brightness(0) invert(1);">
          </td></tr>
          <tr><td style="padding:38px 36px 18px;">
            <div style="display:inline-block;padding:7px 12px;border-radius:999px;background:#fff0ea;color:#cf4f33;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">Spreelo</div>
            <h1 style="margin:18px 0 10px;font-size:30px;line-height:1.16;color:#111a2e;">${copy.title}</h1>
            <p style="margin:0;color:#68758c;font-size:16px;line-height:1.65;">${copy.intro}</p>
          </td></tr>
          <tr><td style="padding:8px 36px 24px;">
            <div style="padding:24px;border:1px solid #ffd4c7;border-radius:18px;background:#fff8f5;text-align:center;">
              <p style="margin:0 0 10px;color:#96503c;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;">${copy.code}</p>
              <div style="font-size:38px;font-weight:850;letter-spacing:.24em;color:#071d32;direction:ltr;">${token}</div>
              <p style="margin:12px 0 0;color:#7b8495;font-size:13px;">${copy.expires}</p>
            </div>
          </td></tr>
          <tr><td style="padding:0 36px 36px;">
            <p style="margin:0;padding-top:22px;border-top:1px solid #e7eaf0;color:#7b8495;font-size:13px;line-height:1.6;">${copy.ignore}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const webhookSecret = Deno.env.get("SEND_EMAIL_HOOK_SECRET") || "";
    const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
    const from = Deno.env.get("SPREELO_AUTH_EMAIL_FROM") || "Spreelo <noreply@spreelo.com>";

    if (!webhookSecret || !resendApiKey) {
      throw new Error("Missing SEND_EMAIL_HOOK_SECRET or RESEND_API_KEY");
    }

    const rawPayload = await request.text();
    const headers = Object.fromEntries(request.headers.entries());
    const webhook = new Webhook(webhookSecret.replace("v1,whsec_", ""));
    const payload = webhook.verify(rawPayload, headers) as HookPayload;
    const recipient = String(payload.user.email || "").trim();
    const token = String(payload.email_data.token || "").trim();

    if (!recipient || !token) throw new Error("Missing recipient or token");

    const locale = getLocale(payload);
    const copy = await getCopy(locale);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject: copy.subject,
        html: renderEmail(copy, token, locale),
        text: `${copy.title}\n\n${copy.intro}\n\n${copy.code}: ${token}\n${copy.expires}\n\n${copy.ignore}`,
      }),
    });

    if (!response.ok) {
      throw new Error((await response.text()) || "Resend delivery failed");
    }

    return Response.json({});
  } catch (error) {
    console.error("Spreelo auth email hook failed", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Email hook failed" },
      { status: 500 }
    );
  }
});

import { createClient } from "@supabase/supabase-js";
import {
  getDefaultNamespaceLabels,
  interpolateUiText,
} from "../../../lib/i18n/defaultLabels.js";
import {
  getServerTranslations,
  resolveBestServerLocale,
} from "../../../lib/i18n/serverUiText.js";

export const dynamic = "force-dynamic";

function createFallbackTranslator() {
  const labels = {
    ...getDefaultNamespaceLabels("common"),
    ...getDefaultNamespaceLabels("approvePages"),
  };

  return {
    locale: "en",
    t(key, values = {}) {
      return interpolateUiText(labels[key] || key, values);
    },
  };
}

async function getApproveTranslations({ supabase, locale }) {
  if (!supabase) return createFallbackTranslator();

  try {
    return await getServerTranslations({
      supabaseAdmin: supabase,
      locale,
      namespaces: ["approvePages"],
    });
  } catch (error) {
    console.error("Could not load approve page translations", error);
    return createFallbackTranslator();
  }
}

function createHtmlPage({ title, message, status = "success", t, locale = "en" }) {
  const isSuccess = status === "success";

  return `
<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        font-family: Arial, sans-serif;
        background: #f5f3ee;
        color: #111827;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }

      .card {
        width: 100%;
        max-width: 560px;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 18px;
        padding: 32px;
        box-shadow: 0 20px 60px rgba(15, 23, 42, 0.08);
        text-align: center;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 48px;
        height: 48px;
        border-radius: 999px;
        margin-bottom: 18px;
        background: ${isSuccess ? "#dcfce7" : "#fee2e2"};
        color: ${isSuccess ? "#166534" : "#991b1b"};
        font-size: 24px;
      }

      h1 {
        margin: 0 0 12px;
        font-size: 26px;
      }

      p {
        margin: 0 0 18px;
        color: #4b5563;
        line-height: 1.6;
      }

      .small-text {
        margin-top: 16px;
        margin-bottom: 0;
        color: #6b7280;
        font-size: 13px;
      }

      .button-row {
        display: flex;
        justify-content: center;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 22px;
      }

      a,
      button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 12px 18px;
        border-radius: 999px;
        text-decoration: none;
        font-weight: 700;
        font-size: 14px;
        cursor: pointer;
      }

      a {
        background: #111827;
        color: #ffffff;
        border: 1px solid #111827;
      }

      button {
        background: #ffffff;
        color: #111827;
        border: 1px solid #d1d5db;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="badge">${isSuccess ? "✓" : "!"}</div>
      <h1>${title}</h1>
      <p>${message}</p>

      ${
        isSuccess
          ? `
            <div class="button-row">
              <button type="button" onclick="window.close()">${t("approvePages.closePage")}</button>
              <a href="https://app.spreelo.com">${t("approvePages.openSpreelo")}</a>
            </div>

            <p class="small-text">
              ${t("approvePages.safeClose")}
            </p>
          `
          : `
            <div class="button-row">
              <a href="https://app.spreelo.com">${t("approvePages.openSpreelo")}</a>
            </div>
          `
      }
    </main>
  </body>
</html>
`;
}

function htmlResponse({ title, message, status = "success", httpStatus = 200, t, locale }) {
  return new Response(
    createHtmlPage({
      title,
      message,
      status,
      t,
      locale,
    }),
    {
      status: httpStatus,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }
  );
}

export async function GET(request) {
  const requestLocale = resolveBestServerLocale({ request });
  let translator = createFallbackTranslator();

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      translator = await getApproveTranslations({ locale: requestLocale });

      return htmlResponse({
        title: translator.t("approvePages.configurationError.title"),
        message: translator.t("approvePages.configurationError.message"),
        status: "error",
        httpStatus: 500,
        t: translator.t,
        locale: translator.locale,
      });
    }

    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (!token) {
      translator = await getApproveTranslations({
        supabase,
        locale: requestLocale,
      });

      return htmlResponse({
        title: translator.t("approvePages.invalidLink.title"),
        message: translator.t("approvePages.invalidLink.message"),
        status: "error",
        httpStatus: 400,
        t: translator.t,
        locale: translator.locale,
      });
    }

    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("id, status, approval_token, language, brand_profile_id")
      .eq("approval_token", token)
      .single();

    let brandProfile = null;

    if (post?.brand_profile_id) {
      const { data: loadedBrandProfile } = await supabase
        .from("brand_profiles")
        .select("id, content_language")
        .eq("id", post.brand_profile_id)
        .maybeSingle();

      brandProfile = loadedBrandProfile || null;
    }

    const postLocale = resolveBestServerLocale({
      request,
      languageCandidates: [post?.language, brandProfile?.content_language],
    });

    translator = await getApproveTranslations({
      supabase,
      locale: postLocale,
    });

    if (postError || !post) {
      return htmlResponse({
        title: translator.t("approvePages.notFound.title"),
        message: translator.t("approvePages.notFound.message"),
        status: "error",
        httpStatus: 404,
        t: translator.t,
        locale: translator.locale,
      });
    }

    if (post.status === "approved") {
      return htmlResponse({
        title: translator.t("approvePages.alreadyApproved.title"),
        message: translator.t("approvePages.alreadyApproved.message"),
        status: "success",
        httpStatus: 200,
        t: translator.t,
        locale: translator.locale,
      });
    }

    if (post.status !== "pending_approval") {
      return htmlResponse({
        title: translator.t("approvePages.cannotApprove.title"),
        message: translator.t("approvePages.cannotApprove.message", {
          status: post.status,
        }),
        status: "error",
        httpStatus: 409,
        t: translator.t,
        locale: translator.locale,
      });
    }

    const approvedAt = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("posts")
      .update({
        status: "approved",
        approved_at: approvedAt,
        updated_at: approvedAt,
      })
      .eq("id", post.id);

    if (updateError) {
      return htmlResponse({
        title: translator.t("approvePages.failed.title"),
        message: translator.t("approvePages.failed.message"),
        status: "error",
        httpStatus: 500,
        t: translator.t,
        locale: translator.locale,
      });
    }

    return htmlResponse({
      title: translator.t("approvePages.approved.title"),
      message: translator.t("approvePages.approved.message"),
      status: "success",
      httpStatus: 200,
      t: translator.t,
      locale: translator.locale,
    });
  } catch (error) {
    return htmlResponse({
      title: translator.t("approvePages.unexpected.title"),
      message: error.message || translator.t("approvePages.unexpected.message"),
      status: "error",
      httpStatus: 500,
      t: translator.t,
      locale: translator.locale,
    });
  }
}

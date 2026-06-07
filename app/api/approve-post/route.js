import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function createHtmlPage({ title, message, status = "success" }) {
  const isSuccess = status === "success";

  return `
<!doctype html>
<html lang="en">
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
              <button type="button" onclick="window.close()">Close page</button>
              <a href="https://app.spreelo.com">Open Spreelo</a>
            </div>

            <p class="small-text">
              You can safely close this page and continue with your next email.
            </p>
          `
          : `
            <div class="button-row">
              <a href="https://app.spreelo.com">Open Spreelo</a>
            </div>
          `
      }
    </main>
  </body>
</html>
`;
}

export async function GET(request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        createHtmlPage({
          title: "Configuration error",
          message:
            "Spreelo could not approve this post because the server is missing required configuration.",
          status: "error",
        }),
        {
          status: 500,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }
      );
    }

    const url = new URL(request.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return new Response(
        createHtmlPage({
          title: "Invalid approval link",
          message: "This approval link is missing a valid token.",
          status: "error",
        }),
        {
          status: 400,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("id, status, approval_token")
      .eq("approval_token", token)
      .single();

    if (postError || !post) {
      return new Response(
        createHtmlPage({
          title: "Approval link not found",
          message:
            "This approval link is invalid, expired, or the post no longer exists.",
          status: "error",
        }),
        {
          status: 404,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }
      );
    }

    if (post.status === "approved") {
      return new Response(
        createHtmlPage({
          title: "Post already approved",
          message:
            "This post has already been approved in Spreelo. You can safely close this page.",
          status: "success",
        }),
        {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }
      );
    }

    if (post.status !== "pending_approval") {
      return new Response(
        createHtmlPage({
          title: "Post cannot be approved",
          message: `This post currently has status "${post.status}" and cannot be approved from this link.`,
          status: "error",
        }),
        {
          status: 409,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }
      );
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
      return new Response(
        createHtmlPage({
          title: "Approval failed",
          message:
            "Spreelo could not approve this post right now. Please try again later.",
          status: "error",
        }),
        {
          status: 500,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }
      );
    }

    return new Response(
      createHtmlPage({
        title: "Post approved",
        message:
          "Your post has been approved successfully. You can now close this page or open Spreelo to review your posts.",
        status: "success",
      }),
      {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }
    );
  } catch (error) {
    return new Response(
      createHtmlPage({
        title: "Unexpected error",
        message:
          error.message || "Something went wrong while approving this post.",
        status: "error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }
    );
  }
}

"use client";

import { useEffect, useState } from "react";
import AppLayout from "../../components/AppLayout";
import { supabase } from "../../lib/supabaseClient";

function formatConnectionStatus(status) {
  if (status === "connected") return "Connected";
  if (status === "expired") return "Needs reconnect";
  if (status === "error") return "Connection error";
  if (status === "disconnected") return "Disconnected";

  return "Not connected";
}

function getStatusClass(status) {
  if (status === "connected") return "status-pill success";
  if (status === "expired") return "status-pill warning";
  if (status === "error") return "status-pill danger";

  return "status-pill";
}

export default function SocialChannelsPage() {
  const [facebookConnection, setFacebookConnection] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadConnections();
  }, []);

  async function loadConnections() {
    setLoading(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    setCurrentUser(user);

    const { data, error } = await supabase
      .from("social_connections")
      .select(
        "id, platform, page_id, page_name, status, created_at, updated_at, token_expires_at"
      )
      .eq("user_id", user.id)
      .eq("platform", "facebook")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      setMessage(error.message);
      setFacebookConnection(null);
    } else {
      setFacebookConnection(data || null);
    }

    setLoading(false);
  }

  async function handleDisconnect() {
    if (!facebookConnection?.id) return;

    const confirmed = window.confirm(
      "Disconnect this Facebook page from Spreelo?"
    );

    if (!confirmed) return;

    setMessage("");

    const { error } = await supabase
      .from("social_connections")
      .update({
        status: "disconnected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", facebookConnection.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadConnections();
  }

  return (
    <AppLayout active="social-channels">
      <header className="topbar">
        <div>
          <p className="eyebrow">Social channels</p>
          <h2>Connect your publishing channels</h2>
        </div>
      </header>

      {message && <p className="login-message">{message}</p>}

      <section className="hero-card">
        <div>
          <p className="eyebrow">Facebook</p>
          <h3>Facebook Page</h3>
          <p>
            Connect a Facebook Page so Spreelo can publish approved posts to the
            right business page.
          </p>
        </div>

        <div className="prompt-box">
          {loading ? (
            <p className="login-message">Loading connection...</p>
          ) : facebookConnection?.status === "connected" ? (
            <>
              <label>Connected page</label>
              <div className="input">
                {facebookConnection.page_name || "Facebook Page"}
              </div>

              <label>Page ID</label>
              <div className="input">
                {facebookConnection.page_id || "No page ID found"}
              </div>

              <div className={getStatusClass(facebookConnection.status)}>
                {formatConnectionStatus(facebookConnection.status)}
              </div>

              <button
                type="button"
                className="secondary-button full"
                onClick={handleDisconnect}
              >
                Disconnect Facebook
              </button>
            </>
          ) : (
            <>
              <label>Status</label>
              <div className={getStatusClass(facebookConnection?.status)}>
                {formatConnectionStatus(facebookConnection?.status)}
              </div>

              <p>
                You have not connected a Facebook Page yet. Start by connecting
                Facebook and choosing the page Spreelo should publish to.
              </p>

              <a
                className="primary-button full"
                href={
                  currentUser?.id
                    ? `/api/meta/connect?user_id=${currentUser.id}`
                    : "/social-channels"
                }
              >
                Connect Facebook
              </a>
            </>
          )}
        </div>
      </section>

      <section className="hero-card">
        <div>
          <p className="eyebrow">Coming later</p>
          <h3>More channels</h3>
          <p>
            Instagram, Google Business Profile and LinkedIn can be added later
            using the same connection structure.
          </p>
        </div>

        <div className="prompt-box">
          <label>Instagram</label>
          <div className="input">Coming soon</div>

          <label>Google Business Profile</label>
          <div className="input">Coming soon</div>

          <label>LinkedIn</label>
          <div className="input">Coming soon</div>
        </div>
      </section>
    </AppLayout>
  );
}

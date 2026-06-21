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

function getBrandStorageKey(userId) {
  return `spreelo_current_brand_id_${userId}`;
}

export default function SocialChannelsPage() {
  const [facebookConnection, setFacebookConnection] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentBrand, setCurrentBrand] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
const [isConnectingFacebook, setIsConnectingFacebook] = useState(false);

  useEffect(() => {
    loadConnections();
  }, []);

  async function getCurrentBrandForUser(user) {
    const savedBrandId =
      typeof window !== "undefined"
        ? localStorage.getItem(getBrandStorageKey(user.id))
        : "";

    if (savedBrandId) {
      const { data: savedBrand, error: savedBrandError } = await supabase
        .from("brand_profiles")
        .select("id, business_name")
        .eq("id", savedBrandId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!savedBrandError && savedBrand?.id) {
        return savedBrand;
      }
    }

    const { data: defaultBrand, error: defaultBrandError } = await supabase
      .from("brand_profiles")
      .select("id, business_name")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (defaultBrandError) {
      throw defaultBrandError;
    }

    if (defaultBrand?.id && typeof window !== "undefined") {
      localStorage.setItem(getBrandStorageKey(user.id), defaultBrand.id);
    }

    return defaultBrand || null;
  }

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

    let selectedBrand = null;

    try {
      selectedBrand = await getCurrentBrandForUser(user);
      setCurrentBrand(selectedBrand);
    } catch (error) {
      setMessage(error.message || "Could not load selected brand.");
      setFacebookConnection(null);
      setLoading(false);
      return;
    }

    if (!selectedBrand?.id) {
      setMessage("Create or select a brand before connecting social channels.");
      setFacebookConnection(null);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("social_connections")
      .select(
        "id, platform, page_id, page_name, status, created_at, updated_at, token_expires_at, brand_profile_id"
      )
      .eq("user_id", user.id)
      .eq("brand_profile_id", selectedBrand.id)
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
      "Disconnect this Facebook page from this brand?"
    );

    if (!confirmed) return;

    setMessage("");

    const { error } = await supabase
      .from("social_connections")
      .update({
        status: "disconnected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", facebookConnection.id)
      .eq("user_id", currentUser.id)
      .eq("brand_profile_id", currentBrand.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadConnections();
  }

  const connectUrl =
    currentUser?.id && currentBrand?.id
      ? `/api/meta/connect?user_id=${currentUser.id}&brand_profile_id=${currentBrand.id}`
      : "/social-channels";

  return (
    <AppLayout active="social-channels">
      <header className="topbar">
        <div>
          <p className="eyebrow">Social channels</p>
          <h2>Connect your publishing channels</h2>
          {currentBrand?.business_name && (
            <p>
              Current brand: <strong>{currentBrand.business_name}</strong>
            </p>
          )}
        </div>
      </header>

      {message && <p className="login-message">{message}</p>}

      <section className="hero-card">
        <div>
          <p className="eyebrow">Facebook</p>
          <h3>Facebook Page</h3>
          <p>
            Connect a Facebook Page for the selected brand. Spreelo will only
            publish this brand&apos;s approved posts to this connected page.
          </p>
        </div>

       <div className="prompt-box social-connect-box">
          {loading ? (
            <p className="login-message">Loading connection...</p>
          ) : facebookConnection?.status === "connected" ? (
            <>
              <label>Connected brand</label>
              <div className="input">
                {currentBrand?.business_name || "Selected brand"}
              </div>

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
              <label>Selected brand</label>
              <div className="input">
                {currentBrand?.business_name || "No brand selected"}
              </div>

              <label>Status</label>
              <div className={getStatusClass(facebookConnection?.status)}>
                {formatConnectionStatus(facebookConnection?.status)}
              </div>

              <p>
                Connect Facebook for this selected brand. If you have several
                brands, switch Current brand in the sidebar before connecting
                another Facebook Page.
              </p>

            <a className="primary-button social-connect-button" href={connectUrl}>
  Connect Facebook
</a>
            </>
          )}
        </div>
      </section>

    </AppLayout>
  );
}

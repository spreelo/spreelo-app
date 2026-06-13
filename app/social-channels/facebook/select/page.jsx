"use client";

import { useEffect, useState } from "react";
import AppLayout from "../../../../components/AppLayout";
import { supabase } from "../../../../lib/supabaseClient";

export default function SelectFacebookPage() {
  const [pages, setPages] = useState([]);
  const [sessionId, setSessionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingPageId, setSavingPageId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const currentSessionId = params.get("session_id") || "";

    setSessionId(currentSessionId);

    if (!currentSessionId) {
      setMessage("Missing Facebook selection session.");
      setLoading(false);
      return;
    }

    loadPages(currentSessionId);
  }, []);

  async function getAccessToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token || "";
  }

  async function loadPages(currentSessionId) {
    setLoading(true);
    setMessage("");

    const accessToken = await getAccessToken();

    if (!accessToken) {
      window.location.href = "/login";
      return;
    }

    const response = await fetch(
      `/api/meta/page-selection?session_id=${currentSessionId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      setMessage(data?.error || "Could not load Facebook pages.");
      setPages([]);
      setLoading(false);
      return;
    }

    setPages(data.pages || []);
    setLoading(false);
  }

  async function selectPage(pageId) {
    if (!sessionId || !pageId) return;

    setSavingPageId(pageId);
    setMessage("");

    const accessToken = await getAccessToken();

    if (!accessToken) {
      window.location.href = "/login";
      return;
    }

    const response = await fetch("/api/meta/page-selection", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session_id: sessionId,
        page_id: pageId,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      setMessage(data?.error || "Could not connect selected Facebook page.");
      setSavingPageId("");
      return;
    }

    window.location.href = "/social-channels?connected=facebook";
  }

  return (
    <AppLayout active="social-channels">
      <header className="topbar">
        <div>
          <p className="eyebrow">Facebook</p>
          <h2>Choose Facebook Page</h2>
        </div>
      </header>

      {message && <p className="login-message">{message}</p>}

      <section className="hero-card">
        <div>
          <p className="eyebrow">Connect Facebook</p>
          <h3>Select the page Spreelo should publish to</h3>
          <p>
            Choose the business page that should receive posts from Spreelo.
            You can disconnect or change this later.
          </p>
        </div>

        <div className="prompt-box">
          {loading ? (
            <p className="login-message">Loading your Facebook Pages...</p>
          ) : pages.length === 0 ? (
            <>
              <label>No pages found</label>
              <p>
                Spreelo could not find any Facebook Pages connected to your
                Facebook account.
              </p>
              <a className="secondary-button full" href="/social-channels">
                Back to social channels
              </a>
            </>
          ) : (
            <>
              <label>Available Facebook Pages</label>

              {pages.map((page) => (
                <button
                  key={page.id}
                  type="button"
                  className="secondary-button full"
                  onClick={() => selectPage(page.id)}
                  disabled={Boolean(savingPageId)}
                >
                  {savingPageId === page.id
                    ? "Connecting..."
                    : `Connect ${page.name}`}
                </button>
              ))}

              <a className="secondary-button full" href="/social-channels">
                Cancel
              </a>
            </>
          )}
        </div>
      </section>
    </AppLayout>
  );
}

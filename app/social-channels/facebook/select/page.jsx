"use client";

import { useEffect, useState } from "react";
import AppLayout from "../../../../components/AppLayout";
import { supabase } from "../../../../lib/supabaseClient";

export default function SelectFacebookPage() {
  const [pages, setPages] = useState([]);
  const [selectedBrand, setSelectedBrand] = useState(null);
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
      setSelectedBrand(null);
      setLoading(false);
      return;
    }

    setPages(data.pages || []);
    setSelectedBrand(data.brand || null);
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
      <section className="facebook-select-page">
        <header className="facebook-select-hero">
          <div className="facebook-select-hero-copy">
            <div className="facebook-select-badge">
              <span className="facebook-logo-mark">f</span>
              <span>Facebook</span>
            </div>

            <h2>Choose Facebook Page</h2>

            {selectedBrand?.business_name ? (
              <p>
                Connect the Facebook Page that Spreelo should publish to for{" "}
                <strong>{selectedBrand.business_name}</strong>.
              </p>
            ) : (
              <p>
                Choose which Facebook Page Spreelo should use for this selected
                brand.
              </p>
            )}
          </div>

          {selectedBrand?.business_name && (
            <div className="facebook-selected-brand-card">
              <span>Selected brand</span>
              <strong>{selectedBrand.business_name}</strong>
            </div>
          )}
        </header>

        {message && <p className="login-message">{message}</p>}

        <section className="facebook-select-card">
          <div className="facebook-select-info">
            <div className="facebook-large-icon">
              <span>f</span>
            </div>

            <p className="eyebrow">Connect Facebook</p>
            <h3>Select the page Spreelo should publish to</h3>

            <p>
              Choose the Facebook Page that belongs to the selected brand.
              Spreelo will only publish this brand&apos;s approved posts to the
              connected page.
            </p>

            <div className="facebook-select-note">
              <strong>Important</strong>
              <span>
                If this Facebook Page was connected to another brand before,
                Spreelo will move the connection to this selected brand.
              </span>
            </div>
          </div>

          <div className="facebook-page-picker-card">
            {loading ? (
              <div className="facebook-loading-box">
                <span className="facebook-select-spinner" />
                <strong>Loading Facebook Pages</strong>
                <p>Please wait while Spreelo loads your available pages.</p>
              </div>
            ) : pages.length === 0 ? (
              <>
                <div className="facebook-picker-header">
                  <span>No pages found</span>
                  <h3>No Facebook Pages available</h3>
                  <p>
                    Spreelo could not find any Facebook Pages connected to your
                    Facebook account.
                  </p>
                </div>

                <a className="facebook-cancel-button" href="/social-channels">
                  Back to social channels
                </a>
              </>
            ) : (
              <>
                <div className="facebook-picker-header">
                  <span>Available pages</span>
                  <h3>Choose a Facebook Page</h3>
                  <p>
                    Pick the page that should receive posts for{" "}
                    <strong>
                      {selectedBrand?.business_name || "this brand"}
                    </strong>
                    .
                  </p>
                </div>

                <div className="facebook-page-list">
                  {pages.map((page) => {
                    const isSaving = savingPageId === page.id;
                    const isDisabled = Boolean(savingPageId);

                    return (
                      <button
                        key={page.id}
                        type="button"
                        className={`facebook-page-option ${
                          isSaving ? "loading" : ""
                        }`}
                        onClick={() => selectPage(page.id)}
                        disabled={isDisabled}
                      >
                        <span className="facebook-page-option-icon">f</span>

                        <span className="facebook-page-option-copy">
                          <strong>{page.name}</strong>
                          <small>
                            {isSaving
                              ? "Connecting page..."
                              : "Available to connect"}
                          </small>
                        </span>

                        <span className="facebook-page-option-action">
                          {isSaving ? (
                            <span className="facebook-select-spinner small" />
                          ) : (
                            "Connect"
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <a className="facebook-cancel-button" href="/social-channels">
                  Cancel
                </a>
              </>
            )}
          </div>
        </section>
      </section>
    </AppLayout>
  );
}

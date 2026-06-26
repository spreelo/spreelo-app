"use client";

import { useEffect, useState } from "react";
import AppLayout from "../../../../components/AppLayout";
import { supabase } from "../../../../lib/supabaseClient";
import { useUiText } from "../../../../lib/i18n/useUiText";

export default function SelectFacebookPage() {
  const { t } = useUiText(["social"]);

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
      setMessage(t("social.errorMissingSelectionSession"));
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
      setMessage(data?.error || t("social.errorLoadFacebookPages"));
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
      setMessage(data?.error || t("social.errorConnectSelectedPage"));
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
              <span>{t("social.facebookEyebrow")}</span>
            </div>

            <h2>{t("social.pickerTitle")}</h2>

            {selectedBrand?.business_name ? (
              <p>
                {t("social.pickerHeroTextForBrand", {
                  brandName: selectedBrand.business_name,
                })}
              </p>
            ) : (
              <p>{t("social.pickerHeroTextFallback")}</p>
            )}
          </div>

          {selectedBrand?.business_name && (
            <div className="facebook-selected-brand-card">
              <span>{t("social.selectedBrand")}</span>
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

            <p className="eyebrow">{t("social.connectFacebook")}</p>
            <h3>{t("social.pickerInfoTitle")}</h3>

            <p>{t("social.pickerInfoText")}</p>

            <div className="facebook-select-note">
              <strong>{t("social.important")}</strong>
              <span>{t("social.moveConnectionNotice")}</span>
            </div>
          </div>

          <div className="facebook-page-picker-card">
            {loading ? (
              <div className="facebook-loading-box">
                <span className="facebook-select-spinner" />
                <strong>{t("social.loadingFacebookPages")}</strong>
                <p>{t("social.loadingFacebookPagesText")}</p>
              </div>
            ) : pages.length === 0 ? (
              <>
                <div className="facebook-picker-header">
                  <span>{t("social.noPagesFoundEyebrow")}</span>
                  <h3>{t("social.noPagesFoundTitle")}</h3>
                  <p>{t("social.noPagesFoundText")}</p>
                </div>

                <a className="facebook-cancel-button" href="/social-channels">
                  {t("social.backToSocialChannels")}
                </a>
              </>
            ) : (
              <>
                <div className="facebook-picker-header">
                  <span>{t("social.availablePages")}</span>
                  <h3>{t("social.chooseFacebookPage")}</h3>
                  <p>
                    {t("social.pickPageForBrandPrefix")} {" "}
                    <strong>
                      {selectedBrand?.business_name || t("social.thisBrand")}
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
                              ? t("social.connectingPage")
                              : t("social.availableToConnect")}
                          </small>
                        </span>

                        <span className="facebook-page-option-action">
                          {isSaving ? (
                            <span className="facebook-select-spinner small" />
                          ) : (
                            t("social.connect")
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <a className="facebook-cancel-button" href="/social-channels">
                  {t("social.cancel")}
                </a>
              </>
            )}
          </div>
        </section>
      </section>
    </AppLayout>
  );
}

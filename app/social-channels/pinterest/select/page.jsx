"use client";

import { useEffect, useState } from "react";
import AppLayout from "../../../../components/AppLayout";
import { supabase } from "../../../../lib/supabaseClient";
import { useUiText } from "../../../../lib/i18n/useUiText";

export default function SelectPinterestBoard() {
  const { t } = useUiText(["social"]);
  const [boards, setBoards] = useState([]);
  const [brand, setBrand] = useState(null);
  const [connectionId, setConnectionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [apiEnvironment, setApiEnvironment] = useState("production");
  const [creatingSandboxBoard, setCreatingSandboxBoard] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("connection_id") || "";
    setConnectionId(id);
    if (!id) {
      setMessage(t("social.pinterestErrorMissingConnection"));
      setLoading(false);
      return;
    }
    loadBoards(id);
  }, []);

  async function accessToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || "";
  }

  async function loadBoards(id) {
    setLoading(true);
    setMessage("");
    const token = await accessToken();
    if (!token) return (window.location.href = "/login");

    const response = await fetch(`/api/pinterest/boards?connection_id=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data?.error || t("social.pinterestErrorLoadBoards"));
      setBoards([]);
      setLoading(false);
      return;
    }
    setBoards(data.boards || []);
    setBrand(data.brand || null);
    setApiEnvironment(data.api_environment || "production");
    setLoading(false);
  }

  async function createSandboxBoard() {
    setCreatingSandboxBoard(true);
    setMessage("");
    const token = await accessToken();
    if (!token) return (window.location.href = "/login");

    const response = await fetch("/api/pinterest/boards", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ connection_id: connectionId, action: "create_sandbox_board" }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.connected) {
      if (data?.trialRestriction && data?.code) {
        window.location.href = `/social-channels/oauth-complete?error=${encodeURIComponent(data.code)}`;
        return;
      }
      setMessage(data?.error || t("social.pinterestErrorCreateSandboxBoard"));
      setCreatingSandboxBoard(false);
      return;
    }

    window.location.href = "/social-channels/oauth-complete?connected=pinterest&pinterest_test_pin=1";
  }

  async function selectBoard(boardId) {
    setSavingId(boardId);
    setMessage("");
    const token = await accessToken();
    if (!token) return (window.location.href = "/login");

    const response = await fetch("/api/pinterest/boards", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ connection_id: connectionId, board_id: boardId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (data?.trialRestriction && data?.code) {
        window.location.href = `/social-channels/oauth-complete?error=${encodeURIComponent(data.code)}`;
        return;
      }
      setMessage(data?.error || t("social.pinterestErrorSelectBoard"));
      setSavingId("");
      return;
    }
    window.location.href = "/social-channels/oauth-complete?connected=pinterest";
  }

  return (
    <AppLayout active="social-channels">
      <section className="facebook-select-page pinterest-select-page">
        <header className="facebook-select-hero pinterest-select-hero">
          <div className="facebook-select-hero-copy">
            <div className="facebook-select-badge pinterest-select-badge">
              <img src="/social-icons/pinterest.png" alt="" aria-hidden="true" />
              <span>Pinterest</span>
            </div>
            <h2>{t("social.pinterestPickerTitle")}</h2>
            <p>{t("social.pinterestPickerHero", { brandName: brand?.business_name || t("social.thisBrand") })}</p>
          </div>
          {brand?.business_name ? (
            <div className="facebook-selected-brand-card">
              <span>{t("social.selectedBrand")}</span>
              <strong>{brand.business_name}</strong>
            </div>
          ) : null}
        </header>

        {message ? <p className="login-message">{message}</p> : null}

        <section className="facebook-select-card">
          <div className="facebook-select-info">
            <div className="facebook-large-icon pinterest-large-icon"><img src="/social-icons/pinterest.png" alt="" /></div>
            <p className="eyebrow">Pinterest</p>
            <h3>{t("social.pinterestPickerInfoTitle")}</h3>
            <p>{t("social.pinterestPickerInfoText")}</p>
            <div className="facebook-select-note">
              <strong>{t("social.important")}</strong>
              <span>{t("social.pinterestBoardNote")}</span>
            </div>
          </div>

          <div className="facebook-page-picker-card">
            {loading ? (
              <div className="facebook-loading-box">
                <span className="facebook-select-spinner" />
                <strong>{t("social.pinterestLoadingBoards")}</strong>
                <p>{t("social.pinterestLoadingBoardsText")}</p>
              </div>
            ) : boards.length === 0 ? (
              <>
                <div className="facebook-picker-header">
                  <span>{t(apiEnvironment === "sandbox" ? "social.pinterestSandboxEyebrow" : "social.pinterestNoBoardsEyebrow")}</span>
                  <h3>{t(apiEnvironment === "sandbox" ? "social.pinterestSandboxBoardTitle" : "social.pinterestNoBoardsTitle")}</h3>
                  <p>{t(apiEnvironment === "sandbox" ? "social.pinterestSandboxBoardText" : "social.pinterestNoBoardsText")}</p>
                </div>
                {apiEnvironment === "sandbox" ? (
                  <button
                    type="button"
                    className="social-v74-primary-action pinterest-sandbox-create-button"
                    onClick={createSandboxBoard}
                    disabled={creatingSandboxBoard}
                    aria-busy={creatingSandboxBoard}
                  >
                    {creatingSandboxBoard ? t("social.pinterestCreatingSandboxBoard") : t("social.pinterestCreateSandboxBoard")}
                  </button>
                ) : (
                  <a className="facebook-cancel-button" href="https://www.pinterest.com/" target="_blank" rel="noreferrer">
                    {t("social.pinterestOpenPinterest")}
                  </a>
                )}
                <button type="button" className="facebook-cancel-button" onClick={() => loadBoards(connectionId)} disabled={creatingSandboxBoard}>
                  {t("social.refresh")}
                </button>
              </>
            ) : (
              <>
                <div className="facebook-picker-header">
                  <span>{t("social.pinterestAvailableBoards")}</span>
                  <h3>{t("social.pinterestChooseBoard")}</h3>
                  <p>{t("social.pinterestChooseBoardText")}</p>
                </div>
                <div className="facebook-page-list">
                  {boards.map((board) => {
                    const saving = savingId === board.id;
                    return (
                      <button
                        key={board.id}
                        type="button"
                        className={`facebook-page-option pinterest-board-option ${saving ? "loading" : ""}`}
                        onClick={() => selectBoard(board.id)}
                        disabled={Boolean(savingId)}
                      >
                        <span className="facebook-page-option-icon pinterest-page-option-icon"><img src="/social-icons/pinterest.png" alt="" /></span>
                        <span className="facebook-page-option-copy">
                          <strong>{board.name}</strong>
                          <small>{saving ? t("social.pinterestConnectingBoard") : t("social.availableToConnect")}</small>
                        </span>
                        <span className="facebook-page-option-action">
                          {saving ? <span className="facebook-select-spinner small" /> : t("social.connect")}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <a className="facebook-cancel-button" href="/social-channels/oauth-complete?error=pinterest_cancelled">{t("social.cancel")}</a>
              </>
            )}
          </div>
        </section>
      </section>
    </AppLayout>
  );
}

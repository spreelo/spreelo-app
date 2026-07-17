"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  FileVideo2,
  ImagePlay,
  LayoutGrid,
  Languages,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import AppLayout from "../../components/AppLayout";
import { supabase } from "../../lib/supabaseClient";
import { useUiText } from "../../lib/i18n/useUiText";

const initialStats = {
  users: 0,
  brands: 0,
  posts: 0,
  activeAutomations: 0,
  backgrounds: 0,
  failedMedia: 0,
  pendingApproval: 0,
};

function formatDateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function getAdminHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token
    ? {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      }
    : { "Content-Type": "application/json" };
}

export default function AdminDashboardPage() {
  const { t } = useUiText(["admin"]);
  const [stats, setStats] = useState(initialStats);
  const [recentAdjustments, setRecentAdjustments] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [translationLocales, setTranslationLocales] = useState([]);
  const [translationStatuses, setTranslationStatuses] = useState({});
  const [selectedLocales, setSelectedLocales] = useState([]);
  const [translationLoading, setTranslationLoading] = useState(true);
  const [translationSaving, setTranslationSaving] = useState(false);
  const [translationMessage, setTranslationMessage] = useState("");

  useEffect(() => {
    loadAdminData();
  }, []);

  async function loadAdminData() {
    setLoading(true);
    setTranslationLoading(true);
    setError("");

    try {
      const headers = await getAdminHeaders();
      const [overviewResponse, translationsResponse] = await Promise.all([
        fetch("/api/admin/overview", { headers }),
        fetch("/api/admin/translations", { headers }),
      ]);
      const overviewPayload = await overviewResponse.json().catch(() => ({}));
      const translationsPayload = await translationsResponse.json().catch(() => ({}));

      if (!overviewResponse.ok) {
        throw new Error(
          overviewPayload?.error || t("admin.errorLoadDashboard")
        );
      }

      setStats({ ...initialStats, ...(overviewPayload?.stats || {}) });
      setRecentAdjustments(overviewPayload?.recentAdjustments || []);
      setWarnings(overviewPayload?.warnings || []);

      if (translationsResponse.ok) {
        setTranslationLocales(
          (translationsPayload?.locales || []).filter(
            (item) => item.locale !== translationsPayload?.defaultLocale
          )
        );
        setTranslationStatuses(translationsPayload?.statuses || {});
      } else {
        setWarnings((current) => [
          ...current,
          {
            key: "translations",
            message:
              translationsPayload?.error || t("admin.translationStatusError"),
          },
        ]);
      }
    } catch (loadError) {
      setError(loadError.message || t("admin.errorLoadDashboard"));
    } finally {
      setLoading(false);
      setTranslationLoading(false);
    }
  }

  function toggleLocale(locale) {
    setSelectedLocales((current) =>
      current.includes(locale)
        ? current.filter((item) => item !== locale)
        : [...current, locale]
    );
  }

  async function requestTranslationRefresh() {
    if (!selectedLocales.length) {
      setTranslationMessage(t("admin.translationChooseLanguage"));
      return;
    }

    setTranslationSaving(true);
    setTranslationMessage("");

    try {
      const headers = await getAdminHeaders();
      const response = await fetch("/api/admin/translations", {
        method: "POST",
        headers,
        body: JSON.stringify({ locales: selectedLocales }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || t("admin.translationRefreshError"));
      }

      const now = new Date().toISOString();
      setTranslationStatuses((current) => {
        const next = { ...current };
        selectedLocales.forEach((locale) => {
          next[locale] = [
            {
              namespace: "all",
              status: "refresh_requested",
              updatedAt: now,
            },
          ];
        });
        return next;
      });
      setTranslationMessage(
        t("admin.translationRefreshQueued", { count: selectedLocales.length })
      );
      setSelectedLocales([]);
    } catch (saveError) {
      setTranslationMessage(
        saveError.message || t("admin.translationRefreshError")
      );
    } finally {
      setTranslationSaving(false);
    }
  }

  const requestedLocaleCount = useMemo(
    () =>
      Object.values(translationStatuses).filter((packs) =>
        (packs || []).some((pack) => pack.status === "refresh_requested")
      ).length,
    [translationStatuses]
  );

  const statCards = [
    { label: "Accounts", value: stats.users, Icon: Users },
    { label: "Brands", value: stats.brands, Icon: Building2 },
    { label: "Posts", value: stats.posts, Icon: Sparkles },
    { label: "Active automations", value: stats.activeAutomations, Icon: Bot },
    { label: "Video backgrounds", value: stats.backgrounds, Icon: ImagePlay },
    { label: "Pending approval", value: stats.pendingApproval, Icon: FileVideo2 },
  ];

  return (
    <AppLayout active="admin">
      <div className="admin-page">
        <header className="admin-hero">
          <div>
            <span className="admin-eyebrow">Spreelo administration</span>
            <h1>Admin dashboard</h1>
            <p>
              Manage shared creative assets, customer credits, translations and operational checks from one protected workspace.
            </p>
          </div>

          <div className="admin-hero-badge">
            <ShieldCheck size={24} aria-hidden="true" />
            <div>
              <strong>Administrator</strong>
              <span>Server-protected access</span>
            </div>
          </div>
        </header>

        {error ? (
          <div className="admin-alert error admin-alert-with-action">
            <span>{error}</span>
            <button type="button" onClick={loadAdminData}>
              <RefreshCw size={15} aria-hidden="true" />
              {t("admin.retry")}
            </button>
          </div>
        ) : null}

        {!error && warnings.length ? (
          <div className="admin-alert warning">
            <AlertTriangle size={19} aria-hidden="true" />
            <div>
              <strong>{t("admin.partialOverviewTitle")}</strong>
              <span>{t("admin.partialOverviewText")}</span>
              <small>{t("admin.partialOverviewDetails", { count: warnings.length })}</small>
            </div>
          </div>
        ) : null}

        {loading ? (
          <section className="admin-loading-card">
            <LoaderCircle className="admin-spin" size={24} aria-hidden="true" />
            Loading admin data…
          </section>
        ) : (
          <>
            <section className="admin-stat-grid">
              {statCards.map(({ label, value, Icon }) => (
                <article className="admin-stat-card" key={label}>
                  <span className="admin-stat-icon"><Icon size={20} aria-hidden="true" /></span>
                  <strong>{Number(value || 0).toLocaleString()}</strong>
                  <span>{label}</span>
                </article>
              ))}
            </section>

            {stats.failedMedia > 0 ? (
              <div className="admin-alert warning">
                <AlertTriangle size={19} aria-hidden="true" />
                <div>
                  <strong>{t("admin.failedJobsTitle", { count: stats.failedMedia })}</strong>
                  <span>{t("admin.failedJobsText")}</span>
                </div>
              </div>
            ) : null}

            <section className="admin-tool-grid">
              <a className="admin-tool-card" href="/video-backgrounds">
                <span className="admin-tool-icon"><ImagePlay size={24} aria-hidden="true" /></span>
                <div>
                  <span className="admin-card-kicker">Creative library</span>
                  <h2>Video backgrounds</h2>
                  <p>Upload, tag, preview, edit and manage the reusable 9:16 motion background library.</p>
                </div>
                <strong>Open library →</strong>
              </a>

              <a className="admin-tool-card" href="/admin/credits">
                <span className="admin-tool-icon"><CircleDollarSign size={24} aria-hidden="true" /></span>
                <div>
                  <span className="admin-card-kicker">Customer support</span>
                  <h2>Credit adjustments</h2>
                  <p>Look up an account by email, add compensation credits or correct a balance with an audit trail.</p>
                </div>
                <strong>Manage credits →</strong>
              </a>

              <a className="admin-tool-card" href="/admin/content-formats">
                <span className="admin-tool-icon"><LayoutGrid size={24} aria-hidden="true" /></span>
                <div>
                  <span className="admin-card-kicker">{t("admin.formats.kicker")}</span>
                  <h2>{t("admin.formats.title")}</h2>
                  <p>{t("admin.formats.dashboardDescription")}</p>
                </div>
                <strong>{t("admin.formats.manage")} →</strong>
              </a>
            </section>

            <section className="admin-panel admin-translation-panel">
              <div className="admin-panel-heading">
                <div>
                  <span className="admin-card-kicker">{t("admin.translationKicker")}</span>
                  <h2>{t("admin.translationTitle")}</h2>
                  <p>{t("admin.translationDescription")}</p>
                </div>
                <span className="admin-translation-status">
                  <Languages size={18} aria-hidden="true" />
                  {t("admin.translationPendingCount", { count: requestedLocaleCount })}
                </span>
              </div>

              {translationLoading ? (
                <div className="admin-inline-loading">
                  <LoaderCircle className="admin-spin" size={18} aria-hidden="true" />
                  {t("admin.translationLoading")}
                </div>
              ) : (
                <>
                  <div className="admin-language-grid">
                    {translationLocales.map((item) => {
                      const packs = translationStatuses[item.locale] || [];
                      const refreshRequested = packs.some(
                        (pack) => pack.status === "refresh_requested"
                      );
                      const selected = selectedLocales.includes(item.locale);

                      return (
                        <button
                          type="button"
                          key={item.locale}
                          className={`admin-language-option${selected ? " selected" : ""}`}
                          onClick={() => toggleLocale(item.locale)}
                          aria-pressed={selected}
                        >
                          <span className="admin-language-checkbox">
                            {selected ? <CheckCircle2 size={17} aria-hidden="true" /> : null}
                          </span>
                          <span>
                            <strong>{item.nativeName}</strong>
                            <small>{item.language}</small>
                          </span>
                          {refreshRequested ? (
                            <em>{t("admin.translationQueued")}</em>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>

                  <div className="admin-translation-actions">
                    <p>{t("admin.translationNextVisitNote")}</p>
                    <button
                      type="button"
                      className="admin-primary-button"
                      onClick={requestTranslationRefresh}
                      disabled={translationSaving || !selectedLocales.length}
                    >
                      {translationSaving ? (
                        <LoaderCircle className="admin-spin" size={17} aria-hidden="true" />
                      ) : (
                        <RefreshCw size={17} aria-hidden="true" />
                      )}
                      {translationSaving
                        ? t("admin.translationRequesting")
                        : t("admin.translationRequest")}
                    </button>
                  </div>
                </>
              )}

              {translationMessage ? (
                <div className="admin-translation-message">{translationMessage}</div>
              ) : null}
            </section>

            <section className="admin-panel">
              <div className="admin-panel-heading">
                <div>
                  <span className="admin-card-kicker">Audit trail</span>
                  <h2>Recent credit adjustments</h2>
                </div>
                <a href="/admin/credits">View all</a>
              </div>

              {recentAdjustments.length ? (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Account</th>
                        <th>Change</th>
                        <th>New balance</th>
                        <th>Reason</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentAdjustments.map((item) => (
                        <tr key={item.id}>
                          <td>{item.target_email || "Unknown account"}</td>
                          <td className={Number(item.amount) >= 0 ? "positive" : "negative"}>
                            {Number(item.amount) > 0 ? "+" : ""}{Number(item.amount || 0)}
                          </td>
                          <td>{Number(item.new_balance || 0)}</td>
                          <td>{item.reason}</td>
                          <td>{formatDateTime(item.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="admin-empty-state">No manual credit adjustments have been made yet.</div>
              )}
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
}

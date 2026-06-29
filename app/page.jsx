"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "../components/AppLayout";
import { supabase } from "../lib/supabaseClient";
import { useUiText } from "../lib/i18n/useUiText";

const PENDING_PREVIEW_LIMIT = 3;

function getBrandStorageKey(userId) {
  return `spreelo_current_brand_id_${userId}`;
}

function formatDate(value, t) {
  if (!value) return t("dashboard.notSet");

  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatShortDate(value, t) {
  if (!value) return t("dashboard.notSet");

  return new Intl.DateTimeFormat("sv-SE", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatCampaignDate(campaign, t) {
  if (!campaign) return t("dashboard.dateNotSet");

  if (campaign.start_date && campaign.end_date) {
    return `${formatShortDate(campaign.start_date, t)} – ${formatShortDate(
      campaign.end_date,
      t
    )}`;
  }

  return formatShortDate(campaign.event_date || campaign.start_date, t);
}

function formatStatus(status, t) {
  if (!status) return t("dashboard.status.draft");

  const labels = {
    draft: t("dashboard.status.draft"),
    pending_approval: t("dashboard.status.pendingApproval"),
    approved: t("dashboard.status.approved"),
    scheduled: t("dashboard.status.scheduled"),
    published: t("dashboard.status.published"),
    failed: t("dashboard.status.failed"),
  };

  return labels[status] || status;
}

function formatScheduleType(value, t) {
  if (value === "once") return t("dashboard.schedule.once");
  if (value === "weekly") return t("dashboard.schedule.weekly");

  return t("dashboard.schedule.scheduled");
}

function isSlideBasedPost(post) {
  return ["carousel", "slideshow_video"].includes(post?.content_format);
}

function formatContentFormat(post, t) {
  if (post?.content_format === "carousel") {
    return t("dashboard.format.carousel");
  }

  if (post?.content_format === "slideshow_video") {
    return t("dashboard.format.slideshowVideo");
  }

  return t("dashboard.format.singleImage");
}

function formatPostKind(post, t) {
  if (post?.content_format === "carousel") {
    return t("dashboard.carouselWithCount", {
      count: post.slide_count || 0,
    });
  }

  if (post?.content_format === "slideshow_video") {
    return t("dashboard.slideshowWithCount", {
      count: post.slide_count || 0,
    });
  }

  return post?.post_type || t("dashboard.post");
}

function formatPlanName(rule, t) {
  if (rule?.name) return rule.name;
  if (rule?.content_type_label) return rule.content_type_label;
  if (rule?.post_type) return rule.post_type;

  return t("dashboard.contentPlan");
}

function getCurrentMonthStart() {
  const now = new Date();

  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function calculateBrandProfileCompleteness(profile) {
  if (!profile) {
    return {
      completed: 0,
      total: 4,
      percent: 0,
    };
  }

  const hasWebsiteOrDescription =
    String(profile.website_url || "").trim() ||
    String(profile.brand_description || "").trim();

  const fields = [
    profile.business_name,
    hasWebsiteOrDescription,
    profile.industry,
    profile.target_audience,
  ];

  const completed = fields.filter((field) => String(field || "").trim()).length;
  const total = fields.length;

  return {
    completed,
    total,
    percent: Math.round((completed / total) * 100),
  };
}

function getCampaignSortDate(campaign) {
  return new Date(
    campaign?.event_date ||
      campaign?.start_date ||
      campaign?.end_date ||
      campaign?.created_at ||
      Date.now()
  );
}

export default function Home() {
  const [posts, setPosts] = useState([]);
  const [rules, setRules] = useState([]);
  const [suggestedCampaign, setSuggestedCampaign] = useState(null);
  const [creditBalance, setCreditBalance] = useState(null);
  const [brandProfile, setBrandProfile] = useState(null);
  const [currentBrandId, setCurrentBrandId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [selectedPendingPostIds, setSelectedPendingPostIds] = useState([]);
  const [deleteConfirmActive, setDeleteConfirmActive] = useState(false);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [showAllPendingPosts, setShowAllPendingPosts] = useState(false);
  const { t, locale } = useUiText(["dashboard"]);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function getCurrentBrand(user) {
    const savedBrandId =
      typeof window !== "undefined"
        ? localStorage.getItem(getBrandStorageKey(user.id))
        : "";

    let query = supabase
      .from("brand_profiles")
      .select(
        "id, business_name, website_url, brand_description, industry, target_audience, is_default, created_at"
      )
      .eq("user_id", user.id);

    if (savedBrandId) {
      query = query.eq("id", savedBrandId).maybeSingle();
    } else {
      query = query
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
    }

    const { data, error } = await query;

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    if (data?.id && typeof window !== "undefined") {
      localStorage.setItem(getBrandStorageKey(user.id), data.id);
    }

    return data || null;
  }

  async function loadDashboard() {
    setLoading(true);
    setMessage("");
    setSelectedPendingPostIds([]);
    setDeleteConfirmActive(false);
    setShowAllPendingPosts(false);
    setSuggestedCampaign(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    let selectedBrand = null;

    try {
      selectedBrand = await getCurrentBrand(user);
    } catch (error) {
      setMessage(error.message || t("dashboard.errorLoadBrand"));
    }

    if (!selectedBrand?.id) {
      setPosts([]);
      setRules([]);
      setBrandProfile(null);
      setCurrentBrandId("");
      setLoading(false);
      return;
    }

    setBrandProfile(selectedBrand);
    setCurrentBrandId(selectedBrand.id);

    const { data: postsData, error: postsError } = await supabase
      .from("posts")
      .select(
        "id, brand_profile_id, platform, tone, language, post_type, idea, content, status, created_at, source, source_label, automation_rule_id, approval_required, approved_at, published_at, scheduled_for, image_url, image_status, content_format"
      )
      .eq("user_id", user.id)
      .eq("brand_profile_id", selectedBrand.id)
      .order("created_at", { ascending: false });

    if (postsError) {
      setMessage(postsError.message);
    } else {
      const basePosts = postsData || [];
      const slidePostIds = basePosts
        .filter((post) => isSlideBasedPost(post))
        .map((post) => post.id);

      if (slidePostIds.length === 0) {
        setPosts(basePosts);
      } else {
        const { data: slidesData, error: slidesError } = await supabase
          .from("post_slides")
          .select("id, post_id")
          .in("post_id", slidePostIds);

        if (slidesError) {
          setPosts(basePosts);
        } else {
          const slideCounts = (slidesData || []).reduce((counts, slide) => {
            counts[slide.post_id] = (counts[slide.post_id] || 0) + 1;
            return counts;
          }, {});

          setPosts(
            basePosts.map((post) => ({
              ...post,
              slide_count: slideCounts[post.id] || 0,
            }))
          );
        }
      }
    }

    const { data: rulesData, error: rulesError } = await supabase
      .from("automation_rules")
      .select(
        "id, brand_profile_id, name, weekday, publish_time, platform, post_type, schedule_type, run_date, timezone, next_run_at, is_active, content_type_label, uses_website_content, generate_image, approval_required"
      )
      .eq("user_id", user.id)
      .eq("brand_profile_id", selectedBrand.id)
      .order("next_run_at", { ascending: true });

    if (rulesError) {
      setMessage((current) =>
        current ? `${current} ${rulesError.message}` : rulesError.message
      );
    } else {
      setRules(rulesData || []);
    }

    const { data: campaignData, error: campaignError } = await supabase
      .from("brand_campaign_opportunities")
      .select(
        "id, title, description, event_date, start_date, end_date, recommended_post_count, relevance_score, sales_score, engagement_score, is_active, is_hidden, is_archived, created_at"
      )
      .eq("brand_profile_id", selectedBrand.id)
      .eq("is_active", true)
      .eq("is_hidden", false)
      .eq("is_archived", false);

    if (!campaignError) {
      const now = new Date();

      const upcomingCampaigns = (campaignData || [])
        .filter((campaign) => getCampaignSortDate(campaign) >= now)
        .sort((a, b) => {
          const scoreA =
            Number(a.relevance_score || 0) +
            Number(a.sales_score || 0) +
            Number(a.engagement_score || 0);

          const scoreB =
            Number(b.relevance_score || 0) +
            Number(b.sales_score || 0) +
            Number(b.engagement_score || 0);

          if (scoreB !== scoreA) return scoreB - scoreA;

          return getCampaignSortDate(a) - getCampaignSortDate(b);
        });

      setSuggestedCampaign(upcomingCampaigns[0] || null);
    }

    const { data: balanceData } = await supabase
      .from("user_credit_balances")
      .select(
        "credits_remaining, monthly_credit_limit, plan_name, subscription_status, subscription_plan, current_period_end, trial_end"
      )
      .eq("user_id", user.id)
      .single();

    if (balanceData) {
      setCreditBalance(balanceData);
    }

    setLoading(false);
  }

  const pendingApprovalPosts = useMemo(() => {
    return posts
      .filter((post) => post.status === "pending_approval")
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [posts]);

  const visiblePendingApprovalPosts = useMemo(() => {
    if (showAllPendingPosts) {
      return pendingApprovalPosts;
    }

    return pendingApprovalPosts.slice(0, PENDING_PREVIEW_LIMIT);
  }, [pendingApprovalPosts, showAllPendingPosts]);

  const scheduledPosts = useMemo(() => {
    return posts
      .filter((post) => post.status === "scheduled")
      .sort(
        (a, b) =>
          new Date(a.scheduled_for || a.created_at) -
          new Date(b.scheduled_for || b.created_at)
      );
  }, [posts]);

  const activeRules = useMemo(() => {
    return rules.filter((rule) => rule.is_active);
  }, [rules]);

  const upcomingRules = useMemo(() => {
    return activeRules
      .filter((rule) => rule.next_run_at)
      .sort((a, b) => new Date(a.next_run_at) - new Date(b.next_run_at))
      .slice(0, 5);
  }, [activeRules]);

  const publishedThisMonthCount = useMemo(() => {
    const monthStart = getCurrentMonthStart();

    return posts.filter((post) => {
      if (post.status !== "published") return false;

      const publishedDate = new Date(post.published_at || post.created_at);

      return publishedDate >= monthStart;
    }).length;
  }, [posts]);

  const brandCompleteness = useMemo(() => {
    return calculateBrandProfileCompleteness(brandProfile);
  }, [brandProfile]);

  const selectedPendingCount = selectedPendingPostIds.length;
  const visiblePendingIds = visiblePendingApprovalPosts.map((post) => post.id);

  const allVisiblePendingSelected =
    visiblePendingIds.length > 0 &&
    visiblePendingIds.every((postId) =>
      selectedPendingPostIds.includes(postId)
    );

  const creditsRemaining = creditBalance?.credits_remaining ?? 0;
  const monthlyCreditLimit = creditBalance?.monthly_credit_limit ?? 0;

  const creditUsagePercent =
    monthlyCreditLimit > 0
      ? Math.min(100, Math.round((creditsRemaining / monthlyCreditLimit) * 100))
      : 0;

  const dashboardContentPlans = useMemo(() => {
    return rules
      .slice()
      .sort((a, b) => {
        const dateA = new Date(a.next_run_at || a.run_date || a.created_at || 0);
        const dateB = new Date(b.next_run_at || b.run_date || b.created_at || 0);
        return dateA - dateB;
      })
      .slice(0, 4);
  }, [rules]);

  const nextAutomation = upcomingRules[0] || null;
  const currentBrandName = brandProfile?.business_name || t("dashboard.currentBrand");
  const dashboardEyebrow = t("dashboard.eyebrow");

  function togglePendingPostSelection(postId) {
    setDeleteConfirmActive(false);

    setSelectedPendingPostIds((current) => {
      if (current.includes(postId)) {
        return current.filter((id) => id !== postId);
      }

      return [...current, postId];
    });
  }

  function selectVisiblePendingPosts() {
    setDeleteConfirmActive(false);
    setSelectedPendingPostIds(visiblePendingIds);
  }

  function clearSelectedPendingPosts() {
    setDeleteConfirmActive(false);
    setSelectedPendingPostIds([]);
  }

  async function deleteSelectedPendingPosts() {
    if (!selectedPendingPostIds.length || bulkActionLoading) {
      return;
    }

    if (!deleteConfirmActive) {
      setDeleteConfirmActive(true);
      return;
    }

    setBulkActionLoading(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const idsToDelete = [...selectedPendingPostIds];

    const { error } = await supabase
      .from("posts")
      .delete()
      .eq("user_id", user.id)
      .eq("brand_profile_id", currentBrandId)
      .eq("status", "pending_approval")
      .in("id", idsToDelete);

    if (error) {
      setMessage(error.message || t("dashboard.errorDeletePosts"));
      setBulkActionLoading(false);
      return;
    }

    setPosts((currentPosts) =>
      currentPosts.filter((post) => !idsToDelete.includes(post.id))
    );

    setSelectedPendingPostIds([]);
    setDeleteConfirmActive(false);
    setBulkActionLoading(false);
    setMessage(t("dashboard.deletedPosts", { count: idsToDelete.length }));
  }
    return (
    <AppLayout active="dashboard">
      <div className="dashboard-page">
        <header className="dashboard-hero">
          <div>
            <p className="dashboard-eyebrow">{dashboardEyebrow}</p>
            <h2>{t("dashboard.title", { brandName: currentBrandName })}</h2>
            <span>{t("dashboard.subtitle")}</span>
          </div>

          <div className="dashboard-hero-actions">
            <a className="dashboard-secondary-action" href="/calendar">
              {t("dashboard.yourCalendar")}
            </a>

            <a className="dashboard-primary-action" href="/automation">
              {t("dashboard.newContentPlan")}
            </a>
          </div>
        </header>

        {message && <p className="login-message">{message}</p>}

        {!loading && !currentBrandId ? (
          <section className="dashboard-card">
            <div className="dashboard-empty">
              <h4>{t("dashboard.noBrandTitle")}</h4>
              <p>{t("dashboard.noBrandText")}</p>
              <a href="/brand">{t("dashboard.openBrandProfile")}</a>
            </div>
          </section>
        ) : (
          <>
            <section className="dashboard-stat-grid">
              <div className="dashboard-stat-card">
                <span>{t("dashboard.stat.plannedPosts")}</span>
                <strong>{activeRules.length + scheduledPosts.length}</strong>
                <p>{t("dashboard.stat.plannedPostsText")}</p>
              </div>

              <div className="dashboard-stat-card">
                <span>{t("dashboard.stat.pendingApproval")}</span>
                <strong>{pendingApprovalPosts.length}</strong>
                <p>{t("dashboard.stat.pendingApprovalText")}</p>
              </div>

              <div className="dashboard-stat-card">
                <span>{t("dashboard.stat.publishedThisMonth")}</span>
                <strong>{publishedThisMonthCount}</strong>
                <p>{t("dashboard.stat.publishedThisMonthText")}</p>
              </div>

              <div className="dashboard-stat-card">
                <span>{t("dashboard.stat.activePlans")}</span>
                <strong>{activeRules.length}</strong>
                <p>{t("dashboard.stat.activePlansText")}</p>
              </div>
            </section>

            <div className="dashboard-layout">
              <main className="dashboard-main">
                <section className="dashboard-card">
                  <div className="dashboard-card-header">
                    <div>
                      <p>{t("dashboard.upcomingEyebrow")}</p>
                      <h3>{t("dashboard.nextPlannedPosts")}</h3>
                    </div>

                    <a href="/calendar">{t("dashboard.yourCalendar")}</a>
                  </div>

                  {loading ? (
                    <div className="dashboard-empty">
                      <h4>{t("dashboard.loadingUpcomingTitle")}</h4>
                      <p>{t("dashboard.loadingUpcomingText")}</p>
                    </div>
                  ) : upcomingRules.length === 0 ? (
                    <div className="dashboard-empty">
                      <h4>{t("dashboard.noUpcomingTitle", { brandName: currentBrandName })}</h4>
                      <p>{t("dashboard.noUpcomingText")}</p>
                      <a href="/automation">{t("dashboard.createContentPlan")}</a>
                    </div>
                  ) : (
                    <div className="dashboard-upcoming-list">
                      {upcomingRules.map((rule) => (
                        <article
                          className="dashboard-upcoming-item"
                          key={rule.id}
                        >
                          <div className="dashboard-upcoming-date">
                            <strong>{formatShortDate(rule.next_run_at, t)}</strong>
                            <span>{formatScheduleType(rule.schedule_type, t)}</span>
                          </div>

                          <div className="dashboard-upcoming-content">
                            <h4>{formatPlanName(rule, t)}</h4>
                            <p>
                              {rule.platform || t("dashboard.platformNotSet")} ·{" "}
                              {rule.content_type_label ||
                                rule.post_type ||
                                t("dashboard.post")}{" "}
                              ·{" "}
                              {rule.generate_image
                                ? t("dashboard.textImage")
                                : t("dashboard.textOnly")}
                            </p>
                          </div>

                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <section
                  className="dashboard-card saved-card-compact"
                  id="pending-review"
                >
                  <div className="saved-header">
                    <div>
                      <p>{t("dashboard.reviewEyebrow")}</p>
                      <h3>{t("dashboard.pendingApproval")}</h3>
                    </div>

                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        setShowAllPendingPosts((current) => !current)
                      }
                      disabled={
                        pendingApprovalPosts.length <= PENDING_PREVIEW_LIMIT
                      }
                    >
                      {showAllPendingPosts ? t("dashboard.showLess") : t("dashboard.showAll")}
                    </button>
                  </div>

                  {!loading && pendingApprovalPosts.length > 0 && (
                    <div className="saved-bulk-actions">
                      <label className="image-check">
                        <input
                          type="checkbox"
                          checked={allVisiblePendingSelected}
                          onChange={() => {
                            if (allVisiblePendingSelected) {
                              clearSelectedPendingPosts();
                            } else {
                              selectVisiblePendingPosts();
                            }
                          }}
                        />
                        {t("dashboard.selectVisible")}
                      </label>

                      <span>
                        {t("dashboard.selectedShowing", { selected: selectedPendingCount, visible: visiblePendingApprovalPosts.length, total: pendingApprovalPosts.length })}
                      </span>

                      {selectedPendingCount > 0 && (
                        <button
                          type="button"
                          className="tiny-button"
                          onClick={clearSelectedPendingPosts}
                          disabled={bulkActionLoading}
                        >
                          {t("dashboard.clear")}
                        </button>
                      )}

                      {selectedPendingCount > 0 && (
                        <button
                          type="button"
                          className="danger-button"
                          onClick={deleteSelectedPendingPosts}
                          disabled={bulkActionLoading}
                        >
                          {bulkActionLoading
                            ? t("dashboard.deleting")
                            : deleteConfirmActive
                              ? t("dashboard.confirmDelete", { count: selectedPendingCount })
                              : t("dashboard.deleteSelected")}
                        </button>
                      )}

                      {deleteConfirmActive && selectedPendingCount > 0 && (
                        <span className="delete-confirm-note">
                          {t("dashboard.confirmDeleteNote", { count: selectedPendingCount })}
                        </span>
                      )}
                    </div>
                  )}

                  {loading ? (
                    <div className="dashboard-empty">
                      <h4>{t("dashboard.loadingReviewTitle")}</h4>
                      <p>{t("dashboard.loadingReviewText")}</p>
                    </div>
                  ) : pendingApprovalPosts.length === 0 ? (
                    <div className="dashboard-empty success">
                      <h4>{t("dashboard.noApprovalTitle")}</h4>
                      <p>{t("dashboard.noApprovalText", { brandName: currentBrandName })}</p>
                    </div>
                  ) : (
                    <>
                      <div className="saved-rule-list">
                        {visiblePendingApprovalPosts.map((post) => (
                          <article
                            className={`saved-rule-card dashboard-pending-card ${
                              selectedPendingPostIds.includes(post.id)
                                ? "selected"
                                : ""
                            }`}
                            key={post.id}
                          >
                            <label className="image-check">
                              <input
                                type="checkbox"
                                checked={selectedPendingPostIds.includes(
                                  post.id
                                )}
                                onChange={() =>
                                  togglePendingPostSelection(post.id)
                                }
                              />
                            </label>

                            {post.image_url ? (
                              <img
                                className="dashboard-pending-thumb"
                                src={post.image_url}
                                alt={t("dashboard.generatedImageAlt")}
                              />
                            ) : (
                              <div className="dashboard-pending-placeholder">
                                {isSlideBasedPost(post)
                                  ? post.slide_count || "S"
                                  : post.platform?.slice(0, 1) || "S"}
                              </div>
                            )}

                            <div>
                              <h4>
                                {post.platform || t("dashboard.platformNotSet")} ·{" "}
                                {formatPostKind(post, t)}
                              </h4>

                              {isSlideBasedPost(post) && (
                                <span className="dashboard-format-pill">
                                  {formatContentFormat(post, t)}
                                </span>
                              )}

                              <p>
                                {(
                                  post.content ||
                                  post.idea ||
                                  t("dashboard.noPreview")
                                )
                                  .split("\n")
                                  .slice(0, 2)
                                  .join(" ")}
                              </p>

                              <small>
                                {t("dashboard.created", { date: formatDate(post.created_at, t) })} ·{" "}
                                {post.source_label ||
                                  (post.source === "automation"
                                    ? t("dashboard.generatedByPlan")
                                    : t("dashboard.manualDraft"))}
                              </small>
                            </div>

                            <a
                              className="dashboard-pending-review-button"
                              href={`/posts/${post.id}`}
                            >
                              {t("dashboard.review")}
                            </a>
                          </article>
                        ))}
                      </div>

                      {!showAllPendingPosts &&
                        pendingApprovalPosts.length >
                          PENDING_PREVIEW_LIMIT && (
                          <button
                            type="button"
                            className="show-more-rules"
                            onClick={() => setShowAllPendingPosts(true)}
                          >
                            {t("dashboard.showMorePending", {
                              count:
                                pendingApprovalPosts.length -
                                PENDING_PREVIEW_LIMIT,
                            })}
                          </button>
                        )}

                      {showAllPendingPosts &&
                        pendingApprovalPosts.length >
                          PENDING_PREVIEW_LIMIT && (
                          <button
                            type="button"
                            className="show-more-rules"
                            onClick={() => {
                              setShowAllPendingPosts(false);
                              clearSelectedPendingPosts();
                            }}
                          >
                            {t("dashboard.showLess")}
                          </button>
                        )}
                    </>
                  )}
                </section>

                <section className="dashboard-card saved-card-compact dashboard-content-plans-card">
                  <div className="saved-header">
                    <div>
                      <p>{t("dashboard.contentPlansEyebrow")}</p>
                      <h3>{t("dashboard.contentPlansTitle")}</h3>
                    </div>

                    <a className="secondary-button" href="/automation">
                      {t("dashboard.newContentPlan")}
                    </a>
                  </div>

                  {loading ? (
                    <div className="dashboard-empty">
                      <h4>{t("dashboard.loadingContentPlansTitle")}</h4>
                      <p>{t("dashboard.loadingUpcomingText")}</p>
                    </div>
                  ) : dashboardContentPlans.length === 0 ? (
                    <div className="dashboard-empty">
                      <h4>{t("dashboard.noContentPlansTitle")}</h4>
                      <p>{t("dashboard.noContentPlansText")}</p>
                      <a href="/automation">{t("dashboard.createContentPlan")}</a>
                    </div>
                  ) : (
                    <div className="dashboard-plan-list">
                      {dashboardContentPlans.map((rule) => (
                          <article className="dashboard-plan-row" key={rule.id}>
                            <div>
                              <h4>{formatPlanName(rule, t)}</h4>
                              <p>
                                {rule.platform || t("dashboard.platformNotSet")} ·{" "}
                                {rule.content_type_label || rule.post_type || t("dashboard.post")}
                              </p>
                            </div>

                            <div className="dashboard-plan-meta">
                              <span>{formatScheduleType(rule.schedule_type, t)}</span>
                              <strong>{formatDate(rule.next_run_at || rule.run_date, t)}</strong>
                            </div>
                            <a href="/automation">{t("dashboard.manage")}</a>
                          </article>
                      ))}
                    </div>
                  )}
                </section>
              </main>

              <aside className="dashboard-sidebar">
                <section className="dashboard-side-card">
                  <div className="dashboard-side-title">
                    <span>▣</span>
                    <div>
                      <h3>{t("dashboard.creditsUsage")}</h3>
                      <p>{t("dashboard.creditsBalanceText")}</p>
                    </div>
                  </div>

                  {creditBalance ? (
                    <>
                      <div className="dashboard-credit-number">
                        <strong>{creditsRemaining}</strong>
                        <span>{t("dashboard.creditsLeft", { limit: monthlyCreditLimit || "—" })}</span>
                      </div>

                      <div className="dashboard-credit-bar">
                        <div style={{ width: `${creditUsagePercent}%` }} />
                      </div>

                      <p className="dashboard-side-note">{t("dashboard.creditsUsageText")}</p>
                    </>
                  ) : (
                    <div className="dashboard-mini-empty">
                      <strong>{t("dashboard.noCreditsTitle")}</strong>
                      <p>{t("dashboard.noCreditsText")}</p>
                    </div>
                  )}
                </section>

                <section className="dashboard-side-card">
                  <div className="dashboard-side-title">
                    <span>✓</span>
                    <div>
                      <h3>{t("dashboard.brandProfile")}</h3>
                      <p>{t("dashboard.brandProfileText")}</p>
                    </div>
                  </div>

                  <div className="dashboard-brand-progress dashboard-brand-readiness">
                    <div className="dashboard-brand-readiness-row">
                      <span>{t("dashboard.brandReadiness")}</span>
                      <strong>{brandCompleteness.percent}%</strong>
                    </div>

                    <div className="dashboard-brand-progress-bar" aria-hidden="true">
                      <div style={{ width: `${brandCompleteness.percent}%` }} />
                    </div>

                    <span
                      className={`dashboard-brand-ready-badge ${
                        brandCompleteness.percent === 100 ? "is-ready" : ""
                      }`}
                    >
                      {brandCompleteness.percent === 100
                        ? t("dashboard.brandReady")
                        : `${brandCompleteness.completed}/${brandCompleteness.total} ${t("dashboard.completed")}`}
                    </span>
                  </div>

                  <p className="dashboard-side-note dashboard-brand-complete-note">
                    {brandCompleteness.percent === 100
                      ? t("dashboard.brandComplete")
                      : t("dashboard.brandIncomplete")}
                  </p>

                  <a className="dashboard-side-link" href="/brand">
                    {t("dashboard.editBrandProfile")}
                  </a>
                </section>

                <section className="dashboard-side-card highlighted">
                  <div className="dashboard-side-title">
                    <span>◇</span>
                    <div>
                      <h3>{t("dashboard.suggestedCampaign")}</h3>
                      <p>{t("dashboard.suggestedCampaignText")}</p>
                    </div>
                  </div>

                  {suggestedCampaign ? (
                    <>
                      <strong className="dashboard-next-title">
                        {suggestedCampaign.title}
                      </strong>

                      <p className="dashboard-side-note">
                        {formatCampaignDate(suggestedCampaign, t)} · {t("dashboard.recommendedPosts", { count: suggestedCampaign.recommended_post_count || 3 })}
                      </p>

                      {suggestedCampaign.description && (
                        <p className="dashboard-side-note">
                          {suggestedCampaign.description}
                        </p>
                      )}

                   <a
  className="dashboard-side-link"
  href={`/automation?campaignOpportunityId=${suggestedCampaign.id}&brandProfileId=${currentBrandId}`}
>
  {t("dashboard.createCampaignPlan")}
</a>
                    </>
                  ) : (
                    <>
                      <strong className="dashboard-next-title">
                        {t("dashboard.noSuggestedCampaign")}
                      </strong>

                      <p className="dashboard-side-note">{t("dashboard.openCalendarText")}</p>

                      <a className="dashboard-side-link" href="/calendar">
                        {t("dashboard.openCalendar")}
                      </a>
                    </>
                  )}
                </section>

                {nextAutomation && (
                  <section className="dashboard-side-card highlighted">
                    <div className="dashboard-side-title">
                      <span>⌁</span>
                      <div>
                        <h3>{t("dashboard.nextContentPlan")}</h3>
                        <p>{formatDate(nextAutomation.next_run_at, t)}</p>
                      </div>
                    </div>

                    <strong className="dashboard-next-title">
                      {formatPlanName(nextAutomation, t)}
                    </strong>

                    <p className="dashboard-side-note">
                      {nextAutomation.platform || t("dashboard.platformNotSet")}
                    </p>
                  </section>
                )}
              </aside>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

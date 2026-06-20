"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "../components/AppLayout";
import { supabase } from "../lib/supabaseClient";

const PENDING_PREVIEW_LIMIT = 3;

function getBrandStorageKey(userId) {
  return `spreelo_current_brand_id_${userId}`;
}

function formatDate(value) {
  if (!value) return "Not set";

  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatShortDate(value) {
  if (!value) return "Not set";

  return new Intl.DateTimeFormat("sv-SE", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatCampaignDate(campaign) {
  if (!campaign) return "Date not set";

  if (campaign.start_date && campaign.end_date) {
    return `${formatShortDate(campaign.start_date)} – ${formatShortDate(
      campaign.end_date
    )}`;
  }

  return formatShortDate(campaign.event_date || campaign.start_date);
}

function formatStatus(status) {
  if (!status) return "Draft";

  const labels = {
    draft: "Draft",
    pending_approval: "Pending approval",
    approved: "Approved",
    scheduled: "Scheduled",
    published: "Published",
    failed: "Failed",
  };

  return labels[status] || status;
}

function formatScheduleType(value) {
  if (value === "once") return "One time";
  if (value === "weekly") return "Weekly";

  return "Scheduled";
}

function formatPlanName(rule) {
  if (rule?.name) return rule.name;
  if (rule?.content_type_label) return rule.content_type_label;
  if (rule?.post_type) return rule.post_type;

  return "Content plan";
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
      setMessage(error.message || "Could not load selected brand.");
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
        "id, brand_profile_id, platform, tone, language, post_type, idea, content, status, created_at, source, source_label, automation_rule_id, approval_required, approved_at, published_at, scheduled_for, image_url, image_status"
      )
      .eq("user_id", user.id)
      .eq("brand_profile_id", selectedBrand.id)
      .order("created_at", { ascending: false });

    if (postsError) {
      setMessage(postsError.message);
    } else {
      setPosts(postsData || []);
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

  const nextAutomation = upcomingRules[0] || null;
  const currentBrandName = brandProfile?.business_name || "Current brand";

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
      setMessage(error.message || "Could not delete selected posts.");
      setBulkActionLoading(false);
      return;
    }

    setPosts((currentPosts) =>
      currentPosts.filter((post) => !idsToDelete.includes(post.id))
    );

    setSelectedPendingPostIds([]);
    setDeleteConfirmActive(false);
    setBulkActionLoading(false);
    setMessage(`${idsToDelete.length} selected post(s) deleted.`);
  }
    return (
    <AppLayout active="dashboard">
      <div className="dashboard-page">
        <header className="dashboard-hero">
          <div>
            <p className="dashboard-eyebrow">Dashboard</p>
            <h2>{currentBrandName} overview</h2>
            <span>
              See what Spreelo is creating for this brand, what needs review and
              what is coming next.
            </span>
          </div>

          <div className="dashboard-hero-actions">
            <a className="dashboard-secondary-action" href="/calendar">
              Your calendar
            </a>

            <a className="dashboard-primary-action" href="/automation">
              New content plan
            </a>
          </div>
        </header>

        {message && <p className="login-message">{message}</p>}

        {!loading && !currentBrandId ? (
          <section className="dashboard-card">
            <div className="dashboard-empty">
              <h4>No brand selected</h4>
              <p>Create or choose a brand from the sidebar to see its dashboard.</p>
              <a href="/brand">Open brand profile</a>
            </div>
          </section>
        ) : (
          <>
            <section className="dashboard-stat-grid">
              <div className="dashboard-stat-card">
                <span>Planned posts</span>
                <strong>{activeRules.length + scheduledPosts.length}</strong>
                <p>Upcoming content plans and scheduled content.</p>
              </div>

              <div className="dashboard-stat-card">
                <span>Pending approval</span>
                <strong>{pendingApprovalPosts.length}</strong>
                <p>Posts waiting for review.</p>
              </div>

              <div className="dashboard-stat-card">
                <span>Published this month</span>
                <strong>{publishedThisMonthCount}</strong>
                <p>Published posts in the current month.</p>
              </div>

              <div className="dashboard-stat-card">
                <span>Active content plans</span>
                <strong>{activeRules.length}</strong>
                <p>Saved plans currently active for this brand.</p>
              </div>
            </section>

            <div className="dashboard-layout">
              <main className="dashboard-main">
                <section className="dashboard-card">
                  <div className="dashboard-card-header">
                    <div>
                      <p>Upcoming</p>
                      <h3>Next planned posts</h3>
                    </div>

                    <a href="/calendar">Your calendar</a>
                  </div>

                  {loading ? (
                    <div className="dashboard-empty">
                      <h4>Loading upcoming posts...</h4>
                      <p>Please wait while Spreelo loads your plan.</p>
                    </div>
                  ) : upcomingRules.length === 0 ? (
                    <div className="dashboard-empty">
                      <h4>No upcoming content plans for {currentBrandName}</h4>
                      <p>
                        Create a content plan for this brand and Spreelo will
                        show the next planned posts here.
                      </p>
                      <a href="/automation">Create content plan</a>
                    </div>
                  ) : (
                    <div className="dashboard-upcoming-list">
                      {upcomingRules.map((rule) => (
                        <article
                          className="dashboard-upcoming-item"
                          key={rule.id}
                        >
                          <div className="dashboard-upcoming-date">
                            <strong>{formatShortDate(rule.next_run_at)}</strong>
                            <span>{formatScheduleType(rule.schedule_type)}</span>
                          </div>

                          <div className="dashboard-upcoming-content">
                            <h4>{formatPlanName(rule)}</h4>
                            <p>
                              {rule.platform || "Platform not set"} ·{" "}
                              {rule.content_type_label ||
                                rule.post_type ||
                                "Post"}{" "}
                              ·{" "}
                              {rule.generate_image
                                ? "Text + image"
                                : "Text only"}
                            </p>
                          </div>

                          <div className="dashboard-upcoming-mode">
                            {rule.approval_required
                              ? "Review first"
                              : "Auto publish"}
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
                      <p>Review</p>
                      <h3>Pending approval</h3>
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
                      {showAllPendingPosts ? "Show less" : "Show all"}
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
                        Select visible
                      </label>

                      <span>
                        {selectedPendingCount} selected · showing{" "}
                        {visiblePendingApprovalPosts.length} of{" "}
                        {pendingApprovalPosts.length}
                      </span>

                      {selectedPendingCount > 0 && (
                        <button
                          type="button"
                          className="tiny-button"
                          onClick={clearSelectedPendingPosts}
                          disabled={bulkActionLoading}
                        >
                          Clear
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
                            ? "Deleting..."
                            : deleteConfirmActive
                              ? `Confirm delete ${selectedPendingCount}`
                              : "Delete selected"}
                        </button>
                      )}

                      {deleteConfirmActive && selectedPendingCount > 0 && (
                        <span className="delete-confirm-note">
                          Click confirm to delete {selectedPendingCount}{" "}
                          selected post
                          {selectedPendingCount === 1 ? "" : "s"}.
                        </span>
                      )}
                    </div>
                  )}

                  {loading ? (
                    <div className="dashboard-empty">
                      <h4>Loading review queue...</h4>
                      <p>Please wait while Spreelo loads your content.</p>
                    </div>
                  ) : pendingApprovalPosts.length === 0 ? (
                    <div className="dashboard-empty success">
                      <h4>No posts waiting for approval</h4>
                      <p>
                        You are all caught up for {currentBrandName}. New posts
                        will appear here when they need review.
                      </p>
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
                                alt="Generated post image"
                              />
                            ) : (
                              <div className="dashboard-pending-placeholder">
                                {post.platform?.slice(0, 1) || "S"}
                              </div>
                            )}

                            <div>
                              <h4>
                                {post.platform || "Platform not set"} ·{" "}
                                {post.post_type || "Post"}
                              </h4>

                              <p>
                                {(
                                  post.content ||
                                  post.idea ||
                                  "No preview available"
                                )
                                  .split("\n")
                                  .slice(0, 2)
                                  .join(" ")}
                              </p>

                              <small>
                                Created {formatDate(post.created_at)} ·{" "}
                                {post.source_label ||
                                  (post.source === "automation"
                                    ? "Generated by content plan"
                                    : "Manual draft")}
                              </small>
                            </div>

                            <a
                              className="dashboard-pending-review-button"
                              href={`/posts/${post.id}`}
                            >
                              Review
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
                            Show{" "}
                            {pendingApprovalPosts.length -
                              PENDING_PREVIEW_LIMIT}{" "}
                            more pending posts
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
                            Show less
                          </button>
                        )}
                    </>
                  )}
                </section>
              </main>

              <aside className="dashboard-sidebar">
                <section className="dashboard-side-card">
                  <div className="dashboard-side-title">
                    <span>▣</span>
                    <div>
                      <h3>Credits usage</h3>
                      <p>Your current credit balance.</p>
                    </div>
                  </div>

                  {creditBalance ? (
                    <>
                      <div className="dashboard-credit-number">
                        <strong>{creditsRemaining}</strong>
                        <span>/ {monthlyCreditLimit || "—"} left</span>
                      </div>

                      <div className="dashboard-credit-bar">
                        <div style={{ width: `${creditUsagePercent}%` }} />
                      </div>

                      <p className="dashboard-side-note">
                        Credits are used when posts are generated, not when a
                        plan is saved.
                      </p>
                    </>
                  ) : (
                    <div className="dashboard-mini-empty">
                      <strong>No credit balance found</strong>
                      <p>
                        Credits will appear here when the account has a balance.
                      </p>
                    </div>
                  )}
                </section>

                <section className="dashboard-side-card">
                  <div className="dashboard-side-title">
                    <span>✓</span>
                    <div>
                      <h3>Brand profile</h3>
                      <p>Helps Spreelo create better posts.</p>
                    </div>
                  </div>

                  <div className="dashboard-brand-progress">
                    <div>
                      <strong>{brandCompleteness.percent}%</strong>
                      <span>
                        {brandCompleteness.completed}/{brandCompleteness.total}{" "}
                        completed
                      </span>
                    </div>

                    <div className="dashboard-credit-bar">
                      <div style={{ width: `${brandCompleteness.percent}%` }} />
                    </div>
                  </div>

                  <p className="dashboard-side-note">
                    {brandCompleteness.percent === 100
                      ? "This brand profile has the core fields completed."
                      : "Complete this brand profile to improve future content."}
                  </p>

                  <a className="dashboard-side-link" href="/brand">
                    Edit brand profile
                  </a>
                </section>

                <section className="dashboard-side-card highlighted">
                  <div className="dashboard-side-title">
                    <span>◇</span>
                    <div>
                      <h3>Suggested campaign</h3>
                      <p>Recommended next campaign idea.</p>
                    </div>
                  </div>

                  {suggestedCampaign ? (
                    <>
                      <strong className="dashboard-next-title">
                        {suggestedCampaign.title}
                      </strong>

                      <p className="dashboard-side-note">
                        {formatCampaignDate(suggestedCampaign)} · Recommended:{" "}
                        {suggestedCampaign.recommended_post_count || 3} posts
                      </p>

                      {suggestedCampaign.description && (
                        <p className="dashboard-side-note">
                          {suggestedCampaign.description}
                        </p>
                      )}

                      <a
                        className="dashboard-side-link"
                        href={`/automation?campaignId=${suggestedCampaign.id}`}
                      >
                        Create campaign plan
                      </a>
                    </>
                  ) : (
                    <>
                      <strong className="dashboard-next-title">
                        No suggested campaign yet
                      </strong>

                      <p className="dashboard-side-note">
                        Open Calendar to review campaign ideas for this brand.
                      </p>

                      <a className="dashboard-side-link" href="/calendar">
                        Open calendar
                      </a>
                    </>
                  )}
                </section>

                {nextAutomation && (
                  <section className="dashboard-side-card highlighted">
                    <div className="dashboard-side-title">
                      <span>⌁</span>
                      <div>
                        <h3>Next content plan</h3>
                        <p>{formatDate(nextAutomation.next_run_at)}</p>
                      </div>
                    </div>

                    <strong className="dashboard-next-title">
                      {formatPlanName(nextAutomation)}
                    </strong>

                    <p className="dashboard-side-note">
                      {nextAutomation.platform || "Platform not set"} ·{" "}
                      {nextAutomation.approval_required
                        ? "Review before publishing"
                        : "Publishes automatically"}
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

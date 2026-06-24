"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "../../components/AppLayout";
import { supabase } from "../../lib/supabaseClient";

function getBrandStorageKey(userId) {
  return `spreelo_current_brand_id_${userId}`;
}

function formatDate(value) {
  if (!value) return "";

  try {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${value}T00:00:00`));
  } catch {
    return value;
  }
}

function getCampaignDateLabel(campaign) {
  const eventType = String(campaign?.event_type || "").toLowerCase();

  const isFullYearFlexibleCampaign =
    campaign?.start_date &&
    campaign?.end_date &&
    String(campaign.start_date).endsWith("-01-01") &&
    String(campaign.end_date).endsWith("-12-31") &&
    ["custom_campaign", "campaign", "seasonal"].includes(eventType);

  if (campaign.event_date) {
    return formatDate(campaign.event_date);
  }

  if (isFullYearFlexibleCampaign && campaign.event_year) {
    return `Flexible campaign · ${campaign.event_year}`;
  }

  if (campaign.start_date && campaign.end_date) {
    return `${formatDate(campaign.start_date)} – ${formatDate(
      campaign.end_date
    )}`;
  }

  if (campaign.start_date) {
    return `From ${formatDate(campaign.start_date)}`;
  }

  if (campaign.event_year) {
    return `Flexible campaign · ${campaign.event_year}`;
  }

  return "Flexible campaign";
}

function getEventTypeLabel(value) {
  return String(value || "campaign")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getConfidenceLabel(value) {
  const confidence = String(value || "medium").toLowerCase();

  if (confidence === "high") return "High confidence";
  if (confidence === "low") return "Low confidence";

  return "Medium confidence";
}

function getSortDate(campaign) {
  const value =
    campaign.event_date || campaign.start_date || `${campaign.event_year}-12-31`;

  const timestamp = new Date(`${value}T00:00:00`).getTime();

  if (Number.isNaN(timestamp)) {
    return Number.MAX_SAFE_INTEGER;
  }

  return timestamp;
}

function getTodayDateString() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getCalendarYearsToShow(todayDateString) {
  const currentYear = Number(todayDateString.slice(0, 4));
  const monthDay = todayDateString.slice(5);

  if (!Number.isFinite(currentYear)) {
    return [new Date().getFullYear()];
  }

  if (monthDay >= "12-01") {
    return [currentYear, currentYear + 1];
  }

  return [currentYear];
}

function getNextCalendarYear(todayDateString) {
  const currentYear = Number(todayDateString.slice(0, 4));

  if (!Number.isFinite(currentYear)) {
    return new Date().getFullYear() + 1;
  }

  return currentYear + 1;
}

function getCalendarYearNotice(todayDateString) {
  const nextYear = getNextCalendarYear(todayDateString);
  const monthDay = todayDateString.slice(5);

  if (monthDay >= "12-01") {
    return `Your ${nextYear} campaign calendar is ready. You can plan next year’s posts while keeping the remaining campaigns for this year.`;
  }

  return `Your ${nextYear} campaign calendar will be added automatically on December 1.`;
}

function isUpcomingCampaign(campaign, todayDateString, visibleYears = []) {
  if (!campaign) return false;

  const currentYear = Number(todayDateString.slice(0, 4));
  const campaignYear = Number(campaign.event_year);

  if (
    Number.isFinite(campaignYear) &&
    visibleYears.length > 0 &&
    !visibleYears.includes(campaignYear)
  ) {
    return false;
  }

  if (Number.isFinite(campaignYear) && campaignYear > currentYear) {
    return true;
  }

  if (campaign.event_date) {
    return campaign.event_date >= todayDateString;
  }

  if (campaign.end_date) {
    return campaign.end_date >= todayDateString;
  }

  if (campaign.start_date) {
    return campaign.start_date >= todayDateString;
  }

  if (Number.isFinite(campaignYear)) {
    return visibleYears.includes(campaignYear);
  }

  return true;
}

function getCampaignRecommendedPostCount(campaign, fallbackCount = 3) {
  const rawRecommendedCount = Number(campaign?.recommended_post_count);

  const count = Number.isFinite(rawRecommendedCount)
    ? rawRecommendedCount
    : fallbackCount;

  return Math.min(Math.max(Math.round(count), 1), 7);
}

function buildFallbackCampaignPlan(count) {
  const templates = [
    {
      role: "Awareness post",
      purpose: "Introduce the campaign and explain why it matters to the audience.",
    },
    {
      role: "Education post",
      purpose: "Share useful information connected to the campaign topic.",
    },
    {
      role: "Value post",
      purpose: "Explain the value, benefit or reason to act before the campaign date.",
    },
    {
      role: "Trust post",
      purpose: "Build trust with an example, reassurance or helpful explanation.",
    },
    {
      role: "Engagement post",
      purpose: "Encourage the audience to react, comment or think about the campaign topic.",
    },
    {
      role: "Reminder post",
      purpose: "Remind the audience that the campaign date is getting closer.",
    },
    {
      role: "Final campaign reminder",
      purpose: "Create a final reminder connected to the campaign date.",
    },
  ];

  return Array.from({ length: count }).map((_, index) => {
    const isLast = index === count - 1;
    const template =
      templates[index] ||
      templates[templates.length - 2] ||
      templates[0];

    return {
      role: isLast ? "Final campaign reminder" : template.role,
      purpose: isLast
        ? "Create a final reminder connected to the campaign date."
        : template.purpose,
      days_before_event: isLast ? 0 : Math.max((count - 1 - index) * 3, 1),
    };
  });
}

function buildCampaignPostPlan(campaign, recommendedCount) {
  const rawPostPlan = Array.isArray(campaign?.post_plan)
    ? campaign.post_plan
    : [];

  const sortedRawPostPlan = [...rawPostPlan].sort((a, b) => {
    const aDays =
      typeof a?.days_before_event === "number" ? a.days_before_event : 0;
    const bDays =
      typeof b?.days_before_event === "number" ? b.days_before_event : 0;

    return bDays - aDays;
  });

  const fallbackPostPlan = buildFallbackCampaignPlan(recommendedCount);

  const mergedPlan = Array.from({ length: recommendedCount }).map((_, index) => {
    const fallbackPost = fallbackPostPlan[index] || {};
    const aiPost = sortedRawPostPlan[index] || {};

    const role =
      aiPost.role && !/^campaign post/i.test(aiPost.role)
        ? aiPost.role
        : fallbackPost.role;

    return {
      ...fallbackPost,
      ...aiPost,
      role,
      purpose: aiPost.purpose || fallbackPost.purpose,
      days_before_event:
        typeof aiPost.days_before_event === "number"
          ? aiPost.days_before_event
          : fallbackPost.days_before_event,
    };
  });

  return mergedPlan.sort((a, b) => {
    const aDays =
      typeof a?.days_before_event === "number" ? a.days_before_event : 0;
    const bDays =
      typeof b?.days_before_event === "number" ? b.days_before_event : 0;

    return bDays - aDays;
  });
}

export default function Calendar() {
  const [user, setUser] = useState(null);
  const [brandProfileId, setBrandProfileId] = useState("");
  const [brandName, setBrandName] = useState("");
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const todayDateString = getTodayDateString();
  const calendarYearNotice = getCalendarYearNotice(todayDateString);

  const selectedCampaign = useMemo(() => {
    return (
      campaigns.find((campaign) => campaign.id === selectedCampaignId) ||
      campaigns[0] ||
      null
    );
  }, [campaigns, selectedCampaignId]);

  const campaignStats = useMemo(() => {
    const total = campaigns.length;
    const fixedDate = campaigns.filter((campaign) => campaign.event_date).length;
    const flexible = campaigns.filter((campaign) => !campaign.event_date).length;

    return {
      total,
      fixedDate,
      flexible,
    };
  }, [campaigns]);

  useEffect(() => {
    async function loadCampaignPlanner() {
      setLoading(true);
      setMessage("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      setUser(user);

      const { data: brands, error: brandListError } = await supabase
        .from("brand_profiles")
        .select("id, business_name, is_default, created_at")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });

      if (brandListError) {
        setMessage(brandListError.message);
        setLoading(false);
        return;
      }

      const brandList = brands || [];

      const selectedBrandId =
        typeof window !== "undefined"
          ? localStorage.getItem(getBrandStorageKey(user.id))
          : "";

      const selectedBrandExists = brandList.some(
        (brand) => brand.id === selectedBrandId
      );

      const fallbackBrand =
        brandList.find((brand) => brand.is_default) || brandList[0] || null;

      const brandToLoad = selectedBrandExists
        ? brandList.find((brand) => brand.id === selectedBrandId)
        : fallbackBrand;

      if (!brandToLoad?.id) {
        setMessage("No brand profile found. Create a brand profile first.");
        setLoading(false);
        return;
      }

      setBrandProfileId(brandToLoad.id);
      setBrandName(brandToLoad.business_name || "Current brand");

      if (typeof window !== "undefined") {
        localStorage.setItem(getBrandStorageKey(user.id), brandToLoad.id);
      }

      const todayDateString = getTodayDateString();
      const calendarYearsToShow = getCalendarYearsToShow(todayDateString);

      const { data, error } = await supabase
        .from("brand_campaign_opportunities")
        .select(
          "id, title, slug, description, country_code, market, language, industry, event_type, event_date, event_year, start_date, end_date, relevance_reason, relevance_score, sales_score, engagement_score, recommended_post_count, prompt_context, campaign_angles, post_plan, date_confidence, is_ai_generated, is_hidden, is_active, is_archived, generated_at, created_at, updated_at"
        )
        .eq("user_id", user.id)
        .eq("brand_profile_id", brandToLoad.id)
        .eq("is_active", true)
        .eq("is_hidden", false)
        .eq("is_archived", false)
        .in("event_year", calendarYearsToShow)
        .order("event_year", { ascending: true })
        .order("event_date", { ascending: true, nullsFirst: false });

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      const upcomingCampaigns = (data || [])
        .filter((campaign) =>
          isUpcomingCampaign(campaign, todayDateString, calendarYearsToShow)
        )
        .sort(
          (firstCampaign, secondCampaign) =>
            getSortDate(firstCampaign) - getSortDate(secondCampaign)
        );

      setCampaigns(upcomingCampaigns);
      setSelectedCampaignId(upcomingCampaigns[0]?.id || "");
      setLoading(false);
    }

    loadCampaignPlanner();
  }, []);

  function handleCreateCampaign(campaign) {
    if (!campaign?.id) return;

    const params = new URLSearchParams({
      campaignOpportunityId: campaign.id,
      brandProfileId,
    });

    window.location.href = `/automation?${params.toString()}`;
  }

  if (loading) {
    return (
      <AppLayout active="calendar">
        <section className="empty-card">
          <h3>Loading campaign calendar...</h3>
          <p>Please wait while Spreelo loads your campaign opportunities.</p>
        </section>
      </AppLayout>
    );
  }

  return (
    <AppLayout active="calendar">
      <div className="campaign-calendar-page">
        <header className="campaign-calendar-hero">
          <div>
            <p className="dashboard-eyebrow">Campaign calendar</p>
            <h2>Campaign opportunities for {brandName}</h2>
            <span>
              Spreelo suggests useful upcoming campaign moments based on your
              brand, market and content language. Choose one to create a focused
              content plan.
            </span>
          </div>

          <div className="campaign-calendar-hero-card">
            <strong>{campaignStats.total}</strong>
            <span>Upcoming AI campaign opportunities</span>
            <p>No posts are created until you choose a campaign.</p>
          </div>
        </header>

        {message && <p className="campaign-calendar-message">{message}</p>}

        <section className="campaign-calendar-year-note">
          <div>
            <p className="dashboard-eyebrow">Calendar update</p>
            <strong>{calendarYearNotice}</strong>
          </div>
        </section>

        {campaigns.length === 0 ? (
          <section className="campaign-calendar-empty">
            <div>
              <p className="dashboard-eyebrow">No upcoming campaigns</p>
              <h3>Create a new campaign calendar</h3>
              <p>
                There are no upcoming campaign opportunities for this brand. Go
                to Brand Profile and generate or refresh the campaign calendar.
              </p>
            </div>

            <a href="/brand">Generate campaign calendar</a>
          </section>
        ) : (
          <>
            <section className="campaign-calendar-stat-grid">
              <div>
                <span>Upcoming opportunities</span>
                <strong>{campaignStats.total}</strong>
                <p>Upcoming campaigns for the current brand.</p>
              </div>

              <div>
                <span>Upcoming fixed dates</span>
                <strong>{campaignStats.fixedDate}</strong>
                <p>Campaigns tied to a specific future date.</p>
              </div>

              <div>
                <span>Upcoming flexible campaigns</span>
                <strong>{campaignStats.flexible}</strong>
                <p>Useful upcoming campaigns without a strict date.</p>
              </div>
            </section>

            <section className="campaign-calendar-layout">
              <div className="campaign-calendar-main">
                <div className="campaign-calendar-section-heading">
                  <div>
                    <p className="dashboard-eyebrow">Opportunities</p>
                    <h3>Choose a campaign to build from</h3>
                  </div>

                  <span>{brandName}</span>
                </div>

                <div className="campaign-card-grid">
                  {campaigns.map((campaign) => {
                    const isSelected = selectedCampaign?.id === campaign.id;

                    return (
                      <article
                        key={campaign.id}
                        className={`campaign-card ${isSelected ? "active" : ""}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedCampaignId(campaign.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedCampaignId(campaign.id);
                          }
                        }}
                      >
                        <div className="campaign-card-top">
                          <span>{getEventTypeLabel(campaign.event_type)}</span>
                          <strong>{getCampaignDateLabel(campaign)}</strong>
                        </div>

                        <h4>{campaign.title}</h4>

                        <p>{campaign.description}</p>

                        <div className="campaign-card-meta">
                          <span>
                            {getCampaignRecommendedPostCount(campaign)} posts
                          </span>
                          <span>{getConfidenceLabel(campaign.date_confidence)}</span>
                        </div>

                        <button
                          type="button"
                          className="campaign-card-create-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleCreateCampaign(campaign);
                          }}
                        >
                          Create posts
                        </button>
                      </article>
                    );
                  })}
                </div>
              </div>

              <aside className="campaign-calendar-sidebar">
                {selectedCampaign && (
                  <div className="campaign-detail-card">
                    <div className="campaign-detail-header">
                      <div>
                        <p className="dashboard-eyebrow">Selected campaign</p>
                        <h3>{selectedCampaign.title}</h3>
                      </div>

                      <span>{getEventTypeLabel(selectedCampaign.event_type)}</span>
                    </div>

                    <div className="campaign-detail-date">
                      <strong>{getCampaignDateLabel(selectedCampaign)}</strong>
                      <span>
                        {getConfidenceLabel(selectedCampaign.date_confidence)}
                      </span>
                    </div>

                    <div className="campaign-detail-score-grid">
                      <div>
                        <span>Relevance</span>
                        <strong>{selectedCampaign.relevance_score || 3}/5</strong>
                      </div>

                      <div>
                        <span>Sales</span>
                        <strong>{selectedCampaign.sales_score || 3}/5</strong>
                      </div>

                      <div>
                        <span>Engagement</span>
                        <strong>
                          {selectedCampaign.engagement_score || 3}/5
                        </strong>
                      </div>
                    </div>

                    <div className="campaign-detail-section">
                      <h4>Why it fits</h4>
                      <p>
                        {selectedCampaign.relevance_reason ||
                          "This campaign can be useful for this brand."}
                      </p>
                    </div>

                    <div className="campaign-detail-section">
                      <h4>Campaign instruction</h4>
                      <p>
                        {selectedCampaign.prompt_context ||
                          "Create posts connected to this campaign opportunity."}
                      </p>
                    </div>

                    {Array.isArray(selectedCampaign.campaign_angles) &&
                      selectedCampaign.campaign_angles.length > 0 && (
                        <div className="campaign-detail-section">
                          <h4>Suggested angles</h4>

                          <div className="campaign-angle-list">
                            {selectedCampaign.campaign_angles
                              .slice(0, 5)
                              .map((angle, index) => (
                                <span key={`${angle}-${index}`}>{angle}</span>
                              ))}
                          </div>
                        </div>
                      )}

                    <div className="campaign-detail-section">
                      <h4>Recommended post plan</h4>

                      <p className="campaign-post-plan-note">
                        Spreelo recommends{" "}
                        {getCampaignRecommendedPostCount(selectedCampaign)} posts
                        for this campaign.
                      </p>

                      <div className="campaign-post-plan">
                        {buildCampaignPostPlan(
                          selectedCampaign,
                          getCampaignRecommendedPostCount(selectedCampaign)
                        ).map((post, index) => (
                          <div key={`${post.role || "campaign-post"}-${index}`}>
                            <span>{index + 1}</span>
                            <div>
                              <strong>{post.role || `Post ${index + 1}`}</strong>
                              <p>{post.purpose || "Create a useful campaign post."}</p>

                              {typeof post.days_before_event === "number" && (
                                <small>
                                  {post.days_before_event === 0
                                    ? "Publish on campaign date"
                                    : `${post.days_before_event} days before`}
                                </small>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="campaign-create-button"
                      onClick={() => handleCreateCampaign(selectedCampaign)}
                    >
                      Create posts
                    </button>

                    <p className="campaign-calendar-disclaimer">
                      Campaign dates are suggested by AI and may vary by market,
                      region or year. You can adjust the schedule before saving
                      the final automation.
                    </p>
                  </div>
                )}
              </aside>
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
}

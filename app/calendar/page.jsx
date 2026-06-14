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
  return new Date().toISOString().slice(0, 10);
}

function isUpcomingCampaign(campaign, todayDateString) {
  if (!campaign) return false;

  const currentYear = Number(todayDateString.slice(0, 4));
  const campaignYear = Number(campaign.event_year);

  if (Number.isFinite(campaignYear) && campaignYear !== currentYear) {
    return false;
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
    return campaignYear === currentYear;
  }

  return true;
}

export default function Calendar() {
  const [user, setUser] = useState(null);
  const [brandProfileId, setBrandProfileId] = useState("");
  const [brandName, setBrandName] = useState("");
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

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

      const currentYear = new Date().getFullYear();

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
        .eq("event_year", currentYear)
        .order("event_year", { ascending: true })
        .order("event_date", { ascending: true, nullsFirst: false });

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      const todayDateString = getTodayDateString();

      const upcomingCampaigns = (data || [])
        .filter((campaign) => isUpcomingCampaign(campaign, todayDateString))
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
                      <button
                        key={campaign.id}
                        type="button"
                        className={`campaign-card ${
                          isSelected ? "active" : ""
                        }`}
                        onClick={() => setSelectedCampaignId(campaign.id)}
                      >
                        <div className="campaign-card-top">
                          <span>{getEventTypeLabel(campaign.event_type)}</span>
                          <strong>{getCampaignDateLabel(campaign)}</strong>
                        </div>

                        <h4>{campaign.title}</h4>

                        <p>{campaign.description}</p>

                        <div className="campaign-card-meta">
                          <span>
                            {campaign.recommended_post_count || 5} posts
                          </span>
                          <span>
                            {getConfidenceLabel(campaign.date_confidence)}
                          </span>
                        </div>
                      </button>
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

                    {Array.isArray(selectedCampaign.post_plan) &&
                      selectedCampaign.post_plan.length > 0 && (
                        <div className="campaign-detail-section">
                          <h4>Suggested post plan</h4>

                          <div className="campaign-post-plan">
                            {selectedCampaign.post_plan
                              .slice(0, 6)
                              .map((post, index) => (
                                <div key={`${post.role}-${index}`}>
                                  <span>{index + 1}</span>
                                  <div>
                                    <strong>
                                      {post.role || `Post ${index + 1}`}
                                    </strong>
                                    <p>
                                      {post.purpose ||
                                        "Create a useful campaign post."}
                                    </p>
                                    {typeof post.days_before_event ===
                                      "number" && (
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
                      )}

                    <button
                      type="button"
                      className="campaign-create-button"
                      onClick={() => handleCreateCampaign(selectedCampaign)}
                    >
                      Create campaign
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

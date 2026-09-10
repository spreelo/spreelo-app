"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Bot,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleDollarSign,
  Gift,
  ImageIcon,
  Layers3,
  Lightbulb,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  History,
  HelpCircle,
  X,
} from "lucide-react";
import AppLayout from "../components/AppLayout";
import HomeReferenceOverview from "../components/HomeReferenceOverview";
import PlanLimitModal from "../components/PlanLimitModal";
import { supabase } from "../lib/supabaseClient";
import { useUiText } from "../lib/i18n/useUiText";
import { parsePlanLimitDatabaseError } from "../lib/planEntitlements";

const PENDING_PREVIEW_LIMIT = 3;
const CONTENT_PLANS_PREVIEW_LIMIT = 3;
const POST_IMAGES_BUCKET = "post-images";

function getBrandStorageKey(userId) {
  return `spreelo_current_brand_id_${userId}`;
}

function formatDate(value, t, locale = "en") {
  if (!value) return t("dashboard.notSet");

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return t("dashboard.notSet");

  try {
    return new Intl.DateTimeFormat(locale || "en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return t("dashboard.notSet");
  }
}

function formatShortDate(value, t, locale = "en") {
  if (!value) return t("dashboard.notSet");

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return t("dashboard.notSet");

  try {
    return new Intl.DateTimeFormat(locale || "en", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return t("dashboard.notSet");
  }
}

function formatCampaignDate(campaign, t, locale = "en") {
  if (!campaign) return t("dashboard.dateNotSet");

  if (campaign.start_date && campaign.end_date) {
    return `${formatShortDate(campaign.start_date, t, locale)} – ${formatShortDate(
      campaign.end_date,
      t
    )}`;
  }

  return formatShortDate(campaign.event_date || campaign.start_date, t, locale);
}

function dashboardText(value, fallback = "") {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  return fallback;
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

function getRulesFromContentPlan(plan) {
  if (Array.isArray(plan?.rules) && plan.rules.length > 0) {
    return plan.rules;
  }

  return plan ? [plan] : [];
}

function getPlanNextDate(rule) {
  const rules = getRulesFromContentPlan(rule);
  const futureDates = rules
    .map((item) => item?.next_run_at)
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => Number.isFinite(date.getTime()) && date.getTime() > Date.now())
    .sort((a, b) => a - b);

  if (futureDates.length > 0) {
    return futureDates[0].toISOString();
  }

  return rule?.next_run_at || rule?.run_date || rules[0]?.next_run_at || rules[0]?.run_date || null;
}

function isFutureDate(value) {
  if (!value) return false;
  return new Date(value).getTime() > Date.now();
}

function getContentPlanStatus(rule, t) {
  const rules = getRulesFromContentPlan(rule);
  const hasWeeklyRule = rules.some((item) => item?.schedule_type === "weekly");
  const hasActiveRule = rules.some((item) => item?.is_active);
  const hasTerminalFailure = rules.some((item) => item?.generation_occurrence_status === "failed_terminal");
  const hasRetryPending = rules.some((item) => item?.generation_occurrence_status === "retry_pending");
  const nextDate = getPlanNextDate(rule);

  if (hasRetryPending) {
    return {
      key: "waiting",
      label: t("dashboard.planStatus.preparing"),
    };
  }

  if (hasTerminalFailure) {
    return {
      key: "waiting",
      label: t("dashboard.planStatus.preparing"),
    };
  }

  if (hasWeeklyRule) {
    if (hasActiveRule) {
      return {
        key: "running",
        label: t("dashboard.planStatus.running"),
      };
    }

    return {
      key: "paused",
      label: t("dashboard.planStatus.paused"),
    };
  }

  if (isFutureDate(nextDate)) {
    return {
      key: "coming",
      label: t("dashboard.planStatus.coming"),
    };
  }

  return {
    key: "finished",
    label: t("dashboard.planStatus.finished"),
  };
}

function getContentPlanSortScore(rule) {
  const status = getContentPlanStatus(rule, (key) => key);
  const statusWeight = {
    failed: 0,
    running: 1,
    coming: 2,
    paused: 3,
    finished: 4,
  }[status.key] ?? 5;

  const date = new Date(getPlanNextDate(rule) || rule?.created_at || 0).getTime();

  return [statusWeight, Number.isFinite(date) ? date : 0];
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

  if (post?.content_format === "animated_video") {
    return t("dashboard.format.animatedVideo");
  }

  return t("dashboard.format.singleImage");
}

function formatPostKind(post, t) {
  if (post?.content_format === "carousel") {
    const slideCount = Number(post.slide_count || 0);

    if (slideCount <= 0) {
      return t("dashboard.carouselDraftMissingSlides");
    }

    return t("dashboard.carouselWithCount", {
      count: slideCount,
    });
  }

  if (post?.content_format === "slideshow_video") {
    const slideCount = Number(post.slide_count || 0);

    if (slideCount <= 0) {
      return t("dashboard.slideshowDraftMissingSlides");
    }

    return t("dashboard.slideshowWithCount", {
      count: slideCount,
    });
  }

  if (post?.content_format === "animated_video") {
    return t("dashboard.animatedProductVideo");
  }

  return post?.post_type || t("dashboard.post");
}

const DASHBOARD_CONTENT_TYPE_KEYS = {
  website_item: "dashboard.contentType.productPost",
  website_item_text_ad: "dashboard.contentType.productAd",
  animated_website_item: "dashboard.contentType.animatedProductReel",
  ai_product_video: "dashboard.contentType.aiProductVideo",
  carousel_website_item: "dashboard.contentType.productCarousel",
  problem_solution: "dashboard.contentType.problemSolution",
  tips: "dashboard.contentType.tips",
  mistakes: "dashboard.contentType.commonMistakes",
  faq: "dashboard.contentType.faq",
  checklist: "dashboard.contentType.checklist",
  service_focus: "dashboard.contentType.serviceFocus",
  seasonal: "dashboard.contentType.seasonal",
  mini_guide: "dashboard.contentType.miniGuide",
  manual_prompt: "dashboard.contentType.customPost",
  myth_fact: "dashboard.contentType.mythFact",
  behind_scenes: "dashboard.contentType.behindScenes",
  case_example: "dashboard.contentType.customerCase",
  local: "dashboard.contentType.localConnection",
  comparison: "dashboard.contentType.comparison",
};

function formatRuleContentType(rule, t) {
  const key = DASHBOARD_CONTENT_TYPE_KEYS[rule?.content_type_id];
  if (key) return t(key);

  if (rule?.content_format === "carousel") return t("dashboard.format.carousel");
  if (rule?.content_format === "animated_video") return t("dashboard.format.animatedVideo");
  if (rule?.content_format === "slideshow_video") return t("dashboard.format.slideshowVideo");

  return dashboardText(
    rule?.content_type_label || rule?.post_type,
    t("dashboard.post")
  );
}

function formatPlanRuleSchedule(rule, t) {
  if (rule?.next_run_at) return formatDate(rule.next_run_at, t);

  if (rule?.run_date && rule?.publish_time) {
    return `${rule.run_date} · ${String(rule.publish_time).slice(0, 5)}`;
  }

  if (rule?.run_date) return dashboardText(rule.run_date, t("dashboard.notSet"));
  if (rule?.publish_time) return String(rule.publish_time).slice(0, 5);

  return t("dashboard.notSet");
}

function isGenericWebsiteReviewLabel(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  return [
    "generated from website",
    "website generated",
    "generated by website",
    "website",
  ].includes(normalized);
}

function getReviewContext(post, rules, t) {
  const rule = rules.find((item) => item.id === post?.automation_rule_id) || null;
  const planName = dashboardText(rule?.name).trim();
  const idea = isGenericWebsiteReviewLabel(post?.idea)
    ? ""
    : dashboardText(post?.idea).trim();
  const sourceLabel = isGenericWebsiteReviewLabel(post?.source_label)
    ? ""
    : dashboardText(post?.source_label).trim();
  const contentType = rule
    ? formatRuleContentType(rule, t)
    : formatPostKind(post, t);

  return {
    title: planName || idea || sourceLabel || contentType || t("dashboard.post"),
    contentType,
    source:
      rule?.queue_source === "campaign"
        ? t("dashboard.reviewSourceCampaign")
        : rule?.queue_source === "content_studio"
          ? t("dashboard.reviewSourceStudio")
          : rule
            ? t("dashboard.reviewSourcePlan")
            : post?.source === "automation"
              ? t("dashboard.reviewSourcePlan")
              : t("dashboard.manualDraft"),
  };
}

function formatPlanName(rule, t) {
  const rules = getRulesFromContentPlan(rule);
  const firstRule = rules[0] || rule;

  if (firstRule?.name) return firstRule.name;
  if (firstRule?.content_type_label) return firstRule.content_type_label;
  if (firstRule?.post_type) return firstRule.post_type;

  return t("dashboard.contentPlan");
}

function getContentPlanFailureInfo(rule, t) {
  const failedRule = getRulesFromContentPlan(rule).find(
    (item) => item?.generation_occurrence_status === "failed_terminal"
  );

  return {
    message: failedRule?.generation_customer_message || t("dashboard.failure.plannedPostCouldNotBeCreated"),
    refundedCredits: Math.max(0, Number(failedRule?.generation_refunded_credits || 0)),
    notificationStatus: failedRule?.generation_notification_status || null,
  };
}

function getContentPlanSummary(rule, t) {
  const rules = getRulesFromContentPlan(rule);
  const firstRule = rules[0] || rule;
  const uniqueTypes = Array.from(
    new Set(
      rules
        .map((item) => formatRuleContentType(item, t))
        .filter(Boolean)
    )
  );

  const typeSummary = uniqueTypes.length
    ? uniqueTypes.slice(0, 3).join(", ") + (uniqueTypes.length > 3 ? "…" : "")
    : firstRule?.post_type || t("dashboard.post");

  const countLabel =
    rules.length > 1
      ? t("dashboard.planPostCount", { count: rules.length })
      : t("dashboard.planOnePost");

  return `${firstRule?.platform || t("dashboard.platformNotSet")} · ${countLabel} · ${typeSummary}`;
}

function getContentPlanGroupKey(rule) {
  const createdMinute = String(rule?.created_at || "").slice(0, 16);
  const name = String(rule?.name || rule?.content_type_label || rule?.post_type || "").trim();
  const platform = String(rule?.platform || "").trim();
  const scheduleType = String(rule?.schedule_type || "").trim();

  return [name, platform, scheduleType, createdMinute].join("|");
}

function groupContentPlans(rules = []) {
  const groups = new Map();

  rules.forEach((rule) => {
    const key = getContentPlanGroupKey(rule);

    if (!groups.has(key)) {
      groups.set(key, {
        ...rule,
        id: key,
        primary_rule_id: rule.id,
        ruleIds: [],
        rules: [],
      });
    }

    const group = groups.get(key);
    group.rules.push(rule);
    group.ruleIds.push(rule.id);

    const currentNext = getPlanNextDate(group);
    const incomingNext = getPlanNextDate(rule);

    if (incomingNext && (!currentNext || new Date(incomingNext) < new Date(currentNext))) {
      group.next_run_at = incomingNext;
      group.run_date = rule.run_date;
    }

    group.is_active = group.rules.some((item) => item.is_active);
  });

  return Array.from(groups.values());
}

function getOperationalPlanGroupKey(rule) {
  const createdMinute = String(rule?.created_at || "").slice(0, 16);
  const name = String(rule?.name || rule?.content_type_label || rule?.post_type || "").trim();
  const scheduleType = String(rule?.schedule_type || "").trim();
  const source = String(rule?.queue_source || "studio").trim();
  return [name, scheduleType, source, createdMinute].join("|");
}

function groupOperationalPlans(rules = []) {
  const groups = new Map();
  for (const rule of rules) {
    const key = getOperationalPlanGroupKey(rule);
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        name: rule?.name || rule?.content_type_label || rule?.post_type || "",
        schedule_type: rule?.schedule_type || "",
        queue_source: rule?.queue_source || "",
        created_at: rule?.created_at || null,
        next_run_at: null,
        plan_state: rule?.plan_state || "active",
        plan_ended_at: rule?.plan_ended_at || null,
        rules: [],
        ruleIds: [],
      });
    }
    const group = groups.get(key);
    group.rules.push(rule);
    group.ruleIds.push(rule.id);
    if (rule?.plan_state === "ended") group.plan_state = "ended";
    else if (rule?.plan_state === "paused" && group.plan_state !== "ended") group.plan_state = "paused";
    if (rule?.plan_ended_at && (!group.plan_ended_at || new Date(rule.plan_ended_at) > new Date(group.plan_ended_at))) {
      group.plan_ended_at = rule.plan_ended_at;
    }
    const candidate = rule?.next_run_at || rule?.run_date || null;
    if (candidate) {
      const time = new Date(candidate).getTime();
      const current = group.next_run_at ? new Date(group.next_run_at).getTime() : Number.POSITIVE_INFINITY;
      if (Number.isFinite(time) && time < current) group.next_run_at = candidate;
    }
    if (rule?.created_at && (!group.created_at || new Date(rule.created_at) < new Date(group.created_at))) {
      group.created_at = rule.created_at;
    }
  }
  return Array.from(groups.values()).map((group) => {
    const platforms = Array.from(new Set(group.rules.map((rule) => String(rule?.platform || "").trim()).filter(Boolean)));
    const contentTypes = Array.from(new Set(group.rules.map((rule) => String(rule?.content_type_label || rule?.content_type_id || rule?.post_type || "").trim()).filter(Boolean)));
    const weeklySlots = new Set(
      group.rules
        .filter((rule) => rule?.schedule_type === "weekly")
        .map((rule) => [rule?.weekday, rule?.publish_time, rule?.content_type_id || rule?.content_type_label || rule?.post_type].join("|"))
    );
    const hasFutureRun = group.rules.some((rule) => isFutureDate(rule?.next_run_at || rule?.run_date));
    const anyActive = group.rules.some((rule) => rule?.is_active === true);
    return {
      ...group,
      platforms,
      contentTypes,
      postsPerWeek: weeklySlots.size || (group.schedule_type === "weekly" ? 1 : 0),
      anyActive,
      hasFutureRun,
    };
  });
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
  const [selectedContentPlanIds, setSelectedContentPlanIds] = useState([]);
  const [showAllContentPlans, setShowAllContentPlans] = useState(false);
  const [contentPlanActionLoading, setContentPlanActionLoading] = useState(false);
  const [showAllHomePlans, setShowAllHomePlans] = useState(false);
  const [expandedHomePlanIds, setExpandedHomePlanIds] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [scheduleActionLoading, setScheduleActionLoading] = useState("");
  const [planLimitDetails, setPlanLimitDetails] = useState(null);
  const { t, locale } = useUiText(["dashboard", "automation"]);

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
    setSelectedContentPlanIds([]);
    setShowAllContentPlans(false);
    setShowAllHomePlans(false);
    setExpandedHomePlanIds([]);
    setShowHistory(false);
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
        "id, brand_profile_id, platform, tone, language, post_type, idea, content, status, created_at, source, source_label, automation_rule_id, approval_required, approved_at, published_at, scheduled_for, image_url, image_status, video_url, video_status, content_format, admin_review_status, admin_reviewed_at, approval_email_sent_at"
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

    const rulesSelect = "id, brand_profile_id, name, weekday, publish_time, platform, post_type, schedule_type, run_date, timezone, next_run_at, is_active, plan_state, plan_ended_at, content_type_id, content_type_label, content_format, queue_source, uses_website_content, generate_image, approval_required, created_at, generation_occurrence_status, generation_customer_message, generation_refunded_credits, generation_notification_status, generation_occurrence_scheduled_for";
    const legacyRulesSelect = "id, brand_profile_id, name, weekday, publish_time, platform, post_type, schedule_type, run_date, timezone, next_run_at, is_active, content_type_id, content_type_label, content_format, queue_source, uses_website_content, generate_image, approval_required, created_at, generation_occurrence_status, generation_customer_message, generation_refunded_credits, generation_notification_status, generation_occurrence_scheduled_for";

    let rulesResult = await supabase
      .from("automation_rules")
      .select(rulesSelect)
      .eq("user_id", user.id)
      .eq("brand_profile_id", selectedBrand.id)
      .order("next_run_at", { ascending: true });

    const lifecycleColumnsMissing = Boolean(
      rulesResult.error && /plan_state|plan_ended_at|schema cache|PGRST204/i.test(String(rulesResult.error.message || ""))
    );
    if (lifecycleColumnsMissing) {
      rulesResult = await supabase
        .from("automation_rules")
        .select(legacyRulesSelect)
        .eq("user_id", user.id)
        .eq("brand_profile_id", selectedBrand.id)
        .order("next_run_at", { ascending: true });
      if (!rulesResult.error) {
        rulesResult.data = (rulesResult.data || []).map((rule) => ({
          ...rule,
          plan_state: rule.is_active ? "active" : rule.schedule_type === "weekly" ? "paused" : "active",
          plan_ended_at: null,
        }));
      }
    }

    if (rulesResult.error) {
      setMessage((current) =>
        current ? `${current} ${rulesResult.error.message}` : rulesResult.error.message
      );
    } else {
      setRules(rulesResult.data || []);
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
    const customerReadyAdminStates = new Set(["approved_by_spreelo", "released", "not_required"]);
    return posts
      .filter((post) =>
        post.status === "pending_approval" &&
        customerReadyAdminStates.has(String(post.admin_review_status || "").toLowerCase())
      )
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
      .filter((rule) => rule.next_run_at && isFutureDate(rule.next_run_at))
      .sort((a, b) => new Date(a.next_run_at) - new Date(b.next_run_at));
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
    return groupContentPlans(rules)
      .sort((a, b) => {
        const [statusA, dateA] = getContentPlanSortScore(a);
        const [statusB, dateB] = getContentPlanSortScore(b);

        if (statusA !== statusB) return statusA - statusB;
        return dateA - dateB;
      });
  }, [rules]);

  const ongoingContentPlans = useMemo(
    () =>
      dashboardContentPlans.filter((plan) =>
        (plan.rules || [plan]).some((rule) => rule.schedule_type === "weekly")
      ),
    [dashboardContentPlans]
  );

  const plannedContentPlans = useMemo(
    () =>
      dashboardContentPlans.filter((plan) =>
        !(plan.rules || [plan]).some((rule) => rule.schedule_type === "weekly")
      ),
    [dashboardContentPlans]
  );

  const visibleOngoingContentPlans = useMemo(() => {
    if (showAllContentPlans) return ongoingContentPlans;
    return ongoingContentPlans.slice(0, CONTENT_PLANS_PREVIEW_LIMIT);
  }, [ongoingContentPlans, showAllContentPlans]);

  const visiblePlannedContentPlans = useMemo(() => {
    if (showAllContentPlans) return plannedContentPlans;
    return plannedContentPlans.slice(0, CONTENT_PLANS_PREVIEW_LIMIT);
  }, [plannedContentPlans, showAllContentPlans]);

  const visibleDashboardContentPlans = useMemo(
    () => [...visibleOngoingContentPlans, ...visiblePlannedContentPlans],
    [visibleOngoingContentPlans, visiblePlannedContentPlans]
  );

  const visibleContentPlanIds = visibleDashboardContentPlans.map((rule) => rule.id);
  const hiddenContentPlanCount = Math.max(
    0,
    dashboardContentPlans.length - visibleDashboardContentPlans.length
  );
  const allVisibleContentPlansSelected =
    visibleContentPlanIds.length > 0 &&
    visibleContentPlanIds.every((ruleId) => selectedContentPlanIds.includes(ruleId));

  const homeActivePlans = useMemo(() => {
    return dashboardContentPlans.filter((plan) => {
      const status = getContentPlanStatus(plan, t);
      return !["finished", "paused"].includes(status.key);
    });
  }, [dashboardContentPlans, t]);

  const homeVisiblePlans = useMemo(
    () => (showAllHomePlans ? homeActivePlans : homeActivePlans.slice(0, 4)),
    [homeActivePlans, showAllHomePlans]
  );

  function toggleHomePlan(planId) {
    setExpandedHomePlanIds((current) =>
      current.includes(planId)
        ? current.filter((id) => id !== planId)
        : [...current, planId]
    );
  }

  const operationalPlans = useMemo(() => groupOperationalPlans(rules), [rules]);
  const recurringSchedules = useMemo(
    () => operationalPlans.filter((plan) => plan.schedule_type === "weekly" && plan.queue_source !== "campaign" && plan.plan_state !== "ended"),
    [operationalPlans]
  );
  const calendarCampaignPlans = useMemo(
    () => operationalPlans.filter((plan) => plan.queue_source === "campaign" && plan.plan_state !== "ended" && (plan.anyActive || plan.hasFutureRun)),
    [operationalPlans]
  );
  const scheduledPlanGroups = useMemo(
    () => operationalPlans.filter((plan) => plan.schedule_type !== "weekly" && plan.queue_source !== "campaign" && plan.plan_state !== "ended" && (plan.anyActive || plan.hasFutureRun)),
    [operationalPlans]
  );
  const planHistory = useMemo(
    () => operationalPlans
      .filter((plan) => plan.plan_state === "ended" || (!plan.anyActive && !plan.hasFutureRun && plan.schedule_type !== "weekly"))
      .sort((a, b) => new Date(b.plan_ended_at || b.next_run_at || b.created_at || 0) - new Date(a.plan_ended_at || a.next_run_at || a.created_at || 0)),
    [operationalPlans]
  );
  const standaloneScheduledPosts = useMemo(() => {
    const plannedRuleIds = new Set(scheduledPlanGroups.flatMap((plan) => plan.ruleIds || []));
    return scheduledPosts.filter((post) => !post.automation_rule_id || !plannedRuleIds.has(post.automation_rule_id));
  }, [scheduledPosts, scheduledPlanGroups]);

  // The Home reference row must count actual one-time posts, not grouped plans.
  // A single plan can contain several rules (for example 3 planned posts), which is
  // why the old UI could show 3 at the top but only 1 in the planner row.
  const scheduledRuleItems = useMemo(() => {
    return rules
      .filter((rule) => {
        if (rule?.schedule_type === "weekly") return false;
        if (rule?.queue_source === "campaign") return false;
        if (rule?.plan_state === "ended") return false;
        return rule?.is_active === true || isFutureDate(rule?.next_run_at || rule?.run_date);
      })
      .sort((a, b) => new Date(a?.next_run_at || a?.run_date || a?.created_at || 0) - new Date(b?.next_run_at || b?.run_date || b?.created_at || 0));
  }, [rules]);

  const homeScheduledItems = useMemo(() => {
    const ruleIds = new Set(scheduledRuleItems.map((rule) => rule.id));
    return [
      ...scheduledRuleItems.map((rule) => ({ ...rule, item_kind: "rule" })),
      ...scheduledPosts
        .filter((post) => !post?.automation_rule_id || !ruleIds.has(post.automation_rule_id))
        .map((post) => ({ ...post, item_kind: "post" })),
    ].sort((a, b) => new Date(a?.next_run_at || a?.scheduled_for || a?.run_date || a?.created_at || 0) - new Date(b?.next_run_at || b?.scheduled_for || b?.run_date || b?.created_at || 0));
  }, [scheduledRuleItems, scheduledPosts]);

  const nextAutomation = upcomingRules[0] || null;
  const currentBrandName = brandProfile?.business_name || t("dashboard.currentBrand");
  const dashboardEyebrow = t("dashboard.eyebrow");

  async function setOperationalPlanState(plan, nextState) {
    if (!plan?.ruleIds?.length || !currentBrandId || scheduleActionLoading) return;
    const planKey = String(creditBalance?.subscription_plan || creditBalance?.plan_name || "").trim().toLowerCase();
    if (nextState === "active" && plan.schedule_type === "weekly" && (planKey === "free" || !planKey)) {
      setMessage(t("dashboard.recurringRequiresPaidPlan"));
      return;
    }
    setScheduleActionLoading(plan.id);
    setMessage("");
    try {
      if (nextState === "ended") {
        const { data, error } = await supabase.rpc("end_automation_rules_keep_history", {
          p_rule_ids: plan.ruleIds,
        });
        if (error) throw error;
        const releasedCredits = Number(data?.released_credits || 0);
        if (releasedCredits > 0) {
          setCreditBalance((current) => current ? {
            ...current,
            credits_remaining: Number(current.credits_remaining || 0) + releasedCredits,
          } : current);
        }
        setRules((current) => current.map((rule) => plan.ruleIds.includes(rule.id) ? {
          ...rule,
          is_active: false,
          plan_state: "ended",
          plan_ended_at: new Date().toISOString(),
        } : rule));
      } else {
        const isActive = nextState === "active";
        const { error } = await supabase
          .from("automation_rules")
          .update({
            is_active: isActive,
            plan_state: isActive ? "active" : "paused",
            plan_ended_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("brand_profile_id", currentBrandId)
          .in("id", plan.ruleIds);
        if (error) throw error;
        setRules((current) => current.map((rule) => plan.ruleIds.includes(rule.id) ? {
          ...rule,
          is_active: isActive,
          plan_state: isActive ? "active" : "paused",
          plan_ended_at: null,
        } : rule));
      }
      setMessage(t("dashboard.scheduleUpdated"));
    } catch (error) {
      const limitDetails = parsePlanLimitDatabaseError(error);
      if (limitDetails) setPlanLimitDetails(limitDetails);
      else setMessage(error?.message || t("dashboard.scheduleUpdateError"));
    } finally {
      setScheduleActionLoading("");
    }
  }

  function getOperationalContentLabels(plan) {
    return Array.from(new Set(
      (plan?.rules || []).map((rule) => formatRuleContentType(rule, t)).filter(Boolean)
    ));
  }

  function renderOperationalPlanRow(plan, kind = "recurring") {
    const labels = getOperationalContentLabels(plan);
    const isPaused = plan.plan_state === "paused" || !plan.anyActive;
    const actionBusy = scheduleActionLoading === plan.id;
    const nextRun = plan.next_run_at || plan.rules?.map((rule) => rule?.next_run_at || rule?.run_date).find(Boolean);
    return (
      <article className="home-v14369-operation-row" key={plan.id}>
        <div className="home-v14369-operation-main">
          <div className="home-v14369-operation-title">
            <span className={`home-v14369-operation-status ${isPaused ? "paused" : "active"}`} />
            <div>
              <strong>{dashboardText(plan.name, t("dashboard.contentPlan"))}</strong>
              <small>
                {kind === "recurring" && plan.postsPerWeek ? t("dashboard.postsPerWeek", { count: plan.postsPerWeek }) : null}
                {kind === "recurring" && plan.postsPerWeek && nextRun ? " · " : null}
                {nextRun ? t("dashboard.nextRun", { date: formatShortDate(nextRun, t, locale) }) : null}
              </small>
            </div>
          </div>
          <div className="home-v14369-operation-meta">
            <span><b>{t("dashboard.platforms")}</b>{plan.platforms.length ? plan.platforms.join(" · ") : t("dashboard.platformNotSet")}</span>
            <span><b>{t("dashboard.contentTypes")}</b>{labels.slice(0, 3).join(" · ") || t("dashboard.post")}{labels.length > 3 ? ` +${labels.length - 3}` : ""}</span>
            <span><b>{t("dashboard.startDateLabel")}</b>{formatShortDate(plan.created_at, t, locale)}</span>
          </div>
        </div>
        <div className="home-v14369-operation-actions">
          {kind === "recurring" && plan?.rules?.[0]?.id ? (
            <a className="home-reference-open-item" href={`/plans/${plan.rules[0].id}`}>
              {t("planManager.openPlan")} <ArrowRight />
            </a>
          ) : null}
          <button
            type="button"
            className="home-v14369-pause"
            disabled={actionBusy}
            onClick={() => setOperationalPlanState(plan, isPaused ? "active" : "paused")}
          >
            {actionBusy ? <RefreshCw className="home-v14369-spin" /> : isPaused ? <Play /> : <Pause />}
            {actionBusy ? t("dashboard.pausing") : isPaused ? t("dashboard.resume") : t("dashboard.pause")}
          </button>
          <button
            type="button"
            className="home-v14369-end"
            disabled={actionBusy}
            onClick={() => {
              if (window.confirm(t("dashboard.confirmEndSchedule"))) setOperationalPlanState(plan, "ended");
            }}
          >
            <Trash2 /> {kind === "campaign" ? t("dashboard.endCampaign") : t("dashboard.endSchedule")}
          </button>
        </div>
      </article>
    );
  }

  function toggleContentPlanSelection(ruleId) {
    setSelectedContentPlanIds((current) => {
      if (current.includes(ruleId)) {
        return current.filter((id) => id !== ruleId);
      }

      return [...current, ruleId];
    });
  }

  function selectVisibleContentPlans() {
    setSelectedContentPlanIds((current) => {
      const merged = new Set(current);

      visibleContentPlanIds.forEach((id) => merged.add(id));

      return Array.from(merged);
    });
  }

  function clearSelectedContentPlans() {
    setSelectedContentPlanIds([]);
  }

  async function deleteContentPlans(ruleIds) {
    const requestedPlanCount = (ruleIds || []).filter(Boolean).length;
    const ids = Array.from(
      new Set(
        (ruleIds || [])
          .filter(Boolean)
          .flatMap((planId) => {
            const plan = dashboardContentPlans.find((item) => item.id === planId);
            return plan?.ruleIds?.length ? plan.ruleIds : [planId];
          })
      )
    );

    if (ids.length === 0 || !currentBrandId) return;

    const confirmed = window.confirm(
      requestedPlanCount === 1
        ? t("dashboard.confirmDeletePlan")
        : t("dashboard.confirmDeleteContentPlans", { count: requestedPlanCount })
    );

    if (!confirmed) return;

    setContentPlanActionLoading(true);
    setMessage("");

    const { data: releaseResult, error } = await supabase.rpc(
      "release_and_delete_automation_rules",
      { p_rule_ids: ids }
    );

    if (error) {
      setMessage(error.message || t("dashboard.errorDeleteContentPlans"));
    } else {
      const releasedRules = Array.isArray(releaseResult?.rules)
        ? releaseResult.rules
        : [];
      const uploadedImagePaths = releasedRules
        .map((rule) => rule.uploaded_image_storage_path)
        .filter(Boolean);

      if (uploadedImagePaths.length) {
        const { error: storageDeleteError } = await supabase.storage
          .from(POST_IMAGES_BUCKET)
          .remove(Array.from(new Set(uploadedImagePaths)));

        if (storageDeleteError) {
          console.warn("Could not remove uploaded content-plan images", {
            message: storageDeleteError.message,
            ruleIds: ids,
          });
        }
      }

      const releasedCredits = Number(releaseResult?.released_credits || 0);
      if (releasedCredits > 0) {
        setCreditBalance((current) =>
          current
            ? {
                ...current,
                credits_remaining:
                  Number(current.credits_remaining || 0) + releasedCredits,
              }
            : current
        );
      }

      setRules((current) => current.filter((rule) => !ids.includes(rule.id)));
      setSelectedContentPlanIds((current) =>
        current.filter((ruleId) => !ids.includes(ruleId))
      );
      setMessage(
        `${requestedPlanCount === 1
          ? t("dashboard.deletedPlan")
          : t("dashboard.deletedContentPlans", { count: requestedPlanCount })}${
          releasedCredits > 0
            ? ` ${releasedCredits} reserved credit${releasedCredits === 1 ? " was" : "s were"} returned.`
            : ""
        }`
      );
    }

    setContentPlanActionLoading(false);
  }

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

  const dashboardRecentActivity = posts.slice(0, 3);
  const dashboardReviewPreview = pendingApprovalPosts.slice(0, 4);

  return (
    <AppLayout active="dashboard">
      <HomeReferenceOverview
        message={message}
        loading={loading}
        currentBrandId={currentBrandId}
        currentBrandName={currentBrandName}
        creditsRemaining={creditsRemaining}
        monthlyCreditLimit={monthlyCreditLimit}
        plannedCount={activeRules.length + scheduledPosts.length}
        pendingCount={pendingApprovalPosts.length}
        publishedCount={publishedThisMonthCount}
        activeSchedulesCount={recurringSchedules.length + calendarCampaignPlans.length}
        recurringCount={recurringSchedules.length}
        scheduledCount={homeScheduledItems.length}
        campaignCount={calendarCampaignPlans.length}
        recurringSchedules={recurringSchedules}
        scheduledItems={homeScheduledItems}
        campaignSchedules={calendarCampaignPlans}
        scheduleActionLoading={scheduleActionLoading}
        onSetRecurringScheduleState={setOperationalPlanState}
        openPlanLabel={t("planManager.openPlan")}
        accountActiveLabel={t("dashboard.accountActiveV14458")}
        suggestedCampaign={suggestedCampaign ? {
          id: suggestedCampaign.id,
          title: dashboardText(suggestedCampaign.title, t("dashboard.suggestedCampaign")),
          date: formatCampaignDate(suggestedCampaign, t, locale),
        } : null}
      />
      <PlanLimitModal details={planLimitDetails} onClose={() => setPlanLimitDetails(null)} />
    </AppLayout>
  );

  return (
    <AppLayout active="dashboard">
      <div className="home-v14335-page">
        {message ? <p className="login-message">{message}</p> : null}

        {!loading && !currentBrandId ? (
          <section className="home-v14335-empty home-v14335-glass">
            <h1>{t("dashboard.noBrandTitle")}</h1>
            <p>{t("dashboard.noBrandText")}</p>
            <a href="/brand">{t("dashboard.openBrandProfile")}</a>
          </section>
        ) : (
          <div className="home-v14335-grid">
            <main className="home-v14335-main">
              <header className="home-v14335-hero">
                <div>
                  <p>{dashboardEyebrow}</p>
                  <h1>{t("dashboard.title", { brandName: currentBrandName })}</h1>
                  <span>{t("dashboard.homeHeroText")}</span>
                </div>
              </header>

              <section className="home-v14335-stats" aria-label={t("dashboard.overviewStats")}> 
                <article>
                  <span className="is-coral"><CalendarClock /></span>
                  <div><small>{t("dashboard.stat.plannedPosts")}</small><strong>{activeRules.length + scheduledPosts.length}</strong><p>{t("dashboard.stat.upcomingShort")}</p></div>
                </article>
                <article>
                  <span className="is-violet"><Sparkles /></span>
                  <div><small>{t("dashboard.stat.pendingApproval")}</small><strong>{pendingApprovalPosts.length}</strong><p>{t("dashboard.stat.reviewShort")}</p></div>
                </article>
                <article>
                  <span className="is-green"><CheckCircle2 /></span>
                  <div><small>{t("dashboard.stat.publishedThisMonth")}</small><strong>{publishedThisMonthCount}</strong><p>{t("dashboard.stat.publishedShort")}</p></div>
                </article>
                <article>
                  <span className="is-mint"><Layers3 /></span>
                  <div><small>{t("dashboard.activeSchedules")}</small><strong>{recurringSchedules.length + calendarCampaignPlans.length}</strong><p>{t("dashboard.activeSchedulesShort")}</p></div>
                </article>
              </section>

              <section className={`home-v14369-approval-notice home-v14370-review-hub ${pendingApprovalPosts.length ? "has-pending" : "is-clear"}`}>
                <div className="home-v14369-approval-copy">
                  <span className="home-v14369-approval-icon">{pendingApprovalPosts.length ? <Sparkles /> : <CheckCircle2 />}</span>
                  <div>
                    <strong>{pendingApprovalPosts.length ? (pendingApprovalPosts.length === 1 ? t("dashboard.reviewNoticeOne") : t("dashboard.reviewNotice", { count: pendingApprovalPosts.length })) : t("dashboard.reviewClearTitle")}</strong>
                    <small>{pendingApprovalPosts.length ? t("dashboard.reviewNoticeHelp") : t("dashboard.reviewClearText")}</small>
                  </div>
                </div>
                {pendingApprovalPosts.length ? (
                  <div className="home-v14369-approval-previews" aria-hidden="true">
                    {pendingApprovalPosts.slice(0, 3).map((post) => post.image_url ? <img key={post.id} src={post.image_url} alt="" /> : <span key={post.id}><ImageIcon /></span>)}
                  </div>
                ) : null}
                <div className="home-v14370-review-actions">
                  {pendingApprovalPosts.length ? <a href="/review?view=queue">{t("dashboard.reviewNow")} <ArrowRight /></a> : null}
                  <a className="history" href="/review?view=history"><History /> {t("dashboard.contentHistory")}</a>
                </div>
              </section>

              <section className="home-v14369-operations home-v14370-module recurring">
                <div className="home-v14369-section-heading">
                  <span className="home-v14370-module-icon"><RefreshCw /></span>
                  <div>
                    <p>{t("dashboard.contentPlansEyebrow")}</p>
                    <div className="home-v14371-title-line">
                      <h2>{t("dashboard.recurringSchedules")}</h2>
                      <details className="home-v14371-help">
                        <summary aria-label={t("dashboard.sectionHelp")}><HelpCircle /></summary>
                        <div>{t("dashboard.recurringSchedulesHelp")}</div>
                      </details>
                    </div>
                    <span>{t("dashboard.recurringSchedulesText")}</span>
                  </div>
                  <div className="home-v14371-header-actions">
                    <button type="button" className="spreelo-action-v14371 ghost compact" onClick={() => setShowHistory(true)}><History /> {t("dashboard.planHistory")}</button>
                    <a className="spreelo-action-v14371 primary compact" href="/automation"><Plus /> {t("dashboard.createSchedule")}</a>
                  </div>
                </div>
                <div className="home-v14369-operation-list">
                  {recurringSchedules.length ? recurringSchedules.map((plan) => renderOperationalPlanRow(plan, "recurring")) : (
                    <div className="home-v14369-empty home-v14371-empty-state">
                      <span>{t("dashboard.noRecurringSchedules")}</span>
                      <a className="spreelo-action-v14371 secondary compact" href="/automation">{t("dashboard.createSchedule")} <ArrowRight /></a>
                    </div>
                  )}
                </div>
              </section>

              <section className="home-v14369-operations home-v14370-module scheduled">
                <div className="home-v14369-section-heading">
                  <span className="home-v14370-module-icon"><CalendarClock /></span>
                  <div>
                    <p>{t("dashboard.upcomingEyebrow")}</p>
                    <div className="home-v14371-title-line">
                      <h2>{t("dashboard.scheduledPostsBox")}</h2>
                      <details className="home-v14371-help">
                        <summary aria-label={t("dashboard.sectionHelp")}><HelpCircle /></summary>
                        <div>{t("dashboard.scheduledPostsHelp")}</div>
                      </details>
                    </div>
                    <span>{t("dashboard.scheduledPostsBoxText")}</span>
                  </div>
                  <div className="home-v14371-header-actions">
                    <a className="spreelo-action-v14371 primary compact" href="/automation"><Plus /> {t("dashboard.schedulePosts")}</a>
                  </div>
                </div>
                <div className="home-v14369-operation-list">
                  {scheduledPlanGroups.length || standaloneScheduledPosts.length ? (
                    <>
                      {scheduledPlanGroups.map((plan) => renderOperationalPlanRow(plan, "scheduled"))}
                      {standaloneScheduledPosts.map((post) => (
                        <article className="home-v14369-operation-row home-v14369-standalone-post" key={`scheduled-post-${post.id}`}>
                          <div className="home-v14369-operation-main">
                            <div className="home-v14369-operation-title">
                              <span className="home-v14369-operation-status active" />
                              <div><strong>{dashboardText(post.idea || formatPostKind(post, t), t("dashboard.post"))}</strong><small>{t("dashboard.nextRun", { date: formatShortDate(post.scheduled_for, t, locale) })}</small></div>
                            </div>
                            <div className="home-v14369-operation-meta">
                              <span><b>{t("dashboard.platforms")}</b>{dashboardText(post.platform, t("dashboard.platformNotSet"))}</span>
                              <span><b>{t("dashboard.contentTypes")}</b>{formatPostKind(post, t)}</span>
                            </div>
                          </div>
                          <a className="home-v14369-open-post" href={`/posts/${post.id}`}>{t("dashboard.view")} <ArrowRight /></a>
                        </article>
                      ))}
                    </>
                  ) : (
                    <div className="home-v14369-empty home-v14371-empty-state">
                      <span>{t("dashboard.noScheduledPosts")}</span>
                      <a className="spreelo-action-v14371 secondary compact" href="/automation">{t("dashboard.schedulePosts")} <ArrowRight /></a>
                    </div>
                  )}
                </div>
              </section>

              <section className="home-v14369-operations home-v14370-module campaign">
                <div className="home-v14369-section-heading">
                  <span className="home-v14370-module-icon"><Gift /></span>
                  <div>
                    <p>{t("dashboard.reviewSourceCampaign")}</p>
                    <div className="home-v14371-title-line">
                      <h2>{t("dashboard.calendarCampaignsBox")}</h2>
                      <details className="home-v14371-help">
                        <summary aria-label={t("dashboard.sectionHelp")}><HelpCircle /></summary>
                        <div>{t("dashboard.calendarCampaignsHelp")}</div>
                      </details>
                    </div>
                    <span>{t("dashboard.calendarCampaignsBoxText")}</span>
                  </div>
                  <div className="home-v14371-header-actions">
                    <a className="spreelo-action-v14371 primary compact" href="/calendar"><Plus /> {t("dashboard.createCampaign")}</a>
                  </div>
                </div>
                <div className="home-v14369-operation-list">
                  {calendarCampaignPlans.length ? calendarCampaignPlans.map((plan) => renderOperationalPlanRow(plan, "campaign")) : (
                    <div className="home-v14369-empty home-v14371-empty-state">
                      <span>{t("dashboard.noCalendarCampaigns")}</span>
                      <a className="spreelo-action-v14371 secondary compact" href="/calendar">{t("dashboard.createCampaign")} <ArrowRight /></a>
                    </div>
                  )}
                </div>
              </section>

              {showHistory ? (
                <div className="home-v14369-history-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowHistory(false); }}>
                  <section className="home-v14369-history-modal" role="dialog" aria-modal="true" aria-label={t("dashboard.historyTitle")}>
                    <header>
                      <div><p>{t("dashboard.history")}</p><h2>{t("dashboard.historyTitle")}</h2><span>{t("dashboard.historyText")}</span></div>
                      <button type="button" onClick={() => setShowHistory(false)} aria-label={t("dashboard.closeHistory")}><X /></button>
                    </header>
                    <div className="home-v14369-history-list">
                      {planHistory.length ? planHistory.map((plan) => (
                        <article key={`history-${plan.id}`}>
                          <div><strong>{dashboardText(plan.name, t("dashboard.contentPlan"))}</strong><small>{plan.platforms.join(" · ") || t("dashboard.platformNotSet")}</small></div>
                          <span>{getOperationalContentLabels(plan).slice(0, 3).join(" · ") || t("dashboard.post")}</span>
                          <time>{t("dashboard.completedOn", { date: formatShortDate(plan.plan_ended_at || plan.next_run_at || plan.created_at, t, locale) })}</time>
                        </article>
                      )) : <div className="home-v14369-empty">{t("dashboard.historyEmpty")}</div>}
                    </div>
                  </section>
                </div>
              ) : null}
            </main>

            <aside className="home-v14335-aside">
              <section className="home-v14335-coach">
                <p>{t("dashboard.aiCoach")}</p>
                <h2>{t("dashboard.coachGreeting")}</h2>
                <span>{t("dashboard.coachIntro", { brandName: currentBrandName })}</span>
                <div className="home-v14335-coach-actions">
                  <h3><Bot /> {t("dashboard.whatToDoNow")}</h3>
                  <a href="/review?view=queue"><Sparkles /><span>{t("dashboard.reviewCount", { count: pendingApprovalPosts.length })}</span><ChevronRight /></a>
                  <a href="/automation"><CalendarDays /><span>{t("dashboard.planNextWeek")}</span><ChevronRight /></a>
                  <a href={suggestedCampaign ? `/automation?campaign=${suggestedCampaign.id}` : "/calendar"}><Lightbulb /><span>{dashboardText(suggestedCampaign?.title, t("dashboard.reviewCampaignIdeas"))}</span><ChevronRight /></a>
                </div>
              </section>

              <section className="home-v14335-side-card home-v14335-campaign">
                <div className="home-v14335-side-title"><Gift /><div><h3>{t("dashboard.suggestedCampaign")}</h3><small>{t("dashboard.recommended")}</small></div></div>
                {suggestedCampaign ? (
                  <><h2>{dashboardText(suggestedCampaign.title, t("dashboard.suggestedCampaign"))}</h2><strong>{formatCampaignDate(suggestedCampaign, t, locale)}</strong><p>{dashboardText(suggestedCampaign.description, t("dashboard.openCalendarText"))}</p><a href={`/automation?campaign=${suggestedCampaign.id}`}>{t("dashboard.createCampaignPlan")} <ArrowRight /></a></>
                ) : (
                  <><h2>{t("dashboard.noSuggestedCampaign")}</h2><p>{t("dashboard.openCalendarText")}</p><a href="/calendar">{t("dashboard.openCalendar")} <ArrowRight /></a></>
                )}
              </section>

              <section className="home-v14335-side-card home-v14335-credits">
                <div className="home-v14335-side-title"><CircleDollarSign /><h3>{t("dashboard.creditStatus")}</h3></div>
                <h2>{creditsRemaining}<span>{t("dashboard.creditsLeft", { limit: monthlyCreditLimit || "—" })}</span></h2>
                <div><i style={{ width: `${creditUsagePercent}%` }} /></div>
                <p>{creditBalance?.plan_name || "Free"}</p>
                <a href="/settings">{t("dashboard.manageCredits")} <ArrowRight /></a>
              </section>
            </aside>
          </div>
        )}
      </div>
    </AppLayout>
  );

  /* The previous dashboard stays below as a rollback-safe implementation. */
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
              <CalendarDays size={16} aria-hidden="true" />
              {t("dashboard.yourCalendar")}
            </a>

            <a className="dashboard-primary-action" href="/automation">
              <Plus size={16} aria-hidden="true" />
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
              <div className="dashboard-stat-card is-planned">
                <span className="dashboard-stat-icon" aria-hidden="true">
                  <CalendarClock />
                </span>
                <div className="dashboard-stat-copy">
                  <span className="dashboard-stat-label">{t("dashboard.stat.plannedPosts")}</span>
                  <strong>{activeRules.length + scheduledPosts.length}</strong>
                  <p>{t("dashboard.stat.plannedPostsText")}</p>
                </div>
              </div>

              <div className="dashboard-stat-card is-review">
                <span className="dashboard-stat-icon" aria-hidden="true">
                  <Sparkles />
                </span>
                <div className="dashboard-stat-copy">
                  <span className="dashboard-stat-label">{t("dashboard.stat.pendingApproval")}</span>
                  <strong>{pendingApprovalPosts.length}</strong>
                  <p>{t("dashboard.stat.pendingApprovalText")}</p>
                </div>
              </div>

              <div className="dashboard-stat-card is-published">
                <span className="dashboard-stat-icon" aria-hidden="true">
                  <CheckCircle2 />
                </span>
                <div className="dashboard-stat-copy">
                  <span className="dashboard-stat-label">{t("dashboard.stat.publishedThisMonth")}</span>
                  <strong>{publishedThisMonthCount}</strong>
                  <p>{t("dashboard.stat.publishedThisMonthText")}</p>
                </div>
              </div>

              <div className="dashboard-stat-card is-active">
                <span className="dashboard-stat-icon" aria-hidden="true">
                  <Layers3 />
                </span>
                <div className="dashboard-stat-copy">
                  <span className="dashboard-stat-label">{t("dashboard.stat.activePlans")}</span>
                  <strong>{activeRules.length}</strong>
                  <p>{t("dashboard.stat.activePlansText")}</p>
                </div>
              </div>
            </section>

            <div className="dashboard-layout">
              <main className="dashboard-main">
                <section className="dashboard-card dashboard-plan-hub-card">
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
                            <strong>{formatShortDate(rule.next_run_at, t, locale)}</strong>
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

                  <div className="dashboard-plan-hub-divider" />

                  <div className="dashboard-plan-hub-section dashboard-content-plans-card">
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
                      <>
                        <div className="dashboard-plan-toolbar">
                          <div>
                            <button
                              type="button"
                              className="dashboard-inline-action"
                              onClick={
                                allVisibleContentPlansSelected
                                  ? clearSelectedContentPlans
                                  : selectVisibleContentPlans
                              }
                            >
                              {allVisibleContentPlansSelected
                                ? t("dashboard.clear")
                                : t("dashboard.selectVisible")}
                            </button>

                            {selectedContentPlanIds.length > 0 && (
                              <span className="dashboard-selection-count">
                                {t("dashboard.contentPlansSelected", {
                                  count: selectedContentPlanIds.length,
                                })}
                              </span>
                            )}
                          </div>

                          {selectedContentPlanIds.length > 0 && (
                            <button
                              type="button"
                              className="dashboard-delete-button"
                              disabled={contentPlanActionLoading}
                              onClick={() => deleteContentPlans(selectedContentPlanIds)}
                            >
                              {contentPlanActionLoading
                                ? t("dashboard.deleting")
                                : t("dashboard.deleteSelected")}
                            </button>
                          )}
                        </div>

                        <div className="dashboard-plan-split">
                          <section className="dashboard-plan-group">
                            <div className="dashboard-plan-group-heading">
                              <div>
                                <span className="dashboard-plan-group-icon ongoing">
                                  <RefreshCw aria-hidden="true" />
                                </span>
                                <div>
                                  <h4>{t("dashboard.ongoingPlansTitle")}</h4>
                                  <p>{t("dashboard.ongoingPlansText")}</p>
                                </div>
                              </div>
                              <strong>{ongoingContentPlans.length}</strong>
                            </div>

                            {visibleOngoingContentPlans.length ? (
                              <div className="dashboard-plan-list">
                                {visibleOngoingContentPlans.map((rule) => {
                                  const status = getContentPlanStatus(rule, t);

                                  return (
                                    <article className="dashboard-plan-row" key={rule.id}>
                                      <label className="dashboard-plan-check">
                                        <input
                                          type="checkbox"
                                          checked={selectedContentPlanIds.includes(rule.id)}
                                          onChange={() => toggleContentPlanSelection(rule.id)}
                                          aria-label={t("dashboard.selectContentPlan")}
                                        />
                                      </label>

                                      <div className="dashboard-plan-main">
                                        <div className="dashboard-plan-title-row">
                                          <h4>{formatPlanName(rule, t)}</h4>
                                          <span className={`dashboard-plan-status dashboard-plan-status-${status.key}`}>
                                            {status.label}
                                          </span>
                                        </div>
                                        <p>{getContentPlanSummary(rule, t)}</p>
                                        {status.key === "failed" ? (() => {
                                          const failureInfo = getContentPlanFailureInfo(rule, t);
                                          return (
                                            <div className="dashboard-v140-failure-note">
                                              <strong>{failureInfo.message}</strong>
                                              <span>{failureInfo.refundedCredits > 0 ? t("dashboard.failure.creditsRefunded", { count: failureInfo.refundedCredits }) : t("dashboard.failure.notRetried")}</span>
                                            </div>
                                          );
                                        })() : null}
                                        <small className="dashboard-recurring-credit-note">
                                          {t("dashboard.weeklyCreditsNote")}
                                        </small>
                                      </div>

                                      <div className="dashboard-plan-meta">
                                        <span>{formatScheduleType(rule.schedule_type, t)}</span>
                                        <strong>{formatDate(getPlanNextDate(rule), t, locale)}</strong>
                                      </div>

                                      <div className="dashboard-plan-actions">
                                        <button type="button" className="dashboard-plan-delete" disabled={contentPlanActionLoading} onClick={() => deleteContentPlans([rule.id])}>
                                          {t("dashboard.delete")}
                                        </button>
                                      </div>
                                    </article>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="dashboard-plan-group-empty">
                                {t("dashboard.noOngoingPlans")}
                              </div>
                            )}
                          </section>

                          <section className="dashboard-plan-group">
                            <div className="dashboard-plan-group-heading">
                              <div>
                                <span className="dashboard-plan-group-icon planned">
                                  <CalendarClock aria-hidden="true" />
                                </span>
                                <div>
                                  <h4>{t("dashboard.plannedPlansTitle")}</h4>
                                  <p>{t("dashboard.plannedPlansText")}</p>
                                </div>
                              </div>
                              <strong>{plannedContentPlans.length}</strong>
                            </div>

                            {visiblePlannedContentPlans.length ? (
                              <div className="dashboard-plan-list">
                                {visiblePlannedContentPlans.map((rule) => {
                                  const status = getContentPlanStatus(rule, t);

                                  return (
                                    <article className="dashboard-plan-row" key={rule.id}>
                                      <label className="dashboard-plan-check">
                                        <input
                                          type="checkbox"
                                          checked={selectedContentPlanIds.includes(rule.id)}
                                          onChange={() => toggleContentPlanSelection(rule.id)}
                                          aria-label={t("dashboard.selectContentPlan")}
                                        />
                                      </label>

                                      <div className="dashboard-plan-main">
                                        <div className="dashboard-plan-title-row">
                                          <h4>{formatPlanName(rule, t)}</h4>
                                          <span className={`dashboard-plan-status dashboard-plan-status-${status.key}`}>
                                            {status.label}
                                          </span>
                                        </div>
                                        <p>{getContentPlanSummary(rule, t)}</p>
                                        {status.key === "failed" ? (() => {
                                          const failureInfo = getContentPlanFailureInfo(rule, t);
                                          return (
                                            <div className="dashboard-v140-failure-note">
                                              <strong>{failureInfo.message}</strong>
                                              <span>{failureInfo.refundedCredits > 0 ? t("dashboard.failure.creditsRefunded", { count: failureInfo.refundedCredits }) : t("dashboard.failure.notRetried")}</span>
                                            </div>
                                          );
                                        })() : null}
                                      </div>

                                      <div className="dashboard-plan-meta">
                                        <span>{formatScheduleType(rule.schedule_type, t)}</span>
                                        <strong>{formatDate(getPlanNextDate(rule), t, locale)}</strong>
                                      </div>

                                      <div className="dashboard-plan-actions">
                                        <button type="button" className="dashboard-plan-delete" disabled={contentPlanActionLoading} onClick={() => deleteContentPlans([rule.id])}>
                                          {t("dashboard.delete")}
                                        </button>
                                      </div>
                                    </article>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="dashboard-plan-group-empty">
                                {t("dashboard.noPlannedPlans")}
                              </div>
                            )}
                          </section>
                        </div>

                        {(showAllContentPlans || hiddenContentPlanCount > 0) && (
                          <div className="dashboard-plan-footer">
                            <button
                              type="button"
                              className="show-more-rules"
                              onClick={() => {
                                setShowAllContentPlans((current) => !current);
                                clearSelectedContentPlans();
                              }}
                            >
                              {showAllContentPlans
                                ? t("dashboard.showLess")
                                : t("dashboard.showAllContentPlans", {
                                    count: hiddenContentPlanCount,
                                  })}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
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
                    <div className="dashboard-plan-toolbar dashboard-review-toolbar">
                      <div>
                        <button
                          type="button"
                          className="dashboard-inline-action"
                          onClick={
                            allVisiblePendingSelected
                              ? clearSelectedPendingPosts
                              : selectVisiblePendingPosts
                          }
                          disabled={bulkActionLoading}
                        >
                          {allVisiblePendingSelected
                            ? t("dashboard.clear")
                            : t("dashboard.selectVisible")}
                        </button>

                        {selectedPendingCount > 0 && (
                          <span className="dashboard-selection-count">
                            {t("dashboard.pendingSelected", {
                              count: selectedPendingCount,
                            })}
                          </span>
                        )}
                      </div>

                      {selectedPendingCount > 0 && (
                        <button
                          type="button"
                          className="dashboard-delete-button"
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
                        <span className="delete-confirm-note dashboard-review-confirm-note">
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

                              {post.content_format && post.content_format !== "single_image" && (
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
                                {t("dashboard.created", { date: formatDate(post.created_at, t, locale) })} ·{" "}
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

              </main>

              <aside className="dashboard-sidebar">
                <section className="dashboard-side-card">
                  <div className="dashboard-side-title">
                    <span><CircleDollarSign aria-hidden="true" /></span>
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
                    <span><BadgeCheck aria-hidden="true" /></span>
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
                    <span><Lightbulb aria-hidden="true" /></span>
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
                        {formatCampaignDate(suggestedCampaign, t, locale)} · {t("dashboard.recommendedPosts", { count: suggestedCampaign.recommended_post_count || 3 })}
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
  <ArrowRight size={15} aria-hidden="true" />
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
                      <span><CalendarClock aria-hidden="true" /></span>
                      <div>
                        <h3>{t("dashboard.nextContentPlan")}</h3>
                        <p>{formatDate(nextAutomation.next_run_at, t, locale)}</p>
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
      <PlanLimitModal details={planLimitDetails} onClose={() => setPlanLimitDetails(null)} />
      </div>
    </AppLayout>
  );
}

"use client";

import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Gift,
  History,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Send,
  Trash2,
} from "lucide-react";
import { useUiText } from "../lib/i18n/useUiText";

function formatScheduleDate(value, timeZone, locale = "en") {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  try {
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      ...(timeZone ? { timeZone } : {}),
    }).format(date);
  } catch {
    return date.toLocaleString(locale || "en");
  }
}

function formatPlannedItemDate(item, locale) {
  if (item?.next_run_at) return formatScheduleDate(item.next_run_at, item?.timezone, locale);
  if (item?.scheduled_for) return formatScheduleDate(item.scheduled_for, item?.timezone, locale);
  if (item?.run_date && item?.publish_time) return `${item.run_date} · ${String(item.publish_time).slice(0, 5)}`;
  if (item?.run_date) return item.run_date;
  return "—";
}

function plannedItemTitle(item, t) {
  return item?.content_type_label || item?.idea || item?.name || item?.post_type || t("homeReference.plannedItem");
}

function humanizeContentType(value, t) {
  const raw = String(value || "").trim();
  if (!raw) return "—";

  const labels = {
    website_item: t("homeReference.type.productPost"),
    website_item_text_ad: t("homeReference.type.productAd"),
    animated_website_item: t("homeReference.type.animatedProductReel"),
    carousel_website_item: t("homeReference.type.productCarousel"),
    ai_product_video: t("homeReference.type.aiProductVideo"),
    ai_image: t("homeReference.type.aiImage"),
    image: t("homeReference.type.aiImage"),
    text: t("homeReference.type.textPost"),
    faq: "FAQ",
    tips: t("homeReference.type.tips"),
    mini_guide: t("homeReference.type.miniGuide"),
    checklist: t("homeReference.type.checklist"),
    problem_solution: t("homeReference.type.problemSolution"),
    seasonal: t("homeReference.type.seasonal"),
  };

  return labels[raw] || raw.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function planContentTypes(plan, t) {
  const types = Array.isArray(plan?.contentTypes) ? plan.contentTypes.filter(Boolean) : [];
  const fallback = plan?.rules
    ?.map((rule) => rule?.content_type_label || rule?.content_type_id || rule?.post_type)
    .filter(Boolean) || [];
  const unique = [...new Set(types.length ? types : fallback)].map((value) => humanizeContentType(value, t));
  return unique.slice(0, 3).join(" · ") || t("homeReference.variedContent");
}

function plannedItemStatus(item, t) {
  if (item?.item_kind === "post") return t("homeReference.status.createdScheduled");
  const occurrence = String(item?.generation_occurrence_status || "").trim().toLowerCase();
  if (["running", "processing", "generating"].includes(occurrence)) return t("homeReference.status.creating");
  if (["failed", "error"].includes(occurrence)) return t("homeReference.status.needsAction");
  if (["completed", "generated", "ready"].includes(occurrence)) return t("homeReference.status.created");
  return t("homeReference.status.waitingRun");
}

export default function HomeReferenceOverview({
  message,
  loading,
  currentBrandId,
  currentBrandName,
  creditsRemaining,
  monthlyCreditLimit,
  plannedCount,
  pendingCount,
  publishedCount,
  activeSchedulesCount,
  recurringCount,
  scheduledCount,
  campaignCount,
  suggestedCampaign,
  recurringSchedules = [],
  scheduledItems = [],
  campaignSchedules = [],
  scheduleActionLoading = "",
  onSetRecurringScheduleState,
  openPlanLabel = "Open plan",
  accountActiveLabel = "Account is active",
}) {
  const { t, locale } = useUiText(["homeReference"]);

  if (!loading && !currentBrandId) {
    return <section className="home-reference-no-brand"><h1>{t("homeReference.noBrandTitle")}</h1><p>{t("homeReference.noBrandText")}</p><a href="/brand">{t("homeReference.openBrand")}</a></section>;
  }

  const campaignTitle = suggestedCampaign?.title || t("homeReference.campaignFallback");
  const campaignDate = suggestedCampaign?.date || "";
  const campaignHref = suggestedCampaign?.id ? `/automation?campaign=${suggestedCampaign.id}` : "/calendar";

  return (
    <div className="home-reference-page">
      {message ? <p className="home-reference-message">{message}</p> : null}
      <header className="home-reference-header">
        <div><h1>{t("homeReference.overviewTitle", { brandName: currentBrandName })}</h1><p>{t("homeReference.overviewText")}</p></div>
        <div className="home-reference-credits">
          <span className="home-reference-credit-check"><CheckCircle2 aria-hidden="true" /></span>
          <div><small>{t("homeReference.currentCredits")}</small><strong>{creditsRemaining} <em>/ {monthlyCreditLimit || "—"}<span className="home-reference-credit-desktop-suffix"> {t("homeReference.creditsLeft")}</span></em></strong><span className="home-reference-credit-mobile-label">{t("homeReference.creditsLeft")}</span></div>
          <span className="home-reference-account-status"><i />{accountActiveLabel}</span>
        </div>
      </header>

      <section className="home-reference-stats" aria-label={t("homeReference.overviewAria")}>
        <article>
          <span className="home-reference-stat-icon"><CalendarDays aria-hidden="true" /></span>
          <div><h2>{t("homeReference.plannedPosts")}</h2><p>{t("homeReference.upcoming")}</p></div>
          <strong>{plannedCount}</strong>
        </article>
        <article>
          <span className="home-reference-stat-icon"><Clock3 aria-hidden="true" /></span>
          <div><h2>{t("homeReference.awaitingApproval")}</h2><p>{t("homeReference.needsReview")}</p></div>
          <strong className={pendingCount ? "attention" : ""}>{pendingCount}</strong>
        </article>
        <article>
          <span className="home-reference-stat-icon"><Send aria-hidden="true" /></span>
          <div><h2>{t("homeReference.publishedThisMonth")}</h2><p>{t("homeReference.publishedPosts")}</p></div>
          <strong>{publishedCount}</strong>
        </article>
        <article>
          <span className="home-reference-stat-icon"><RefreshCw aria-hidden="true" /></span>
          <div><h2>{t("homeReference.activeSchedules")}</h2><p>{t("homeReference.rollingPlans")}</p></div>
          <strong>{activeSchedulesCount}</strong>
        </article>
      </section>

      <section className="home-reference-review">
        <ClipboardCheck />
        <div><strong>{t("homeReference.reviewPending", { count: pendingCount })}</strong><small>{t("homeReference.reviewHelp")}</small></div>
        <a className="primary" href="/review?view=queue">{t("homeReference.reviewPosts")}<ArrowRight className="home-reference-review-primary-arrow" aria-hidden="true" /></a>
        <a href="/review?view=history"><History /><span className="home-reference-review-desktop-label">{t("homeReference.postHistory")}</span><span className="home-reference-review-mobile-label">{t("homeReference.showContentCalendar")}</span><ArrowRight /></a>
      </section>

      <div className="home-reference-workspace">
        <section className="home-reference-plans home-reference-plans-v153">
          <header className="home-reference-plans-heading">
            <div>
              <h2>{t("homeReference.contentPlans")}</h2>
              <p>{t("homeReference.contentPlansText")}</p>
            </div>
            <a className="home-reference-plans-show-all" href="/automation">{t("homeReference.showAll")}</a>
          </header>

          <article className="home-plan-overview-card recurring home-plan-section-v153">
            <div className="home-plan-section-head-v153">
              <div className="home-plan-overview-icon"><RefreshCw aria-hidden="true" /></div>
              <div className="home-plan-overview-copy">
                <div className="home-plan-overview-title-row">
                  <h3>{t("homeReference.recurringSchedules")}</h3>
                  <span className={`home-plan-overview-count${recurringCount ? " active" : ""}`}>{recurringCount ? t("homeReference.activeCount", { count: recurringCount }) : t("homeReference.noneActive")}</span>
                </div>
                <p>{t("homeReference.recurringText")}</p>
              </div>
              <a className="home-plan-overview-action" href="/automation"><Plus />{recurringCount ? t("homeReference.newSchedule") : t("homeReference.createSchedule")}<ArrowRight /></a>
            </div>

            {recurringSchedules?.length ? (
              <div className="home-plan-inline-list-v153 recurring-list-v153">
                {recurringSchedules.map((plan) => {
                  const isPaused = plan?.plan_state === "paused" || !plan?.anyActive;
                  const isBusy = scheduleActionLoading === plan?.id;
                  const platforms = Array.isArray(plan?.platforms) ? plan.platforms.filter(Boolean) : [];
                  return (
                    <div className="home-plan-inline-row-v153 recurring-row-v153" key={plan.id}>
                      <div className="home-plan-inline-main-v153">
                        <span className={`home-plan-inline-dot-v153 ${isPaused ? "paused" : "recurring"}`} />
                        <div>
                          <strong>{plan?.name || t("homeReference.contentPlan")}</strong>
                          <span className={`home-plan-inline-state-v153 ${isPaused ? "paused" : "active"}`}>{isPaused ? t("homeReference.paused") : t("homeReference.active")}</span>
                        </div>
                      </div>
                      <div className="home-plan-inline-meta-v153">
                        <span><b>{t("homeReference.nextRun")}</b>{formatScheduleDate(plan?.next_run_at, plan?.rules?.[0]?.timezone, locale)}</span>
                        <span><b>{t("homeReference.cadence")}</b>{plan?.postsPerWeek ? t("homeReference.postsPerWeek", { count: plan.postsPerWeek }) : t("homeReference.recurring")}</span>
                        <span><b>{t("homeReference.channels")}</b>{platforms.length ? platforms.join(" · ") : "—"}</span>
                        <span><b>{t("homeReference.content")}</b>{planContentTypes(plan, t)}</span>
                      </div>
                      <div className="home-plan-inline-actions-v153">
                        {plan?.rules?.[0]?.id ? <a className="home-reference-open-item" href={`/plans/${plan.rules[0].id}`}>{openPlanLabel}<ArrowRight /></a> : null}
                        <button type="button" className="pause" disabled={isBusy || typeof onSetRecurringScheduleState !== "function"} onClick={() => onSetRecurringScheduleState?.(plan, isPaused ? "active" : "paused")}>
                          {isPaused ? <Play /> : <Pause />}{isBusy ? t("homeReference.working") : isPaused ? t("homeReference.resume") : t("homeReference.pause")}
                        </button>
                        <button type="button" className="end" disabled={isBusy || typeof onSetRecurringScheduleState !== "function"} onClick={() => {
                          if (window.confirm(t("homeReference.confirmEndRecurring"))) onSetRecurringScheduleState?.(plan, "ended");
                        }}><Trash2 /> {t("homeReference.end")}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </article>

          <article className="home-plan-overview-card scheduled home-plan-section-v153">
            <div className="home-plan-section-head-v153">
              <div className="home-plan-overview-icon"><CalendarDays aria-hidden="true" /></div>
              <div className="home-plan-overview-copy">
                <div className="home-plan-overview-title-row">
                  <h3>{t("homeReference.plannedPosts")}</h3>
                  <span className={`home-plan-overview-count${scheduledCount ? " active" : ""}`}>{scheduledCount ? t("homeReference.upcomingCount", { count: scheduledCount }) : t("homeReference.nothingPlanned")}</span>
                </div>
                <p>{t("homeReference.scheduledText")}</p>
              </div>
              <a className="home-plan-overview-action" href="/automation"><Plus />{scheduledCount ? t("homeReference.planMore") : t("homeReference.planPost")}<ArrowRight /></a>
            </div>

            {scheduledItems?.length ? (
              <div className="home-plan-inline-list-v153 scheduled-list-v153">
                {scheduledItems.map((item) => {
                  const isGeneratedPost = item?.item_kind === "post";
                  const isBusy = scheduleActionLoading === item?.id;
                  const platform = item?.platform || "—";
                  const rulePlan = isGeneratedPost ? null : { ...item, id: item.id, ruleIds: [item.id], rules: [item], anyActive: item.is_active === true };
                  return (
                    <div className="home-plan-inline-row-v153 scheduled-row-v153" key={`${item?.item_kind || "rule"}-${item.id}`}>
                      <div className="home-plan-inline-main-v153">
                        <span className="home-plan-inline-dot-v153 scheduled" />
                        <div>
                          <strong>{plannedItemTitle(item, t)}</strong>
                          <span className="home-plan-inline-state-v153 scheduled">{plannedItemStatus(item, t)}</span>
                        </div>
                      </div>
                      <div className="home-plan-inline-meta-v153">
                        <span><b>{t("homeReference.dateTime")}</b>{formatPlannedItemDate(item, locale)}</span>
                        <span><b>{t("homeReference.channel")}</b>{platform}</span>
                        <span><b>{t("homeReference.type")}</b>{humanizeContentType(item?.content_type_label || item?.content_type_id || item?.post_type || "website_item", t)}</span>
                      </div>
                      <div className="home-plan-inline-actions-v153">
                        {isGeneratedPost ? <a className="home-reference-open-item" href={`/posts/${item.id}`}>{t("homeReference.open")}<ArrowRight /></a> : (
                          <button type="button" className="end" disabled={isBusy || typeof onSetRecurringScheduleState !== "function"} onClick={() => {
                            if (window.confirm(t("homeReference.confirmDeleteScheduled"))) onSetRecurringScheduleState?.(rulePlan, "ended");
                          }}><Trash2 />{isBusy ? t("homeReference.deleting") : t("homeReference.delete")}</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </article>

          <article className="home-plan-overview-card campaign home-plan-section-v153">
            <div className="home-plan-section-head-v153">
              <div className="home-plan-overview-icon"><Gift aria-hidden="true" /></div>
              <div className="home-plan-overview-copy">
                <div className="home-plan-overview-title-row">
                  <h3>{t("homeReference.calendarCampaigns")}</h3>
                  <span className={`home-plan-overview-count${campaignCount ? " active" : ""}`}>{campaignCount ? t("homeReference.activeCount", { count: campaignCount }) : t("homeReference.noneActive")}</span>
                </div>
                <p>{t("homeReference.campaignPlansText")}</p>
              </div>
              <a className="home-plan-overview-action" href="/calendar"><Plus />{t("homeReference.createCampaign")}<ArrowRight /></a>
            </div>

            {campaignSchedules?.length ? (
              <div className="home-plan-inline-list-v153 campaign-list-v153">
                {campaignSchedules.map((plan) => {
                  const isPaused = plan?.plan_state === "paused" || !plan?.anyActive;
                  const isBusy = scheduleActionLoading === plan?.id;
                  const platforms = Array.isArray(plan?.platforms) ? plan.platforms.filter(Boolean) : [];
                  const postCount = Array.isArray(plan?.rules) ? plan.rules.filter((rule) => rule?.plan_state !== "ended").length : 0;
                  return (
                    <div className="home-plan-inline-row-v153 campaign-row-v153" key={plan.id}>
                      <div className="home-plan-inline-main-v153">
                        <span className={`home-plan-inline-dot-v153 ${isPaused ? "paused" : "campaign"}`} />
                        <div>
                          <strong>{plan?.name || t("homeReference.calendarCampaign")}</strong>
                          <span className={`home-plan-inline-state-v153 ${isPaused ? "paused" : "campaign"}`}>{isPaused ? t("homeReference.paused") : t("homeReference.active")}{postCount ? ` · ${t("homeReference.postCount", { count: postCount })}` : ""}</span>
                        </div>
                      </div>
                      <div className="home-plan-inline-meta-v153">
                        <span><b>{t("homeReference.nextRun")}</b>{formatScheduleDate(plan?.next_run_at, plan?.rules?.[0]?.timezone, locale)}</span>
                        <span><b>{t("homeReference.channels")}</b>{platforms.length ? platforms.join(" · ") : "—"}</span>
                        <span><b>{t("homeReference.content")}</b>{planContentTypes(plan, t)}</span>
                      </div>
                      <div className="home-plan-inline-actions-v153">
                        <button type="button" className="pause" disabled={isBusy || typeof onSetRecurringScheduleState !== "function"} onClick={() => onSetRecurringScheduleState?.(plan, isPaused ? "active" : "paused")}>
                          {isPaused ? <Play /> : <Pause />}{isBusy ? t("homeReference.working") : isPaused ? t("homeReference.resume") : t("homeReference.pause")}
                        </button>
                        <button type="button" className="end" disabled={isBusy || typeof onSetRecurringScheduleState !== "function"} onClick={() => {
                          if (window.confirm(t("homeReference.confirmEndCampaign"))) onSetRecurringScheduleState?.(plan, "ended");
                        }}><Trash2 /> {t("homeReference.end")}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </article>
        </section>

        <aside className="home-reference-coach">
          <h2>{t("homeReference.aiCoach")}</h2>
          <h3>{t("homeReference.doNow")}</h3>
          <ol>
            <li><ClipboardCheck /><span>1.</span><a href="/review?view=queue">{t("homeReference.reviewCount", { count: pendingCount })}</a></li>
            <li><CalendarDays /><span>2.</span><a href="/automation">{t("homeReference.planNextWeek")}</a></li>
            <li><Gift /><span>3.</span><a href={campaignHref}>{t("homeReference.createTheCampaign")}</a></li>
          </ol>
          <div className="home-reference-suggestion"><small>{t("homeReference.suggestedCampaign")}</small><strong>{campaignTitle}</strong>{campaignDate ? <span>{campaignDate}</span> : null}<a href={campaignHref}>{t("homeReference.createCampaignPlan")}</a></div>
        </aside>
      </div>

      <footer className="home-reference-focus">
        <h2>{t("homeReference.weekFocus")}</h2>
        <span><ClipboardCheck /><strong>{pendingCount}</strong> {t("homeReference.postsToReview")}</span>
        <span><CalendarDays /><strong>{plannedCount}</strong> {t("homeReference.postsPlanned")}</span>
        <span><Gift /><strong>{suggestedCampaign ? 1 : 0}</strong> {t("homeReference.campaignSuggestions")}</span>
        <a href="/calendar">{t("homeReference.openAiCalendar")}<ArrowRight /></a>
      </footer>
    </div>
  );
}

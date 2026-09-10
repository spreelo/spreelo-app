"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  History,
  ImageIcon,
  Layers3,
} from "lucide-react";
import AppLayout from "../../components/AppLayout";
import { supabase } from "../../lib/supabaseClient";
import { useUiText } from "../../lib/i18n/useUiText";

const CUSTOMER_READY_ADMIN_STATES = new Set([
  "approved_by_spreelo",
  "released",
  "not_required",
]);

function getBrandStorageKey(userId) {
  return `spreelo_current_brand_id_${userId}`;
}

function formatDate(value, t, locale = "en") {
  if (!value) return t("dashboard.notSet");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("dashboard.notSet");
  try {
    return new Intl.DateTimeFormat(locale || "en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return t("dashboard.notSet");
  }
}

function formatKind(post, t) {
  const format = String(post?.content_format || "").toLowerCase();
  if (format === "carousel") return t("dashboard.contentType.productCarousel");
  if (format === "animated_video") return t("dashboard.contentType.animatedProductReel");
  if (String(post?.post_type || "").toLowerCase().includes("product")) return t("dashboard.contentType.productPost");
  return post?.post_type || t("dashboard.post");
}

function historyStatus(post, t) {
  if (post?.status === "published") return t("dashboard.customerReview.published");
  if (post?.status === "rejected") return t("dashboard.customerReview.rejected");
  return t("dashboard.customerReview.approved");
}

export default function CustomerReviewPage() {
  const { t, locale } = useUiText(["dashboard"]);
  const [posts, setPosts] = useState([]);
  const [brandName, setBrandName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState("queue");

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("view");
    setView(requested === "history" ? "history" : "queue");
    loadPosts();
  }, []);

  async function loadPosts() {
    setLoading(true);
    setError("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      window.location.replace("/login");
      return;
    }

    const savedBrandId = localStorage.getItem(getBrandStorageKey(user.id)) || "";
    let brandQuery = supabase
      .from("brand_profiles")
      .select("id, business_name, is_default, created_at")
      .eq("user_id", user.id);
    if (savedBrandId) {
      brandQuery = brandQuery.eq("id", savedBrandId).maybeSingle();
    } else {
      brandQuery = brandQuery.order("is_default", { ascending: false }).order("created_at", { ascending: true }).limit(1).maybeSingle();
    }

    const { data: brand, error: brandError } = await brandQuery;
    if (brandError && brandError.code !== "PGRST116") {
      setError(brandError.message || t("dashboard.customerReview.loadError"));
      setLoading(false);
      return;
    }
    if (!brand?.id) {
      setPosts([]);
      setLoading(false);
      return;
    }
    setBrandName(brand.business_name || "");

    const { data: postRows, error: postsError } = await supabase
      .from("posts")
      .select("id, user_id, brand_profile_id, platform, post_type, content_format, content, status, created_at, scheduled_for, approved_at, published_at, image_url, admin_review_status")
      .eq("user_id", user.id)
      .eq("brand_profile_id", brand.id)
      .in("status", ["pending_approval", "approved", "published", "rejected"])
      .order("created_at", { ascending: false })
      .limit(150);

    if (postsError) {
      setError(postsError.message || t("dashboard.customerReview.loadError"));
      setLoading(false);
      return;
    }

    const rows = postRows || [];
    const slideIds = rows.filter((post) => post.content_format === "carousel").map((post) => post.id);
    let slideMap = {};
    if (slideIds.length) {
      const { data: slides } = await supabase
        .from("post_slides")
        .select("post_id, slide_order, image_url")
        .in("post_id", slideIds)
        .order("slide_order", { ascending: true });
      slideMap = (slides || []).reduce((map, slide) => {
        if (!map[slide.post_id] && slide.image_url) map[slide.post_id] = slide.image_url;
        return map;
      }, {});
    }

    setPosts(rows.map((post) => ({
      ...post,
      review_thumbnail: post.image_url || slideMap[post.id] || "",
    })));
    setLoading(false);
  }

  const queue = useMemo(() => posts.filter((post) =>
    post.status === "pending_approval" && CUSTOMER_READY_ADMIN_STATES.has(String(post.admin_review_status || "").toLowerCase())
  ), [posts]);

  const historyRows = useMemo(() => posts.filter((post) => ["approved", "published", "rejected"].includes(post.status)), [posts]);
  const activeRows = view === "history" ? historyRows : queue;

  return (
    <AppLayout active="dashboard">
      <main className="customer-review-page-v14371">
        <header className="customer-review-hero-v14371">
          <div>
            <span>{t("dashboard.customerReview.kicker")}</span>
            <h1>{view === "history" ? t("dashboard.customerReview.historyTitle") : t("dashboard.customerReview.title")}</h1>
            <p>{view === "history" ? t("dashboard.customerReview.historyText") : t("dashboard.customerReview.text")}</p>
          </div>
          {brandName ? <strong>{brandName}</strong> : null}
        </header>

        <nav className="customer-review-tabs-v14371" aria-label={t("dashboard.customerReview.tabsLabel")}>
          <a className={view === "queue" ? "active" : ""} href="/review?view=queue"><Clock3 /> {t("dashboard.customerReview.queue")} <b>{queue.length}</b></a>
          <a className={view === "history" ? "active" : ""} href="/review?view=history"><History /> {t("dashboard.customerReview.history")} <b>{historyRows.length}</b></a>
        </nav>

        {error ? <div className="customer-review-message-v14371 error">{error}</div> : null}
        {loading ? <div className="customer-review-message-v14371">{t("dashboard.customerReview.loading")}</div> : null}

        {!loading && !activeRows.length ? (
          <section className="customer-review-empty-v14371">
            <span>{view === "history" ? <History /> : <CheckCircle2 />}</span>
            <strong>{view === "history" ? t("dashboard.customerReview.historyEmptyTitle") : t("dashboard.customerReview.emptyTitle")}</strong>
            <p>{view === "history" ? t("dashboard.customerReview.historyEmptyText") : t("dashboard.customerReview.emptyText")}</p>
          </section>
        ) : null}

        {!loading && activeRows.length ? (
          <section className="customer-review-list-v14371">
            {activeRows.map((post) => (
              <article key={post.id}>
                <div className="customer-review-thumb-v14371">
                  {post.review_thumbnail ? <img src={post.review_thumbnail} alt="" /> : <ImageIcon />}
                </div>
                <div className="customer-review-main-v14371">
                  <small>{String(post.platform || t("dashboard.platformNotSet")).toUpperCase()} · {formatKind(post, t)}</small>
                  <strong>{String(post.content || "").split("\n")[0].slice(0, 110) || formatKind(post, t)}</strong>
                  <p>{String(post.content || "").replace(/\s+/g, " ").slice(0, 180)}</p>
                </div>
                <div className="customer-review-meta-v14371">
                  <span><CalendarClock /><small>{t("dashboard.customerReview.created")}</small><strong>{formatDate(post.created_at, t, locale)}</strong></span>
                  {post.scheduled_for ? <span><Clock3 /><small>{t("dashboard.customerReview.scheduled")}</small><strong>{formatDate(post.scheduled_for, t, locale)}</strong></span> : null}
                </div>
                {view === "history" ? (
                  <span className={`customer-review-status-v14371 ${post.status}`}>{historyStatus(post, t)}</span>
                ) : (
                  <span className="customer-review-status-v14371 pending">{t("dashboard.customerReview.awaitingDecision")}</span>
                )}
                <a className="spreelo-action-v14371 secondary compact" href={`/posts/${post.id}`}>
                  {view === "history" ? t("dashboard.customerReview.open") : t("dashboard.customerReview.review")} <ArrowRight />
                </a>
              </article>
            ))}
          </section>
        ) : null}
      </main>
    </AppLayout>
  );
}

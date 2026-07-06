"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AppLayout from "../../../components/AppLayout";
import { supabase } from "../../../lib/supabaseClient";
import { useUiText } from "../../../lib/i18n/useUiText";

function formatDate(value, t) {
  if (!value) return t("posts.notSet");

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatStatus(status, t) {
  if (!status) return t("posts.status.draft");

  const labels = {
    draft: t("posts.status.draft"),
    pending_approval: t("posts.status.pendingApproval"),
    approved: t("posts.status.approved"),
    scheduled: t("posts.status.scheduled"),
    published: t("posts.status.published"),
    failed: t("posts.status.failed"),
    rejected: t("posts.status.rejected"),
  };

  return labels[status] || status;
}

function formatImageStatus(status, t) {
  if (!status || status === "none") return null;

  const labels = {
    generating: t("posts.imageStatus.generating"),
    ready: t("posts.imageStatus.ready"),
    failed: t("posts.imageStatus.failed"),
  };

  return labels[status] || status;
}

function getStatusClass(status) {
  if (status === "pending_approval") return "status-pill warning";
  if (status === "approved") return "status-pill success";
  if (status === "published") return "status-pill success";
  if (status === "failed") return "status-pill danger";
  if (status === "rejected") return "status-pill danger";

  return "status-pill";
}

function getImageStatusClass(status) {
  if (status === "ready") return "status-pill success";
  if (status === "generating") return "status-pill warning";
  if (status === "failed") return "status-pill danger";

  return "status-pill";
}

function isSlideBasedPost(post) {
  return ["carousel", "slideshow_video"].includes(post?.content_format);
}

function formatContentFormat(post, t) {
  if (post?.content_format === "carousel") {
    return t("posts.format.carousel");
  }

  if (post?.content_format === "slideshow_video") {
    return t("posts.format.slideshowVideo");
  }

  return t("posts.format.singleImage");
}

export default function EditPostPage() {
  const { t } = useUiText(["posts"]);
  const params = useParams();
  const postId = params.id;

  const [post, setPost] = useState(null);
  const [slides, setSlides] = useState([]);
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  useEffect(() => {
    async function loadPost() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data, error } = await supabase
        .from("posts")
        .select(
          "id, platform, tone, language, post_type, idea, content, status, created_at, updated_at, source, source_label, automation_rule_id, approval_required, approved_at, published_at, scheduled_for, image_url, image_status, image_storage_path, image_prompt, content_format"
        )
        .eq("id", postId)
        .eq("user_id", user.id)
        .single();

      if (error) {
        setMessage(error.message);
      }

      if (data) {
        setPost(data);
        setContent(data.content || "");

        if (isSlideBasedPost(data)) {
          const { data: slidesData } = await supabase
            .from("post_slides")
            .select(
              "id, post_id, slide_order, slide_type, headline, body, cta_text, image_url, product_url, logo_enabled, render_status, metadata"
            )
            .eq("post_id", postId)
            .order("slide_order", { ascending: true });

          setSlides(slidesData || []);
        } else {
          setSlides([]);
        }
      }

      setLoading(false);
    }

    if (postId) {
      loadPost();
    }
  }, [postId]);

  async function savePost() {
    setSaving(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { data, error } = await supabase
      .from("posts")
      .update({
        content,
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId)
      .eq("user_id", user.id)
      .select(
        "id, platform, tone, language, post_type, idea, content, status, created_at, updated_at, source, source_label, automation_rule_id, approval_required, approved_at, published_at, scheduled_for, image_url, image_status, image_storage_path, image_prompt, content_format"
      )
      .single();

    if (error) {
      setMessage(error.message);
    } else {
      setPost(data);
      setContent(data.content || "");
      setMessage(t("posts.messageUpdated"));
    }

    setSaving(false);
  }

  async function approvePost() {
    const isCarouselApproval = post?.content_format === "carousel";
    const confirmApprove = window.confirm(
      t(isCarouselApproval ? "posts.confirmApproveCarousel" : "posts.confirmApprove")
    );

    if (!confirmApprove) return;

    setApproving(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const approvedAt = new Date().toISOString();

    const { data, error } = await supabase
      .from("posts")
      .update({
        content,
        status: "approved",
        approved_at: approvedAt,
        updated_at: approvedAt,
      })
      .eq("id", postId)
      .eq("user_id", user.id)
      .select(
        "id, platform, tone, language, post_type, idea, content, status, created_at, updated_at, source, source_label, automation_rule_id, approval_required, approved_at, published_at, scheduled_for, image_url, image_status, image_storage_path, image_prompt, content_format"
      )
      .single();

    if (error) {
      setMessage(error.message);
    } else {
      setPost(data);
      setContent(data.content || "");
      setMessage(t(isCarouselApproval ? "posts.messageApprovedCarousel" : "posts.messageApproved"));
    }

    setApproving(false);
  }

  async function discardPost() {
    const confirmDiscard = window.confirm(t("posts.confirmDiscard"));

    if (!confirmDiscard) return;

    setDiscarding(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const discardedAt = new Date().toISOString();

    const { error } = await supabase
      .from("posts")
      .update({
        status: "rejected",
        updated_at: discardedAt,
      })
      .eq("id", postId)
      .eq("user_id", user.id);

    if (error) {
      setMessage(error.message);
      setDiscarding(false);
    } else {
      window.location.href = "/";
    }
  }

  if (loading) {
    return (
      <AppLayout active="dashboard">
        <section className="empty-card">
          <h3>{t("posts.loadingTitle")}</h3>
          <p>{t("posts.loadingText")}</p>
        </section>
      </AppLayout>
    );
  }

  if (!post) {
    return (
      <AppLayout active="dashboard">
        <section className="empty-card">
          <h3>{t("posts.notFoundTitle")}</h3>
          <p>{t("posts.notFoundText")}</p>
          <br />
          <a className="primary-button" href="/">
            {t("posts.backToDashboard")}
          </a>
        </section>
      </AppLayout>
    );
  }

  const isPendingApproval = post.status === "pending_approval";
  const isAutomationPost = post.source === "automation";
  const sourceLabel =
    post.source_label ||
    (isAutomationPost ? t("posts.generatedByAutomation") : t("posts.manualDraft"));

  const isCarouselPost = post.content_format === "carousel";
  const imageStatusLabel = isCarouselPost ? null : formatImageStatus(post.image_status, t);
  const hasSlides = slides.length > 0;

  return (
    <AppLayout active="dashboard">
      <header className="topbar">
        <div>
          <p className="eyebrow">
            {isPendingApproval ? t("posts.reviewPost") : t("posts.editPost")}
          </p>
          <h2>
            {isCarouselPost
              ? t("posts.reviewCarouselTitle")
              : isPendingApproval
              ? t("posts.reviewApproveTitle")
              : t("posts.editSavedTitle")}
          </h2>
        </div>

        <div className="button-row">
          <a className="secondary-button" href="/">
            {t("posts.back")}
          </a>

          {!isCarouselPost && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => navigator.clipboard.writeText(content)}
            >
              {t("posts.copyText")}
            </button>
          )}

          <button
            type="button"
            className="primary-button"
            onClick={savePost}
            disabled={saving || approving || discarding}
          >
            {saving ? t("posts.saving") : t("posts.saveChanges")}
          </button>

          {isPendingApproval && (
            <>
              <button
                type="button"
                className="secondary-button"
                onClick={discardPost}
                disabled={saving || approving || discarding}
              >
                {discarding ? t("posts.discarding") : t("posts.discard")}
              </button>

              <button
                type="button"
                className={isCarouselPost ? "primary-button approve-success-button" : "primary-button"}
                onClick={approvePost}
                disabled={saving || approving || discarding}
              >
                {approving ? t("posts.approving") : t("posts.approve")}
              </button>
            </>
          )}
        </div>
      </header>

      <section className="result-card">
        <div className="result-header">
          <div>
            <p className="eyebrow">
              {post.platform || t("posts.platformNotSet")} ·{" "}
              {post.post_type || t("posts.post")}
            </p>
            <h3>
              {post.tone || t("posts.toneNotSet")} ·{" "}
              {post.language || t("posts.languageNotSet")}
            </h3>
          </div>

          <div className="post-meta-row">
            <span className={getStatusClass(post.status)}>
              {formatStatus(post.status, t)}
            </span>

            {isAutomationPost && (
              <span className="status-pill">{t("posts.generatedByAutomation")}</span>
            )}

            {isSlideBasedPost(post) && (
              <span className="status-pill">{formatContentFormat(post, t)}</span>
            )}

            {imageStatusLabel && (
              <span className={getImageStatusClass(post.image_status)}>
                {imageStatusLabel}
              </span>
            )}
          </div>
        </div>

        <div className="idea-box">
          <p>
            <strong>{t("posts.source")}:</strong> {sourceLabel}
          </p>

          <p>
            <strong>{t("posts.created")}:</strong>{" "}
            {formatDate(post.created_at, t)}
          </p>

          {post.scheduled_for && !isCarouselPost && (
            <p>
              <strong>{t("posts.scheduledFor")}:</strong>{" "}
              {formatDate(post.scheduled_for, t)}
            </p>
          )}

          {post.approved_at && (
            <p>
              <strong>{t("posts.approvedAt")}:</strong>{" "}
              {formatDate(post.approved_at, t)}
            </p>
          )}

          {post.published_at && (
            <p>
              <strong>{t("posts.publishedAt")}:</strong>{" "}
              {formatDate(post.published_at, t)}
            </p>
          )}

          {isPendingApproval && !isCarouselPost && (
            <p>
              <strong>{t("posts.note")}:</strong>{" "}
              {t("posts.approvalNote")}
            </p>
          )}

          {post.status === "rejected" && (
            <p>
              <strong>{t("posts.note")}:</strong> {t("posts.discardedNote")}
            </p>
          )}
        </div>

        {isCarouselPost && (
          <div className="carousel-review-banner">
            <strong>{t("posts.carouselReviewBannerTitle")}</strong>
            <span>{t("posts.carouselReviewBannerText")}</span>
          </div>
        )}

        {isSlideBasedPost(post) && (
          <div className="edit-post-slides-block">
            <div className="edit-post-image-header">
              <div>
                <label className="field-label">{t("posts.slidesTitle")}</label>
                <p>{t("posts.slidesText", { count: slides.length })}</p>
              </div>
            </div>

            {slides.length === 0 ? (
              <div className="idea-box">
                <p>{t("posts.noSlidesYet")}</p>
              </div>
            ) : (
              <div className="edit-post-slides-grid">
                {slides.map((slide) => (
                  <article className="edit-post-slide-card" key={slide.id}>
                    <div className="edit-post-slide-number">
                      {t("posts.slideNumber", { number: slide.slide_order ?? 1 })}
                    </div>

                    {slide.image_url ? (
                      <img src={slide.image_url} alt={t("posts.slideImageAlt")} />
                    ) : (
                      <div className="edit-post-slide-placeholder">
                        {t("posts.slideImagePending")}
                      </div>
                    )}

                    <div className="edit-post-slide-content">
                      {slide.headline && <h4>{slide.headline}</h4>}
                      {slide.body && <p>{slide.body}</p>}
                      {slide.cta_text && <strong>{slide.cta_text}</strong>}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {post.image_url && !(isCarouselPost && hasSlides) && (
          <div className="edit-post-image-block">
            <div className="edit-post-image-header">
              <div>
                <label className="field-label">{t("posts.generatedImage")}</label>
                <p>{t("posts.generatedImageText")}</p>
              </div>

              {post.image_url && (
                <a
                  className="secondary-button small-button"
                  href={post.image_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("posts.openImage")}
                </a>
              )}
            </div>

            <img src={post.image_url} alt={t("posts.generatedPostImageAlt")} />
          </div>
        )}

        {!post.image_url && imageStatusLabel && (
          <div className="idea-box">
            <p>
              <strong>{t("posts.imageStatus")}:</strong> {imageStatusLabel}
            </p>
          </div>
        )}

        <div className="edit-post-grid">
          {post.idea && (
            <div>
              <label className="field-label">{t("posts.originalIdea")}</label>
              <div className="idea-box">{post.idea}</div>
            </div>
          )}

          <div>
            <label className="field-label">{t("posts.postContent")}</label>
            <textarea
              className="large-textarea"
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </div>
        </div>

        {message && <p className="login-message">{message}</p>}
      </section>
    </AppLayout>
  );
}

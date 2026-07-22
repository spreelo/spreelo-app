"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  ImageIcon,
  Info,
  Save,
  Sparkles,
  Trash2,
  Video,
} from "lucide-react";
import AppLayout from "../../../components/AppLayout";
import { supabase } from "../../../lib/supabaseClient";
import { useUiText } from "../../../lib/i18n/useUiText";
import { normalizeSingleContentLanguage } from "../../../lib/contentLanguage";

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

function formatVideoStatus(status, t) {
  if (!status || status === "none") return null;

  const labels = {
    rendering: t("posts.videoStatus.rendering"),
    ready: t("posts.videoStatus.ready"),
    failed: t("posts.videoStatus.failed"),
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
  if (["generating", "rendering", "queued"].includes(status)) {
    return "status-pill warning";
  }
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

  if (post?.content_format === "animated_video") {
    return t("posts.format.animatedVideo");
  }

  return t("posts.format.singleImage");
}

function getLocalizedOptionLabel(t, prefix, value, fallbackKey) {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    return t(fallbackKey);
  }

  const translationKey = `${prefix}.${normalizedValue}`;
  const translatedValue = t(translationKey);

  return translatedValue === translationKey ? normalizedValue : translatedValue;
}

function normalizeLanguageForDisplay(value) {
  const rawLanguage = String(value || "").trim();

  if (!rawLanguage) return "";

  const normalizedLanguage = normalizeSingleContentLanguage(rawLanguage, "English");
  const rawLooksEnglish = /^(english|engelska|en(?:[-_][a-z]{2})?)$/i.test(rawLanguage);

  // Preserve languages that are not in the current normalization list instead
  // of incorrectly turning them into English in the review header.
  if (normalizedLanguage === "English" && !rawLooksEnglish) {
    return rawLanguage;
  }

  return normalizedLanguage;
}

function getLocalizedPostType(t, value) {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    return t("posts.post");
  }

  const optionKey = normalizedValue
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .replace(/\s+/g, "");
  const translationKey = `create.postType.${optionKey}`;
  const translatedValue = t(translationKey);

  return translatedValue === translationKey ? normalizedValue : translatedValue;
}

function getLocalizedSourceLabel(sourceLabel, isAutomationPost, t) {
  const normalizedLabel = String(sourceLabel || "").trim().toLowerCase();

  if (["generated from website", "website", "website generated"].includes(normalizedLabel)) {
    return t("posts.generatedFromWebsite");
  }

  if (sourceLabel) {
    return sourceLabel;
  }

  return isAutomationPost ? t("posts.generatedByAutomation") : t("posts.manualDraft");
}

function getPlatformIconPath(platform) {
  const normalizedPlatform = String(platform || "").trim().toLowerCase();

  if (normalizedPlatform.includes("facebook")) return "/social-icons/facebook.png";
  if (normalizedPlatform.includes("instagram")) return "/social-icons/instagram.png";
  if (normalizedPlatform.includes("linkedin")) return "/social-icons/linkedin.png";
  if (normalizedPlatform.includes("tiktok")) return "/social-icons/tiktok.png";
  if (normalizedPlatform.includes("youtube")) return "/social-icons/youtube.png";
  if (normalizedPlatform === "x" || normalizedPlatform.includes("twitter")) return "/social-icons/x.png";
  if (normalizedPlatform.includes("pinterest")) return "/social-icons/pinterest.png";

  return null;
}

export default function EditPostPage() {
  const { t } = useUiText(["posts", "create", "brand"]);
  const params = useParams();
  const postId = params.id;

  const [post, setPost] = useState(null);
  const [brandContentLanguage, setBrandContentLanguage] = useState("");
  const [slides, setSlides] = useState([]);
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const contentTextareaRef = useRef(null);

  useEffect(() => {
    const textarea = contentTextareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(260, textarea.scrollHeight + 2)}px`;
  }, [content]);

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
          "id, user_id, brand_profile_id, platform, tone, language, post_type, idea, content, status, created_at, updated_at, source, source_label, automation_rule_id, approval_required, approved_at, published_at, scheduled_for, image_url, image_status, image_storage_path, image_prompt, video_url, video_status, video_storage_path, video_error, content_format"
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

        let relatedBrandProfileId = data.brand_profile_id || null;
        let ruleLanguage = "";

        if (!relatedBrandProfileId && data.automation_rule_id) {
          const { data: relatedRule } = await supabase
            .from("automation_rules")
            .select("brand_profile_id, language")
            .eq("id", data.automation_rule_id)
            .eq("user_id", user.id)
            .maybeSingle();

          relatedBrandProfileId = relatedRule?.brand_profile_id || null;
          ruleLanguage = relatedRule?.language || "";
        }

        if (relatedBrandProfileId) {
          const { data: relatedBrand } = await supabase
            .from("brand_profiles")
            .select("content_language")
            .eq("id", relatedBrandProfileId)
            .eq("user_id", user.id)
            .maybeSingle();

          setBrandContentLanguage(relatedBrand?.content_language || ruleLanguage || "");
        } else {
          setBrandContentLanguage(ruleLanguage);
        }

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
        "id, user_id, brand_profile_id, platform, tone, language, post_type, idea, content, status, created_at, updated_at, source, source_label, automation_rule_id, approval_required, approved_at, published_at, scheduled_for, image_url, image_status, image_storage_path, image_prompt, video_url, video_status, video_storage_path, video_error, content_format"
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

  async function copyPostText() {
    try {
      await navigator.clipboard.writeText(content);
      setMessage(t("posts.messageCopied"));
    } catch {
      setMessage(t("posts.messageCopyFailed"));
    }
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
        "id, user_id, brand_profile_id, platform, tone, language, post_type, idea, content, status, created_at, updated_at, source, source_label, automation_rule_id, approval_required, approved_at, published_at, scheduled_for, image_url, image_status, image_storage_path, image_prompt, video_url, video_status, video_storage_path, video_error, content_format"
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
      <AppLayout active="automation">
        <section className="empty-card">
          <h3>{t("posts.loadingTitle")}</h3>
          <p>{t("posts.loadingText")}</p>
        </section>
      </AppLayout>
    );
  }

  if (!post) {
    return (
      <AppLayout active="automation">
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
  const sourceLabel = getLocalizedSourceLabel(post.source_label, isAutomationPost, t);
  const preferredLanguage =
    (isAutomationPost ? brandContentLanguage : "") || post.language || "";
  const normalizedDisplayLanguage = normalizeLanguageForDisplay(preferredLanguage);
  const displayLanguage = getLocalizedOptionLabel(
    t,
    "brand.language",
    normalizedDisplayLanguage,
    "posts.languageNotSet"
  );
  const displayTone = getLocalizedOptionLabel(
    t,
    "create.tone",
    post.tone,
    "posts.toneNotSet"
  );
  const displayPostType = getLocalizedPostType(t, post.post_type);
  const platformIconPath = getPlatformIconPath(post.platform);

  const isCarouselPost = post.content_format === "carousel";
  const isAnimatedVideoPost = post.content_format === "animated_video";
  const imageStatusLabel = isCarouselPost ? null : formatImageStatus(post.image_status, t);
  const videoStatusLabel = isAnimatedVideoPost
    ? formatVideoStatus(post.video_status, t)
    : null;
  const hasSlides = slides.length > 0;
  const primaryPreviewImageUrl =
    isSlideBasedPost(post) && hasSlides ? slides[0]?.image_url : post.image_url;
  const pageTitle = isCarouselPost
    ? t("posts.reviewCarouselTitle")
    : isPendingApproval
    ? t("posts.reviewApproveTitle")
    : t("posts.editSavedTitle");

  return (
    <AppLayout active="automation">
      <div className="post-review-page">
        <header className="post-review-topbar">
          <div className="post-review-heading">
            <p className="eyebrow">
              {isPendingApproval ? t("posts.reviewPost") : t("posts.editPost")}
            </p>
            <h1>{pageTitle}</h1>
            <p>{t("posts.reviewPageIntro")}</p>
          </div>

          <div className="post-review-actions">
            <a className="post-review-button neutral" href="/">
              <ArrowLeft size={17} aria-hidden="true" />
              {t("posts.back")}
            </a>

            {!isCarouselPost && (
              <button type="button" className="post-review-button neutral" onClick={copyPostText}>
                <Copy size={17} aria-hidden="true" />
                {t("posts.copyText")}
              </button>
            )}

            <button
              type="button"
              className="post-review-button save"
              onClick={savePost}
              disabled={saving || approving || discarding}
            >
              <Save size={17} aria-hidden="true" />
              {saving ? t("posts.saving") : t("posts.saveChanges")}
            </button>

            {isPendingApproval && (
              <>
                <button
                  type="button"
                  className="post-review-button discard"
                  onClick={discardPost}
                  disabled={saving || approving || discarding}
                >
                  <Trash2 size={17} aria-hidden="true" />
                  {discarding ? t("posts.discarding") : t("posts.discard")}
                </button>

                <button
                  type="button"
                  className="post-review-button approve"
                  onClick={approvePost}
                  disabled={saving || approving || discarding}
                >
                  <CheckCircle2 size={18} aria-hidden="true" />
                  {approving ? t("posts.approving") : t("posts.approve")}
                </button>
              </>
            )}
          </div>
        </header>

        {message && (
          <p className="post-review-message" role="status" aria-live="polite">
            <Info size={18} aria-hidden="true" />
            {message}
          </p>
        )}

        <section className="post-review-summary-card">
          <div className="post-review-summary-copy">
            <span className="post-review-summary-icon"><Sparkles size={23} aria-hidden="true" /></span>
            <div>
              <p className="eyebrow">
                {post.platform || t("posts.platformNotSet")} · {displayPostType}
              </p>
              <h2>
                {displayTone} · {displayLanguage}
              </h2>
              <p>{t("posts.reviewSummaryText")}</p>
            </div>
          </div>

          <div className="post-review-statuses">
            <span className={getStatusClass(post.status)}>{formatStatus(post.status, t)}</span>
            {isAutomationPost && <span className="status-pill">{t("posts.generatedByAutomation")}</span>}
            {(isSlideBasedPost(post) || isAnimatedVideoPost) && (
              <span className="status-pill">{formatContentFormat(post, t)}</span>
            )}
            {imageStatusLabel && (
              <span className={getImageStatusClass(post.image_status)}>{imageStatusLabel}</span>
            )}
            {videoStatusLabel && (
              <span className={getImageStatusClass(post.video_status)}>{videoStatusLabel}</span>
            )}
          </div>
        </section>

        <section className="post-review-meta-card">
          <div className="post-review-meta-item">
            <span><Info size={18} aria-hidden="true" /></span>
            <div><small>{t("posts.source")}</small><strong>{sourceLabel}</strong></div>
          </div>
          <div className="post-review-meta-item">
            <span><Sparkles size={18} aria-hidden="true" /></span>
            <div><small>{t("posts.created")}</small><strong>{formatDate(post.created_at, t)}</strong></div>
          </div>
          {post.scheduled_for && !isCarouselPost && (
            <div className="post-review-meta-item">
              <span><CalendarClock size={18} aria-hidden="true" /></span>
              <div><small>{t("posts.scheduledFor")}</small><strong>{formatDate(post.scheduled_for, t)}</strong></div>
            </div>
          )}
          {post.approved_at && (
            <div className="post-review-meta-item">
              <span><CheckCircle2 size={18} aria-hidden="true" /></span>
              <div><small>{t("posts.approvedAt")}</small><strong>{formatDate(post.approved_at, t)}</strong></div>
            </div>
          )}
          {post.published_at && (
            <div className="post-review-meta-item">
              <span><CheckCircle2 size={18} aria-hidden="true" /></span>
              <div><small>{t("posts.publishedAt")}</small><strong>{formatDate(post.published_at, t)}</strong></div>
            </div>
          )}
          {isPendingApproval && !isCarouselPost && (
            <div className="post-review-meta-note">
              <Info size={18} aria-hidden="true" />
              <p>{t("posts.approvalNote")}</p>
            </div>
          )}
          {post.status === "rejected" && (
            <div className="post-review-meta-note danger">
              <Info size={18} aria-hidden="true" />
              <p>{t("posts.discardedNote")}</p>
            </div>
          )}
        </section>

        {isCarouselPost && (
          <div className="carousel-review-banner post-review-carousel-banner">
            <strong>{t("posts.carouselReviewBannerTitle")}</strong>
            <span>{t("posts.carouselReviewBannerText")}</span>
          </div>
        )}

        <section className="post-review-workspace">
          <article className="post-review-preview-card">
            <header className="post-review-card-heading">
              <span className="post-review-card-icon media">
                {isAnimatedVideoPost ? <Video size={21} aria-hidden="true" /> : <ImageIcon size={21} aria-hidden="true" />}
              </span>
              <div>
                <h2>{t("posts.fullPostPreview")}</h2>
                <p>{t("posts.fullPostPreviewText")}</p>
              </div>
              {(post.video_url || primaryPreviewImageUrl) && (
                <a
                  className="post-review-open-media"
                  href={isAnimatedVideoPost ? post.video_url : primaryPreviewImageUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={16} aria-hidden="true" />
                  {isAnimatedVideoPost ? t("posts.openVideo") : t("posts.openImage")}
                </a>
              )}
            </header>

            <div className="post-review-social-preview">
              <div className="post-review-social-heading">
                <span className={`post-review-platform-mark${platformIconPath ? " image" : ""}`}>
                  {platformIconPath ? (
                    <img src={platformIconPath} alt="" aria-hidden="true" />
                  ) : (
                    String(post.platform || "S").slice(0, 1).toUpperCase()
                  )}
                </span>
                <div>
                  <strong>{post.platform || t("posts.platformNotSet")}</strong>
                  <small>{t("posts.previewLabel")}</small>
                </div>
              </div>

              {isAnimatedVideoPost && post.video_url ? (
                <video controls muted loop playsInline poster={post.image_url || undefined}>
                  <source src={post.video_url} type="video/mp4" />
                </video>
              ) : primaryPreviewImageUrl ? (
                <img src={primaryPreviewImageUrl} alt={t("posts.generatedPostImageAlt")} />
              ) : (
                <div className="post-review-media-placeholder">
                  <ImageIcon size={32} aria-hidden="true" />
                  <strong>{imageStatusLabel || videoStatusLabel || t("posts.noMediaPreview")}</strong>
                </div>
              )}

              <div className="post-review-published-copy">
                {content || t("posts.noPostContent")}
              </div>
            </div>
          </article>

          <div className="post-review-editor-column">
            <article className="post-review-editor-card">
              <header className="post-review-card-heading">
                <span className="post-review-card-icon text"><FileText size={21} aria-hidden="true" /></span>
                <div>
                  <h2>{t("posts.editContentTitle")}</h2>
                  <p>{t("posts.editContentText")}</p>
                </div>
              </header>

              <textarea
                ref={contentTextareaRef}
                className="post-review-content-textarea"
                value={content}
                rows={10}
                onChange={(event) => setContent(event.target.value)}
                aria-label={t("posts.postContent")}
              />

              <div className="post-review-editor-help">
                <Info size={16} aria-hidden="true" />
                <span>{t("posts.completeContentHelp")}</span>
              </div>
            </article>

            {post.idea && (
              <article className="post-review-idea-card">
                <header>
                  <span><Sparkles size={18} aria-hidden="true" /></span>
                  <h2>{t("posts.originalIdea")}</h2>
                </header>
                <p>{post.idea}</p>
              </article>
            )}
          </div>
        </section>

        {isSlideBasedPost(post) && (
          <section className="edit-post-slides-block post-review-slides-card">
            <div className="edit-post-image-header">
              <div>
                <label className="field-label">{t("posts.slidesTitle")}</label>
                <p>{t("posts.slidesText", { count: slides.length })}</p>
              </div>
            </div>

            {slides.length === 0 ? (
              <div className="idea-box"><p>{t("posts.noSlidesYet")}</p></div>
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
                      <div className="edit-post-slide-placeholder">{t("posts.slideImagePending")}</div>
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
          </section>
        )}

        <footer className="post-review-footer-actions">
          <div>
            <CheckCircle2 size={22} aria-hidden="true" />
            <p><strong>{t("posts.readyForDecision")}</strong><span>{t("posts.readyForDecisionText")}</span></p>
          </div>
          <div className="post-review-actions compact">
            <button
              type="button"
              className="post-review-button save"
              onClick={savePost}
              disabled={saving || approving || discarding}
            >
              <Save size={17} aria-hidden="true" />
              {saving ? t("posts.saving") : t("posts.saveChanges")}
            </button>
            {isPendingApproval && (
              <button
                type="button"
                className="post-review-button approve"
                onClick={approvePost}
                disabled={saving || approving || discarding}
              >
                <CheckCircle2 size={18} aria-hidden="true" />
                {approving ? t("posts.approving") : t("posts.approve")}
              </button>
            )}
          </div>
        </footer>
      </div>
    </AppLayout>
  );
}

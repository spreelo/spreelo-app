"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileCheck2,
  Download,
  ImageIcon,
  Link2,
  LoaderCircle,
  Maximize2,
  PackageCheck,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Video,
  X,
  ZoomIn,
  XCircle,
} from "lucide-react";
import AppLayout from "../../../components/AppLayout";
import { supabase } from "../../../lib/supabaseClient";
import { useUiText } from "../../../lib/i18n/useUiText";
import { getPostRescueProductCount, POST_RESCUE_TYPES, resolvePostRescueType } from "../../../lib/postRescueFormat";

async function getHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

function formatDate(value, locale = "en") {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale || "en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatNativeMoney(amount, currency) {
  const numeric = Number(amount);
  const code = String(currency || "").trim().toUpperCase();
  if (!Number.isFinite(numeric) || !code) return null;
  return `${code} ${numeric.toFixed(9)}`;
}

function formatGenerationCost(post) {
  const totals = post?.generation_cost_breakdown?.totals;
  if (totals && typeof totals === "object") {
    const parts = Object.entries(totals)
      .map(([currency, amount]) => formatNativeMoney(amount, currency))
      .filter(Boolean);
    if (parts.length) return parts.join(" + ");
  }
  return formatNativeMoney(post?.generation_cost_amount, post?.generation_cost_currency) || "—";
}

function getGenerationCostEvents(post) {
  return Array.isArray(post?.generation_cost_breakdown?.events)
    ? post.generation_cost_breakdown.events
    : [];
}

function formatGenerationCostEventLabel(event) {
  const provider = String(event?.provider || "provider").toUpperCase();
  const model = String(event?.model || event?.service || "API");
  const operation = String(event?.operation || "").trim();
  const operationLabels = {
    "images.edit": "image edit",
    "images.generate": "image generate",
    "responses.background": "background response",
    "responses.create": "response",
    "responses.retrieve": "response retrieve",
    "chat.completions.create": "chat completion",
    "image_to_video": "image-to-video",
    "render_video": "video render",
  };
  const operationLabel = operationLabels[operation] || operation.replaceAll(".", " ");
  return [provider, model, operationLabel].filter(Boolean).join(" · ");
}

function statusMeta(status, t) {
  if (status === "planned") return { label: t("admin.approvals.statusPlanned"), className: "pending", Icon: Clock3 };
  if (status === "creating") return { label: t("admin.approvals.statusCreating"), className: "pending", Icon: LoaderCircle };
  if (status === "needs_repair") return { label: t("admin.approvals.statusNeedsRepair"), className: "failed", Icon: AlertTriangle };
  if (status === "sent_directly") return { label: t("admin.approvals.statusSentDirectly"), className: "approved", Icon: CheckCircle2 };
  if (status === "approved_by_spreelo") return { label: t("admin.approvals.statusApprovedBySpreelo"), className: "approved", Icon: CheckCircle2 };
  if (status === "failed") return { label: t("admin.approvals.failed"), className: "failed", Icon: AlertTriangle };
  if (status === "approved") return { label: t("admin.approvals.approved"), className: "approved", Icon: CheckCircle2 };
  if (status === "rejected") return { label: t("admin.approvals.rejected"), className: "rejected", Icon: XCircle };
  return { label: t("admin.approvals.pending"), className: "pending", Icon: Clock3 };
}

const CAROUSEL_PRODUCT_COUNT = 5;
const ADMIN_WORKBENCH_TABS = ["upcoming", "queue", "failed", "history"];
const ADMIN_WORKBENCH_TAB_ICONS = { upcoming: Clock3, queue: FileCheck2, failed: AlertTriangle, history: CheckCircle2 };
const POSTS_PER_PAGE = 15;
const emptyCarouselProduct = () => ({
  title: "",
  description: "",
  url: "",
  image_url: "",
  preview_image_url: "",
  product_brand: "",
  product_identifier: "",
  price: "",
  currency: "",
  product_display_type: "",
  product_color: "",
  product_image_width: null,
  product_image_height: null,
  product_identity_locked: false,
  product_image_semantic_verified: false,
  locked_product_fingerprint: "",
  manual_override: false,
  manual_image_override: false,
  manual_override_note: "",
});
function isMaterialReady(item) {
  if (!item) return false;
  if (item.manual_override === true) return Boolean(item.title?.trim() && item.image_url?.trim());
  return Boolean(item.url?.trim());
}
const PRODUCT_CONTENT_TYPE_IDS = new Set([
  "website_item",
  "website_item_text_ad",
  "animated_website_item",
  "carousel_website_item",
  "ai_product_video",
]);
function isProductDrivenPost(post) {
  const contentTypeId = String(post?.content_type_id || "").trim();
  if (PRODUCT_CONTENT_TYPE_IDS.has(contentTypeId)) return true;
  return Array.isArray(post?.admin_product_items) && post.admin_product_items.length > 0;
}
function isCarouselPost(post) {
  return String(post?.content_type_id || "").trim() === "carousel_website_item" ||
    /carousel/i.test(String(post?.content_format || post?.post_type || ""));
}
function isSyntheticAdminCaseId(id) {
  const value = String(id || "");
  return value.startsWith("occurrence-") || value.startsWith("review-case-") || value.startsWith("work-item-");
}

function getKlingRejectedAudit(post) {
  const audit = post?.video_background_selection?.product_video_validation;
  const failureStage = String(post?.failure?.failure_stage || "");
  const failureCode = String(post?.failure?.failure_code || "");
  const rejected =
    String(post?.video_provider || "").toLowerCase() === "kling" &&
    String(post?.video_status || "").toLowerCase() === "failed" &&
    (String(audit?.status || "").toLowerCase() === "failed" ||
      failureStage === "kling_finished_product_identity" ||
      failureCode === "KLING_FINISHED_PRODUCT_IDENTITY_REJECTED");
  return rejected ? (audit || {}) : null;
}

function getKlingAuditViolationLabels(audit, t) {
  const codes = Array.isArray(audit?.violation_codes) ? audit.violation_codes : [];
  const labelKeys = {
    product_identity_changed: "admin.approvals.klingViolationIdentity",
    verified_view_or_surface_changed: "admin.approvals.klingViolationSurface",
    controls_or_hardware_changed: "admin.approvals.klingViolationHardware",
    material_color_or_print_changed: "admin.approvals.klingViolationPrint",
    invented_or_moved_identity_detail: "admin.approvals.klingViolationInventedDetail",
    scene_continuity_broken: "admin.approvals.klingViolationSceneContinuity",
    environment_geometry_changed: "admin.approvals.klingViolationEnvironmentGeometry",
    object_appeared_or_disappeared: "admin.approvals.klingViolationObjectAppeared",
    identity_audit_uncertain: "admin.approvals.klingViolationUncertain",
  };
  return codes.map((code) => t(labelKeys[code] || "admin.approvals.klingViolationGeneric", { code }));
}
function getFiveCarouselProducts(items) {
  return Array.from({ length: CAROUSEL_PRODUCT_COUNT }, (_, index) => ({
    ...emptyCarouselProduct(),
    ...(Array.isArray(items) ? items[index] : null),
  }));
}

function getPostMediaItems(post) {
  if (Array.isArray(post?.slides) && post.slides.length) {
    return post.slides
      .filter((slide) => slide?.image_url)
      .map((slide, index) => ({
        url: slide.image_url,
        label: slide.headline || slide.metadata?.product_title || `Slide ${slide.slide_order || index + 1}`,
        productUrl: slide.product_url || "",
        order: slide.slide_order || index + 1,
      }));
  }
  return post?.image_url
    ? [{ url: post.image_url, label: post.post_type || post.content_format || "Post image", productUrl: post?.admin_product_items?.[0]?.url || "", order: 1 }]
    : [];
}

function MediaPreview({ post, t, onOpen }) {
  const mediaItems = getPostMediaItems(post);
  if (post.slides?.length) {
    return (
      <div className="admin-review-media-section">
        <div className="admin-review-section-heading">
          <div><span>{t("admin.approvals.visualReview")}</span><strong>{t(mediaItems.length === 1 ? "admin.approvals.oneImage" : "admin.approvals.imageCount", { count: mediaItems.length })}</strong></div>
          <small>{t("admin.approvals.inspectImagesHelp")}</small>
        </div>
        <div className="admin-v74-slide-grid admin-review-slide-grid">
          {post.slides.map((slide) => {
            const mediaIndex = mediaItems.findIndex((item) => item.url === slide.image_url);
            return (
              <article key={`${post.id}-${slide.slide_order}`}>
                {slide.image_url ? (
                  <button type="button" className="admin-review-image-button" onClick={() => onOpen?.(Math.max(0, mediaIndex))}>
                    <img src={slide.image_url} alt="" />
                    <span className="admin-review-image-zoom"><Maximize2 size={16} /> {t("admin.approvals.inspect")}</span>
                  </button>
                ) : <span><ImageIcon size={22} /></span>}
                <div>
                  <div className="admin-v14401-product-title-row">
                    <strong>{slide.headline || slide.metadata?.product_title || `Slide ${slide.slide_order}`}</strong>
                    {slide.product_url ? <a href={slide.product_url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}><ExternalLink size={13} /> {t("admin.approvals.product")}</a> : null}
                  </div>
                  {slide.body ? <p>{slide.body}</p> : null}
                  {slide.cta_text ? <small>{slide.cta_text}</small> : null}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    );
  }
  if (post.video_url) {
    return (
      <div className="admin-v74-media-frame admin-review-primary-media">
        <video src={post.video_url} controls playsInline preload="metadata" />
      </div>
    );
  }
  if (post.image_url) {
    return (
      <div className="admin-v74-media-frame admin-review-primary-media">
        <button type="button" className="admin-review-image-button admin-review-single-image" onClick={() => onOpen?.(0)}>
          <img src={post.image_url} alt="" />
          <span className="admin-review-image-zoom"><ZoomIn size={17} /> {t("admin.approvals.inspectFullSize")}</span>
        </button>
      </div>
    );
  }
  return <div className="admin-v74-no-media"><ImageIcon size={22} />{t("admin.approvals.noMedia")}</div>;
}

export default function AdminPostApprovalsPage() {
  const { t, locale } = useUiText(["admin"]);
  const [filter, setFilter] = useState(() => {
    if (typeof window === "undefined") return "upcoming";
    const view = new URLSearchParams(window.location.search).get("view");
    return ["upcoming", "queue", "failed", "history"].includes(view) ? view : "upcoming";
  });
  const [posts, setPosts] = useState([]);
  const [tabCounts, setTabCounts] = useState({ upcoming: 0, queue: 0, failed: 0 });
  const [cleaningTestData, setCleaningTestData] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState("");
  const [drafts, setDrafts] = useState({});
  const [selectedPostId, setSelectedPostId] = useState("");
  const [reviewGateEnabled, setReviewGateEnabled] = useState(false);
  const [savingReviewGate, setSavingReviewGate] = useState(false);
  const [releasingPostId, setReleasingPostId] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [postCopy, setPostCopy] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [retryingKling, setRetryingKling] = useState(false);
  const [regenerationError, setRegenerationError] = useState("");
  const [regenerationSuccess, setRegenerationSuccess] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [resolvingProductIndex, setResolvingProductIndex] = useState(null);
  const [savingReviewChanges, setSavingReviewChanges] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const [productDirty, setProductDirty] = useState(false);
  const [editorPostId, setEditorPostId] = useState("");
  const [manualEditingIndices, setManualEditingIndices] = useState([]);
  const [sourceUrl, setSourceUrl] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [formatFilter, setFormatFilter] = useState("all");
  const [testFilter, setTestFilter] = useState(() => {
    if (typeof window === "undefined") return "all";
    return new URLSearchParams(window.location.search).get("testBatch") || "all";
  });
  const [restoringVersionId, setRestoringVersionId] = useState("");
  const [copyingTestDiagnostic, setCopyingTestDiagnostic] = useState(false);
  const [rescueUploading, setRescueUploading] = useState(false);
  const [rescueMessage, setRescueMessage] = useState("");
  const [rescueError, setRescueError] = useState("");
  const [cancellingFailedOccurrenceId, setCancellingFailedOccurrenceId] = useState("");
  const [refundActionMessage, setRefundActionMessage] = useState("");
  const [refundActionError, setRefundActionError] = useState("");
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const postCopyRef = useRef(null);

  const selectedPost = useMemo(
    () => posts.find((post) => post.id === selectedPostId) || null,
    [posts, selectedPostId]
  );
  const selectedKlingRejectedAudit = useMemo(
    () => getKlingRejectedAudit(selectedPost),
    [selectedPost]
  );
  const lightboxItems = useMemo(() => getPostMediaItems(selectedPost), [selectedPost]);
  const availableFormats = useMemo(() => Array.from(new Set(
    posts.map((post) => String(post.content_format || post.post_type || "").trim()).filter(Boolean)
  )).sort((a, b) => a.localeCompare(b)), [posts]);
  const availableTestBatches = useMemo(() => Array.from(new Set(
    posts.map((post) => String(post.admin_test_batch_id || "").trim()).filter(Boolean)
  )), [posts]);
  const filteredPosts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return posts.filter((post) => {
      const format = String(post.content_format || post.post_type || "").trim();
      if (formatFilter !== "all" && format !== formatFilter) return false;
      if (testFilter === "tests" && post.is_admin_test !== true) return false;
      if (testFilter === "normal" && post.is_admin_test === true) return false;
      if (!["all", "tests", "normal"].includes(testFilter) && post.admin_test_batch_id !== testFilter) return false;
      if (!query) return true;
      return [post.brand_name, post.customer_email, post.content, post.platform, post.post_type, post.content_format]
        .some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [posts, searchQuery, formatFilter, testFilter]);
  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / POSTS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const paginatedPosts = useMemo(
    () => filteredPosts.slice((currentPage - 1) * POSTS_PER_PAGE, currentPage * POSTS_PER_PAGE),
    [filteredPosts, currentPage]
  );
  const visiblePages = useMemo(() => {
    const values = new Set([1, totalPages]);
    for (let value = currentPage - 2; value <= currentPage + 2; value += 1) {
      if (value >= 1 && value <= totalPages) values.add(value);
    }
    return Array.from(values).sort((a, b) => a - b);
  }, [currentPage, totalPages]);
  const carouselReady =
    isCarouselPost(selectedPost) &&
    materials.length === CAROUSEL_PRODUCT_COUNT &&
    materials.every(isMaterialReady);
  const singleProductReady =
    Boolean(selectedPost) &&
    !isCarouselPost(selectedPost) &&
    isMaterialReady(materials?.[0]);
  const verifiedMaterialCount = materials.filter(
    (item) => item.product_identity_locked === true && item.product_image_semantic_verified === true
  ).length;
  const manualMaterialCount = materials.filter((item) => item.manual_override === true).length;
  const lowResolutionMaterialCount = materials.filter((item) => {
    const width = Number(item?.product_image_width || 0);
    const height = Number(item?.product_image_height || 0);
    return width > 0 && height > 0 && Math.max(width, height) < 1000;
  }).length;

  useEffect(() => { loadPosts(); }, [filter, testFilter]);
  useEffect(() => { setPage(1); }, [filter, searchQuery, formatFilter, testFilter]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  useEffect(() => { setPageInput(String(currentPage)); }, [currentPage]);
  useEffect(() => {
    const textarea = postCopyRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [postCopy, selectedPostId]);
  useEffect(() => {
    const refresh = () => fetchPosts("", true);
    const intervalId = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refresh);
    };
  }, [filter, selectedPostId]);
  useEffect(() => { loadReviewGate(); }, []);
  useEffect(() => {
    if (!selectedPostId && lightboxIndex === null) return undefined;
    const onKeyDown = (event) => {
      if (lightboxIndex !== null) {
        if (event.key === "Escape") setLightboxIndex(null);
        if (event.key === "ArrowLeft") setLightboxIndex((index) => lightboxItems.length ? (Number(index || 0) - 1 + lightboxItems.length) % lightboxItems.length : null);
        if (event.key === "ArrowRight") setLightboxIndex((index) => lightboxItems.length ? (Number(index || 0) + 1) % lightboxItems.length : null);
        return;
      }
      if (event.key === "Escape") setSelectedPostId("");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedPostId, lightboxIndex, lightboxItems.length]);
  useEffect(() => {
    if (!selectedPost) {
      setMaterials([]);
      setPostCopy("");
      setRegenerationError("");
      setRegenerationSuccess("");
      setLightboxIndex(null);
      setEditorPostId("");
      setEditorDirty(false);
      setProductDirty(false);
      setManualEditingIndices([]);
      setSourceUrl("");
      setRescueMessage("");
      setRescueError("");
      setRefundActionMessage("");
      setRefundActionError("");
      return;
    }
    // Do not let the 15-second admin polling overwrite an open edit session.
    if (editorPostId === selectedPost.id && (editorDirty || productDirty)) return;
    const isEmptyFailedSingle = selectedPost.status === "failed" &&
      isProductDrivenPost(selectedPost) &&
      !isCarouselPost(selectedPost) &&
      !selectedPost?.admin_product_items?.length;
    setMaterials(
      isCarouselPost(selectedPost)
        ? getFiveCarouselProducts(selectedPost?.admin_product_items)
        : selectedPost?.admin_product_items?.length
          ? [{ ...emptyCarouselProduct(), ...(selectedPost.admin_product_items[0] || {}) }]
          : isEmptyFailedSingle
            ? [emptyCarouselProduct()]
            : []
    );
    setPostCopy(selectedPost?.content || "");
    setSourceUrl(selectedPost?.source_url || selectedPost?.website_url || "");
    setRegenerationError("");
    setRegenerationSuccess("");
    setRescueMessage("");
    setRescueError("");
    setRefundActionMessage("");
    setRefundActionError("");
    setLightboxIndex(null);
    setEditorPostId(selectedPost.id);
    setEditorDirty(false);
    setProductDirty(false);
    // Failed single-product generations often contain no scraped material at
    // all. Open the manual repair form immediately so an admin can paste the
    // product name/text and upload the source image without an extra click.
    setManualEditingIndices(isEmptyFailedSingle ? [0] : []);
  }, [selectedPost, editorPostId, editorDirty, productDirty]);

  function markEditorDirty({ product = false } = {}) {
    setEditorDirty(true);
    if (product) setProductDirty(true);
  }

  function updateMaterial(index, patch, { manual = false } = {}) {
    setMaterials((items) => items.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      return {
        ...item,
        ...patch,
        ...(manual ? {
          manual_override: true,
          product_identity_locked: false,
          product_image_semantic_verified: false,
          locked_product_fingerprint: "",
        } : {}),
      };
    }));
    markEditorDirty({ product: true });
  }

  function toggleManualEditor(index) {
    setManualEditingIndices((current) =>
      current.includes(index)
        ? current.filter((value) => value !== index)
        : [...current, index]
    );
  }

  function renderManualProductEditor(item, index) {
    if (!manualEditingIndices.includes(index)) return null;
    const setField = (field, value) => updateMaterial(index, { [field]: value }, { manual: true });
    return (
      <div className="admin-product-manual-editor">
        <div className="admin-product-manual-heading">
          <div>
            <Pencil size={15} />
            <span>
              <strong>{t("admin.approvals.manualOverride")}</strong>
              <small>{t("admin.approvals.manualOverrideHelp")}</small>
            </span>
          </div>
          <span className="admin-product-manual-warning">{t("admin.approvals.notSourceVerified")}</span>
        </div>
        <div className="admin-product-manual-fields admin-v14401-manual-primary">
          <label><span>{t("admin.approvals.productName")}</span><input value={item.title || ""} onChange={(event) => setField("title", event.target.value)} /></label>
          <label className="admin-product-manual-description"><span>{t("admin.approvals.productDescription")}</span><textarea value={item.description || ""} onChange={(event) => setField("description", event.target.value)} /></label>
        </div>
        <details className="admin-v14401-advanced-product-fields">
          <summary>{t("admin.approvals.moreProductDetails")}</summary>
          <div className="admin-product-manual-fields">
            <label><span>{t("admin.approvals.brand")}</span><input value={item.product_brand || ""} onChange={(event) => setField("product_brand", event.target.value)} /></label>
            <label><span>{t("admin.approvals.productType")}</span><input value={item.product_display_type || ""} onChange={(event) => setField("product_display_type", event.target.value)} /></label>
            <label><span>{t("admin.approvals.variant")}</span><input value={item.product_color || ""} onChange={(event) => setField("product_color", event.target.value)} /></label>
            <label><span>{t("admin.approvals.sku")}</span><input value={item.product_identifier || ""} onChange={(event) => setField("product_identifier", event.target.value)} /></label>
            <label><span>{t("admin.approvals.price")}</span><input value={item.price || ""} onChange={(event) => setField("price", event.target.value)} placeholder={t("admin.approvals.pricePlaceholder")} /></label>
            <label><span>{t("admin.approvals.currency")}</span><input value={item.currency || ""} onChange={(event) => setField("currency", event.target.value)} placeholder={t("admin.approvals.currencyPlaceholder")} /></label>
          </div>
        </details>
        <div className="admin-product-manual-actions">
          <label className="admin-product-upload-button">
            <Upload size={15} /> {t("admin.approvals.uploadProductImage")}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => uploadProductImage(index, event.target.files?.[0])} />
          </label>
          {item.url ? (
            <button type="button" onClick={() => resolveMaterialProduct(index)} disabled={resolvingProductIndex === index}>
              <RotateCcw size={15} /> {t("admin.approvals.resetToSource")}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  async function loadPosts(preferredSelectedPostId = "") {
    return fetchPosts(preferredSelectedPostId, false);
  }

  async function fetchPosts(preferredSelectedPostId = "", silent = false) {
    if (!silent) setLoading(true);
    if (!silent) setError("");
    try {
      const headers = await getHeaders();
      const batchQuery = !["all", "tests", "normal"].includes(testFilter) ? `&testBatch=${encodeURIComponent(testFilter)}` : "";
      const [response, countsResponse] = await Promise.all([
        fetch(`/api/admin/post-approvals?status=${encodeURIComponent(filter)}${batchQuery}`, { headers, cache: "no-store" }),
        fetch("/api/admin/post-approvals/counts", { headers, cache: "no-store" }),
      ]);
      const payload = await response.json().catch(() => ({}));
      const countsPayload = await countsResponse.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t("admin.approvals.loadError"));
      if (countsResponse.ok && countsPayload?.counts) {
        setTabCounts({
          upcoming: Number(countsPayload.counts.upcoming || 0),
          queue: Number(countsPayload.counts.queue || 0),
          failed: Number(countsPayload.counts.failed || 0),
        });
      }
      const nextPosts = payload?.posts || [];
      setPosts(nextPosts);
      const nextDrafts = {};
      nextPosts.forEach((post) => {
        if (post.rejection) {
          nextDrafts[post.rejection.id] = {
            review_status: post.rejection.review_status || "new",
            refund_status: post.rejection.refund_status || "pending_review",
            admin_note: post.rejection.admin_note || "",
          };
        }
      });
      setDrafts(nextDrafts);
      const selectionToKeep = preferredSelectedPostId || selectedPostId;
      if (selectionToKeep && nextPosts.some((post) => post.id === selectionToKeep)) setSelectedPostId(selectionToKeep);
      else if (selectionToKeep) setSelectedPostId("");
    } catch (loadError) {
      setError(loadError.message || t("admin.approvals.loadError"));
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function cleanupCurrentAdminTestData() {
    const confirmation = window.prompt(t("admin.approvals.cleanupConfirm"));
    if (confirmation !== "DELETE MY TEST DATA") return;

    setCleaningTestData(true);
    setCleanupMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/test-data-cleanup", {
        method: "POST",
        headers: await getHeaders(),
        body: JSON.stringify({ confirmation }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t("admin.approvals.cleanupError"));
      setSelectedPostId("");
      setSelectedIds([]);
      setCleanupMessage(t("admin.approvals.cleanupDone", { plans: Number(payload?.ended_rules || 0), credits: Number(payload?.released_credits || 0) }));
      await loadPosts();
    } catch (cleanupError) {
      setError(cleanupError?.message || t("admin.approvals.cleanupError"));
    } finally {
      setCleaningTestData(false);
    }
  }

  async function copySelectedTestDiagnostic() {
    if (!selectedPost?.is_admin_test || !selectedPost?.admin_test_batch_id || !selectedPost?.automation_rule_id) return;
    setCopyingTestDiagnostic(true);
    try {
      const response = await fetch(`/api/admin/mass-tests/${selectedPost.admin_test_batch_id}/diagnostics?ruleId=${encodeURIComponent(selectedPost.automation_rule_id)}`, { headers: await getHeaders(), cache: "no-store" });
      const text = await response.text();
      if (!response.ok) throw new Error(text || t("admin.approvals.errorDiagnostic"));
      await navigator.clipboard.writeText(text);
      setRegenerationSuccess(t("admin.approvals.diagnosticCopied"));
    } catch (copyError) {
      setRegenerationError(copyError.message || t("admin.approvals.errorCopyDiagnostic"));
    } finally {
      setCopyingTestDiagnostic(false);
    }
  }

  async function loadReviewGate() {
    try {
      const headers = await getHeaders();
      const response = await fetch("/api/admin/post-review-settings", { headers, cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) setReviewGateEnabled(Boolean(payload?.requireAdminPostApproval));
    } catch {
      // The approval list remains available if this separate setting cannot load.
    }
  }

  async function updateReviewGate(enabled) {
    setSavingReviewGate(true);
    setError("");
    try {
      const headers = await getHeaders();
      const response = await fetch("/api/admin/post-review-settings", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ requireAdminPostApproval: enabled }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t("admin.approvals.settingError"));
      setReviewGateEnabled(Boolean(payload?.requireAdminPostApproval));
    } catch (saveError) {
      setError(saveError.message || t("admin.approvals.settingError"));
    } finally {
      setSavingReviewGate(false);
    }
  }

  async function releaseToCustomer(postId) {
    setReleasingPostId(postId);
    setError("");
    try {
      const headers = await getHeaders();
      const response = await fetch("/api/admin/post-approvals", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ action: "release_to_customer", post_id: postId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t("admin.approvals.releaseError"));
      await loadPosts();
    } catch (releaseError) {
      setError(releaseError.message || t("admin.approvals.releaseError"));
    } finally {
      setReleasingPostId("");
    }
  }

  async function runAdminAction(payload) {
    const headers = await getHeaders();
    const response = await fetch("/api/admin/post-approvals", { method: "PATCH", headers, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error || "The admin action failed.");
    return result;
  }

  async function saveCurrentReviewChanges() {
    if (!selectedPost || isSyntheticAdminCaseId(selectedPost.id)) return;
    setSavingReviewChanges(true);
    setRegenerationError("");
    setRegenerationSuccess("");
    try {
      await runAdminAction({
        action: "save_materials",
        post_id: selectedPost.id,
        occurrence_id: selectedPost.occurrence_id || null,
        content: postCopy,
        product_items: materials,
      });
      setEditorDirty(false);
      await loadPosts(selectedPost.id);
      setSelectedPostId(selectedPost.id);
      setRegenerationSuccess(
        productDirty
          ? t("admin.approvals.savedNeedsRegeneration")
          : t("admin.approvals.reviewChangesSaved")
      );
    } catch (actionError) {
      setRegenerationError(actionError.message || "Could not save review changes.");
    } finally {
      setSavingReviewChanges(false);
    }
  }

  async function regenerateFromMaterials() {
    if (!selectedPost) return;
    setRegenerating(true);
    setError("");
    setRegenerationError("");
    setRegenerationSuccess("");
    try {
      const headers = await getHeaders();
      const response = await fetch("/api/admin/post-approvals/regenerate", { method: "POST", headers, body: JSON.stringify({ post_id: selectedPost.status === "failed" ? null : selectedPost.id, occurrence_id: selectedPost.occurrence_id || null, review_case_id: selectedPost.failure?.review_case_id || null, work_item_id: selectedPost.work_item_id || null, content: postCopy, product_items: materials }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || "Regeneration failed.");
      setEditorDirty(false);
      setProductDirty(false);
      await loadPosts(result.post_id);
      setSelectedPostId(result.post_id);
      setRegenerationSuccess(t("admin.approvals.carouselRegenerated", { count: result.slide_count || 5 }));
    } catch (actionError) {
      const message = actionError.message || "Regeneration failed.";
      setRegenerationError(message);
      setError(message);
    } finally { setRegenerating(false); }
  }

  async function regenerateSingleProduct() {
    if (!selectedPost || !singleProductReady) return;
    setRegenerating(true);
    setError("");
    setRegenerationError("");
    setRegenerationSuccess("");
    try {
      const headers = await getHeaders();
      const response = await fetch("/api/admin/post-approvals/regenerate-product", {
        method: "POST",
        headers,
        body: JSON.stringify({
          post_id: selectedPost.status === "failed" ? null : selectedPost.id,
          occurrence_id: selectedPost.occurrence_id || null,
          review_case_id: selectedPost.failure?.review_case_id || null,
          work_item_id: selectedPost.work_item_id || null,
          product_url: materials[0].url,
          product_item: materials[0],
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || "Product post regeneration failed.");
      setEditorDirty(false);
      setProductDirty(false);
      await loadPosts(result.post_id);
      setSelectedPostId(result.post_id);
      setRegenerationSuccess(
        result.format === "ai_product_video_rescue"
          ? t("admin.approvals.aiProductVideoRescueSubmitted")
          : result.format === "animated_product_reel"
            ? t("admin.approvals.productReelRegenerated")
            : result.format === "ai_product_ad"
              ? t("admin.approvals.productAdRegenerated")
              : t("admin.approvals.productPostRegenerated")
      );
    } catch (actionError) {
      const message = actionError.message || "Product post regeneration failed.";
      setRegenerationError(message);
      setError(message);
    } finally {
      setRegenerating(false);
    }
  }

  async function regenerateGeneric(mode = "all") {
    if (!selectedPost) return;
    setRegenerating(true);
    setError("");
    setRegenerationError("");
    setRegenerationSuccess("");
    try {
      const headers = await getHeaders();
      const response = await fetch("/api/admin/post-approvals/regenerate-any", {
        method: "POST",
        headers,
        body: JSON.stringify({
          post_id: selectedPost.status === "failed" ? null : selectedPost.id,
          occurrence_id: selectedPost.occurrence_id || null,
          review_case_id: selectedPost.failure?.review_case_id || null,
          work_item_id: selectedPost.work_item_id || null,
          source_url: sourceUrl,
          content: postCopy,
          mode,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || "Regeneration failed.");
      setEditorDirty(false);
      setProductDirty(false);
      await loadPosts(result.post_id);
      setSelectedPostId(result.post_id);
      setRegenerationSuccess(
        mode === "text" ? t("admin.approvals.regeneratedText") : mode === "media" ? t("admin.approvals.regeneratedMedia") : t("admin.approvals.regeneratedPost")
      );
    } catch (actionError) {
      const message = actionError.message || "Regeneration failed.";
      setRegenerationError(message);
      setError(message);
    } finally {
      setRegenerating(false);
    }
  }

  async function retryRejectedKlingVideo() {
    if (!selectedPost || !selectedKlingRejectedAudit) return;
    setRetryingKling(true);
    setError("");
    setRegenerationError("");
    setRegenerationSuccess("");
    try {
      const headers = await getHeaders();
      const response = await fetch("/api/admin/post-approvals/retry-kling", {
        method: "POST",
        headers,
        body: JSON.stringify({ post_id: selectedPost.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || t("admin.approvals.klingRetryError"));
      await loadPosts(result.post_id);
      setSelectedPostId(result.post_id);
      setRegenerationSuccess(t("admin.approvals.klingRetryQueued"));
    } catch (actionError) {
      const message = actionError.message || t("admin.approvals.klingRetryError");
      setRegenerationError(message);
      setError(message);
    } finally {
      setRetryingKling(false);
    }
  }

  async function regenerateCurrent(mode = "all") {
    if (!selectedPost) return;
    if (isCarouselPost(selectedPost)) return regenerateFromMaterials();
    if (materials.length) return regenerateSingleProduct();
    return regenerateGeneric(mode);
  }

  async function restoreVersion(versionId) {
    if (!selectedPost || isSyntheticAdminCaseId(selectedPost.id) || !versionId) return;
    setRestoringVersionId(versionId);
    setError("");
    setRegenerationError("");
    setRegenerationSuccess("");
    try {
      const headers = await getHeaders();
      const response = await fetch("/api/admin/post-approvals/restore-version", {
        method: "POST",
        headers,
        body: JSON.stringify({ post_id: selectedPost.id, version_id: versionId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || t("admin.approvals.errorRestoreVersion"));
      setEditorDirty(false);
      setProductDirty(false);
      await loadPosts(selectedPost.id);
      setRegenerationSuccess(t("admin.approvals.versionRestored", { version: result.restored_version }));
    } catch (restoreError) {
      setError(restoreError.message || t("admin.approvals.errorRestoreVersion"));
    } finally {
      setRestoringVersionId("");
    }
  }

  async function resolveMaterialProduct(index) {
    const productUrl = String(materials?.[index]?.url || "").trim();
    if (!selectedPost || !productUrl) return;
    setResolvingProductIndex(index);
    setRegenerationError("");
    setRegenerationSuccess("");
    try {
      const headers = await getHeaders();
      const response = await fetch("/api/admin/post-approvals/resolve-product", {
        method: "POST",
        headers,
        body: JSON.stringify({
          post_id: selectedPost.status === "failed" ? null : selectedPost.id,
          occurrence_id: selectedPost.occurrence_id || null,
          product_url: productUrl,
          title_hint: materials?.[index]?.title || "",
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || "Could not verify product URL.");
      setMaterials((items) => items.map((item, itemIndex) =>
        itemIndex === index ? { ...emptyCarouselProduct(), ...(result.product || {}), manual_override: false, manual_image_override: false } : item
      ));
      setEditorDirty(true);
      setProductDirty(true);
      setRegenerationSuccess(
        isCarouselPost(selectedPost)
          ? t("admin.approvals.productFetched", { number: index + 1 })
          : t("admin.approvals.replacementFetched")
      );
    } catch (actionError) {
      setRegenerationError(actionError.message || "Could not verify product URL.");
    } finally {
      setResolvingProductIndex(null);
    }
  }

  async function uploadProductImage(index, file) {
    if (!file) return;
    setError("");
    try {
      const headers = await getHeaders();
      const response = await fetch("/api/admin/post-approvals/upload", { method: "POST", headers, body: JSON.stringify({ content_type: file.type, size: file.size }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || "Could not prepare image upload.");
      const { error: uploadError } = await supabase.storage.from(result.bucket).uploadToSignedUrl(result.path, result.token, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      setMaterials((items) => items.map((item, itemIndex) => itemIndex === index ? {
        ...item,
        image_url: result.public_url,
        preview_image_url: "",
        product_image_width: null,
        product_image_height: null,
        manual_override: true,
        manual_image_override: true,
        product_identity_locked: false,
        product_image_semantic_verified: false,
        locked_product_fingerprint: "",
      } : item));
      markEditorDirty({ product: true });
    } catch (uploadError) { setError(uploadError.message || "Image upload failed."); }
  }

  function buildRescuePrompt(post) {
    if (!post) return "";
    const rescueType = resolvePostRescueType(post);
    const count = getPostRescueProductCount(post, rescueType);
    const ruleSnapshot = post.rule_snapshot || post.work_item?.rule_snapshot || {};
    const matchTerms = Array.isArray(post.product_match_terms) ? post.product_match_terms.filter(Boolean) : [];
    const searchQueries = Array.isArray(post.product_search_queries) ? post.product_search_queries.filter(Boolean) : [];
    const strategy = post.product_strategy || ruleSnapshot.product_search_intent || (matchTerms.length ? `Theme/search terms: ${matchTerms.join(", ")}` : "Use the original task and campaign context.");
    const language = ruleSnapshot.language || ruleSnapshot.content_language || "en";
    const campaignGoal = ruleSnapshot.campaign_goal || "";
    const campaignTheme = ruleSnapshot.campaign_theme || ruleSnapshot.campaign_opportunity_title || "";
    const marketingAngle = ruleSnapshot.marketing_angle || "";
    const customerNeed = ruleSnapshot.target_customer_need || "";
    const commonHeader = `You are helping Spreelo rescue a failed scheduled post. Use ChatGPT web search/browsing to obtain REAL, verifiable material from the customer's public website and create a finished ZIP file that can be uploaded back to Spreelo.

CUSTOMER / TASK
Company: ${post.brand_name || "—"}
Website: ${post.brand_website_url || post.source_url || "—"}
Job source: ${post.source_url || post.brand_website_url || "—"}
Post type: ${post.content_type_label || post.post_type || "—"}
Format: ${post.content_format || "—"}
Rescue type: ${rescueType}
Platform: ${post.platform || "—"}
Plan/campaign: ${post.work_item?.plan_name || post.content || "—"}
Scheduled for: ${post.scheduled_for || "—"}
Language from original recipe: ${language}
Campaign goal: ${campaignGoal || "—"}
Campaign theme: ${campaignTheme || "—"}
Marketing angle: ${marketingAngle || "—"}
Customer need: ${customerNeed || "—"}
Product strategy: ${strategy}
Match terms: ${matchTerms.length ? matchTerms.join(", ") : "—"}
Search queries from original recipe: ${searchQueries.length ? searchQueries.join(" | ") : "—"}
Spreelo failure: ${post.failure?.failure_code || "—"} / ${post.failure?.failure_stage || "—"}

ORIGINAL TASK / STRATEGY
${post.prompt_snapshot || ruleSnapshot.prompt || "—"}
${post.strategy_snapshot || ruleSnapshot.strategy_notes || ""}`;

    if (rescueType === POST_RESCUE_TYPES.SOURCE_RESEARCH) {
      return `${commonHeader}

REQUIREMENTS
This is NOT a product rescue. Do not force products into the package. Research the customer's own public website and collect only factual source material that is relevant to the original post task. Verify every factual claim against a concrete HTTPS page from the customer's website. Do not invent testimonials, statistics, offers, prices, guarantees, opening hours, product facts or other claims.

DELIVER AN ACTUAL ZIP FILE containing manifest.json. No image files are required.

manifest.json must be valid JSON with:
{
  "version": 3,
  "source_type": "chatgpt_rescue",
  "rescue_type": "source_research",
  "post_type": ${JSON.stringify(post.content_type_id || post.content_format || "post")},
  "website_url": ${JSON.stringify(post.brand_website_url || post.source_url || "")},
  "campaign_goal": ${JSON.stringify(campaignGoal || post.work_item?.plan_name || "")},
  "theme": ${JSON.stringify(campaignTheme || strategy)},
  "language": ${JSON.stringify(language)},
  "verified_context": {
    "summary": "Short factual summary that gives Spreelo enough verified context to create this post without fetching the blocked website again.",
    "key_facts": ["Verified fact 1", "Verified fact 2"],
    "audience_or_use_case": "Only when supported by the website; otherwise empty string",
    "content_notes": "Any task-specific factual guidance needed for this exact post"
  },
  "sources": [
    {
      "url": "https://customer.example/relevant-page",
      "supports": "Which facts in verified_context this page verifies"
    }
  ]
}

SOURCE RULES: Use direct HTTPS pages from the customer's own website whenever possible. Every key fact must be supported by at least one listed source. If the website does not contain enough verified information for the requested post, say so instead of inventing material.`;
    }

    const typeInstruction = rescueType === POST_RESCUE_TYPES.PRODUCT_CAROUSEL
      ? "Find exactly five different products that work together as one coherent carousel selection."
      : rescueType === POST_RESCUE_TYPES.PRODUCT_REEL
        ? "Find exactly one verified product. Spreelo will rebuild the animated Product Reel from this authoritative product after import."
        : rescueType === POST_RESCUE_TYPES.AI_PRODUCT_VIDEO
          ? "Find exactly one verified product. Spreelo will create a NEW rescue video post and allow exactly one fresh provider video generation on that new post; never retry the already failed post."
          : "Find exactly one verified product for this post.";

    return `${commonHeader}
Required product count: ${count}

REQUIREMENTS
${typeInstruction}
Products must be real products from the customer's own website. For every product, verify that product name, product URL and product image belong to exactly the same product. Do not use category images, images from other products or AI-generated replacement images. Use the best available real product image. Include price only when it can be verified. Write a short factual product description without inventing attributes. ${count > 1 ? "The five products must work together as a set, not merely match individually." : ""}

DELIVER AN ACTUAL ZIP FILE. The ZIP must always contain manifest.json. Real product image files may also be included when available, but they are no longer required.

Minimum valid structure:
rescue-package.zip
└── manifest.json

Optional structure when product images are packaged too:
rescue-package.zip
├── manifest.json
${Array.from({ length: count }, (_, i) => `├── product-${i + 1}.jpg`).join("\n")}

For every product, the manifest must contain either:
- image_file: the filename of the real product image inside the ZIP, OR
- image_url: a direct HTTPS URL to the verified real product image from the customer's website/CDN.

If both image_file and image_url exist, Spreelo uses image_file first. If only image_url exists, Spreelo downloads it during import, verifies that it is a readable JPG/PNG/WEBP and saves its own copy in Spreelo Storage before preview. Do NOT use a product page URL as image_url; it must be the direct image asset.

manifest.json must be valid JSON with:
{
  "version": 3,
  "source_type": "chatgpt_rescue",
  "rescue_type": ${JSON.stringify(rescueType)},
  "post_type": ${JSON.stringify(post.content_type_id || post.content_format || "product_post")},
  "website_url": ${JSON.stringify(post.brand_website_url || post.source_url || "")},
  "campaign_goal": ${JSON.stringify(campaignGoal || post.work_item?.plan_name || "")},
  "theme": ${JSON.stringify(campaignTheme || strategy)},
  "language": ${JSON.stringify(language)},
  "products": [
    {
      "slot": 1,
      "product_name": "...",
      "product_url": "https://...",
      "article_number": "...",
      "price": "...",
      "currency": "SEK",
      "description": "...",
      "brand": "...",
      "product_type": "...",
      "color": "...",
      "image_url": "https://customer-cdn.example/path/real-product-image.jpg",
      "verification_note": "Short explanation of how the product and main image were verified as the same product"
    }
  ]
}

IMAGE_URL REQUIREMENT: direct HTTPS image from the customer's website or its real CDN, not a search-result thumbnail, not a proxy/cache from another service and not an AI-generated image. If you can attach the image file inside the ZIP, you may use image_file instead. If you cannot verify ${count} complete product${count === 1 ? "" : "s"} with the correct product link and real product image, say so instead of filling the package with uncertain material.`;
  }

  async function copyRescuePromptAndOpenChatGpt() {
    if (!selectedPost) return;
    const prompt = buildRescuePrompt(selectedPost);
    setRescueError("");
    setRescueMessage("");
    // Open the tab synchronously from the click so normal popup blockers do not
    // reject it after the asynchronous clipboard permission step.
    window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
    try {
      await navigator.clipboard.writeText(prompt);
      setRescueMessage(t("admin.approvals.rescuePromptCopied"));
    } catch {
      setRescueError(t("admin.approvals.rescuePromptCopyFailed"));
    }
  }

  function downloadRescueBrief() {
    if (!selectedPost) return;
    const prompt = buildRescuePrompt(selectedPost);
    const payload = {
      work_item_id: selectedPost.work_item_id || null,
      brand_name: selectedPost.brand_name || null,
      website_url: selectedPost.brand_website_url || selectedPost.source_url || null,
      content_type_id: selectedPost.content_type_id || null,
      content_type_label: selectedPost.content_type_label || selectedPost.post_type || null,
      content_format: selectedPost.content_format || null,
      platform: selectedPost.platform || null,
      scheduled_for: selectedPost.scheduled_for || null,
      rescue_type: resolvePostRescueType(selectedPost),
      requirement_count: getPostRescueProductCount(selectedPost),
      product_strategy: selectedPost.product_strategy || null,
      product_match_terms: selectedPost.product_match_terms || [],
      product_search_queries: selectedPost.product_search_queries || [],
      failure: selectedPost.failure || null,
      prompt,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `spreelo-rescue-${selectedPost.work_item_id || selectedPost.occurrence_id || "job"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importRescueZip(file) {
    if (!file || !selectedPost?.work_item_id) return;
    setRescueUploading(true);
    setRescueError("");
    setRescueMessage("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const form = new FormData();
      form.append("work_item_id", selectedPost.work_item_id);
      form.append("file", file);
      const response = await fetch("/api/admin/post-approvals/rescue-import", {
        method: "POST",
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        body: form,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || "Rescue-ZIP kunde inte importeras.");
      if (result.rescue_type === POST_RESCUE_TYPES.SOURCE_RESEARCH) {
        setMaterials([]);
        setEditorDirty(false);
        setProductDirty(false);
        setRescueMessage(t("admin.approvals.rescueSourcesImported", { count: result.source_count || 0 }));
      } else {
        setMaterials((result.products || []).map((item) => ({ ...emptyCarouselProduct(), ...item })));
        setEditorDirty(true);
        setProductDirty(true);
        setManualEditingIndices([]);
        setRescueMessage(t("admin.approvals.rescueProductsImported", { count: result.product_count }));
      }
      await loadPosts(selectedPost.id);
      setSelectedPostId(selectedPost.id);
    } catch (uploadError) {
      setRescueError(uploadError.message || "Rescue-ZIP kunde inte importeras.");
    } finally {
      setRescueUploading(false);
    }
  }

  async function archiveSelected(ids) {
    const postIds = ids.filter((id) => !isSyntheticAdminCaseId(id));
    if (!postIds.length) return;
    try {
      await runAdminAction({ action: "bulk_archive", post_ids: postIds });
      setSelectedIds([]); setSelectedPostId(""); await loadPosts();
    } catch (actionError) { setError(actionError.message); }
  }

  async function cancelFailedOccurrenceAndRefund() {
    if (!selectedPost?.occurrence_id || selectedPost?.is_admin_test) return;

    const refundedCredits = Math.max(0, Number(selectedPost?.failure?.refunded_credits || 0));
    const heldCredits = Math.max(0, Number(selectedPost?.failure?.held_rescue_credits || selectedPost?.failure?.rescue_credit_cost || 0));
    const notificationStatus = String(selectedPost?.failure?.notification_status || "").toLowerCase();
    const alreadyRefunded = refundedCredits > 0;
    const creditsLabel = alreadyRefunded ? refundedCredits : heldCredits;
    const prompt = alreadyRefunded && notificationStatus !== "sent"
      ? t("admin.approvals.retryCustomerEmailConfirm", { credits: creditsLabel > 0 ? creditsLabel : "" })
      : t("admin.approvals.cancelRefundConfirm", { credits: creditsLabel || t("admin.approvals.reservedCredit") });

    if (!window.confirm(prompt)) return;

    setCancellingFailedOccurrenceId(selectedPost.occurrence_id);
    setRefundActionMessage("");
    setRefundActionError("");
    try {
      const response = await fetch("/api/admin/post-approvals/cancel-refund", {
        method: "POST",
        headers: await getHeaders(),
        body: JSON.stringify({ occurrence_id: selectedPost.occurrence_id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        if (result?.refund_applied) {
          setRefundActionError(result?.error || t("admin.approvals.refundedEmailFailed"));
          await loadPosts(selectedPost.id);
          return;
        }
        throw new Error(result?.error || t("admin.approvals.cancelRefundFailed"));
      }

      setRefundActionMessage(t("admin.approvals.refundDone", { credits: Number(result.refunded_credits || 0), locale: String(result.locale || t("admin.approvals.customerAppLanguage")) }));
      await loadPosts();
      setSelectedPostId("");
    } catch (refundError) {
      setRefundActionError(refundError?.message || t("admin.approvals.cancelRefundFailed"));
    } finally {
      setCancellingFailedOccurrenceId("");
    }
  }

  async function setBrandPolicy(required) {
    if (!selectedPost?.brand_profile_id) return;
    try {
      await runAdminAction({ action: "set_brand_review_policy", brand_profile_id: selectedPost.brand_profile_id, admin_review_required: required });
      await loadPosts();
    } catch (actionError) { setError(actionError.message); }
  }

  function updateDraft(id, changes) {
    setDrafts((current) => ({ ...current, [id]: { ...(current[id] || {}), ...changes } }));
  }

  async function saveReview(feedbackId) {
    setSavingId(feedbackId);
    setError("");
    try {
      const headers = await getHeaders();
      const response = await fetch("/api/admin/post-approvals", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ feedback_id: feedbackId, ...(drafts[feedbackId] || {}) }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t("admin.approvals.saveError"));
      await loadPosts();
    } catch (saveError) {
      setError(saveError.message || t("admin.approvals.saveError"));
    } finally {
      setSavingId("");
    }
  }

  return (
    <AppLayout active="admin">
      <div className="admin-page admin-approvals-page admin-v74-approvals-page admin-v14401-workbench">
        <header className="admin-hero compact">
          <div>
            <span className="admin-eyebrow">{t("admin.approvals.kicker")}</span>
            <h1>{t("admin.approvals.title")}</h1>
            <p>{t("admin.approvals.description")}</p>
          </div>
          <button type="button" className="admin-primary-button" onClick={() => loadPosts()}>
            <RefreshCw size={16} /> {t("admin.retry")}
          </button>
        </header>

        <section className={`admin-review-gate-card ${reviewGateEnabled ? "enabled" : ""}`}>
          <div>
            <span>{t("admin.approvals.reviewGateEyebrow")}</span>
            <strong>{t("admin.approvals.reviewGateTitle")}</strong>
            <p>{reviewGateEnabled ? t("admin.approvals.reviewGateOn") : t("admin.approvals.reviewGateOff")}</p>
          </div>
          <button
            type="button"
            className={`admin-review-gate-switch ${reviewGateEnabled ? "on" : ""}`}
            aria-pressed={reviewGateEnabled}
            aria-label={t("admin.approvals.reviewGateTitle")}
            disabled={savingReviewGate}
            onClick={() => updateReviewGate(!reviewGateEnabled)}
          ><span /></button>
        </section>

        <div className="admin-approval-tabs admin-v14370-review-tabs admin-v144110-icon-tabs" aria-label={t("admin.approvals.viewsAria")}>
          {ADMIN_WORKBENCH_TABS.map((value) => {
            const Icon = ADMIN_WORKBENCH_TAB_ICONS[value];
            const label = value === "upcoming" ? t("admin.approvals.upcomingTab") : value === "queue" ? t("admin.approvals.approvalTab") : value === "failed" ? t("admin.approvals.failedTab") : t("admin.approvals.history");
            const count = value === "upcoming" ? tabCounts.upcoming : value === "queue" ? tabCounts.queue : value === "failed" ? tabCounts.failed : 0;
            return (
            <button type="button" key={value} className={filter === value ? "active" : ""} onClick={() => {
              setSelectedPostId("");
              setSelectedIds([]);
              setFilter(value);
              if (typeof window !== "undefined") {
                const nextUrl = new URL(window.location.href);
                nextUrl.searchParams.set("view", value);
                window.history.replaceState({}, "", nextUrl);
              }
            }}>
              <span className="admin-v144110-tab-icon"><Icon size={21} aria-hidden="true" />{count > 0 ? <b>{count > 99 ? "99+" : count}</b> : null}</span>
              <span>{label}</span>
            </button>
            );
          })}
        </div>
        <section className="admin-v14370-queue-intro">
          <div>
            <span>{filter === "upcoming" ? t("admin.approvals.upcomingEyebrow") : filter === "history" ? t("admin.approvals.historyEyebrow") : filter === "failed" ? t("admin.approvals.failedEyebrow") : t("admin.approvals.approvalEyebrow")}</span>
            <strong>{filter === "upcoming" ? t("admin.approvals.upcomingTitle") : filter === "history" ? t("admin.approvals.historyTitle") : filter === "failed" ? t("admin.approvals.failedTitle") : t("admin.approvals.queueTitle")}</strong>
            <p>{filter === "upcoming" ? t("admin.approvals.upcomingText") : filter === "history" ? t("admin.approvals.historyText") : filter === "failed" ? t("admin.approvals.failedText") : t("admin.approvals.queueText")}</p>
          </div>
          <b>{filteredPosts.length}</b>
        </section>
        <section className="admin-v14401-toolbar">
          <label className="admin-v14401-search"><Search size={16} /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={t("admin.approvals.searchPlaceholder")} /></label>
          <label className="admin-v14401-format-filter"><span>{t("admin.approvals.format")}</span><select value={formatFilter} onChange={(event) => setFormatFilter(event.target.value)}><option value="all">{t("admin.approvals.allFormats")}</option>{availableFormats.map((format) => <option key={format} value={format}>{format}</option>)}</select></label>
          <label className="admin-v14401-format-filter"><span>{t("admin.approvals.type")}</span><select value={testFilter} onChange={(event) => setTestFilter(event.target.value)}><option value="all">{t("admin.approvals.allPosts")}</option><option value="normal">{t("admin.approvals.normalPosts")}</option><option value="tests">{t("admin.approvals.allMassTests")}</option>{availableTestBatches.map((id) => <option key={id} value={id}>{t("admin.approvals.testBatch", { id: id.slice(0, 8) })}</option>)}</select></label>
          <button type="button" className="admin-v144110-clean-testdata" onClick={cleanupCurrentAdminTestData} disabled={cleaningTestData}>
            {cleaningTestData ? <LoaderCircle className="admin-spin" size={16} /> : <Trash2 size={16} />}
            <span>{cleaningTestData ? t("admin.approvals.cleaning") : t("admin.approvals.cleanMyTestPosts")}</span>
          </button>
          <div className="admin-v14401-safety-note"><ShieldCheck size={16} /><span>{t("admin.approvals.failuresStayAdmin")}</span></div>
        </section>
        {selectedIds.length ? (
          <div className="admin-workbench-bulkbar">
            <strong>{t("admin.approvals.selectedCount", { count: selectedIds.length })}</strong>
            <button type="button" onClick={() => archiveSelected(selectedIds)}><Trash2 size={15} /> {t("admin.approvals.archiveSelected")}</button>
          </div>
        ) : null}

        {cleanupMessage ? <div className="admin-alert success">{cleanupMessage}</div> : null}
        {error ? <div className="admin-alert error">{error}</div> : null}

        {loading ? (
          <section className="admin-loading-card"><LoaderCircle className="admin-spin" size={22} /> {t("admin.approvals.loading")}</section>
        ) : filteredPosts.length === 0 ? (
          <div className="admin-empty-state"><FileCheck2 size={28} /><strong>{t("admin.approvals.empty")}</strong></div>
        ) : (
          <section className="admin-v74-approval-table admin-v14370-review-list">
            {paginatedPosts.map((post) => {
              const displayStatus = post.admin_review_status === "approved_by_spreelo"
                ? "approved_by_spreelo"
                : post.admin_review_status === "not_required" && post.approval_email_sent_at
                  ? "sent_directly"
                  : post.admin_review_status === "needs_repair" || post.admin_review_status === "failure"
                    ? "needs_repair"
                    : post.status;
              const meta = statusMeta(displayStatus, t);
              return (
                <button type="button" className="admin-v74-approval-row admin-v14370-review-row" key={post.id} onClick={() => setSelectedPostId(post.id)}>
                  {isSyntheticAdminCaseId(post.id) ? (
                    <span className="admin-v144106-work-item-dot" aria-hidden="true" />
                  ) : (
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(post.id)}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => setSelectedIds((ids) => event.target.checked ? [...ids, post.id] : ids.filter((id) => id !== post.id))}
                      aria-label={t("admin.approvals.selectPost")}
                    />
                  )}
                  <span className="admin-v14370-review-thumb">
                    {(post.slides?.[0]?.image_url || post.image_url) ? <img src={post.slides?.[0]?.image_url || post.image_url} alt="" /> : post.video_url ? <Video size={20} /> : <ImageIcon size={20} />}
                  </span>
                  <span className="admin-v14370-review-main">
                    <small>{post.platform || t("admin.approvals.platformUnknown")} · {post.content_format || post.post_type || t("admin.approvals.post")}</small>
                    <strong>{post.brand_name || t("admin.approvals.unknownBrand")} {post.is_admin_test ? <span className="sp102-approval-test-badge">{t("admin.approvals.testMassTest")}</span> : null}</strong>
                    <em>{post.admin_test_campaign ? `${post.admin_test_campaign} · ` : ""}{String(post.content || "").replace(/\s+/g, " ").slice(0, 120) || t("admin.approvals.noContent")}</em>
                  </span>
                  <span className="admin-v14370-review-time"><small>{t("admin.approvals.created")}</small><strong>{formatDate(post.created_at, locale)}</strong></span>
                  <span className="admin-v14370-review-time admin-v14412-review-cost"><small>{t("admin.approvals.generationCost")}</small><strong>{formatGenerationCost(post)}</strong></span>
                  <span className="admin-v14370-review-time"><small>{t("admin.approvals.scheduled")}</small><strong>{formatDate(post.scheduled_for, locale)}</strong></span>
                  <span className={`admin-approval-status ${meta.className}`}><meta.Icon size={15} />{meta.label}</span>
                  <span className="admin-v14370-review-open">{t("admin.approvals.reviewPost")} <ChevronRight size={18} /></span>
                </button>
              );
            })}
          </section>
        )}

        {!loading && filteredPosts.length > POSTS_PER_PAGE ? (
          <nav className="admin-review-pagination" aria-label={t("admin.approvals.paginationAria")}>
            <button type="button" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={16} /> {t("admin.approvals.previous")}</button>
            <div className="admin-review-page-numbers">
              {visiblePages.map((value, index) => (
                <span key={value}>
                  {index > 0 && value - visiblePages[index - 1] > 1 ? <i>…</i> : null}
                  <button type="button" className={value === currentPage ? "active" : ""} aria-current={value === currentPage ? "page" : undefined} onClick={() => setPage(value)}>{value}</button>
                </span>
              ))}
            </div>
            <form onSubmit={(event) => { event.preventDefault(); const requested = Math.min(totalPages, Math.max(1, Number.parseInt(pageInput, 10) || 1)); setPage(requested); }}>
              <label htmlFor="admin-review-page-input">{t("admin.approvals.goToPage")}</label>
              <input id="admin-review-page-input" type="number" min="1" max={totalPages} inputMode="numeric" value={pageInput} onChange={(event) => setPageInput(event.target.value)} />
              <button type="submit">{t("admin.approvals.go")}</button>
            </form>
            <button type="button" disabled={currentPage === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>{t("admin.approvals.next")} <ChevronRight size={16} /></button>
          </nav>
        ) : null}

        {selectedPost ? (
          <div className="admin-v74-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedPostId(""); }}>
            <section className="admin-v74-detail-modal" role="dialog" aria-modal="true" aria-label={t("admin.approvals.fullPost")}>
              <header>
                <div>
                  <span>{selectedPost.brand_name || t("admin.approvals.unknownBrand")} {selectedPost.is_admin_test ? <b className="sp102-approval-test-badge">{t("admin.approvals.testMassTest")}</b> : null}</span>
                  <h2>{t("admin.approvals.fullPost")}</h2>
                  <p>{formatDate(selectedPost.scheduled_for, locale)} · {selectedPost.platform || "—"}</p>
                </div>
                <button type="button" onClick={() => setSelectedPostId("")} aria-label={t("admin.approvals.closePost")}><X size={20} /></button>
              </header>

              <div className="admin-v74-detail-body">
                <div className="admin-v74-email-preview admin-review-workspace-main">
                  <div className="admin-v74-email-topline">{t("admin.approvals.reviewWorkspace")}</div>
                  <div className="admin-review-title-row">
                    <div>
                      <span>{selectedPost.post_type || selectedPost.content_format || t("admin.approvals.post")}</span>
                      <h3>{t("admin.approvals.qualityReview")}</h3>
                    </div>
                    <div className="admin-review-title-actions">
                      {!isCarouselPost(selectedPost) && materials[0]?.url ? (
                        <a className="admin-review-source-quick" href={materials[0].url} target="_blank" rel="noreferrer">
                          <ExternalLink size={15} /> {t("admin.approvals.openProductSource")}
                        </a>
                      ) : null}
                      {(isCarouselPost(selectedPost) || materials.length) ? (
                        <button type="button" className="admin-review-jump-products" onClick={() => document.getElementById(`admin-review-products-${selectedPost.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                          <PackageCheck size={15} /> {t("admin.approvals.editProducts")}
                        </button>
                      ) : null}
                      <span className="admin-review-post-id">{String(selectedPost.id || "").slice(0, 8)}</span>
                      {(editorDirty || productDirty) ? <span className="admin-review-unsaved">{t("admin.approvals.unsavedChanges")}</span> : null}
                    </div>
                  </div>

                  <div className="admin-review-quality-strip">
                    <div className={manualMaterialCount ? "warning" : materials.length && verifiedMaterialCount === materials.length ? "ok" : "neutral"}>
                      <ShieldCheck size={18} /><span>{t("admin.approvals.productIdentity")}</span><strong>{manualMaterialCount ? t("admin.approvals.identityWithManual", { verified: verifiedMaterialCount, manual: manualMaterialCount }) : materials.length ? `${verifiedMaterialCount}/${materials.length}` : t("admin.approvals.ready")}</strong>
                    </div>
                    <div className={lowResolutionMaterialCount ? "warning" : "ok"}>
                      <ImageIcon size={18} /><span>{t("admin.approvals.imageQuality")}</span><strong>{lowResolutionMaterialCount ? t("admin.approvals.lowResolution", { count: lowResolutionMaterialCount }) : t("admin.approvals.checked")}</strong>
                    </div>
                    <div className={lightboxItems.length ? "ok" : "neutral"}>
                      <PackageCheck size={18} /><span>{t("admin.approvals.media")}</span><strong>{lightboxItems.length ? t(lightboxItems.length === 1 ? "admin.approvals.oneImage" : "admin.approvals.imageCount", { count: lightboxItems.length }) : selectedPost.video_url ? t("admin.approvals.video") : t("admin.approvals.none")}</strong>
                    </div>
                    <div className={selectedPost.content ? "ok" : "warning"}>
                      <FileCheck2 size={18} /><span>{t("admin.approvals.postCopy")}</span><strong>{selectedPost.content ? t("admin.approvals.ready") : t("admin.approvals.missing")}</strong>
                    </div>
                  </div>

                  <MediaPreview post={selectedPost} t={t} onOpen={(index) => setLightboxIndex(index)} />

                  <section className="admin-review-copy-editor">
                    <div className="admin-review-section-heading">
                      <div><span>{t("admin.approvals.caption")}</span><strong>{t("admin.approvals.postCopy")}</strong></div>
                      <small>{t("admin.approvals.editCaptionHelp")}</small>
                    </div>
                    <textarea ref={postCopyRef} rows={8} value={postCopy} onChange={(event) => { setPostCopy(event.target.value); markEditorDirty(); }} placeholder={t("admin.approvals.noContent")} />
                  </section>

                  {isCarouselPost(selectedPost) ? (
                    <section id={`admin-review-products-${selectedPost.id}`} className="admin-carousel-editor admin-review-product-workspace">
                      <div className="admin-carousel-editor-heading">
                        <div>
                          <span>{t("admin.approvals.productSource")}</span>
                          <strong>{t("admin.approvals.fiveProductSources")}</strong>
                          <p>{t("admin.approvals.productSourceHelp")}</p>
                        </div>
                        <b className={carouselReady ? "ready" : ""}>{materials.filter(isMaterialReady).length}/5</b>
                      </div>
                      <div className="admin-carousel-product-grid admin-review-product-grid">
                        {materials.map((item, index) => {
                          const verified = item.product_identity_locked === true && item.product_image_semantic_verified === true;
                          const width = Number(item.product_image_width || 0);
                          const height = Number(item.product_image_height || 0);
                          return (
                            <article className={isMaterialReady(item) ? "complete" : "empty"} key={`${selectedPost.id}-product-${index}`}>
                              <span className="admin-carousel-number">{index + 1}</span>
                              <button type="button" className="admin-carousel-clear" onClick={() => { setMaterials((items) => items.map((row, rowIndex) => rowIndex === index ? emptyCarouselProduct() : row)); markEditorDirty({ product: true }); }} aria-label={t("admin.approvals.removeProduct")}><X size={16} /></button>
                              <div className="admin-carousel-product-image admin-review-product-image">
                                {(item.image_url || item.preview_image_url) ? <img src={item.image_url || item.preview_image_url} alt="" /> : <ImageIcon size={28} />}
                                <span className={`admin-product-verification-badge ${item.manual_override ? "manual" : verified ? "verified" : "pending"}`}>
                                  {item.manual_override ? <Pencil size={13} /> : verified ? <ShieldCheck size={13} /> : <ScanSearch size={13} />}
                                  {item.manual_override ? t("admin.approvals.manualOverride") : verified ? t("admin.approvals.verifiedSource") : t("admin.approvals.fetchFromUrl")}
                                </span>
                              </div>
                              <div className="admin-carousel-product-fields admin-review-product-fields">
                                <label className="admin-product-url-field">
                                  <span>{t("admin.approvals.replaceProductUrl")}</span>
                                  <div>
                                    <Link2 size={15} />
                                    <input value={item.url || ""} placeholder="https://.../product" onChange={(event) => {
                                      const url = event.target.value;
                                      setMaterials((items) => items.map((row, rowIndex) => rowIndex === index ? { ...emptyCarouselProduct(), url } : row));
                                      markEditorDirty({ product: true });
                                    }} />
                                    <button type="button" disabled={!item.url?.trim() || resolvingProductIndex === index} onClick={() => resolveMaterialProduct(index)}>
                                      {resolvingProductIndex === index ? <LoaderCircle className="admin-spin" size={15} /> : <ScanSearch size={15} />}
                                      {item.title ? t("admin.approvals.refresh") : t("admin.approvals.fetch")}
                                    </button>
                                  </div>
                                </label>
                                {item.title ? (
                                  <div className="admin-product-facts">
                                    <div><span>{t("admin.approvals.brand")}</span><strong>{item.product_brand || "—"}</strong></div>
                                    <div><span>{t("admin.approvals.productName")}</span><strong>{item.title}{item.url ? <a className="admin-v14401-inline-product-link" href={item.url} target="_blank" rel="noreferrer"><ExternalLink size={12} /> {t("admin.approvals.link")}</a> : null}</strong></div>
                                    <div><span>{t("admin.approvals.productType")}</span><strong>{item.product_display_type || "—"}</strong></div>
                                    <div><span>{t("admin.approvals.variant")}</span><strong>{item.product_color || "—"}</strong></div>
                                    <div><span>{t("admin.approvals.sku")}</span><strong>{item.product_identifier || "—"}</strong></div>
                                    <div><span>{t("admin.approvals.price")}</span><strong>{item.price || "—"}{item.currency && !String(item.price || "").includes(item.currency) ? ` ${item.currency}` : ""}</strong></div>
                                    <div><span>{t("admin.approvals.sourceImage")}</span><strong>{width && height ? `${width} × ${height}` : "—"}</strong></div>
                                  </div>
                                ) : <p className="admin-product-url-help">{t("admin.approvals.pasteProductUrl")}</p>}
                                <div className="admin-product-source-actions">
                                  {item.url ? <a className="admin-product-original-link" href={item.url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> {t("admin.approvals.openOriginalProduct")}</a> : null}
                                  <button type="button" className="admin-product-manual-toggle" onClick={() => toggleManualEditor(index)}><Pencil size={14} /> {manualEditingIndices.includes(index) ? t("admin.approvals.closeManualEdit") : t("admin.approvals.editManually")}</button>
                                </div>
                                {renderManualProductEditor(item, index)}
                                <p className="admin-product-refresh-help">{t("admin.approvals.productRefreshHelp")}</p>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                      {regenerationError ? <div className="admin-alert error admin-regeneration-inline-alert"><AlertTriangle size={16} /> <span>{regenerationError}</span></div> : null}
                      {regenerationSuccess ? <div className="admin-alert success admin-regeneration-inline-alert"><CheckCircle2 size={16} /> <span>{regenerationSuccess}</span></div> : null}
                    </section>
                  ) : selectedPost.admin_product_items?.length || materials.length ? (
                    <section id={`admin-review-products-${selectedPost.id}`} className="admin-review-single-product">
                      <div className="admin-review-section-heading">
                        <div><span>{t("admin.approvals.productSource")}</span><strong>{t("admin.approvals.lockedProductObject")}</strong></div>
                        <small>{t("admin.approvals.singleProductSourceHelp")}</small>
                      </div>
                      {materials.slice(0, 1).map((item, index) => {
                        const verified = item.product_identity_locked === true && item.product_image_semantic_verified === true;
                        return (
                          <div className="admin-review-single-product-editor" key={`single-product-${index}`}>
                            <div className="admin-review-single-product-source">
                              <div className="admin-review-product-image">
                                {item.image_url ? <img src={item.image_url} alt="" /> : <ImageIcon size={30} />}
                                <span className={`admin-product-verification-badge ${item.manual_override ? "manual" : verified ? "verified" : "pending"}`}>
                                  {item.manual_override ? <Pencil size={13} /> : verified ? <ShieldCheck size={13} /> : <ScanSearch size={13} />}
                                  {item.manual_override ? t("admin.approvals.manualOverride") : verified ? t("admin.approvals.verifiedSource") : t("admin.approvals.fetchFromUrl")}
                                </span>
                              </div>
                              <label className="admin-product-url-field">
                                <span>{t("admin.approvals.replaceProductUrl")}</span>
                                <div>
                                  <Link2 size={15} />
                                  <input value={item.url || ""} placeholder="https://.../product" onChange={(event) => {
                                    const url = event.target.value;
                                    setMaterials([{ ...emptyCarouselProduct(), url }]);
                                    markEditorDirty({ product: true });
                                  }} />
                                  <button type="button" disabled={!item.url?.trim() || resolvingProductIndex === 0} onClick={() => resolveMaterialProduct(0)}>
                                    {resolvingProductIndex === 0 ? <LoaderCircle className="admin-spin" size={15} /> : <ScanSearch size={15} />}
                                    {item.title ? t("admin.approvals.refresh") : t("admin.approvals.fetch")}
                                  </button>
                                </div>
                              </label>
                            </div>
                            {item.title ? (
                              <div className="admin-product-facts admin-product-facts-single">
                                <div><span>{t("admin.approvals.brand")}</span><strong>{item.product_brand || "—"}</strong></div>
                                <div><span>{t("admin.approvals.productName")}</span><strong>{item.title || "—"}{item.url ? <a className="admin-v14401-inline-product-link" href={item.url} target="_blank" rel="noreferrer"><ExternalLink size={12} /> {t("admin.approvals.link")}</a> : null}</strong></div>
                                <div><span>{t("admin.approvals.productType")}</span><strong>{item.product_display_type || "—"}</strong></div>
                                <div><span>{t("admin.approvals.variant")}</span><strong>{item.product_color || "—"}</strong></div>
                                <div><span>{t("admin.approvals.sku")}</span><strong>{item.product_identifier || "—"}</strong></div>
                                <div><span>{t("admin.approvals.price")}</span><strong>{item.price || "—"}{item.currency && !String(item.price || "").includes(item.currency) ? ` ${item.currency}` : ""}</strong></div>
                                <div><span>{t("admin.approvals.sourceImage")}</span><strong>{item.product_image_width && item.product_image_height ? `${item.product_image_width} × ${item.product_image_height}` : "—"}</strong></div>
                              </div>
                            ) : <p className="admin-product-url-help">{t("admin.approvals.pasteProductUrl")}</p>}
                            <div className="admin-product-source-actions">
                              {item.url ? <a className="admin-product-original-link" href={item.url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> {t("admin.approvals.openOriginalProduct")}</a> : null}
                              <button type="button" className="admin-product-manual-toggle" onClick={() => toggleManualEditor(index)}><Pencil size={14} /> {manualEditingIndices.includes(index) ? t("admin.approvals.closeManualEdit") : t("admin.approvals.editManually")}</button>
                            </div>
                            {renderManualProductEditor(item, index)}
                            <p className="admin-product-refresh-help">{t("admin.approvals.productRefreshHelp")}</p>
                            {regenerationError ? <div className="admin-alert error admin-regeneration-inline-alert"><AlertTriangle size={16} /> <span>{regenerationError}</span></div> : null}
                            {regenerationSuccess ? <div className="admin-alert success admin-regeneration-inline-alert"><CheckCircle2 size={16} /> <span>{regenerationSuccess}</span></div> : null}
                          </div>
                        );
                      })}
                    </section>
                  ) : null}
                </div>

                <aside className="admin-v74-detail-meta">
                  {(() => { const meta = statusMeta(selectedPost.status, t); return <span className={`admin-approval-status ${meta.className}`}><meta.Icon size={16} />{meta.label}</span>; })()}
                  <dl>
                    <div><dt>{t("admin.approvals.created")}</dt><dd>{formatDate(selectedPost.created_at, locale)}</dd></div>
                    <div><dt>{t("admin.approvals.scheduled")}</dt><dd>{formatDate(selectedPost.scheduled_for, locale)}</dd></div>
                    <div><dt>{t("admin.approvals.platform")}</dt><dd>{selectedPost.platform || "—"}</dd></div>
                    <div><dt>{t("admin.approvals.generationCost")}</dt><dd>{formatGenerationCost(selectedPost)}</dd></div>
                  </dl>
                  {getGenerationCostEvents(selectedPost).length ? (
                    <div className="admin-v14412-cost-card">
                      <div className="admin-v14401-source-head"><strong>{t("admin.approvals.costBreakdown")}</strong><span>{selectedPost.generation_cost_complete ? t("admin.approvals.costExact") : t("admin.approvals.costPartial")}</span></div>
                      <div className="admin-v14412-cost-events">
                        {getGenerationCostEvents(selectedPost).map((event, index) => (
                          <div key={`${event.provider || "provider"}-${event.provider_request_id || index}`}>
                            <span>{formatGenerationCostEventLabel(event)}</span>
                            <strong>{event.amount == null ? `${Number(event.usage_quantity || 0).toFixed(4)} ${event.usage_unit || "units"}` : formatNativeMoney(event.amount, event.currency)}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className={`admin-brand-review-policy admin-v14401-brand-policy ${selectedPost.brand_admin_review_required === false ? "direct" : "review"}`}>
                    <div className="admin-v14401-policy-head"><strong>{t("admin.approvals.brandReviewPolicy")}</strong><span>{selectedPost.brand_admin_review_required === false ? t("admin.approvals.directDelivery") : selectedPost.brand_admin_review_required === true ? t("admin.approvals.adminFirst") : t("admin.approvals.inheritGlobal")}</span></div>
                    <p>{selectedPost.brand_admin_review_required === false ? t("admin.approvals.directDeliveryText") : t("admin.approvals.adminFirstText")}</p>
                    <div className="admin-v14401-policy-actions">
                      <button type="button" className={selectedPost.brand_admin_review_required !== false ? "active" : ""} onClick={() => setBrandPolicy(true)}><ShieldCheck size={14} /> {t("admin.approvals.review")}</button>
                      <button type="button" className={selectedPost.brand_admin_review_required === false ? "active" : ""} onClick={() => setBrandPolicy(false)}><CheckCircle2 size={14} /> {t("admin.approvals.sendSuccessfulDirectly")}</button>
                    </div>
                  </div>

                  <div className="admin-v14401-source-card">
                    <div className="admin-v14401-source-head"><strong>{t("admin.approvals.source")}</strong>{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> {t("admin.approvals.open")}</a> : null}</div>
                    <label><span>{t("admin.approvals.sourceUrl")}</span><div><Link2 size={15} /><input value={sourceUrl} onChange={(event) => { setSourceUrl(event.target.value); setEditorDirty(true); }} placeholder="https://…" /></div></label>
                    {selectedPost.brand_website_url ? <a className="admin-v14401-brand-link" href={selectedPost.brand_website_url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> {t("admin.approvals.companyWebsite")}</a> : null}
                  </div>

                  {Array.isArray(selectedPost.versions) && selectedPost.versions.length ? (
                    <div className="admin-v14401-versions-card">
                      <div className="admin-v14401-source-head"><strong>{t("admin.approvals.versionHistory")}</strong><span>{selectedPost.versions.length}</span></div>
                      <div className="admin-v14401-version-list">
                        {selectedPost.versions.slice(0, 6).map((version) => (
                          <div key={version.id}>
                            <span><strong>{t("admin.approvals.versionNumber", { number: version.version_number })}</strong><small>{formatDate(version.created_at, locale)} · {String(version.reason || "admin").replaceAll("_", " ")}</small></span>
                            <button type="button" disabled={restoringVersionId === version.id} onClick={() => restoreVersion(version.id)}>{restoringVersionId === version.id ? <LoaderCircle className="admin-spin" size={13} /> : <RotateCcw size={13} />} {t("admin.approvals.restore")}</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {selectedPost.status === "planned" ? (
                    <div className="admin-v144106-work-order-card">
                      <div className="admin-v144106-work-order-head"><Clock3 size={18} /><div><strong>{t("admin.approvals.workOrderCreated")}</strong><span>{t("admin.approvals.noContentGenerated")}</span></div></div>
                      <dl>
                        <div><dt>{t("admin.approvals.postType")}</dt><dd>{selectedPost.content_type_label || selectedPost.post_type || "—"}</dd></div>
                        <div><dt>{t("admin.approvals.format")}</dt><dd>{selectedPost.content_format || "—"}</dd></div>
                        <div><dt>{t("admin.approvals.productStrategy")}</dt><dd>{selectedPost.product_strategy || (selectedPost.product_match_terms?.length ? selectedPost.product_match_terms.join(", ") : t("admin.approvals.automatic"))}</dd></div>
                        <div><dt>{t("admin.approvals.needsFetch")}</dt><dd>{Number(selectedPost.requirement_count || 0) > 0 ? t("admin.approvals.productCount", { count: selectedPost.requirement_count }) : t("admin.approvals.websiteBrandMaterial")}</dd></div>
                      </dl>
                      {selectedPost.prompt_snapshot ? <details><summary>{t("admin.approvals.showOriginalTask")}</summary><pre>{selectedPost.prompt_snapshot}</pre></details> : null}
                    </div>
                  ) : null}

                  {selectedPost.status === "failed" && selectedPost.work_item_id ? (
                    <div className="admin-v144106-rescue-card">
                      <div className="admin-v144106-rescue-head">
                        <div><PackageCheck size={19} /><span><strong>{t("admin.approvals.aiRescue")}</strong><small>{t("admin.approvals.aiRescueText")}</small></span></div>
                        <span className={`admin-v144106-rescue-status ${selectedPost.work_item?.rescue_status || selectedPost.rescue_status || "needed"}`}>{selectedPost.work_item?.rescue_status === "ready" || selectedPost.rescue_status === "ready" ? t("admin.approvals.materialReady") : t("admin.approvals.materialNeeded")}</span>
                      </div>
                      <div className="admin-v144106-rescue-actions">
                        <button type="button" onClick={copyRescuePromptAndOpenChatGpt}><ExternalLink size={15} /> {t("admin.approvals.openTaskChatGPT")}</button>
                        <button type="button" onClick={downloadRescueBrief}><Download size={15} /> {t("admin.approvals.downloadRescueBrief")}</button>
                        <label className="admin-v144106-rescue-upload">
                          {rescueUploading ? <LoaderCircle className="admin-spin" size={15} /> : <Upload size={15} />} {rescueUploading ? t("admin.approvals.importing") : t("admin.approvals.uploadRescueZip")}
                          <input type="file" accept=".zip,application/zip" disabled={rescueUploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) importRescueZip(file); event.target.value = ""; }} />
                        </label>
                      </div>
                      {rescueMessage ? <div className="admin-alert success"><CheckCircle2 size={15} /><span>{rescueMessage}</span></div> : null}
                      {rescueError ? <div className="admin-alert error"><AlertTriangle size={15} /><span>{rescueError}</span></div> : null}
                      <details className="admin-v144106-rescue-prompt"><summary>{t("admin.approvals.showExactChatGPTTask")}</summary><pre>{buildRescuePrompt(selectedPost)}</pre></details>
                    </div>
                  ) : null}

                  {selectedPost.status === "failed" && selectedPost.occurrence_id && !selectedPost.is_admin_test && (Number(selectedPost?.failure?.held_rescue_credits || 0) > 0 || Number(selectedPost?.failure?.refunded_credits || 0) > 0) ? (
                    <div className={`admin-v144111-credit-card ${Number(selectedPost?.failure?.refunded_credits || 0) > 0 ? "refunded" : "held"}`}>
                      <div className="admin-v144111-credit-copy">
                        {Number(selectedPost?.failure?.refunded_credits || 0) > 0 ? <CheckCircle2 size={18} /> : <ShieldCheck size={18} />}
                        <span>
                          <strong>{Number(selectedPost?.failure?.refunded_credits || 0) > 0
                            ? t("admin.approvals.creditsRefunded", { count: Number(selectedPost.failure.refunded_credits) })
                            : t("admin.approvals.creditsUsedRescue", { count: Number(selectedPost?.failure?.held_rescue_credits || 0) })}</strong>
                          <small>{Number(selectedPost?.failure?.refunded_credits || 0) > 0
                            ? (String(selectedPost?.failure?.notification_status || "").toLowerCase() === "sent" ? t("admin.approvals.customerInformed") : t("admin.approvals.refundEmailRetry"))
                            : t("admin.approvals.noAutoRefundText")}</small>
                        </span>
                      </div>
                      {(selectedPost?.failure?.rescue_credit_refund_available === true || (Number(selectedPost?.failure?.refunded_credits || 0) > 0 && String(selectedPost?.failure?.notification_status || "").toLowerCase() !== "sent")) ? (
                        <button type="button" className="admin-v144111-refund-button" disabled={cancellingFailedOccurrenceId === selectedPost.occurrence_id} onClick={cancelFailedOccurrenceAndRefund}>
                          {cancellingFailedOccurrenceId === selectedPost.occurrence_id ? <LoaderCircle className="admin-spin" size={15} /> : <RotateCcw size={15} />}
                          {Number(selectedPost?.failure?.refunded_credits || 0) > 0 ? t("admin.approvals.sendCustomerEmailAgain") : t("admin.approvals.cancelRefundCredit")}
                        </button>
                      ) : null}
                      {refundActionMessage ? <div className="admin-alert success"><CheckCircle2 size={15} /><span>{refundActionMessage}</span></div> : null}
                      {refundActionError ? <div className="admin-alert error"><AlertTriangle size={15} /><span>{refundActionError}</span></div> : null}
                    </div>
                  ) : null}

                  {selectedPost.status === "failed" ? (
                    <div className="admin-generation-error-card">
                      <AlertTriangle size={20} />
                      <div>
                        <strong>{selectedKlingRejectedAudit ? t("admin.approvals.klingRejectedTitle") : t("admin.approvals.generationFailedTitle")}</strong>
                        {selectedKlingRejectedAudit ? (
                          <>
                            <p>{selectedKlingRejectedAudit.reason || selectedPost.failure?.failure_message_internal || selectedPost.video_error || t("admin.approvals.klingRejectedHelp")}</p>
                            <small>{t("admin.approvals.klingRejectedHelp")}</small>
                            <dl className="admin-kling-rejection-summary">
                              <div><dt>{t("admin.approvals.product")}</dt><dd>{selectedPost.video_background_selection?.verified_product_title || selectedPost.admin_product_items?.[0]?.title || "—"}</dd></div>
                              <div><dt>{t("admin.approvals.auditConfidence")}</dt><dd>{Number.isFinite(Number(selectedKlingRejectedAudit.confidence)) ? `${Math.round(Number(selectedKlingRejectedAudit.confidence) * 100)}%` : "—"}</dd></div>
                            </dl>
                            {getKlingAuditViolationLabels(selectedKlingRejectedAudit, t).length ? (
                              <ul className="admin-kling-rejection-violations">
                                {getKlingAuditViolationLabels(selectedKlingRejectedAudit, t).map((label, index) => <li key={`${label}-${index}`}>{label}</li>)}
                              </ul>
                            ) : null}
                            <button type="button" className="admin-primary-button" disabled={retryingKling} onClick={retryRejectedKlingVideo}>
                              {retryingKling ? <LoaderCircle className="admin-spin" size={16} /> : <RefreshCw size={16} />}
                              {t("admin.approvals.klingRetry")}
                            </button>
                          </>
                        ) : (
                          <>
                            <p>{selectedPost.video_error || `${t("admin.approvals.imageStatus")}: ${selectedPost.image_status || "—"}. ${t("admin.approvals.videoStatus")}: ${selectedPost.video_status || "—"}.`}</p>
                            <small>{t("admin.approvals.generationFailedHelp")}</small>
                          </>
                        )}
                        {selectedPost.failure ? (
                          <details className="admin-generation-error-details">
                            <summary>{t("admin.approvals.failureDetails")}</summary>
                            <dl>
                              <div><dt>{t("admin.approvals.failureStage")}</dt><dd>{selectedPost.failure.failure_stage || "—"}</dd></div>
                              <div><dt>{t("admin.approvals.failureCode")}</dt><dd>{selectedPost.failure.failure_code || "—"}</dd></div>
                              <div><dt>{t("admin.approvals.contentType")}</dt><dd>{selectedPost.failure.content_type_label || selectedPost.failure.content_format || "—"}</dd></div>
                            </dl>
                            <pre>{JSON.stringify(selectedPost.failure, null, 2)}</pre>
                          </details>
                        ) : null}
                        {selectedPost.is_admin_test && selectedPost.admin_test_batch_id && selectedPost.automation_rule_id ? (
                          <button type="button" className="sp102-copy-diagnostic" onClick={copySelectedTestDiagnostic} disabled={copyingTestDiagnostic}>
                            <ClipboardCopy size={15} /> {copyingTestDiagnostic ? t("admin.approvals.copyingFailureLog") : t("admin.approvals.copyFullTestLog")}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {!isSyntheticAdminCaseId(selectedPost.id) ? <button type="button" className="admin-archive-button" onClick={() => archiveSelected([selectedPost.id])}><Trash2 size={15} /> {t("admin.approvals.archivePost")}</button> : null}

                  {selectedPost.rejection ? (
                    <div className="admin-v74-rejection-review">
                      <strong>{t("admin.approvals.customerReason")}</strong>
                      <span>{selectedPost.rejection.reason_category}</span>
                      <p>{selectedPost.rejection.reason_text}</p>
                      <label><span>{t("admin.approvals.reviewStatus")}</span><select value={drafts[selectedPost.rejection.id]?.review_status || "new"} onChange={(event) => updateDraft(selectedPost.rejection.id, { review_status: event.target.value })}><option value="new">{t("admin.approvals.review.new")}</option><option value="reviewing">{t("admin.approvals.review.reviewing")}</option><option value="resolved">{t("admin.approvals.review.resolved")}</option></select></label>
                      <label><span>{t("admin.approvals.refundStatus")}</span><select value={drafts[selectedPost.rejection.id]?.refund_status || "pending_review"} onChange={(event) => updateDraft(selectedPost.rejection.id, { refund_status: event.target.value })}><option value="pending_review">{t("admin.approvals.refund.pending")}</option><option value="approved">{t("admin.approvals.refund.approved")}</option><option value="declined">{t("admin.approvals.refund.declined")}</option><option value="credited">{t("admin.approvals.refund.credited")}</option></select></label>
                      <label><span>{t("admin.approvals.adminNote")}</span><textarea value={drafts[selectedPost.rejection.id]?.admin_note || ""} onChange={(event) => updateDraft(selectedPost.rejection.id, { admin_note: event.target.value })} /></label>
                      <button type="button" className="admin-primary-button" disabled={savingId === selectedPost.rejection.id} onClick={() => saveReview(selectedPost.rejection.id)}>{savingId === selectedPost.rejection.id ? <LoaderCircle className="admin-spin" size={16} /> : <Save size={16} />}{t("admin.approvals.saveReview")}</button>
                    </div>
                  ) : null}
                </aside>
              </div>
              <footer className="admin-review-actionbar">
                <button type="button" className="admin-review-secondary-action" onClick={() => setSelectedPostId("")}><X size={16} /> {t("admin.approvals.close")}</button>
                <div>
                  {!isSyntheticAdminCaseId(selectedPost.id) ? (
                    <button type="button" className="admin-review-secondary-action" disabled={savingReviewChanges} onClick={saveCurrentReviewChanges}>
                      {savingReviewChanges ? <LoaderCircle className="admin-spin" size={16} /> : <Save size={16} />}
                      {t("admin.approvals.saveChanges")}
                    </button>
                  ) : null}
                  {!selectedKlingRejectedAudit && selectedPost.status !== "planned" ? (
                    <button type="button" className="admin-review-secondary-action admin-review-regenerate-action admin-v14401-regenerate-main" disabled={regenerating || (isCarouselPost(selectedPost) ? !carouselReady : materials.length ? !singleProductReady : false)} onClick={() => regenerateCurrent("all")}>
                      {regenerating ? <LoaderCircle className="admin-spin" size={16} /> : <RefreshCw size={16} />}
                      {t("admin.approvals.regeneratePost")}
                    </button>
                  ) : null}
                  {!selectedKlingRejectedAudit && selectedPost.status !== "planned" && !isCarouselPost(selectedPost) && !materials.length ? (
                    <div className="admin-v14401-partial-actions">
                      <button type="button" disabled={regenerating} onClick={() => regenerateCurrent("text")}>{t("admin.approvals.textOnly")}</button>
                      <button type="button" disabled={regenerating} onClick={() => regenerateCurrent("media")}>{t("admin.approvals.imageOnly")}</button>
                    </div>
                  ) : null}
                  {productDirty ? <span className="admin-review-regeneration-required"><AlertTriangle size={14} /> {t("admin.approvals.regenerationRequired")}</span> : editorDirty ? <span className="admin-review-regeneration-required"><AlertTriangle size={14} /> {t("admin.approvals.saveBeforeApproval")}</span> : null}
                  {selectedPost.status === "pending_approval" && !["approved_by_spreelo", "released", "not_required", "archived"].includes(String(selectedPost.admin_review_status || "").toLowerCase()) ? (
                    <button type="button" className="admin-primary-button admin-review-approve-action" disabled={releasingPostId === selectedPost.id || productDirty || editorDirty} onClick={() => releaseToCustomer(selectedPost.id)}>
                      {releasingPostId === selectedPost.id ? <LoaderCircle className="admin-spin" size={16} /> : <CheckCircle2 size={16} />}
                      {t("admin.approvals.releaseToCustomer")}
                    </button>
                  ) : null}
                </div>
              </footer>
            </section>
          </div>
        ) : null}

        {lightboxIndex !== null && lightboxItems[lightboxIndex] ? (
          <div className="admin-review-lightbox-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setLightboxIndex(null); }}>
            <section className="admin-review-lightbox" role="dialog" aria-modal="true" aria-label={t("admin.approvals.largeImageReview")}>
            <header>
              <div>
                <span>{selectedPost?.brand_name || "Spreelo"}</span>
                <strong>{lightboxItems[lightboxIndex].label}</strong>
                <small>{lightboxIndex + 1} / {lightboxItems.length}</small>
              </div>
              <div>
                {lightboxItems[lightboxIndex].productUrl ? <a href={lightboxItems[lightboxIndex].productUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} /> {t("admin.approvals.originalProduct")}</a> : null}
                <button type="button" onClick={() => setLightboxIndex(null)} aria-label={t("admin.approvals.closeImage")}><X size={21} /></button>
              </div>
            </header>
            <div className="admin-review-lightbox-stage">
              {lightboxItems.length > 1 ? <button type="button" className="previous" onClick={() => setLightboxIndex((lightboxIndex - 1 + lightboxItems.length) % lightboxItems.length)} aria-label={t("admin.approvals.previousImage")}><ChevronLeft size={26} /></button> : null}
              <img src={lightboxItems[lightboxIndex].url} alt="" />
              {lightboxItems.length > 1 ? <button type="button" className="next" onClick={() => setLightboxIndex((lightboxIndex + 1) % lightboxItems.length)} aria-label={t("admin.approvals.nextImage")}><ChevronRight size={26} /></button> : null}
            </div>
            <footer><span>{t("admin.approvals.lightboxHelp")}</span><strong><ZoomIn size={15} /> {t("admin.approvals.largePreview")}</strong></footer>
            </section>
          </div>
        ) : null}
      </div>
    </AppLayout>
  );
}

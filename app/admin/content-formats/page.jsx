"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  Check,
  CircleHelp,
  Clapperboard,
  GalleryHorizontalEnd,
  ImagePlus,
  Lightbulb,
  Link2,
  ListChecks,
  LoaderCircle,
  MapPin,
  Megaphone,
  PenLine,
  PlayCircle,
  Puzzle,
  Save,
  Scale,
  ShoppingBag,
  Sparkles,
  Tag,
  Trash2,
  Trophy,
  Wrench,
} from "lucide-react";
import AppLayout from "../../../components/AppLayout";
import { supabase } from "../../../lib/supabaseClient";
import { useUiText } from "../../../lib/i18n/useUiText";
import {
  CONTENT_FORMAT_ASSET_BUCKET,
  CONTENT_FORMAT_ICON_OPTIONS,
  DEFAULT_CONTENT_FORMAT_MAP,
} from "../../../lib/contentFormatLibrary";

const iconComponents = {
  ShoppingBag,
  Megaphone,
  PlayCircle,
  GalleryHorizontalEnd,
  Puzzle,
  Lightbulb,
  AlertTriangle,
  CircleHelp,
  Clapperboard,
  ListChecks,
  Wrench,
  Trophy,
  Sparkles,
  MapPin,
  CalendarDays,
  Scale,
  BookOpen,
  Link2,
  Tag,
  PenLine,
};

const categoryValues = ["popular", "text", "image_ads", "video", "educational", "sales"];

async function getAdminHeaders(includeJson = true) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};

  if (includeJson) headers["Content-Type"] = "application/json";
  return headers;
}

function FormatIcon({ name, size = 22 }) {
  const Icon = iconComponents[name] || Sparkles;
  return <Icon size={size} strokeWidth={1.9} aria-hidden="true" />;
}

export default function AdminContentFormatsPage() {
  const { t } = useUiText(["admin"]);
  const [formats, setFormats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState("");
  const [uploadingId, setUploadingId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadFormats();
  }, []);

  async function loadFormats() {
    setLoading(true);
    setError("");

    try {
      const headers = await getAdminHeaders();
      const response = await fetch("/api/admin/content-formats", { headers });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t("admin.formats.loadError"));
      setFormats(payload?.formats || []);
    } catch (loadError) {
      setError(loadError.message || t("admin.formats.loadError"));
    } finally {
      setLoading(false);
    }
  }

  function updateFormat(contentTypeId, changes) {
    setFormats((current) =>
      current.map((item) =>
        item.content_type_id === contentTypeId ? { ...item, ...changes } : item
      )
    );
  }

  async function saveFormat(item, overrides = {}) {
    const nextItem = { ...item, ...overrides };
    setSavingId(item.content_type_id);
    setMessage("");

    try {
      const headers = await getAdminHeaders();
      const response = await fetch("/api/admin/content-formats", {
        method: "PATCH",
        headers,
        body: JSON.stringify(nextItem),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t("admin.formats.saveError"));
      updateFormat(item.content_type_id, payload.format || nextItem);
      setMessage(t("admin.formats.saved", { name: DEFAULT_CONTENT_FORMAT_MAP[item.content_type_id]?.default_label || item.content_type_id }));
    } catch (saveError) {
      setMessage(saveError.message || t("admin.formats.saveError"));
    } finally {
      setSavingId("");
    }
  }

  async function uploadImage(item, file) {
    if (!file) return;
    setUploadingId(item.content_type_id);
    setMessage("");

    try {
      const headers = await getAdminHeaders();
      const createResponse = await fetch("/api/admin/content-formats", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "create_upload",
          content_type_id: item.content_type_id,
          contentType: file.type,
          size: file.size,
        }),
      });
      const createPayload = await createResponse.json().catch(() => ({}));
      if (!createResponse.ok) throw new Error(createPayload?.error || t("admin.formats.prepareUploadError"));

      const upload = createPayload?.upload;
      const { error: uploadError } = await supabase.storage
        .from(CONTENT_FORMAT_ASSET_BUCKET)
        .uploadToSignedUrl(upload.path, upload.token, file, {
          contentType: file.type,
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage
        .from(CONTENT_FORMAT_ASSET_BUCKET)
        .getPublicUrl(upload.path);

      await saveFormat(item, {
        image_storage_path: upload.path,
        image_url: publicData?.publicUrl || "",
      });
    } catch (uploadError) {
      setMessage(uploadError.message || t("admin.formats.uploadError"));
    } finally {
      setUploadingId("");
    }
  }

  const featuredCount = useMemo(
    () => formats.filter((item) => item.is_featured && item.active).length,
    [formats]
  );

  return (
    <AppLayout active="admin">
      <div className="admin-page admin-format-library-page">
        <header className="admin-hero admin-format-library-hero">
          <div>
            <span className="admin-eyebrow">{t("admin.formats.kicker")}</span>
            <h1>{t("admin.formats.title")}</h1>
            <p>{t("admin.formats.description")}</p>
          </div>
          <div className="admin-format-library-count">
            <strong>{featuredCount}</strong>
            <span>{t("admin.formats.featuredCount")}</span>
          </div>
        </header>

        {error ? (
          <div className="admin-alert error">
            <AlertTriangle size={19} aria-hidden="true" />
            <div>
              <strong>{t("admin.formats.loadErrorTitle")}</strong>
              <span>{error}</span>
            </div>
          </div>
        ) : null}

        {message ? <div className="admin-translation-message">{message}</div> : null}

        {loading ? (
          <section className="admin-loading-card">
            <LoaderCircle className="admin-spin" size={22} aria-hidden="true" />
            {t("admin.formats.loading")}
          </section>
        ) : (
          <section className="admin-format-grid">
            {formats.map((item) => {
              const defaults = DEFAULT_CONTENT_FORMAT_MAP[item.content_type_id] || {};
              const busy = savingId === item.content_type_id || uploadingId === item.content_type_id;

              return (
                <article className="admin-format-card" key={item.content_type_id}>
                  <div className="admin-format-preview">
                    {item.image_url ? (
                      <img src={item.image_url} alt="" />
                    ) : (
                      <span><FormatIcon name={item.icon_name} size={30} /></span>
                    )}
                    <label className="admin-format-upload-button">
                      {uploadingId === item.content_type_id ? (
                        <LoaderCircle className="admin-spin" size={16} aria-hidden="true" />
                      ) : (
                        <ImagePlus size={16} aria-hidden="true" />
                      )}
                      {t("admin.formats.changeImage")}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(event) => uploadImage(item, event.target.files?.[0])}
                        disabled={busy}
                      />
                    </label>
                  </div>

                  <div className="admin-format-card-heading">
                    <div>
                      <span>{item.content_type_id}</span>
                      <h2>{defaults.default_label || item.content_type_id}</h2>
                    </div>
                    <label className="admin-format-switch">
                      <input
                        type="checkbox"
                        checked={Boolean(item.active)}
                        onChange={(event) => updateFormat(item.content_type_id, { active: event.target.checked })}
                      />
                      <span /> {t("admin.formats.active")}
                    </label>
                  </div>

                  <div className="admin-format-fields">
                    <label>
                      <span>{t("admin.formats.icon")}</span>
                      <select
                        value={item.icon_name || defaults.icon_name}
                        onChange={(event) => updateFormat(item.content_type_id, { icon_name: event.target.value })}
                      >
                        {CONTENT_FORMAT_ICON_OPTIONS.map((iconName) => (
                          <option value={iconName} key={iconName}>{iconName}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>{t("admin.formats.category")}</span>
                      <select
                        value={item.category || defaults.category}
                        onChange={(event) => updateFormat(item.content_type_id, { category: event.target.value })}
                      >
                        {categoryValues.map((value) => (
                          <option value={value} key={value}>{t(`admin.formats.category.${value}`)}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>{t("admin.formats.order")}</span>
                      <input
                        type="number"
                        min="0"
                        max="9999"
                        value={item.sort_order ?? defaults.sort_order}
                        onChange={(event) => updateFormat(item.content_type_id, { sort_order: Number(event.target.value) })}
                      />
                    </label>
                  </div>

                  <label className="admin-format-featured">
                    <input
                      type="checkbox"
                      checked={Boolean(item.is_featured)}
                      onChange={(event) => updateFormat(item.content_type_id, { is_featured: event.target.checked })}
                    />
                    <span className="admin-language-checkbox">
                      {item.is_featured ? <Check size={15} aria-hidden="true" /> : null}
                    </span>
                    {t("admin.formats.featured") }
                  </label>

                  <div className="admin-format-actions">
                    {item.image_url ? (
                      <button
                        type="button"
                        className="admin-format-remove-image"
                        onClick={() => saveFormat(item, { image_url: null, image_storage_path: null })}
                        disabled={busy}
                      >
                        <Trash2 size={15} aria-hidden="true" /> {t("admin.formats.removeImage")}
                      </button>
                    ) : <span />}
                    <button
                      type="button"
                      className="admin-primary-button"
                      onClick={() => saveFormat(item)}
                      disabled={busy}
                    >
                      {savingId === item.content_type_id ? (
                        <LoaderCircle className="admin-spin" size={16} aria-hidden="true" />
                      ) : (
                        <Save size={16} aria-hidden="true" />
                      )}
                      {t("admin.formats.save")}
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </AppLayout>
  );
}

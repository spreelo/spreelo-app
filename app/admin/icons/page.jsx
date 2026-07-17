"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
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

async function getAdminHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token
    ? {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      }
    : { "Content-Type": "application/json" };
}

function SystemIcon({ name, size = 25 }) {
  const Icon = iconComponents[name] || Sparkles;
  return <Icon size={size} strokeWidth={1.9} aria-hidden="true" />;
}

export default function AdminIconsPage() {
  const { t } = useUiText(["admin"]);
  const [formats, setFormats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
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
      if (!response.ok) throw new Error(payload?.error || t("admin.icons.loadError"));
      setFormats(payload?.formats || []);
    } catch (loadError) {
      setError(loadError.message || t("admin.icons.loadError"));
    } finally {
      setLoading(false);
    }
  }

  function updateLocal(contentTypeId, changes) {
    setFormats((current) =>
      current.map((item) =>
        item.content_type_id === contentTypeId ? { ...item, ...changes } : item
      )
    );
  }

  async function save(item, overrides = {}) {
    const nextItem = { ...item, ...overrides };
    setBusyId(item.content_type_id);
    setMessage("");
    try {
      const headers = await getAdminHeaders();
      const response = await fetch("/api/admin/content-formats", {
        method: "PATCH",
        headers,
        body: JSON.stringify(nextItem),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t("admin.icons.saveError"));
      updateLocal(item.content_type_id, payload?.format || nextItem);
      setMessage(
        t("admin.icons.saved", {
          name:
            DEFAULT_CONTENT_FORMAT_MAP[item.content_type_id]?.default_label ||
            item.content_type_id,
        })
      );
    } catch (saveError) {
      setMessage(saveError.message || t("admin.icons.saveError"));
    } finally {
      setBusyId("");
    }
  }

  async function uploadIcon(item, file) {
    if (!file) return;
    setBusyId(item.content_type_id);
    setMessage("");
    try {
      const headers = await getAdminHeaders();
      const prepareResponse = await fetch("/api/admin/content-formats", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "create_icon_upload",
          content_type_id: item.content_type_id,
          contentType: file.type,
          size: file.size,
        }),
      });
      const preparePayload = await prepareResponse.json().catch(() => ({}));
      if (!prepareResponse.ok) {
        throw new Error(preparePayload?.error || t("admin.icons.uploadError"));
      }

      const upload = preparePayload?.upload;
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

      await save(item, {
        icon_url: publicData?.publicUrl || "",
        icon_storage_path: upload.path,
      });
    } catch (uploadError) {
      setMessage(uploadError.message || t("admin.icons.uploadError"));
      setBusyId("");
    }
  }

  return (
    <AppLayout active="admin">
      <div className="admin-page admin-icons-page">
        <header className="admin-hero compact">
          <div>
            <span className="admin-eyebrow">{t("admin.icons.kicker")}</span>
            <h1>{t("admin.icons.title")}</h1>
            <p>{t("admin.icons.description")}</p>
          </div>
        </header>

        {error ? <div className="admin-alert error">{error}</div> : null}
        {message ? <div className="admin-alert success">{message}</div> : null}

        {loading ? (
          <section className="admin-loading-card">
            <LoaderCircle className="admin-spin" size={22} aria-hidden="true" />
            {t("admin.icons.loading")}
          </section>
        ) : (
          <section className="admin-icon-library-grid">
            {formats.map((item) => {
              const defaults = DEFAULT_CONTENT_FORMAT_MAP[item.content_type_id] || {};
              const busy = busyId === item.content_type_id;
              return (
                <article className="admin-icon-library-card" key={item.content_type_id}>
                  <div className="admin-icon-preview">
                    {item.icon_url ? (
                      <img src={item.icon_url} alt="" />
                    ) : (
                      <SystemIcon name={item.icon_name || defaults.icon_name} />
                    )}
                  </div>

                  <div className="admin-icon-card-copy">
                    <small>{item.content_type_id}</small>
                    <h2>{defaults.default_label || item.content_type_id}</h2>
                  </div>

                  <label>
                    <span>{t("admin.icons.systemIcon")}</span>
                    <select
                      value={item.icon_name || defaults.icon_name}
                      onChange={(event) =>
                        updateLocal(item.content_type_id, {
                          icon_name: event.target.value,
                        })
                      }
                    >
                      {CONTENT_FORMAT_ICON_OPTIONS.map((name) => (
                        <option value={name} key={name}>{name}</option>
                      ))}
                    </select>
                  </label>

                  <div className="admin-icon-actions">
                    <label className="admin-upload-button">
                      {busy ? <LoaderCircle className="admin-spin" size={16} /> : <ImagePlus size={16} />}
                      {t("admin.icons.upload")}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={busy}
                        onChange={(event) => uploadIcon(item, event.target.files?.[0])}
                      />
                    </label>
                    {item.icon_url ? (
                      <button
                        type="button"
                        className="admin-format-remove-image"
                        disabled={busy}
                        onClick={() => save(item, { icon_url: null, icon_storage_path: null })}
                      >
                        <Trash2 size={15} /> {t("admin.icons.remove")}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="admin-primary-button"
                      disabled={busy}
                      onClick={() => save(item)}
                    >
                      <Save size={16} /> {t("admin.icons.save")}
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

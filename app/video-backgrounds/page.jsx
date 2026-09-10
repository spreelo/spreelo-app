"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Film,
  Loader2,
  Pencil,
  ShieldAlert,
  Star,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import AppLayout from "../../components/AppLayout";
import { supabase } from "../../lib/supabaseClient";
import { useUiText } from "../../lib/i18n/useUiText";

const EMPTY_FORM = {
  name: "",
  family: "abstract",
  moods: "premium, calm, minimal",
  industries: "fashion, beauty, jewelry, home",
  campaigns: "product, brand, launch",
  colors: "cream, beige, white",
  brightness: "light",
  energy: "low",
  season: "all",
  priority: 0,
  text_safe: true,
  logo_safe: true,
  crop_safe_916: true,
  active: true,
  is_fallback: false,
  notes: "",
};

async function getAuthHeaders(t) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error(t("videoBackgrounds.sessionExpired"));
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
}

function getVideoMetadata(file, t) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      resolve({
        duration: Number(video.duration || 0),
        width: Number(video.videoWidth || 0),
        height: Number(video.videoHeight || 0),
        video,
        objectUrl,
      });
    };

    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(t("videoBackgrounds.readError")));
    };

    video.src = objectUrl;
  });
}

function createPosterBlob(video, objectUrl, t) {
  return new Promise((resolve, reject) => {
    const capture = () => {
      try {
        const canvas = document.createElement("canvas");
        const width = 540;
        const height = 960;
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.drawImage(video, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl);
            if (blob) resolve(blob);
            else reject(new Error(t("videoBackgrounds.posterError")));
          },
          "image/jpeg",
          0.88
        );
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        reject(error);
      }
    };

    video.onseeked = capture;
    video.currentTime = Math.min(0.12, Math.max(0, Number(video.duration || 0) / 2));
  });
}

function formatTags(values) {
  return (Array.isArray(values) ? values : []).join(", ");
}

export default function VideoBackgroundsPage() {
  const { t } = useUiText(["videoBackgrounds"]);
  const [assets, setAssets] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [configurationMissing, setConfigurationMissing] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const activeCount = useMemo(
    () => assets.filter((asset) => asset.active !== false).length,
    [assets]
  );

  useEffect(() => {
    loadAssets();
  }, []);

  async function loadAssets() {
    setLoading(true);
    setError("");

    try {
      const headers = await getAuthHeaders(t);
      const response = await fetch("/api/video-backgrounds", { headers });
      const payload = await response.json();

      if (!response.ok) {
        setConfigurationMissing(Boolean(payload?.configurationMissing));
        throw new Error(t("videoBackgrounds.loadError"));
      }

      setAssets(payload.assets || []);
    } catch (loadError) {
      setError(loadError.message || t("videoBackgrounds.loadError"));
    } finally {
      setLoading(false);
    }
  }

  function updateForm(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleUpload(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!file) {
      setError(t("videoBackgrounds.chooseFile"));
      return;
    }

    if (!form.name.trim()) {
      setError(t("videoBackgrounds.editNameRequired"));
      return;
    }

    setUploading(true);

    try {
      const metadata = await getVideoMetadata(file, t);

      if (metadata.width !== 1080 || metadata.height !== 1920) {
        URL.revokeObjectURL(metadata.objectUrl);
        throw new Error(t("videoBackgrounds.sizeError"));
      }

      if (metadata.duration < 4.5 || metadata.duration > 15.5) {
        URL.revokeObjectURL(metadata.objectUrl);
        throw new Error(t("videoBackgrounds.durationError"));
      }

      const posterBlob = await createPosterBlob(metadata.video, metadata.objectUrl, t);
      const headers = await getAuthHeaders(t);
      const createResponse = await fetch("/api/video-backgrounds", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "create_upload",
          filename: file.name,
          contentType: file.type || "video/mp4",
          size: file.size,
        }),
      });
      const uploadData = await createResponse.json();

      if (!createResponse.ok) {
        throw new Error(t("videoBackgrounds.prepareError"));
      }

      const videoUpload = await supabase.storage
        .from("video-backgrounds")
        .uploadToSignedUrl(uploadData.video.path, uploadData.video.token, file, {
          contentType: "video/mp4",
        });

      if (videoUpload.error) throw videoUpload.error;

      const posterUpload = await supabase.storage
        .from("video-backgrounds")
        .uploadToSignedUrl(uploadData.poster.path, uploadData.poster.token, posterBlob, {
          contentType: "image/jpeg",
        });

      if (posterUpload.error) throw posterUpload.error;

      const completeResponse = await fetch("/api/video-backgrounds", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "complete_upload",
          assetId: uploadData.assetId,
          storage_path: uploadData.video.path,
          poster_storage_path: uploadData.poster.path,
          ...form,
          duration_seconds: metadata.duration,
          width: metadata.width,
          height: metadata.height,
        }),
      });
      const completeData = await completeResponse.json();

      if (!completeResponse.ok) {
        throw new Error(t("videoBackgrounds.saveMetadataError"));
      }

      setAssets((current) => [completeData.asset, ...current]);
      setForm(EMPTY_FORM);
      setFile(null);
      const input = document.getElementById("video-background-file");
      if (input) input.value = "";
      setMessage(t("videoBackgrounds.uploadSuccess"));
    } catch (uploadError) {
      setError(uploadError.message || t("videoBackgrounds.uploadError"));
    } finally {
      setUploading(false);
    }
  }

  async function patchAsset(asset, changes) {
    setError("");
    setMessage("");

    try {
      const headers = await getAuthHeaders(t);
      const response = await fetch("/api/video-backgrounds", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          ...asset,
          ...changes,
          moods: changes.moods ?? asset.moods,
          industries: changes.industries ?? asset.industries,
          campaigns: changes.campaigns ?? asset.campaigns,
          colors: changes.colors ?? asset.colors,
        }),
      });
      const payload = await response.json();

      if (!response.ok) throw new Error(t("videoBackgrounds.updateError"));

      setAssets((current) =>
        current.map((item) => {
          if (payload.asset.is_fallback && item.id !== payload.asset.id) {
            return { ...item, is_fallback: false };
          }
          return item.id === payload.asset.id ? payload.asset : item;
        })
      );
    } catch (updateError) {
      setError(updateError.message || t("videoBackgrounds.updateError"));
    }
  }

  function openEditAsset(asset) {
    setEditingAsset(asset);
    setEditForm({
      name: asset.name || "",
      family: asset.family || "abstract",
      moods: formatTags(asset.moods),
      industries: formatTags(asset.industries),
      campaigns: formatTags(asset.campaigns),
      colors: formatTags(asset.colors),
      brightness: asset.brightness || "medium",
      energy: asset.energy || "low",
      season: asset.season || "all",
      priority: Number(asset.priority || 0),
      text_safe: asset.text_safe !== false,
      logo_safe: asset.logo_safe !== false,
      crop_safe_916: asset.crop_safe_916 !== false,
      active: asset.active !== false,
      is_fallback: Boolean(asset.is_fallback),
      notes: asset.notes || "",
    });
    setError("");
    setMessage("");
  }

  function updateEditForm(key, value) {
    setEditForm((current) => ({ ...current, [key]: value }));
  }

  async function saveEditedAsset(event) {
    event.preventDefault();
    if (!editingAsset || !editForm) return;

    if (!String(editForm.name || "").trim()) {
      setError(t("videoBackgrounds.editNameRequired"));
      return;
    }

    setSavingEdit(true);
    setError("");
    setMessage("");

    try {
      const headers = await getAuthHeaders(t);
      const response = await fetch("/api/video-backgrounds", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          ...editingAsset,
          ...editForm,
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || t("videoBackgrounds.editError"));
      }

      setAssets((current) =>
        current.map((item) => {
          if (payload.asset.is_fallback && item.id !== payload.asset.id) {
            return { ...item, is_fallback: false };
          }
          return item.id === payload.asset.id ? payload.asset : item;
        })
      );
      setEditingAsset(null);
      setEditForm(null);
      setMessage(t("videoBackgrounds.editSuccess"));
    } catch (saveError) {
      setError(saveError.message || t("videoBackgrounds.editError"));
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteAsset(asset) {
    const confirmed = window.confirm(
      t("videoBackgrounds.deleteConfirm", { name: asset.name })
    );
    if (!confirmed) return;

    setError("");

    try {
      const headers = await getAuthHeaders(t);
      const response = await fetch(`/api/video-backgrounds?id=${encodeURIComponent(asset.id)}`, {
        method: "DELETE",
        headers,
      });
      const payload = await response.json();

      if (!response.ok) throw new Error(t("videoBackgrounds.deleteError"));

      setAssets((current) => current.filter((item) => item.id !== asset.id));
    } catch (deleteError) {
      setError(deleteError.message || t("videoBackgrounds.deleteError"));
    }
  }

  return (
    <AppLayout active="admin">
      <div className="video-background-page">
        <section className="video-background-hero">
          <div>
            <span className="video-background-eyebrow">{t("videoBackgrounds.eyebrow")}</span>
            <h1>{t("videoBackgrounds.title")}</h1>
            <p>{t("videoBackgrounds.description")}</p>
          </div>
          <div className="video-background-summary">
            <strong>{assets.length}</strong>
            <span>{t("videoBackgrounds.activeCount", { count: activeCount })}</span>
          </div>
        </section>

        {configurationMissing && (
          <div className="video-background-alert warning">
            <ShieldAlert size={20} />
            <div>
              <strong>{t("videoBackgrounds.adminMissingTitle")}</strong>
              <p>{t("videoBackgrounds.adminMissingText")} <code>SPREELO_PRIMARY_ADMIN_EMAIL</code> / <code>SPREELO_ADMIN_EMAILS</code>.</p>
            </div>
          </div>
        )}

        {error && <div className="video-background-alert error">{error}</div>}
        {message && (
          <div className="video-background-alert success">
            <CheckCircle2 size={18} /> {message}
          </div>
        )}

        <section className="video-background-panel">
          <div className="video-background-panel-heading">
            <div>
              <span>{t("videoBackgrounds.newAsset")}</span>
              <h2>{t("videoBackgrounds.uploadTitle")}</h2>
            </div>
            <div className="video-background-format-pill">1080 × 1920 · MP4 · 4.5–15 sec</div>
          </div>

          <form className="video-background-form" onSubmit={handleUpload}>
            <label className="video-background-file-drop" htmlFor="video-background-file">
              <UploadCloud size={28} />
              <strong>{file ? file.name : t("videoBackgrounds.chooseMp4")}</strong>
              <span>{t("videoBackgrounds.safeAreaHelp")}</span>
              <input
                id="video-background-file"
                type="file"
                accept="video/mp4"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
              />
            </label>

            <div className="video-background-fields">
              <label>
                <span>{t("videoBackgrounds.internalName")}</span>
                <input value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder={t("videoBackgrounds.namePlaceholder")} />
              </label>
              <label>
                <span>{t("videoBackgrounds.family")}</span>
                <input value={form.family} onChange={(event) => updateForm("family", event.target.value)} placeholder={t("videoBackgrounds.familyPlaceholder")} />
              </label>
              <label>
                <span>{t("videoBackgrounds.moods")}</span>
                <input value={form.moods} onChange={(event) => updateForm("moods", event.target.value)} />
              </label>
              <label>
                <span>{t("videoBackgrounds.industries")}</span>
                <input value={form.industries} onChange={(event) => updateForm("industries", event.target.value)} />
              </label>
              <label>
                <span>{t("videoBackgrounds.campaigns")}</span>
                <input value={form.campaigns} onChange={(event) => updateForm("campaigns", event.target.value)} />
              </label>
              <label>
                <span>{t("videoBackgrounds.colors")}</span>
                <input value={form.colors} onChange={(event) => updateForm("colors", event.target.value)} />
              </label>
              <label>
                <span>{t("videoBackgrounds.brightness")}</span>
                <select value={form.brightness} onChange={(event) => updateForm("brightness", event.target.value)}>
                  <option value="light">{t("videoBackgrounds.light")}</option>
                  <option value="medium">{t("videoBackgrounds.medium")}</option>
                  <option value="dark">{t("videoBackgrounds.dark")}</option>
                </select>
              </label>
              <label>
                <span>{t("videoBackgrounds.energy")}</span>
                <select value={form.energy} onChange={(event) => updateForm("energy", event.target.value)}>
                  <option value="low">{t("videoBackgrounds.low")}</option>
                  <option value="medium">{t("videoBackgrounds.medium")}</option>
                  <option value="high">{t("videoBackgrounds.high")}</option>
                </select>
              </label>
              <label>
                <span>{t("videoBackgrounds.seasonLock")}</span>
                <input value={form.season} onChange={(event) => updateForm("season", event.target.value)} placeholder={t("videoBackgrounds.seasonPlaceholder")} />
              </label>
              <label>
                <span>{t("videoBackgrounds.priority")}</span>
                <input type="number" min="-100" max="100" value={form.priority} onChange={(event) => updateForm("priority", Number(event.target.value))} />
              </label>
            </div>

            <div className="video-background-checks">
              {[
                ["text_safe", t("videoBackgrounds.clearTextArea")],
                ["logo_safe", t("videoBackgrounds.clearLogoArea")],
                ["crop_safe_916", t("videoBackgrounds.cropSafe")],
                ["active", t("videoBackgrounds.activeImmediately")],
                ["is_fallback", t("videoBackgrounds.useFallback")],
              ].map(([key, label]) => (
                <label key={key}>
                  <input type="checkbox" checked={Boolean(form[key])} onChange={(event) => updateForm(key, event.target.checked)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            <label className="video-background-notes">
              <span>{t("videoBackgrounds.notes")}</span>
              <textarea value={form.notes} onChange={(event) => updateForm("notes", event.target.value)} placeholder={t("videoBackgrounds.notesPlaceholder")} />
            </label>

            <button className="video-background-upload-button" type="submit" disabled={uploading || configurationMissing}>
              {uploading ? <Loader2 className="spin" size={18} /> : <UploadCloud size={18} />}
              {uploading ? t("videoBackgrounds.uploading") : t("videoBackgrounds.uploadLibrary")}
            </button>
          </form>
        </section>

        <section className="video-background-library">
          <div className="video-background-panel-heading">
            <div>
              <span>{t("videoBackgrounds.availableAssets")}</span>
              <h2>{t("videoBackgrounds.libraryTitle")}</h2>
            </div>
          </div>

          {loading ? (
            <div className="video-background-empty"><Loader2 className="spin" /> {t("videoBackgrounds.loading")}</div>
          ) : assets.length === 0 ? (
            <div className="video-background-empty">
              <Film size={34} />
              <strong>{t("videoBackgrounds.noneTitle")}</strong>
              <span>{t("videoBackgrounds.noneText")}</span>
            </div>
          ) : (
            <div className="video-background-grid">
              {assets.map((asset) => (
                <article className={`video-background-card ${asset.active ? "" : "inactive"}`} key={asset.id}>
                  <div className="video-background-preview">
                    <video src={asset.public_url} poster={asset.poster_url || undefined} muted loop playsInline controls preload="metadata" />
                    {asset.is_fallback && <span className="video-background-fallback"><Star size={13} /> {t("videoBackgrounds.fallback")}</span>}
                  </div>
                  <div className="video-background-card-body">
                    <div className="video-background-card-title">
                      <div>
                        <strong>{asset.name}</strong>
                        <span>{t("videoBackgrounds.cardSummary", { family: asset.family, brightness: asset.brightness, energy: asset.energy })}</span>
                      </div>
                      <label className="video-background-toggle">
                        <input type="checkbox" checked={asset.active !== false} onChange={(event) => patchAsset(asset, { active: event.target.checked })} />
                        <span>{t("videoBackgrounds.active")}</span>
                      </label>
                    </div>
                    <dl>
                      <div><dt>{t("videoBackgrounds.mood")}</dt><dd>{formatTags(asset.moods) || "—"}</dd></div>
                      <div><dt>{t("videoBackgrounds.industries")}</dt><dd>{formatTags(asset.industries) || "—"}</dd></div>
                      <div><dt>{t("videoBackgrounds.campaigns")}</dt><dd>{formatTags(asset.campaigns) || "—"}</dd></div>
                      <div><dt>{t("videoBackgrounds.colors")}</dt><dd>{formatTags(asset.colors) || "—"}</dd></div>
                    </dl>
                    <div className="video-background-card-footer">
                      <span>{t("videoBackgrounds.usageSummary", { seconds: Number(asset.duration_seconds || 0).toFixed(1), count: asset.times_used || 0 })}</span>
                      <div>
                        <button type="button" onClick={() => openEditAsset(asset)}>
                          <Pencil size={15} /> {t("videoBackgrounds.edit")}
                        </button>
                        {!asset.is_fallback && (
                          <button type="button" onClick={() => patchAsset(asset, { is_fallback: true })}><Star size={15} /> {t("videoBackgrounds.setFallback")}</button>
                        )}
                        <button className="danger" type="button" onClick={() => deleteAsset(asset)}><Trash2 size={15} /> {t("videoBackgrounds.delete")}</button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {editingAsset && editForm ? (
          <div className="video-background-edit-backdrop" onClick={() => !savingEdit && setEditingAsset(null)}>
            <form
              className="video-background-edit-modal"
              onSubmit={saveEditedAsset}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="video-background-edit-heading">
                <div>
                  <span>{t("videoBackgrounds.editEyebrow")}</span>
                  <h2>{t("videoBackgrounds.editTitle")}</h2>
                  <p>{t("videoBackgrounds.editDescription")}</p>
                </div>
                <button
                  type="button"
                  className="video-background-edit-close"
                  onClick={() => setEditingAsset(null)}
                  aria-label={t("videoBackgrounds.closeEdit")}
                  disabled={savingEdit}
                >
                  <X size={19} />
                </button>
              </div>

              <div className="video-background-fields video-background-edit-fields">
                <label><span>{t("videoBackgrounds.internalName")}</span><input value={editForm.name} onChange={(event) => updateEditForm("name", event.target.value)} /></label>
                <label><span>{t("videoBackgrounds.family")}</span><input value={editForm.family} onChange={(event) => updateEditForm("family", event.target.value)} /></label>
                <label><span>{t("videoBackgrounds.moods")}</span><input value={editForm.moods} onChange={(event) => updateEditForm("moods", event.target.value)} /></label>
                <label><span>{t("videoBackgrounds.industries")}</span><input value={editForm.industries} onChange={(event) => updateEditForm("industries", event.target.value)} /></label>
                <label><span>{t("videoBackgrounds.campaigns")}</span><input value={editForm.campaigns} onChange={(event) => updateEditForm("campaigns", event.target.value)} /></label>
                <label><span>{t("videoBackgrounds.colors")}</span><input value={editForm.colors} onChange={(event) => updateEditForm("colors", event.target.value)} /></label>
                <label>
                  <span>{t("videoBackgrounds.brightness")}</span>
                  <select value={editForm.brightness} onChange={(event) => updateEditForm("brightness", event.target.value)}>
                    <option value="light">{t("videoBackgrounds.light")}</option><option value="medium">{t("videoBackgrounds.medium")}</option><option value="dark">{t("videoBackgrounds.dark")}</option>
                  </select>
                </label>
                <label>
                  <span>{t("videoBackgrounds.energy")}</span>
                  <select value={editForm.energy} onChange={(event) => updateEditForm("energy", event.target.value)}>
                    <option value="low">{t("videoBackgrounds.low")}</option><option value="medium">{t("videoBackgrounds.medium")}</option><option value="high">{t("videoBackgrounds.high")}</option>
                  </select>
                </label>
                <label><span>{t("videoBackgrounds.seasonLock")}</span><input value={editForm.season} onChange={(event) => updateEditForm("season", event.target.value)} /></label>
                <label><span>{t("videoBackgrounds.priority")}</span><input type="number" min="-100" max="100" value={editForm.priority} onChange={(event) => updateEditForm("priority", Number(event.target.value))} /></label>
              </div>

              <div className="video-background-checks">
                {[
                  ["text_safe", t("videoBackgrounds.clearTextArea")],
                  ["logo_safe", t("videoBackgrounds.clearLogoArea")],
                  ["crop_safe_916", t("videoBackgrounds.cropSafe")],
                  ["active", t("videoBackgrounds.active")],
                  ["is_fallback", t("videoBackgrounds.neutralFallback")],
                ].map(([key, label]) => (
                  <label key={key}>
                    <input type="checkbox" checked={Boolean(editForm[key])} onChange={(event) => updateEditForm(key, event.target.checked)} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>

              <label className="video-background-notes">
                <span>{t("videoBackgrounds.notes")}</span>
                <textarea value={editForm.notes} onChange={(event) => updateEditForm("notes", event.target.value)} />
              </label>

              <div className="video-background-edit-actions">
                <button type="button" onClick={() => setEditingAsset(null)} disabled={savingEdit}>
                  {t("videoBackgrounds.cancel")}
                </button>
                <button className="primary" type="submit" disabled={savingEdit}>
                  {savingEdit ? <Loader2 className="spin" size={17} /> : <CheckCircle2 size={17} />}
                  {savingEdit ? t("videoBackgrounds.saving") : t("videoBackgrounds.saveChanges")}
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </div>
    </AppLayout>
  );
}

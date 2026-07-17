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

async function getAuthHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Your login session has expired.");
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
}

function getVideoMetadata(file) {
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
      reject(new Error("The selected MP4 could not be read."));
    };

    video.src = objectUrl;
  });
}

function createPosterBlob(video, objectUrl) {
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
            else reject(new Error("Could not create a poster image."));
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
      const headers = await getAuthHeaders();
      const response = await fetch("/api/video-backgrounds", { headers });
      const payload = await response.json();

      if (!response.ok) {
        setConfigurationMissing(Boolean(payload?.configurationMissing));
        throw new Error(payload?.error || "Could not load the background library.");
      }

      setAssets(payload.assets || []);
    } catch (loadError) {
      setError(loadError.message || "Could not load the background library.");
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
      setError("Choose an MP4 background first.");
      return;
    }

    if (!form.name.trim()) {
      setError("Give the background a clear internal name.");
      return;
    }

    setUploading(true);

    try {
      const metadata = await getVideoMetadata(file);

      if (metadata.width !== 1080 || metadata.height !== 1920) {
        URL.revokeObjectURL(metadata.objectUrl);
        throw new Error("Background videos must be exactly 1080 × 1920 (9:16).");
      }

      if (metadata.duration < 4.5 || metadata.duration > 15.5) {
        URL.revokeObjectURL(metadata.objectUrl);
        throw new Error("Background videos must be between 4.5 and 15 seconds long.");
      }

      const posterBlob = await createPosterBlob(metadata.video, metadata.objectUrl);
      const headers = await getAuthHeaders();
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
        throw new Error(uploadData?.error || "Could not prepare the upload.");
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
        throw new Error(completeData?.error || "Could not save the background metadata.");
      }

      setAssets((current) => [completeData.asset, ...current]);
      setForm(EMPTY_FORM);
      setFile(null);
      const input = document.getElementById("video-background-file");
      if (input) input.value = "";
      setMessage("Background uploaded and added to the automatic selection library.");
    } catch (uploadError) {
      setError(uploadError.message || "Could not upload the background.");
    } finally {
      setUploading(false);
    }
  }

  async function patchAsset(asset, changes) {
    setError("");
    setMessage("");

    try {
      const headers = await getAuthHeaders();
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

      if (!response.ok) throw new Error(payload?.error || "Could not update the background.");

      setAssets((current) =>
        current.map((item) => {
          if (payload.asset.is_fallback && item.id !== payload.asset.id) {
            return { ...item, is_fallback: false };
          }
          return item.id === payload.asset.id ? payload.asset : item;
        })
      );
    } catch (updateError) {
      setError(updateError.message || "Could not update the background.");
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
      const headers = await getAuthHeaders();
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
      `Delete “${asset.name}” permanently from the shared video library?`
    );
    if (!confirmed) return;

    setError("");

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/video-backgrounds?id=${encodeURIComponent(asset.id)}`, {
        method: "DELETE",
        headers,
      });
      const payload = await response.json();

      if (!response.ok) throw new Error(payload?.error || "Could not delete the background.");

      setAssets((current) => current.filter((item) => item.id !== asset.id));
    } catch (deleteError) {
      setError(deleteError.message || "Could not delete the background.");
    }
  }

  return (
    <AppLayout active="admin">
      <div className="video-background-page">
        <section className="video-background-hero">
          <div>
            <span className="video-background-eyebrow">Shared creative library</span>
            <h1>Video backgrounds</h1>
            <p>
              Upload reusable 9:16 motion backgrounds. Spreelo scores them against the product,
              campaign, brand and recent usage before rendering an animated product Reel.
            </p>
          </div>
          <div className="video-background-summary">
            <strong>{assets.length}</strong>
            <span>{activeCount} active</span>
          </div>
        </section>

        {configurationMissing && (
          <div className="video-background-alert warning">
            <ShieldAlert size={20} />
            <div>
              <strong>Administrator access is not configured</strong>
              <p>
                Add <code>SPREELO_ADMIN_EMAILS</code> in Vercel with your Spreelo login email,
                then redeploy.
              </p>
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
              <span>New asset</span>
              <h2>Upload a moving background</h2>
            </div>
            <div className="video-background-format-pill">1080 × 1920 · MP4 · 4.5–15 sec</div>
          </div>

          <form className="video-background-form" onSubmit={handleUpload}>
            <label className="video-background-file-drop" htmlFor="video-background-file">
              <UploadCloud size={28} />
              <strong>{file ? file.name : "Choose a 9:16 MP4"}</strong>
              <span>Keep the center clear for the product, top-left clear for the logo and bottom clear for text.</span>
              <input
                id="video-background-file"
                type="file"
                accept="video/mp4"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
              />
            </label>

            <div className="video-background-fields">
              <label>
                <span>Internal name</span>
                <input value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder="Cream flowing surfaces 01" />
              </label>
              <label>
                <span>Family</span>
                <input value={form.family} onChange={(event) => updateForm("family", event.target.value)} placeholder="abstract" />
              </label>
              <label>
                <span>Moods</span>
                <input value={form.moods} onChange={(event) => updateForm("moods", event.target.value)} />
              </label>
              <label>
                <span>Industries</span>
                <input value={form.industries} onChange={(event) => updateForm("industries", event.target.value)} />
              </label>
              <label>
                <span>Campaigns</span>
                <input value={form.campaigns} onChange={(event) => updateForm("campaigns", event.target.value)} />
              </label>
              <label>
                <span>Colors</span>
                <input value={form.colors} onChange={(event) => updateForm("colors", event.target.value)} />
              </label>
              <label>
                <span>Brightness</span>
                <select value={form.brightness} onChange={(event) => updateForm("brightness", event.target.value)}>
                  <option value="light">Light</option>
                  <option value="medium">Medium</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
              <label>
                <span>Energy</span>
                <select value={form.energy} onChange={(event) => updateForm("energy", event.target.value)}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <label>
                <span>Season / campaign lock</span>
                <input value={form.season} onChange={(event) => updateForm("season", event.target.value)} placeholder="all or halloween" />
              </label>
              <label>
                <span>Priority</span>
                <input type="number" min="-100" max="100" value={form.priority} onChange={(event) => updateForm("priority", Number(event.target.value))} />
              </label>
            </div>

            <div className="video-background-checks">
              {[
                ["text_safe", "Clear text area"],
                ["logo_safe", "Clear logo area"],
                ["crop_safe_916", "9:16 safe"],
                ["active", "Active immediately"],
                ["is_fallback", "Use as neutral fallback"],
              ].map(([key, label]) => (
                <label key={key}>
                  <input type="checkbox" checked={Boolean(form[key])} onChange={(event) => updateForm(key, event.target.checked)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            <label className="video-background-notes">
              <span>Notes</span>
              <textarea value={form.notes} onChange={(event) => updateForm("notes", event.target.value)} placeholder="Best for premium fashion, beauty and accessories." />
            </label>

            <button className="video-background-upload-button" type="submit" disabled={uploading || configurationMissing}>
              {uploading ? <Loader2 className="spin" size={18} /> : <UploadCloud size={18} />}
              {uploading ? "Uploading background..." : "Upload to library"}
            </button>
          </form>
        </section>

        <section className="video-background-library">
          <div className="video-background-panel-heading">
            <div>
              <span>Available assets</span>
              <h2>Automatic selection library</h2>
            </div>
          </div>

          {loading ? (
            <div className="video-background-empty"><Loader2 className="spin" /> Loading backgrounds...</div>
          ) : assets.length === 0 ? (
            <div className="video-background-empty">
              <Film size={34} />
              <strong>No backgrounds uploaded yet</strong>
              <span>Upload one neutral fallback before creating an animated product Reel.</span>
            </div>
          ) : (
            <div className="video-background-grid">
              {assets.map((asset) => (
                <article className={`video-background-card ${asset.active ? "" : "inactive"}`} key={asset.id}>
                  <div className="video-background-preview">
                    <video src={asset.public_url} poster={asset.poster_url || undefined} muted loop playsInline controls preload="metadata" />
                    {asset.is_fallback && <span className="video-background-fallback"><Star size={13} /> Fallback</span>}
                  </div>
                  <div className="video-background-card-body">
                    <div className="video-background-card-title">
                      <div>
                        <strong>{asset.name}</strong>
                        <span>{asset.family} · {asset.brightness} · {asset.energy} energy</span>
                      </div>
                      <label className="video-background-toggle">
                        <input type="checkbox" checked={asset.active !== false} onChange={(event) => patchAsset(asset, { active: event.target.checked })} />
                        <span>Active</span>
                      </label>
                    </div>
                    <dl>
                      <div><dt>Mood</dt><dd>{formatTags(asset.moods) || "—"}</dd></div>
                      <div><dt>Industries</dt><dd>{formatTags(asset.industries) || "—"}</dd></div>
                      <div><dt>Campaigns</dt><dd>{formatTags(asset.campaigns) || "—"}</dd></div>
                      <div><dt>Colors</dt><dd>{formatTags(asset.colors) || "—"}</dd></div>
                    </dl>
                    <div className="video-background-card-footer">
                      <span>{Number(asset.duration_seconds || 0).toFixed(1)} sec · used {asset.times_used || 0} times</span>
                      <div>
                        <button type="button" onClick={() => openEditAsset(asset)}>
                          <Pencil size={15} /> {t("videoBackgrounds.edit")}
                        </button>
                        {!asset.is_fallback && (
                          <button type="button" onClick={() => patchAsset(asset, { is_fallback: true })}><Star size={15} /> Set fallback</button>
                        )}
                        <button className="danger" type="button" onClick={() => deleteAsset(asset)}><Trash2 size={15} /> Delete</button>
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
                <label><span>Internal name</span><input value={editForm.name} onChange={(event) => updateEditForm("name", event.target.value)} /></label>
                <label><span>Family</span><input value={editForm.family} onChange={(event) => updateEditForm("family", event.target.value)} /></label>
                <label><span>Moods</span><input value={editForm.moods} onChange={(event) => updateEditForm("moods", event.target.value)} /></label>
                <label><span>Industries</span><input value={editForm.industries} onChange={(event) => updateEditForm("industries", event.target.value)} /></label>
                <label><span>Campaigns</span><input value={editForm.campaigns} onChange={(event) => updateEditForm("campaigns", event.target.value)} /></label>
                <label><span>Colors</span><input value={editForm.colors} onChange={(event) => updateEditForm("colors", event.target.value)} /></label>
                <label>
                  <span>Brightness</span>
                  <select value={editForm.brightness} onChange={(event) => updateEditForm("brightness", event.target.value)}>
                    <option value="light">Light</option><option value="medium">Medium</option><option value="dark">Dark</option>
                  </select>
                </label>
                <label>
                  <span>Energy</span>
                  <select value={editForm.energy} onChange={(event) => updateEditForm("energy", event.target.value)}>
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                  </select>
                </label>
                <label><span>Season / campaign lock</span><input value={editForm.season} onChange={(event) => updateEditForm("season", event.target.value)} /></label>
                <label><span>Priority</span><input type="number" min="-100" max="100" value={editForm.priority} onChange={(event) => updateEditForm("priority", Number(event.target.value))} /></label>
              </div>

              <div className="video-background-checks">
                {[
                  ["text_safe", "Clear text area"],
                  ["logo_safe", "Clear logo area"],
                  ["crop_safe_916", "9:16 safe"],
                  ["active", "Active"],
                  ["is_fallback", "Neutral fallback"],
                ].map(([key, label]) => (
                  <label key={key}>
                    <input type="checkbox" checked={Boolean(editForm[key])} onChange={(event) => updateEditForm(key, event.target.checked)} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>

              <label className="video-background-notes">
                <span>Notes</span>
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

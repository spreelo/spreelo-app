"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AudioLines,
  CheckCircle2,
  Clock3,
  Library,
  Loader2,
  Music2,
  Pencil,
  Search,
  ShieldAlert,
  Trash2,
  UploadCloud,
  Volume2,
  X,
} from "lucide-react";
import AppLayout from "../../../components/AppLayout";
import { supabase } from "../../../lib/supabaseClient";
import { useUiText } from "../../../lib/i18n/useUiText";

const EMPTY_FORM = {
  name: "",
  categories: "premium, modern",
  moods: "energetic, polished",
  industries: "retail, ecommerce",
  formats: "animated_video, ai_product_video, reel, short_form",
  keywords: "product, social media, video",
  energy: "medium",
  priority: 0,
  volume: 0.5,
  active: true,
  notes: "",
};

async function getAuthHeaders(t) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error(t("admin.music.sessionExpired"));
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
}

function formatDuration(seconds) {
  const value = Number(seconds || 0);
  if (!value) return "—";
  const minutes = Math.floor(value / 60);
  const remainder = value - minutes * 60;
  return minutes ? `${minutes}:${String(remainder.toFixed(1)).padStart(4, "0")}` : `${value.toFixed(1)} s`;
}

function formatTags(values) {
  return (Array.isArray(values) ? values : []).join(", ");
}

function tags(value) {
  return Array.isArray(value) ? value : [];
}

function getTrackUrl(track) {
  return track?.public_url || track?.public_path || "";
}

function getAudioMetadata(file, t) {
  return new Promise((resolve, reject) => {
    const audio = document.createElement("audio");
    const objectUrl = URL.createObjectURL(file);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const duration = Number(audio.duration || 0);
      URL.revokeObjectURL(objectUrl);
      resolve({ duration });
    };
    audio.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(t("admin.music.readError")));
    };
    audio.src = objectUrl;
  });
}

function TrackTags({ track }) {
  const visible = [
    ...tags(track.categories).slice(0, 3),
    ...tags(track.moods).slice(0, 2),
    ...tags(track.industries).slice(0, 2),
  ].filter((value, index, all) => all.indexOf(value) === index).slice(0, 7);

  return (
    <div className="music-library-tags">
      {visible.map((tag) => <span key={tag}>{tag.replaceAll("_", " ")}</span>)}
    </div>
  );
}

export default function MusicLibraryPage() {
  const { t } = useUiText(["admin"]);
  const [tracks, setTracks] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [configurationMissing, setConfigurationMissing] = useState(false);
  const [editingTrack, setEditingTrack] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingIds, setDeletingIds] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const activeCount = useMemo(
    () => tracks.filter((track) => track.active !== false).length,
    [tracks]
  );

  const averageDuration = useMemo(() => {
    const durations = tracks.map((track) => Number(track.duration_seconds || 0)).filter(Boolean);
    if (!durations.length) return 0;
    return durations.reduce((sum, value) => sum + value, 0) / durations.length;
  }, [tracks]);

  const filteredTracks = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return tracks.filter((track) => {
      if (statusFilter === "active" && track.active === false) return false;
      if (statusFilter === "inactive" && track.active !== false) return false;
      if (!needle) return true;
      const haystack = [
        track.name,
        track.energy,
        ...(track.categories || []),
        ...(track.moods || []),
        ...(track.industries || []),
        ...(track.formats || []),
        ...(track.keywords || []),
      ].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [tracks, search, statusFilter]);

  useEffect(() => {
    loadTracks();
  }, []);

  async function loadTracks() {
    setLoading(true);
    setError("");
    try {
      const headers = await getAuthHeaders(t);
      const response = await fetch("/api/video-music", { headers, cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setConfigurationMissing(Boolean(payload?.configurationMissing));
        throw new Error(payload?.error || t("admin.music.loadError"));
      }
      setTracks(payload?.tracks || []);
    } catch (loadError) {
      setError(loadError?.message || t("admin.music.loadError"));
    } finally {
      setLoading(false);
    }
  }

  function updateForm(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleFileChange(event) {
    const selected = event.target.files?.[0] || null;
    setFile(selected);
    if (selected && !form.name.trim()) {
      const baseName = selected.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
      setForm((current) => ({ ...current, name: baseName || current.name }));
    }
  }

  async function handleUpload(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!file) return setError(t("admin.music.chooseFile"));
    if (!form.name.trim()) return setError(t("admin.music.nameRequired"));

    setUploading(true);
    try {
      const metadata = await getAudioMetadata(file, t);
      if (!metadata.duration || metadata.duration < 1 || metadata.duration > 60) {
        throw new Error(t("admin.music.durationError"));
      }

      const headers = await getAuthHeaders(t);
      const createResponse = await fetch("/api/video-music", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "create_upload",
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          size: file.size,
        }),
      });
      const uploadData = await createResponse.json().catch(() => ({}));
      if (!createResponse.ok) throw new Error(uploadData?.error || t("admin.music.prepareError"));

      const upload = await supabase.storage
        .from("video-music-library")
        .uploadToSignedUrl(uploadData.audio.path, uploadData.audio.token, file, {
          contentType: uploadData.audio.contentType,
        });
      if (upload.error) throw upload.error;

      const completeResponse = await fetch("/api/video-music", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "complete_upload",
          assetId: uploadData.assetId,
          storage_path: uploadData.audio.path,
          duration_seconds: metadata.duration,
          ...form,
        }),
      });
      const completeData = await completeResponse.json().catch(() => ({}));
      if (!completeResponse.ok) throw new Error(completeData?.error || t("admin.music.saveError"));

      setTracks((current) => [completeData.track, ...current]);
      setForm(EMPTY_FORM);
      setFile(null);
      const input = document.getElementById("music-library-file");
      if (input) input.value = "";
      setMessage(t("admin.music.uploaded", { name: completeData.track.name }));
    } catch (uploadError) {
      setError(uploadError?.message || t("admin.music.uploadError"));
    } finally {
      setUploading(false);
    }
  }

  async function patchTrack(track, changes, { quiet = false } = {}) {
    setError("");
    if (!quiet) setMessage("");
    try {
      const headers = await getAuthHeaders(t);
      const response = await fetch("/api/video-music", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          ...track,
          ...changes,
          id: track.id,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t("admin.music.saveError"));
      setTracks((current) => current.map((item) => item.id === payload.track.id ? payload.track : item));
      if (!quiet) setMessage(t("admin.music.saved", { name: payload.track.name }));
      return payload.track;
    } catch (saveError) {
      setError(saveError?.message || t("admin.music.saveError"));
      return null;
    }
  }

  function startEdit(track) {
    setEditingTrack(track);
    setEditForm({
      ...track,
      categories: formatTags(track.categories),
      moods: formatTags(track.moods),
      industries: formatTags(track.industries),
      formats: formatTags(track.formats),
      keywords: formatTags(track.keywords),
      notes: track.notes || "",
    });
    setError("");
    setMessage("");
  }

  function closeEdit() {
    setEditingTrack(null);
    setEditForm(null);
    setSavingEdit(false);
  }

  async function saveEdit() {
    if (!editingTrack || !editForm) return;
    if (!String(editForm.name || "").trim()) {
      setError(t("admin.music.nameRequired"));
      return;
    }
    setSavingEdit(true);
    const saved = await patchTrack(editingTrack, editForm);
    if (saved) {
      setEditingTrack(saved);
      setEditForm({
        ...saved,
        categories: formatTags(saved.categories),
        moods: formatTags(saved.moods),
        industries: formatTags(saved.industries),
        formats: formatTags(saved.formats),
        keywords: formatTags(saved.keywords),
        notes: saved.notes || "",
      });
    }
    setSavingEdit(false);
  }

  async function deleteTrack(track) {
    if (!track?.id || !window.confirm(t("admin.music.deleteConfirm", { name: track.name }))) return;
    if (deletingIds.includes(track.id)) return;
    setDeletingIds(ids => [...ids, track.id]);
    setError("");
    setMessage("");
    try {
      const headers = await getAuthHeaders(t);
      const response = await fetch(`/api/video-music?id=${encodeURIComponent(track.id)}`, {
        method: "DELETE",
        headers,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t("admin.music.deleteError"));
      setTracks((current) => current.filter((item) => item.id !== track.id));
      if (editingTrack?.id === track.id) closeEdit();
      setMessage(t("admin.music.deleted", { name: track.name }));
    } catch (deleteError) {
      setError(deleteError?.message || t("admin.music.deleteError"));
    } finally {
      setDeletingIds(ids => ids.filter(id => id !== track.id));
    }
  }

  return (
    <AppLayout active="admin">
      <div className="admin-page music-library-page">
        <header className="admin-hero music-library-hero">
          <div>
            <span className="admin-eyebrow">{t("admin.music.kicker")}</span>
            <h1>{t("admin.music.title")}</h1>
            <p>{t("admin.music.description")}</p>
          </div>
          <div className="music-library-summary" aria-label={t("admin.music.summary")}> 
            <div><Library size={18} /><strong>{tracks.length}</strong><span>{t("admin.music.total")}</span></div>
            <div><CheckCircle2 size={18} /><strong>{activeCount}</strong><span>{t("admin.music.active")}</span></div>
            <div><Clock3 size={18} /><strong>{averageDuration ? `${averageDuration.toFixed(1)} s` : "—"}</strong><span>{t("admin.music.avgLength")}</span></div>
          </div>
        </header>

        {configurationMissing ? (
          <div className="admin-alert warning"><ShieldAlert size={18} /><div><strong>{t("admin.music.storageWarningTitle")}</strong><span>{t("admin.music.storageWarning")}</span></div></div>
        ) : null}
        {error ? <div className="admin-alert error"><ShieldAlert size={18} /><div><strong>{t("admin.music.errorTitle")}</strong><span>{error}</span></div></div> : null}
        {message ? <div className="admin-alert success"><CheckCircle2 size={18} /><div><strong>{t("admin.music.successTitle")}</strong><span>{message}</span></div></div> : null}

        <section className="music-library-workspace">
          <form className="music-upload-panel" onSubmit={handleUpload}>
            <div className="music-section-heading">
              <span className="music-section-icon"><UploadCloud size={20} /></span>
              <div><span className="admin-card-kicker">{t("admin.music.uploadKicker")}</span><h2>{t("admin.music.uploadTitle")}</h2><p>{t("admin.music.uploadText")}</p></div>
            </div>

            <label className="music-file-drop" htmlFor="music-library-file">
              <Music2 size={28} />
              <strong>{file?.name || t("admin.music.chooseAudio")}</strong>
              <span>{file ? t("admin.music.fileReady") : t("admin.music.fileHelp")}</span>
              <input id="music-library-file" type="file" accept=".wav,.mp3,.m4a,.aac,audio/*" onChange={handleFileChange} />
            </label>

            <label className="music-field"><span>{t("admin.music.name")}</span><input value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder={t("admin.music.namePlaceholder")} /></label>
            <label className="music-field"><span>{t("admin.music.categories")}</span><input value={form.categories} onChange={(event) => updateForm("categories", event.target.value)} /><small>{t("admin.music.categoriesHelp")}</small></label>
            <label className="music-field"><span>{t("admin.music.moods")}</span><input value={form.moods} onChange={(event) => updateForm("moods", event.target.value)} /></label>
            <label className="music-field"><span>{t("admin.music.industries")}</span><input value={form.industries} onChange={(event) => updateForm("industries", event.target.value)} /></label>
            <label className="music-field"><span>{t("admin.music.formats")}</span><input value={form.formats} onChange={(event) => updateForm("formats", event.target.value)} /></label>
            <label className="music-field"><span>{t("admin.music.keywords")}</span><input value={form.keywords} onChange={(event) => updateForm("keywords", event.target.value)} /></label>

            <div className="music-field-row">
              <label className="music-field"><span>{t("admin.music.energy")}</span><select value={form.energy} onChange={(event) => updateForm("energy", event.target.value)}><option value="low">{t("admin.music.energyLow")}</option><option value="medium">{t("admin.music.energyMedium")}</option><option value="high">{t("admin.music.energyHigh")}</option></select></label>
              <label className="music-field"><span>{t("admin.music.priority")}</span><input type="number" min="-100" max="100" value={form.priority} onChange={(event) => updateForm("priority", event.target.value)} /></label>
            </div>

            <label className="music-field music-volume-field"><span><span>{t("admin.music.volume")}</span><strong>{Math.round(Number(form.volume) * 100)}%</strong></span><input type="range" min="0" max="1" step="0.05" value={form.volume} onChange={(event) => updateForm("volume", Number(event.target.value))} /></label>
            <label className="music-field"><span>{t("admin.music.notes")}</span><textarea rows={3} value={form.notes} onChange={(event) => updateForm("notes", event.target.value)} /></label>
            <label className="music-toggle"><input type="checkbox" checked={form.active} onChange={(event) => updateForm("active", event.target.checked)} /><span><strong>{t("admin.music.activeOnUpload")}</strong><small>{t("admin.music.activeOnUploadHelp")}</small></span></label>

            <button className="admin-primary-button music-upload-button" type="submit" disabled={uploading}>
              {uploading ? <Loader2 className="admin-spin" size={17} /> : <UploadCloud size={17} />}
              {uploading ? t("admin.music.uploading") : t("admin.music.upload")}
            </button>
          </form>

          <div className="music-library-panel">
            <div className="music-library-toolbar">
              <div>
                <span className="admin-card-kicker">{t("admin.music.libraryKicker")}</span>
                <h2>{t("admin.music.libraryTitle")}</h2>
                <p>{t("admin.music.libraryText")}</p>
              </div>
              <div className="music-library-filter-row">
                <label className="music-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("admin.music.search")} /></label>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label={t("admin.music.statusFilter")}>
                  <option value="all">{t("admin.music.allTracks")}</option>
                  <option value="active">{t("admin.music.activeTracks")}</option>
                  <option value="inactive">{t("admin.music.inactiveTracks")}</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="admin-loading-card"><Loader2 className="admin-spin" size={18} /> {t("admin.music.loading")}</div>
            ) : filteredTracks.length ? (
              <div className="music-track-list">
                {filteredTracks.map((track) => (
                  <article className={`music-track-card ${track.active === false ? "inactive" : ""}`} key={track.id}>
                    <div className="music-track-art"><AudioLines size={30} /><span>{track.energy || "medium"}</span></div>
                    <div className="music-track-main">
                      <div className="music-track-title-row">
                        <div><h3>{track.name}</h3><p>{track.source_kind === "bundled" ? t("admin.music.bundled") : t("admin.music.uploadedSource")} · {formatDuration(track.duration_seconds)}</p></div>
                        <label className="music-card-toggle" title={t("admin.music.toggleActive")}><input type="checkbox" checked={track.active !== false} onChange={(event) => patchTrack(track, { active: event.target.checked }, { quiet: true })} /><span /></label>
                      </div>
                      <audio className="music-player" controls preload="metadata" src={getTrackUrl(track)} />
                      <TrackTags track={track} />
                      <div className="music-track-meta">
                        <span><Volume2 size={14} /> {Math.round(Number(track.volume ?? 0.5) * 100)}%</span>
                        <span>{t("admin.music.priorityValue", { value: Number(track.priority || 0) })}</span>
                        <span>{tags(track.formats).length ? tags(track.formats).slice(0, 2).join(" · ").replaceAll("_", " ") : t("admin.music.allFormats")}</span>
                      </div>
                    </div>
                    <div className="music-track-actions">
                      <button type="button" onClick={() => startEdit(track)}><Pencil size={15} /> {t("admin.music.edit")}</button>
                      <button type="button" className="danger" disabled={deletingIds.includes(track.id)} onClick={() => deleteTrack(track)}><Trash2 size={15} /> {t("admin.music.delete")}</button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="music-library-empty"><Music2 size={26} /><strong>{tracks.length ? t("admin.music.noMatches") : t("admin.music.noneTitle")}</strong><p>{tracks.length ? t("admin.music.noMatchesText") : t("admin.music.noneText")}</p></div>
            )}
          </div>
        </section>

        <section className="music-library-rule-card">
          <span className="music-section-icon"><AudioLines size={20} /></span>
          <div><span className="admin-card-kicker">{t("admin.music.selectionKicker")}</span><h2>{t("admin.music.selectionTitle")}</h2><p>{t("admin.music.selectionText")}</p></div>
        </section>

        {editingTrack && editForm ? (
          <div className="music-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEdit(); }}>
            <section className="music-modal" role="dialog" aria-modal="true" aria-label={t("admin.music.editTitle")}>
              <div className="music-modal-heading"><div><span className="admin-card-kicker">{t("admin.music.editKicker")}</span><h2>{t("admin.music.editTitle")}</h2><p>{t("admin.music.editText")}</p></div><button type="button" onClick={closeEdit} aria-label={t("admin.music.closeEdit")}><X size={20} /></button></div>
              <audio className="music-player music-modal-player" controls preload="metadata" src={getTrackUrl(editingTrack)} />
              <div className="music-edit-grid">
                <label className="music-field full"><span>{t("admin.music.name")}</span><input value={editForm.name} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} /></label>
                <label className="music-field full"><span>{t("admin.music.categories")}</span><input value={editForm.categories} onChange={(event) => setEditForm((current) => ({ ...current, categories: event.target.value }))} /></label>
                <label className="music-field full"><span>{t("admin.music.moods")}</span><input value={editForm.moods} onChange={(event) => setEditForm((current) => ({ ...current, moods: event.target.value }))} /></label>
                <label className="music-field full"><span>{t("admin.music.industries")}</span><input value={editForm.industries} onChange={(event) => setEditForm((current) => ({ ...current, industries: event.target.value }))} /></label>
                <label className="music-field full"><span>{t("admin.music.formats")}</span><input value={editForm.formats} onChange={(event) => setEditForm((current) => ({ ...current, formats: event.target.value }))} /></label>
                <label className="music-field full"><span>{t("admin.music.keywords")}</span><input value={editForm.keywords} onChange={(event) => setEditForm((current) => ({ ...current, keywords: event.target.value }))} /></label>
                <label className="music-field"><span>{t("admin.music.energy")}</span><select value={editForm.energy} onChange={(event) => setEditForm((current) => ({ ...current, energy: event.target.value }))}><option value="low">{t("admin.music.energyLow")}</option><option value="medium">{t("admin.music.energyMedium")}</option><option value="high">{t("admin.music.energyHigh")}</option></select></label>
                <label className="music-field"><span>{t("admin.music.priority")}</span><input type="number" min="-100" max="100" value={editForm.priority} onChange={(event) => setEditForm((current) => ({ ...current, priority: event.target.value }))} /></label>
                <label className="music-field music-volume-field full"><span><span>{t("admin.music.volume")}</span><strong>{Math.round(Number(editForm.volume) * 100)}%</strong></span><input type="range" min="0" max="1" step="0.05" value={editForm.volume} onChange={(event) => setEditForm((current) => ({ ...current, volume: Number(event.target.value) }))} /></label>
                <label className="music-field full"><span>{t("admin.music.notes")}</span><textarea rows={3} value={editForm.notes} onChange={(event) => setEditForm((current) => ({ ...current, notes: event.target.value }))} /></label>
                <label className="music-toggle full"><input type="checkbox" checked={editForm.active !== false} onChange={(event) => setEditForm((current) => ({ ...current, active: event.target.checked }))} /><span><strong>{t("admin.music.active")}</strong><small>{t("admin.music.activeEditHelp")}</small></span></label>
              </div>
              <div className="music-modal-actions"><button type="button" className="admin-secondary-button" onClick={closeEdit}>{t("admin.music.cancel")}</button><button type="button" className="admin-primary-button" onClick={saveEdit} disabled={savingEdit}>{savingEdit ? <Loader2 className="admin-spin" size={16} /> : null}{t("admin.music.save")}</button></div>
            </section>
          </div>
        ) : null}
      </div>
    </AppLayout>
  );
}

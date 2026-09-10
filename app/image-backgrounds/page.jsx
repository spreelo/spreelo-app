"use client";

import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ImagePlus,
  Loader2,
  Pencil,
  ShieldAlert,
  Star,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import AppLayout from '../../components/AppLayout';
import { supabase } from '../../lib/supabaseClient';
import { useUiText } from '../../lib/i18n/useUiText';

const EMPTY_FORM = {
  name: '',
  family: 'abstract',
  moods: 'premium, calm, minimal',
  industries: 'fashion, beauty, jewelry, home',
  campaigns: 'product, brand, launch',
  colors: 'cream, beige, white, neutral',
  brightness: 'light',
  season: 'all',
  priority: 0,
  text_safe: true,
  label_safe: true,
  crop_safe_1x1: true,
  active: true,
  is_fallback: false,
  notes: '',
};

async function getAuthHeaders(t) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error(t('admin.imageBackgrounds.sessionExpired'));
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  };
}

function formatTags(values) {
  return (Array.isArray(values) ? values : []).join(', ');
}

function FilePreview({ asset, t }) {
  if (!asset?.public_url) {
    return <div className="video-background-card__preview-fallback">{t("admin.imageBackgrounds.noPreview")}</div>;
  }
  return <img src={asset.public_url} alt={asset.name || t("admin.imageBackgrounds.backgroundAlt")} className="video-background-card__poster" />;
}

export default function ImageBackgroundsPage() {
  const { t } = useUiText(["admin"]);
  const [assets, setAssets] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
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
    setError('');

    try {
      const headers = await getAuthHeaders(t);
      const response = await fetch('/api/image-backgrounds', { headers });
      const payload = await response.json();

      if (!response.ok) {
        setConfigurationMissing(Boolean(payload?.configurationMissing));
        throw new Error(t('admin.imageBackgrounds.loadError'));
      }

      setAssets(payload.assets || []);
    } catch (loadError) {
      setError(loadError.message || t('admin.imageBackgrounds.loadError'));
    } finally {
      setLoading(false);
    }
  }

  function updateForm(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function getImageMetadata(selectedFile) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(selectedFile);
      image.onload = () => {
        resolve({ width: image.naturalWidth || 0, height: image.naturalHeight || 0, objectUrl });
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error(t('admin.imageBackgrounds.readError')));
      };
      image.src = objectUrl;
    });
  }

  async function handleUpload(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!file) return setError(t('admin.imageBackgrounds.chooseFile'));
    if (!form.name.trim()) return setError(t('admin.imageBackgrounds.nameRequired'));

    setUploading(true);

    try {
      const metadata = await getImageMetadata(file);
      if (metadata.width !== 1080 || metadata.height !== 1080) {
        URL.revokeObjectURL(metadata.objectUrl);
        throw new Error(t('admin.imageBackgrounds.sizeError'));
      }
      URL.revokeObjectURL(metadata.objectUrl);

      const headers = await getAuthHeaders(t);
      const createResponse = await fetch('/api/image-backgrounds', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'create_upload',
          filename: file.name,
          contentType: file.type || 'image/png',
          size: file.size,
        }),
      });
      const uploadData = await createResponse.json();
      if (!createResponse.ok) throw new Error(t('admin.imageBackgrounds.prepareError'));

      const imageUpload = await supabase.storage
        .from('image-backgrounds')
        .uploadToSignedUrl(uploadData.image.path, uploadData.image.token, file, {
          contentType: file.type || 'image/png',
        });
      if (imageUpload.error) throw imageUpload.error;

      const completeResponse = await fetch('/api/image-backgrounds', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'complete_upload',
          assetId: uploadData.assetId,
          storage_path: uploadData.image.path,
          ...form,
          width: metadata.width,
          height: metadata.height,
        }),
      });
      const completeData = await completeResponse.json();
      if (!completeResponse.ok) throw new Error(t('admin.imageBackgrounds.saveError'));

      setAssets((current) => [completeData.asset, ...current]);
      setForm(EMPTY_FORM);
      setFile(null);
      const input = document.getElementById('image-background-file');
      if (input) input.value = '';
      setMessage(t('admin.imageBackgrounds.uploaded'));
    } catch (uploadError) {
      setError(uploadError.message || t('admin.imageBackgrounds.uploadError'));
    } finally {
      setUploading(false);
    }
  }

  function startEdit(asset) {
    setEditingAsset(asset);
    setEditForm({
      ...asset,
      moods: formatTags(asset.moods),
      industries: formatTags(asset.industries),
      campaigns: formatTags(asset.campaigns),
      colors: formatTags(asset.colors),
      notes: asset.notes || '',
    });
    setMessage('');
    setError('');
  }

  function closeEdit() {
    setEditingAsset(null);
    setEditForm(null);
    setSavingEdit(false);
  }

  async function saveEdit() {
    if (!editingAsset || !editForm) return;
    setSavingEdit(true);
    setError('');
    setMessage('');

    try {
      const headers = await getAuthHeaders(t);
      const response = await fetch('/api/image-backgrounds', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ ...editForm, id: editingAsset.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(t('admin.imageBackgrounds.saveError'));

      setAssets((current) => current.map((asset) => (asset.id === payload.asset.id ? payload.asset : asset)));
      setEditingAsset(payload.asset);
      setEditForm({
        ...payload.asset,
        moods: formatTags(payload.asset.moods),
        industries: formatTags(payload.asset.industries),
        campaigns: formatTags(payload.asset.campaigns),
        colors: formatTags(payload.asset.colors),
        notes: payload.asset.notes || '',
      });
      setMessage(t("admin.imageBackgrounds.saved", { name: payload.asset.name }));
    } catch (saveError) {
      setError(saveError.message || t('admin.imageBackgrounds.saveError'));
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteAsset(id) {
    if (!id || !window.confirm(t('admin.imageBackgrounds.deleteConfirm'))) return;
    setError('');
    setMessage('');

    try {
      const headers = await getAuthHeaders(t);
      const response = await fetch(`/api/image-backgrounds?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(t('admin.imageBackgrounds.deleteError'));

      setAssets((current) => current.filter((asset) => asset.id !== id));
      if (editingAsset?.id === id) closeEdit();
      setMessage(t('admin.imageBackgrounds.deleted'));
    } catch (deleteError) {
      setError(deleteError.message || t('admin.imageBackgrounds.deleteError'));
    }
  }

  return (
    <AppLayout active="admin">
      <div className="video-backgrounds-page admin-page">
        <header className="admin-hero compact">
          <div>
            <span className="admin-eyebrow">{t("admin.imageBackgrounds.kicker")}</span>
            <h1>{t("admin.imageBackgrounds.title")}</h1>
            <p>{t("admin.imageBackgrounds.description")}</p>
          </div>
          <div className="video-backgrounds-summary">
            <div>
              <strong>{assets.length}</strong>
              <span>{t("admin.imageBackgrounds.total")}</span>
            </div>
            <div>
              <strong>{activeCount}</strong>
              <span>{t("admin.imageBackgrounds.active")}</span>
            </div>
          </div>
        </header>

        {configurationMissing ? (
          <div className="video-backgrounds-alert warning">
            <ShieldAlert size={18} /> {t("admin.imageBackgrounds.configWarning")}
          </div>
        ) : null}
        {error ? <div className="video-backgrounds-alert error">{error}</div> : null}
        {message ? <div className="video-backgrounds-alert success">{message}</div> : null}

        <section className="video-backgrounds-grid">
          <form className="video-background-card video-background-upload" onSubmit={handleUpload}>
            <div className="video-background-card__header">
              <div>
                <h2>{t("admin.imageBackgrounds.uploadTitle")}</h2>
                <p>{t("admin.imageBackgrounds.uploadText")}</p>
              </div>
              <span className="video-background-card__icon"><ImagePlus size={22} /></span>
            </div>

            <label className="video-background-field">
              <span>{t("admin.imageBackgrounds.name")}</span>
              <input value={form.name} onChange={(event) => updateForm('name', event.target.value)} placeholder={t("admin.imageBackgrounds.namePlaceholder")} />
            </label>
            <label className="video-background-field">
              <span>{t("admin.imageBackgrounds.file")}</span>
              <input id="image-background-file" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} />
            </label>
            <div className="video-background-field-row two">
              <label className="video-background-field"><span>{t("admin.imageBackgrounds.family")}</span><input value={form.family} onChange={(event) => updateForm('family', event.target.value)} /></label>
              <label className="video-background-field"><span>{t("admin.imageBackgrounds.season")}</span><input value={form.season} onChange={(event) => updateForm('season', event.target.value)} /></label>
            </div>
            <label className="video-background-field"><span>{t("admin.imageBackgrounds.moods")}</span><input value={form.moods} onChange={(event) => updateForm('moods', event.target.value)} /></label>
            <label className="video-background-field"><span>{t("admin.imageBackgrounds.industries")}</span><input value={form.industries} onChange={(event) => updateForm('industries', event.target.value)} /></label>
            <label className="video-background-field"><span>{t("admin.imageBackgrounds.campaigns")}</span><input value={form.campaigns} onChange={(event) => updateForm('campaigns', event.target.value)} /></label>
            <label className="video-background-field"><span>{t("admin.imageBackgrounds.colors")}</span><input value={form.colors} onChange={(event) => updateForm('colors', event.target.value)} /></label>
            <div className="video-background-field-row three">
              <label className="video-background-field">
                <span>{t("admin.imageBackgrounds.brightness")}</span>
                <select value={form.brightness} onChange={(event) => updateForm('brightness', event.target.value)}>
                  <option value="light">{t("admin.imageBackgrounds.light")}</option>
                  <option value="medium">{t("admin.imageBackgrounds.medium")}</option>
                  <option value="dark">{t("admin.imageBackgrounds.dark")}</option>
                </select>
              </label>
              <label className="video-background-field">
                <span>{t("admin.imageBackgrounds.priority")}</span>
                <input type="number" value={form.priority} onChange={(event) => updateForm('priority', event.target.value)} />
              </label>
            </div>
            <label className="video-background-field"><span>{t("admin.imageBackgrounds.notes")}</span><textarea rows={3} value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} /></label>
            <div className="video-background-checkboxes">
              <label><input type="checkbox" checked={form.text_safe} onChange={(event) => updateForm('text_safe', event.target.checked)} /> {t("admin.imageBackgrounds.textSafe")}</label>
              <label><input type="checkbox" checked={form.label_safe} onChange={(event) => updateForm('label_safe', event.target.checked)} /> {t("admin.imageBackgrounds.labelSafe")}</label>
              <label><input type="checkbox" checked={form.crop_safe_1x1} onChange={(event) => updateForm('crop_safe_1x1', event.target.checked)} /> {t("admin.imageBackgrounds.cropSafe")}</label>
              <label><input type="checkbox" checked={form.active} onChange={(event) => updateForm('active', event.target.checked)} /> {t("admin.imageBackgrounds.active")}</label>
              <label><input type="checkbox" checked={form.is_fallback} onChange={(event) => updateForm('is_fallback', event.target.checked)} /> {t("admin.imageBackgrounds.fallback")}</label>
            </div>
            <button type="submit" className="admin-primary-button" disabled={uploading}>
              {uploading ? <Loader2 className="admin-spin" size={16} /> : <UploadCloud size={16} />} {t("admin.imageBackgrounds.upload")}
            </button>
          </form>

          <div className="video-background-library">
            {loading ? (
              <div className="admin-loading-card"><Loader2 className="admin-spin" size={18} /> {t("admin.imageBackgrounds.loading")}</div>
            ) : assets.length ? (
              <div className="video-background-library__list">
                {assets.map((asset) => (
                  <article className="video-background-card" key={asset.id}>
                    <div className="video-background-card__preview"><FilePreview asset={asset} t={t} /></div>
                    <div className="video-background-card__body">
                      <div className="video-background-card__title-row">
                        <div>
                          <h3>{asset.name}</h3>
                          <p>{asset.family || 'abstract'} · {asset.width || 0} × {asset.height || 0}</p>
                        </div>
                        <div className="video-background-card__status-row">
                          {asset.active !== false ? <span className="video-background-pill active"><CheckCircle2 size={12} /> {t("admin.imageBackgrounds.active")}</span> : null}
                          {asset.is_fallback ? <span className="video-background-pill fallback"><Star size={12} /> {t("admin.imageBackgrounds.fallback")}</span> : null}
                        </div>
                      </div>
                      <div className="video-background-meta"><strong>{t("admin.imageBackgrounds.moods")}:</strong> {formatTags(asset.moods) || '—'}</div>
                      <div className="video-background-meta"><strong>{t("admin.imageBackgrounds.industries")}:</strong> {formatTags(asset.industries) || '—'}</div>
                      <div className="video-background-meta"><strong>{t("admin.imageBackgrounds.campaigns")}:</strong> {formatTags(asset.campaigns) || '—'}</div>
                      <div className="video-background-card__actions">
                        <button type="button" onClick={() => startEdit(asset)}><Pencil size={14} /> {t("admin.imageBackgrounds.edit")}</button>
                        <button type="button" onClick={() => deleteAsset(asset.id)} className="danger"><Trash2 size={14} /> {t("admin.imageBackgrounds.delete")}</button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="admin-empty-state">{t("admin.imageBackgrounds.none")}</div>
            )}
          </div>
        </section>

        {editingAsset && editForm ? (
          <div className="video-background-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEdit(); }}>
            <section className="video-background-modal" role="dialog" aria-modal="true" aria-label={t("admin.imageBackgrounds.editTitle")}>
              <div className="video-background-modal__header">
                <div>
                  <h2>{t("admin.imageBackgrounds.editTitle")}</h2>
                  <p>{t("admin.imageBackgrounds.editText")}</p>
                </div>
                <button type="button" onClick={closeEdit} className="video-background-icon-button"><X size={18} /></button>
              </div>
              <div className="video-background-modal__layout">
                <div className="video-background-modal__preview"><FilePreview asset={editingAsset} t={t} /></div>
                <div className="video-background-modal__fields">
                  <label className="video-background-field"><span>{t("admin.imageBackgrounds.name")}</span><input value={editForm.name || ''} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} /></label>
                  <div className="video-background-field-row two">
                    <label className="video-background-field"><span>{t("admin.imageBackgrounds.family")}</span><input value={editForm.family || ''} onChange={(event) => setEditForm((current) => ({ ...current, family: event.target.value }))} /></label>
                    <label className="video-background-field"><span>{t("admin.imageBackgrounds.season")}</span><input value={editForm.season || ''} onChange={(event) => setEditForm((current) => ({ ...current, season: event.target.value }))} /></label>
                  </div>
                  <label className="video-background-field"><span>{t("admin.imageBackgrounds.moods")}</span><input value={editForm.moods || ''} onChange={(event) => setEditForm((current) => ({ ...current, moods: event.target.value }))} /></label>
                  <label className="video-background-field"><span>{t("admin.imageBackgrounds.industries")}</span><input value={editForm.industries || ''} onChange={(event) => setEditForm((current) => ({ ...current, industries: event.target.value }))} /></label>
                  <label className="video-background-field"><span>{t("admin.imageBackgrounds.campaigns")}</span><input value={editForm.campaigns || ''} onChange={(event) => setEditForm((current) => ({ ...current, campaigns: event.target.value }))} /></label>
                  <label className="video-background-field"><span>{t("admin.imageBackgrounds.colors")}</span><input value={editForm.colors || ''} onChange={(event) => setEditForm((current) => ({ ...current, colors: event.target.value }))} /></label>
                  <div className="video-background-field-row three">
                    <label className="video-background-field"><span>{t("admin.imageBackgrounds.brightness")}</span><select value={editForm.brightness || 'light'} onChange={(event) => setEditForm((current) => ({ ...current, brightness: event.target.value }))}><option value="light">{t("admin.imageBackgrounds.light")}</option><option value="medium">{t("admin.imageBackgrounds.medium")}</option><option value="dark">{t("admin.imageBackgrounds.dark")}</option></select></label>
                    <label className="video-background-field"><span>{t("admin.imageBackgrounds.priority")}</span><input type="number" value={editForm.priority ?? 0} onChange={(event) => setEditForm((current) => ({ ...current, priority: event.target.value }))} /></label>
                  </div>
                  <label className="video-background-field"><span>{t("admin.imageBackgrounds.notes")}</span><textarea rows={3} value={editForm.notes || ''} onChange={(event) => setEditForm((current) => ({ ...current, notes: event.target.value }))} /></label>
                  <div className="video-background-checkboxes">
                    <label><input type="checkbox" checked={editForm.text_safe !== false} onChange={(event) => setEditForm((current) => ({ ...current, text_safe: event.target.checked }))} /> {t("admin.imageBackgrounds.textSafe")}</label>
                    <label><input type="checkbox" checked={editForm.label_safe !== false} onChange={(event) => setEditForm((current) => ({ ...current, label_safe: event.target.checked }))} /> {t("admin.imageBackgrounds.labelSafe")}</label>
                    <label><input type="checkbox" checked={editForm.crop_safe_1x1 !== false} onChange={(event) => setEditForm((current) => ({ ...current, crop_safe_1x1: event.target.checked }))} /> {t("admin.imageBackgrounds.cropSafe")}</label>
                    <label><input type="checkbox" checked={editForm.active !== false} onChange={(event) => setEditForm((current) => ({ ...current, active: event.target.checked }))} /> {t("admin.imageBackgrounds.active")}</label>
                    <label><input type="checkbox" checked={Boolean(editForm.is_fallback)} onChange={(event) => setEditForm((current) => ({ ...current, is_fallback: event.target.checked }))} /> {t("admin.imageBackgrounds.fallback")}</label>
                  </div>
                </div>
              </div>
              <div className="video-background-modal__actions">
                <button type="button" className="admin-secondary-button" onClick={closeEdit}>{t("admin.imageBackgrounds.cancel")}</button>
                <button type="button" className="admin-primary-button" onClick={saveEdit} disabled={savingEdit}>{savingEdit ? <Loader2 className="admin-spin" size={16} /> : null} {t("admin.imageBackgrounds.save")}</button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </AppLayout>
  );
}

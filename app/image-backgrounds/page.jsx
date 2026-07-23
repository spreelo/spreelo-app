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

async function getAuthHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Your login session has expired.');
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  };
}

function formatTags(values) {
  return (Array.isArray(values) ? values : []).join(', ');
}

function FilePreview({ asset }) {
  if (!asset?.public_url) {
    return <div className="video-background-card__preview-fallback">No preview</div>;
  }
  return <img src={asset.public_url} alt={asset.name || 'Background'} className="video-background-card__poster" />;
}

export default function ImageBackgroundsPage() {
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
      const headers = await getAuthHeaders();
      const response = await fetch('/api/image-backgrounds', { headers });
      const payload = await response.json();

      if (!response.ok) {
        setConfigurationMissing(Boolean(payload?.configurationMissing));
        throw new Error(payload?.error || 'Could not load the background library.');
      }

      setAssets(payload.assets || []);
    } catch (loadError) {
      setError(loadError.message || 'Could not load the background library.');
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
        reject(new Error('The selected image could not be read.'));
      };
      image.src = objectUrl;
    });
  }

  async function handleUpload(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!file) return setError('Choose a square background image first.');
    if (!form.name.trim()) return setError('Give the background a clear internal name.');

    setUploading(true);

    try {
      const metadata = await getImageMetadata(file);
      if (metadata.width !== 1080 || metadata.height !== 1080) {
        URL.revokeObjectURL(metadata.objectUrl);
        throw new Error('Image backgrounds must be exactly 1080 × 1080 (1:1).');
      }
      URL.revokeObjectURL(metadata.objectUrl);

      const headers = await getAuthHeaders();
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
      if (!createResponse.ok) throw new Error(uploadData?.error || 'Could not prepare the upload.');

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
      if (!completeResponse.ok) throw new Error(completeData?.error || 'Could not save the background metadata.');

      setAssets((current) => [completeData.asset, ...current]);
      setForm(EMPTY_FORM);
      setFile(null);
      const input = document.getElementById('image-background-file');
      if (input) input.value = '';
      setMessage('Background uploaded and added to the automatic selection library.');
    } catch (uploadError) {
      setError(uploadError.message || 'Could not upload the background.');
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
      const headers = await getAuthHeaders();
      const response = await fetch('/api/image-backgrounds', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ ...editForm, id: editingAsset.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Could not save the background.');

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
      setMessage(`${payload.asset.name} saved.`);
    } catch (saveError) {
      setError(saveError.message || 'Could not save the background.');
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteAsset(id) {
    if (!id || !window.confirm('Delete this background from the shared library?')) return;
    setError('');
    setMessage('');

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/image-backgrounds?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Could not delete the background.');

      setAssets((current) => current.filter((asset) => asset.id !== id));
      if (editingAsset?.id === id) closeEdit();
      setMessage('Background removed from the library.');
    } catch (deleteError) {
      setError(deleteError.message || 'Could not delete the background.');
    }
  }

  return (
    <AppLayout active="admin">
      <div className="video-backgrounds-page admin-page">
        <header className="admin-hero compact">
          <div>
            <span className="admin-eyebrow">Creative library</span>
            <h1>Image backgrounds</h1>
            <p>Upload and manage reusable square backgrounds for product carousel cards.</p>
          </div>
          <div className="video-backgrounds-summary">
            <div>
              <strong>{assets.length}</strong>
              <span>Total assets</span>
            </div>
            <div>
              <strong>{activeCount}</strong>
              <span>Active</span>
            </div>
          </div>
        </header>

        {configurationMissing ? (
          <div className="video-backgrounds-alert warning">
            <ShieldAlert size={18} /> Configure SPREELO_ADMIN_EMAILS or SPREELO_ADMIN_USER_IDS to unlock the shared library.
          </div>
        ) : null}
        {error ? <div className="video-backgrounds-alert error">{error}</div> : null}
        {message ? <div className="video-backgrounds-alert success">{message}</div> : null}

        <section className="video-backgrounds-grid">
          <form className="video-background-card video-background-upload" onSubmit={handleUpload}>
            <div className="video-background-card__header">
              <div>
                <h2>Upload new background</h2>
                <p>Use 1080 × 1080 PNG, JPG or WEBP. These assets are used behind transparent product images.</p>
              </div>
              <span className="video-background-card__icon"><ImagePlus size={22} /></span>
            </div>

            <label className="video-background-field">
              <span>Name</span>
              <input value={form.name} onChange={(event) => updateForm('name', event.target.value)} placeholder="Soft beige studio" />
            </label>
            <label className="video-background-field">
              <span>File</span>
              <input id="image-background-file" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} />
            </label>
            <div className="video-background-field-row two">
              <label className="video-background-field"><span>Family</span><input value={form.family} onChange={(event) => updateForm('family', event.target.value)} /></label>
              <label className="video-background-field"><span>Season</span><input value={form.season} onChange={(event) => updateForm('season', event.target.value)} /></label>
            </div>
            <label className="video-background-field"><span>Moods</span><input value={form.moods} onChange={(event) => updateForm('moods', event.target.value)} /></label>
            <label className="video-background-field"><span>Industries</span><input value={form.industries} onChange={(event) => updateForm('industries', event.target.value)} /></label>
            <label className="video-background-field"><span>Campaigns</span><input value={form.campaigns} onChange={(event) => updateForm('campaigns', event.target.value)} /></label>
            <label className="video-background-field"><span>Colors</span><input value={form.colors} onChange={(event) => updateForm('colors', event.target.value)} /></label>
            <div className="video-background-field-row three">
              <label className="video-background-field">
                <span>Brightness</span>
                <select value={form.brightness} onChange={(event) => updateForm('brightness', event.target.value)}>
                  <option value="light">Light</option>
                  <option value="medium">Medium</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
              <label className="video-background-field">
                <span>Priority</span>
                <input type="number" value={form.priority} onChange={(event) => updateForm('priority', event.target.value)} />
              </label>
            </div>
            <label className="video-background-field"><span>Notes</span><textarea rows={3} value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} /></label>
            <div className="video-background-checkboxes">
              <label><input type="checkbox" checked={form.text_safe} onChange={(event) => updateForm('text_safe', event.target.checked)} /> Text safe</label>
              <label><input type="checkbox" checked={form.label_safe} onChange={(event) => updateForm('label_safe', event.target.checked)} /> Label safe</label>
              <label><input type="checkbox" checked={form.crop_safe_1x1} onChange={(event) => updateForm('crop_safe_1x1', event.target.checked)} /> Crop safe 1:1</label>
              <label><input type="checkbox" checked={form.active} onChange={(event) => updateForm('active', event.target.checked)} /> Active</label>
              <label><input type="checkbox" checked={form.is_fallback} onChange={(event) => updateForm('is_fallback', event.target.checked)} /> Fallback</label>
            </div>
            <button type="submit" className="admin-primary-button" disabled={uploading}>
              {uploading ? <Loader2 className="admin-spin" size={16} /> : <UploadCloud size={16} />} Upload background
            </button>
          </form>

          <div className="video-background-library">
            {loading ? (
              <div className="admin-loading-card"><Loader2 className="admin-spin" size={18} /> Loading library…</div>
            ) : assets.length ? (
              <div className="video-background-library__list">
                {assets.map((asset) => (
                  <article className="video-background-card" key={asset.id}>
                    <div className="video-background-card__preview"><FilePreview asset={asset} /></div>
                    <div className="video-background-card__body">
                      <div className="video-background-card__title-row">
                        <div>
                          <h3>{asset.name}</h3>
                          <p>{asset.family || 'abstract'} · {asset.width || 0} × {asset.height || 0}</p>
                        </div>
                        <div className="video-background-card__status-row">
                          {asset.active !== false ? <span className="video-background-pill active"><CheckCircle2 size={12} /> Active</span> : null}
                          {asset.is_fallback ? <span className="video-background-pill fallback"><Star size={12} /> Fallback</span> : null}
                        </div>
                      </div>
                      <div className="video-background-meta"><strong>Moods:</strong> {formatTags(asset.moods) || '—'}</div>
                      <div className="video-background-meta"><strong>Industries:</strong> {formatTags(asset.industries) || '—'}</div>
                      <div className="video-background-meta"><strong>Campaigns:</strong> {formatTags(asset.campaigns) || '—'}</div>
                      <div className="video-background-card__actions">
                        <button type="button" onClick={() => startEdit(asset)}><Pencil size={14} /> Edit</button>
                        <button type="button" onClick={() => deleteAsset(asset.id)} className="danger"><Trash2 size={14} /> Delete</button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="admin-empty-state">No backgrounds uploaded yet.</div>
            )}
          </div>
        </section>

        {editingAsset && editForm ? (
          <div className="video-background-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEdit(); }}>
            <section className="video-background-modal" role="dialog" aria-modal="true" aria-label="Edit background">
              <div className="video-background-modal__header">
                <div>
                  <h2>Edit background</h2>
                  <p>Update matching tags and quality settings for automatic selection.</p>
                </div>
                <button type="button" onClick={closeEdit} className="video-background-icon-button"><X size={18} /></button>
              </div>
              <div className="video-background-modal__layout">
                <div className="video-background-modal__preview"><FilePreview asset={editingAsset} /></div>
                <div className="video-background-modal__fields">
                  <label className="video-background-field"><span>Name</span><input value={editForm.name || ''} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} /></label>
                  <div className="video-background-field-row two">
                    <label className="video-background-field"><span>Family</span><input value={editForm.family || ''} onChange={(event) => setEditForm((current) => ({ ...current, family: event.target.value }))} /></label>
                    <label className="video-background-field"><span>Season</span><input value={editForm.season || ''} onChange={(event) => setEditForm((current) => ({ ...current, season: event.target.value }))} /></label>
                  </div>
                  <label className="video-background-field"><span>Moods</span><input value={editForm.moods || ''} onChange={(event) => setEditForm((current) => ({ ...current, moods: event.target.value }))} /></label>
                  <label className="video-background-field"><span>Industries</span><input value={editForm.industries || ''} onChange={(event) => setEditForm((current) => ({ ...current, industries: event.target.value }))} /></label>
                  <label className="video-background-field"><span>Campaigns</span><input value={editForm.campaigns || ''} onChange={(event) => setEditForm((current) => ({ ...current, campaigns: event.target.value }))} /></label>
                  <label className="video-background-field"><span>Colors</span><input value={editForm.colors || ''} onChange={(event) => setEditForm((current) => ({ ...current, colors: event.target.value }))} /></label>
                  <div className="video-background-field-row three">
                    <label className="video-background-field"><span>Brightness</span><select value={editForm.brightness || 'light'} onChange={(event) => setEditForm((current) => ({ ...current, brightness: event.target.value }))}><option value="light">Light</option><option value="medium">Medium</option><option value="dark">Dark</option></select></label>
                    <label className="video-background-field"><span>Priority</span><input type="number" value={editForm.priority ?? 0} onChange={(event) => setEditForm((current) => ({ ...current, priority: event.target.value }))} /></label>
                  </div>
                  <label className="video-background-field"><span>Notes</span><textarea rows={3} value={editForm.notes || ''} onChange={(event) => setEditForm((current) => ({ ...current, notes: event.target.value }))} /></label>
                  <div className="video-background-checkboxes">
                    <label><input type="checkbox" checked={editForm.text_safe !== false} onChange={(event) => setEditForm((current) => ({ ...current, text_safe: event.target.checked }))} /> Text safe</label>
                    <label><input type="checkbox" checked={editForm.label_safe !== false} onChange={(event) => setEditForm((current) => ({ ...current, label_safe: event.target.checked }))} /> Label safe</label>
                    <label><input type="checkbox" checked={editForm.crop_safe_1x1 !== false} onChange={(event) => setEditForm((current) => ({ ...current, crop_safe_1x1: event.target.checked }))} /> Crop safe 1:1</label>
                    <label><input type="checkbox" checked={editForm.active !== false} onChange={(event) => setEditForm((current) => ({ ...current, active: event.target.checked }))} /> Active</label>
                    <label><input type="checkbox" checked={Boolean(editForm.is_fallback)} onChange={(event) => setEditForm((current) => ({ ...current, is_fallback: event.target.checked }))} /> Fallback</label>
                  </div>
                </div>
              </div>
              <div className="video-background-modal__actions">
                <button type="button" className="admin-secondary-button" onClick={closeEdit}>Cancel</button>
                <button type="button" className="admin-primary-button" onClick={saveEdit} disabled={savingEdit}>{savingEdit ? <Loader2 className="admin-spin" size={16} /> : null} Save</button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </AppLayout>
  );
}

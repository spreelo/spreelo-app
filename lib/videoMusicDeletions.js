// One immutable object per deleted id prevents concurrent catalog writes from
// bringing deleted music back. No schema migration is required.
export const VIDEO_MUSIC_DELETION_PREFIX = "catalog/deleted";
export function isMissingMusicCatalog(error) {
  return String(error?.statusCode || error?.status || "") === "404" ||
    /^(object not found|the resource was not found|not found)$/i.test(String(error?.message || "").trim());
}
export async function loadVideoMusicDeletedIds(storage) {
  const ids = new Set();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await storage.list(VIDEO_MUSIC_DELETION_PREFIX, {
      limit: 1000, offset, sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`Could not read music deletions: ${error.message || error}`);
    for (const item of data || []) {
      if (item.name?.endsWith(".json")) ids.add(item.name.slice(0, -5));
    }
    if ((data || []).length < 1000) return ids;
  }
}
export async function markVideoMusicDeleted(storage, id) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("Invalid music track id.");
  const { error } = await storage.upload(`${VIDEO_MUSIC_DELETION_PREFIX}/${id}.json`,
    Buffer.from(JSON.stringify({ id, deleted_at: new Date().toISOString() })),
    { contentType: "application/json", upsert: true, cacheControl: "0" });
  if (error) throw new Error(`Could not persist music deletion: ${error.message || error}`);
}
export function excludeDeletedVideoMusic(catalog, ids) {
  return { ...catalog, tracks: (catalog.tracks || []).filter(track => !ids.has(track.id)) };
}

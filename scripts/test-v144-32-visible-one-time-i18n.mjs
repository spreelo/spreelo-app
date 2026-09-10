import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const uiHook = read('lib/i18n/useUiText.js');
const uiRoute = read('app/api/ui-translations/route.js');
const defaults = read('lib/i18n/defaultLabels.js');

function assert(ok, msg) { if (!ok) throw new Error(msg); }

assert(defaults.includes('export const DEFAULT_UI_LOCALE = "en"'), 'English must remain the canonical source locale');
assert(uiHook.includes('INCOMPLETE_TRANSLATION_RETRY_MS = 5 * 60 * 1000'), 'incomplete packs must retry after a bounded short cooldown');
assert(!uiHook.includes('locale !== DEFAULT_UI_LOCALE && loading && fallbackText'), 'missing translations must never intentionally render blank');
assert(uiHook.includes('return interpolateUiText(fallbackText || key, values);'), 'English source labels must remain visible while translation is pending');
assert(uiRoute.includes('TRANSLATION_FETCH_TIMEOUT_MS = 24000'), 'translation provider gets a realistic response window');
assert(uiRoute.includes('TRANSLATION_DEFER_MS = 5 * 60 * 1000'), 'transient failures must not defer labels for hours');
assert(uiRoute.includes('remainingMs > TRANSLATION_DEFER_MS + 30_000'), 'legacy six-hour deferred entries must be invalidated');
assert(uiRoute.includes('.from("ui_translation_packs")'), 'successful translations must remain persistent globally');
assert(uiRoute.includes('status: "ready"'), 'failed keys must release the lease instead of leaving an eternal updating lock');
assert(uiRoute.includes('deferred_keys'), 'failed keys must be persisted as bounded deferred metadata');
assert(uiRoute.includes('source_fingerprints'), 'packs must persist per-key English source fingerprints');
assert(uiRoute.includes('claimTranslationPack'), 'the first translation must use a database-backed single-flight claim');

console.log('v144.32 visible one-time i18n regression checks passed');

// v328: provider probes are deliberately bounded and never modify active settings.
// A probe proves only basic API compatibility, not creative quality or production reliability.
export const OPENAI_PROBE_LIMIT = 2;
export const OPENAI_IMAGE_PROBE_LIMIT = 1;
const OPENAI_ENDPOINT = 'https://api.openai.com/v1';
const TIMEOUT_MS = 28000;

export function modelKind(model) {
  const id = String(model || '').toLowerCase();
  if (!/^gpt-[a-z0-9][a-z0-9._-]{0,100}$/.test(id)) return null;
  if (id.includes('image')) return 'image';
  if (id.includes('audio') || id.includes('realtime') || id.includes('transcribe') || id.includes('tts')) return null;
  // Prevent random experimental, fine-tuned and dated checkpoints being probed automatically.
  if (/\bpreview\b|^gpt-.*(?:ft:|search|codex)/.test(id)) return null;
  return 'text';
}

async function openaiRequest(key, path, body) {
  const r = await fetch(`${OPENAI_ENDPOINT}${path}`, {
    method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const response = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`OpenAI HTTP ${r.status}: ${String(response?.error?.message || 'request rejected').slice(0,180)}`);
  return response;
}

export function extractResponseText(json) {
  if (typeof json?.output_text === 'string') return json.output_text.trim();
  return (json?.output || []).flatMap(x => x?.content || [])
    .filter(x => x?.type === 'output_text').map(x => x.text || '').join(' ').trim();
}

async function checkText(key, model, input, opts = {}) {
  const json = await openaiRequest(key, '/responses', { model, input, max_output_tokens: 160, ...opts });
  const output = extractResponseText(json).toUpperCase();
  if (!output.includes('SPREELO_OK')) throw new Error('API responded but did not follow the deterministic probe');
}

export async function probeTextModel(key, model) {
  const result = { capabilities: [], notes: [] };
  await checkText(key, model, 'Reply with exactly SPREELO_OK and nothing else.');
  result.capabilities.push('text');
  result.notes.push('Responses API text smoke test passed');
  // Reasoning support must be proven by accepting the reasoning parameter.
  try {
    await checkText(key, model, 'Reply with exactly SPREELO_OK.', { reasoning: { effort: 'low' } });
    result.capabilities.push('text_reasoning');
    result.notes.push('Responses reasoning parameter accepted');
  } catch { result.notes.push('Reasoning parameter not verified'); }
  try {
    // Generate an actual image, rather than inferring vision from model naming.
    const { default: sharp } = await import('sharp');
    const png = await sharp({create:{width:64,height:64,channels:3,background:'#164eda'}}).png().toBuffer();
    const input = [{role:'user',content:[
      {type:'input_text',text:'Inspect the image, then reply with exactly SPREELO_OK.'},
      {type:'input_image',image_url:`data:image/png;base64,${png.toString('base64')}`},
    ]}];
    await checkText(key, model, input);
    result.capabilities.push('text_vision');
    result.notes.push('Responses image input smoke test passed');
  } catch { result.notes.push('Vision input not verified'); }
  return result;
}

export function inspectAlphaPixels({channels, hasAlpha, data}) {
  if (!hasAlpha || channels !== 4 || !data || data.length < 16) return false;
  let transparent = 0, opaque = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] <= 32) transparent++;
    if (data[i] >= 223) opaque++;
  }
  const n = data.length / 4;
  return transparent >= n * 0.02 && opaque >= n * 0.02;
}

export async function probeImageModel(key, model) {
  const base = {model, prompt:'A centered solid bright red circle, isolated, with generous empty space around it. No text.', size:'1024x1024', quality:'low', output_format:'png', n:1};
  // One paid image generation is enough to verify normal output and true alpha.
  // Models rejecting alpha remain pending instead of being automatically treated as safe.
  const json = await openaiRequest(key, '/images/generations', {...base, background:'transparent'});
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64 || b64.length > 22000000) throw new Error('No valid bounded image payload returned');
  const image = Buffer.from(b64,'base64');
  const {default:sharp} = await import('sharp');
  const meta = await sharp(image).metadata();
  if (meta.format !== 'png' || (meta.width || 0) < 128 || (meta.height || 0) < 128) throw new Error('Image output did not match the requested PNG format');
  const {data,info} = await sharp(image).resize(64,64).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const alpha = inspectAlphaPixels({channels:info.channels,hasAlpha:meta.hasAlpha,data});
  return {capabilities:alpha?['image','image_alpha']:['image'],notes:[alpha?'Generated PNG passed pixel alpha verification':'Image created, but real transparent AND opaque pixels were not both verified']};
}

export async function runOpenAiProbe(key, model) {
  const kind = modelKind(model);
  if (!kind) throw new Error('This model type is not supported for unattended verification');
  const result = kind === 'image' ? await probeImageModel(key, model) : await probeTextModel(key, model);
  return { ...result, kind, passed: result.capabilities.length > 0 };
}

export function acceptedForPurpose(model, provider, capability, catalog = []) {
  return catalog.some(r => r.provider === provider && r.model === model && r.status === 'approved' &&
    Array.isArray(r.verified_capabilities) && r.verified_capabilities.includes(capability));
}

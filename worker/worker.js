/* ═══════════════════════════════════════════════════════════════════
   TAMATO — CLOUDFLARE WORKER
   Routes all AI calls. Keeps API keys server-side.
     Pythm-4.5o mini  → Groq    (llama-3.3-70b-versatile)
     Pythm 4.5        → Anthropic (claude-haiku-4-5)
     Metrio 4.6       → Anthropic (claude-sonnet-4-6)
     Megisto 4.8      → Anthropic (claude-opus-4-8)
   Also serves the public Megisto API for tm-meg-* keys.
   Env vars: GROQ_API_KEY, ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
═══════════════════════════════════════════════════════════════════ */

const ANTHROPIC_VERSION = '2023-06-01';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const GROQ_MODELS = new Set(['llama-3.3-70b-versatile']);

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const url = new URL(request.url);

    // Public Megisto API (tm-meg-* keys)
    if (url.pathname.startsWith('/v1/generate')) {
      return handleApiGenerate(request, env);
    }

    return handleChat(request, env);
  },
};

/* ── Standard chat / generation routing ────────────────────────── */
async function handleChat(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { model, messages, stream = false, max_tokens = 8000 } = body;
  if (!model || !Array.isArray(messages)) return json({ error: 'model and messages required' }, 400);

  if (GROQ_MODELS.has(model)) return callGroq({ model, messages, stream, max_tokens }, env);
  return callAnthropic({ model, messages, stream, max_tokens }, env);
}

/* ── Groq (OpenAI-compatible) ──────────────────────────────────── */
async function callGroq({ model, messages, stream, max_tokens }, env) {
  const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.GROQ_API_KEY },
    body: JSON.stringify({ model, messages, stream, max_tokens }),
  });
  return passthrough(upstream, stream);
}

/* ── Anthropic ─────────────────────────────────────────────────── */
async function callAnthropic({ model, messages, stream, max_tokens }, env) {
  // Split out system messages → Anthropic's top-level system field
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const convo = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }));

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({ model, system: system || undefined, messages: convo, stream, max_tokens }),
  });
  return passthrough(upstream, stream, true);
}

/* ── Public API: POST /v1/generate (Bearer tm-meg-*) ───────────── */
async function handleApiGenerate(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const key = auth.replace(/^Bearer\s+/i, '').trim();
  if (!key.startsWith('tm-meg-')) return json({ error: 'Invalid API key' }, 401);

  const keyRow = await validateApiKey(key, env);
  if (!keyRow) return json({ error: 'Invalid or inactive API key' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { prompt, mode = 'both', stream = false } = body;
  if (!prompt) return json({ error: 'prompt required' }, 400);

  // Routed to Megisto (claude-opus-4-8)
  const modes = mode === 'both' ? ['desktop', 'mobile'] : [mode];
  const result = {}; let inTok = 0, outTok = 0;

  for (const m of modes) {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': ANTHROPIC_VERSION },
      body: JSON.stringify({
        model: 'claude-opus-4-8', max_tokens: 8000,
        system: m === 'mobile' ? MOBILE_SYS : DESKTOP_SYS,
        messages: [{ role: 'user', content: USER_MSG(prompt) }],
      }),
    });
    if (!upstream.ok) return json({ error: 'Generation failed' }, 502);
    const data = await upstream.json();
    result[m + '_html'] = (data.content && data.content[0] && data.content[0].text) || '';
    inTok += data.usage?.input_tokens || 0;
    outTok += data.usage?.output_tokens || 0;
  }

  await logApiUsage(keyRow.id, inTok, outTok, env);
  const credits_used = Math.max(1, Math.ceil(((inTok + outTok) / 1.33) / 3000)) * 8;
  return json({ ...result, tokens: { input: inTok, output: outTok }, credits_used });
}

/* ── Supabase helpers (service key) ────────────────────────────── */
async function validateApiKey(key, env) {
  const res = await fetch(env.SUPABASE_URL + '/rest/v1/api_keys?key=eq.' + encodeURIComponent(key) + '&active=eq.true&select=*', {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

async function logApiUsage(id, inTok, outTok, env) {
  // increment token counters
  await fetch(env.SUPABASE_URL + '/rest/v1/rpc/increment_api_usage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY },
    body: JSON.stringify({ p_id: id, p_in: inTok, p_out: outTok }),
  }).catch(() => {}); // TODO: create increment_api_usage RPC or use PATCH
}

/* ── Utilities ─────────────────────────────────────────────────── */
function passthrough(upstream, stream, anthropic = false) {
  if (!upstream.ok && !stream) {
    return upstream.text().then(t => json({ error: 'Upstream error', detail: t }, upstream.status));
  }
  if (stream) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    });
  }
  // normalize non-stream body
  return upstream.json().then(data => {
    if (anthropic) {
      return json({ text: data.content?.[0]?.text || '', usage: data.usage || {} });
    }
    const choice = data.choices?.[0]?.message?.content || '';
    return json({ text: choice, usage: data.usage || {} });
  });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

/* ── System prompts for the public API ─────────────────────────── */
const DESKTOP_SYS = `You are an expert web designer and developer. Generate a complete, production-ready, single-file HTML website.
Rules:
- Complete site in one HTML file. All CSS in style tag. All JS in script tag.
- Completely unique design — no generic templates, no Bootstrap, no cookie-cutter layouts.
- Every site must look structurally different from any other site ever generated.
- Real, specific placeholder content relevant to the described business.
- Desktop-optimized (min-width: 1024px). Always include navigation, hero, minimum 3 content sections, footer.
- Modern CSS: flexbox, grid, custom properties, clamp(). Scroll-triggered animations, hover micro-interactions.
- Google Fonts only (import via @import in style tag).
- Return ONLY raw HTML starting with <!DOCTYPE html>. No explanation. No markdown. No code fences.`;

const MOBILE_SYS = `You are an expert mobile web designer. Generate a complete mobile-optimized HTML website.
Rules:
- Complete site in one HTML file. All CSS in style tag. All JS in script tag.
- Mobile-first for screens under 768px — assume 375px viewport.
- Touch-friendly tap targets (minimum 44px). Stacked single-column layouts. Hamburger navigation. Minimum 16px body text.
- Google Fonts only. Return ONLY raw HTML starting with <!DOCTYPE html>. No explanation. No markdown. No code fences.`;

const USER_MSG = (p) => `Business/site description: ${p}
Generate a complete, unique, visually impressive website. Make design decisions a senior designer at a top agency would be proud of.`;

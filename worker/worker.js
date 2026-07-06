/* ═══════════════════════════════════════════════════════════════════
   TAMATO — CLOUDFLARE WORKER
   Routes all AI calls. Keeps API keys server-side.
     pythm-mini    → Groq       (llama-3.3-70b-versatile)  — free tier
     pythm-4.5     → Anthropic  (claude-haiku-4-5)          — standard
     metrio-4.6    → Anthropic  (claude-sonnet-4-6)         — advanced
     megisto-4.8   → Anthropic  (claude-opus-4-8)           — frontier/agency
     krator        → Anthropic  (claude-fable-5)            — frontier-class
   Also serves the public Megisto API for tm-meg-* keys, and Stripe
   checkout/portal/webhook routes for payments.
   Env vars: GROQ_API_KEY, ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY,
             STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
═══════════════════════════════════════════════════════════════════ */

const ANTHROPIC_VERSION = '2024-10-22';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const ANTHROPIC_MODEL_MAP = {
  'pythm-4.5':   'claude-haiku-4-5',
  'metrio-4.6':  'claude-sonnet-4-6',
  'megisto-4.8': 'claude-opus-4-8',
  'krator':      'claude-fable-5',
};
const GROQ_MODEL_MAP = {
  'pythm-mini': 'llama-3.3-70b-versatile',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(request.url);

    // Public Megisto API (tm-meg-* keys)
    if (url.pathname.startsWith('/v1/generate')) {
      if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
      return handleApiGenerate(request, env);
    }

    // Stripe payments
    if (url.pathname === '/api/checkout') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
      return handleCheckout(request, env);
    }
    if (url.pathname === '/api/portal') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
      return handlePortal(request, env);
    }
    if (url.pathname === '/api/stripe-webhook') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
      return handleStripeWebhook(request, env);
    }

    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    return handleChat(request, env);
  },
};

/* ── Standard chat / generation routing ────────────────────────── */
async function handleChat(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { model, messages, system, stream = false, max_tokens = 1024 } = body;
  if (!model || !Array.isArray(messages)) {
    return json({ error: 'Missing required fields: model, messages' }, 400);
  }

  if (GROQ_MODEL_MAP[model]) {
    return handleGroq({ tamatoModel: model, messages, system, max_tokens, stream, env });
  }
  if (ANTHROPIC_MODEL_MAP[model]) {
    return handleAnthropic({ tamatoModel: model, messages, system, max_tokens, stream, env });
  }
  return json({ error: `Unknown model: ${model}` }, 400);
}

/* ── Groq (OpenAI-compatible) — pythm-mini ──────────────────────── */
async function handleGroq({ tamatoModel, messages, system, max_tokens, stream, env }) {
  const groqMessages = [];
  if (system) groqMessages.push({ role: 'system', content: system });
  messages.forEach(m => groqMessages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

  const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + env.GROQ_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: GROQ_MODEL_MAP[tamatoModel], messages: groqMessages, max_tokens, stream, temperature: 0.7 }),
  });

  if (stream) return passthroughStream(upstream);

  if (!upstream.ok) {
    const detail = await upstream.text();
    return json({ error: 'Groq API error', status: upstream.status, detail }, upstream.status);
  }
  const data = await upstream.json();
  return json({
    content: data.choices?.[0]?.message?.content || '',
    model: tamatoModel,
    provider: 'groq',
    usage: data.usage || null,
  });
}

/* ── Anthropic — pythm-4.5, metrio-4.6, megisto-4.8 ─────────────── */
async function handleAnthropic({ tamatoModel, messages, system, max_tokens, stream, env }) {
  const anthropicModel = ANTHROPIC_MODEL_MAP[tamatoModel];
  const anthropicMessages = messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

  const requestBody = { model: anthropicModel, max_tokens, messages: anthropicMessages, stream };
  if (system) requestBody.system = system;

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (stream) return passthroughStream(upstream);

  if (!upstream.ok) {
    const detail = await upstream.text();
    return json({ error: 'Anthropic API error', status: upstream.status, detail }, upstream.status);
  }
  const data = await upstream.json();
  return json({
    content: data.content?.[0]?.text || '',
    model: tamatoModel,
    provider: 'anthropic',
    usage: data.usage || null,
  });
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
  const { prompt, mode = 'both' } = body;
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

/* ── Stripe: create Checkout Session ────────────────────────────── */
async function handleCheckout(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { price_id, mode, product, credits, user_id, email, success_url, cancel_url } = body;
  if (!price_id || !mode || !success_url || !cancel_url) {
    return json({ error: 'Missing required fields: price_id, mode, success_url, cancel_url' }, 400);
  }

  const params = {
    mode,
    'line_items[0][price]': price_id,
    'line_items[0][quantity]': '1',
    success_url,
    cancel_url,
    'metadata[product]': product || '',
    'metadata[user_id]': user_id || '',
  };
  if (credits) params['metadata[credits]'] = String(credits);
  if (user_id) params.client_reference_id = user_id;
  if (email) params.customer_email = email;

  const upstream = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + env.STRIPE_SECRET_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: stripeForm(params),
  });
  if (!upstream.ok) {
    const detail = await upstream.text();
    return json({ error: 'Stripe checkout error', detail }, upstream.status);
  }
  const session = await upstream.json();
  return json({ id: session.id, url: session.url });
}

/* ── Stripe: Customer Portal session (billing management) ──────── */
async function handlePortal(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { customer_id, return_url } = body;
  if (!customer_id || !return_url) return json({ error: 'Missing required fields: customer_id, return_url' }, 400);

  const upstream = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + env.STRIPE_SECRET_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: stripeForm({ customer: customer_id, return_url }),
  });
  if (!upstream.ok) {
    const detail = await upstream.text();
    return json({ error: 'Stripe portal error', detail }, upstream.status);
  }
  const session = await upstream.json();
  return json({ url: session.url });
}

/* ── Stripe: webhook — grants credits / upgrades tier on payment ── */
const TIER_FROM_PRODUCT = {
  pro_monthly: 'pro', pro_annual: 'pro',
  pro_krator_monthly: 'pro_krator', pro_krator_annual: 'pro_krator',
  agency3_monthly: 'agency3', agency3_annual: 'agency3',
  agency5_monthly: 'agency5', agency5_annual: 'agency5',
  agency10_monthly: 'agency10', agency10_annual: 'agency10',
  brandwide_monthly: 'brandwide', brandwide_annual: 'brandwide',
};
const DEV_MODE_PRODUCTS = new Set(['single_dev', 'dev_addon']);
const SINGLE_MK_ADDON_PRODUCTS = new Set(['single_megisto_krator_addon']);

async function handleStripeWebhook(request, env) {
  const sig = request.headers.get('Stripe-Signature') || '';
  const payload = await request.text();

  const valid = await verifyStripeSignature(payload, sig, env.STRIPE_WEBHOOK_SECRET);
  if (!valid) return json({ error: 'Invalid signature' }, 400);

  let event;
  try { event = JSON.parse(payload); } catch { return json({ error: 'Invalid JSON' }, 400); }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.client_reference_id || session.metadata?.user_id;
    const product = session.metadata?.product;
    const credits = parseInt(session.metadata?.credits || '0', 10);

    if (userId) {
      const profile = await getProfile(userId, env);
      if (profile) {
        const fields = {};
        if (session.customer) fields.stripe_customer_id = session.customer;
        if (session.subscription) fields.stripe_subscription_id = session.subscription;
        if (product && TIER_FROM_PRODUCT[product]) fields.tier = TIER_FROM_PRODUCT[product];
        if (product && DEV_MODE_PRODUCTS.has(product)) fields.dev_mode = true;
        if (product && SINGLE_MK_ADDON_PRODUCTS.has(product)) fields.single_site_megisto_krator_addon = true;
        if (credits > 0) fields.credits = (profile.credits || 0) + credits;
        await patchProfile(userId, fields, env);
      }
    }
  }

  return json({ received: true });
}

async function verifyStripeSignature(payload, sigHeader, secret) {
  if (!secret || !sigHeader) return false;
  const parts = Object.fromEntries(sigHeader.split(',').map(p => p.split('=')));
  if (!parts.t || !parts.v1) return false;
  const signedPayload = `${parts.t}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expected = [...new Uint8Array(sigBytes)].map(b => b.toString(16).padStart(2, '0')).join('');
  return expected === parts.v1;
}

function stripeForm(params) {
  return Object.entries(params)
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
    .join('&');
}

/* ── Supabase helpers (service key) ────────────────────────────── */
async function getProfile(userId, env) {
  const res = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + encodeURIComponent(userId) + '&select=*', {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

async function patchProfile(userId, fields, env) {
  await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' + encodeURIComponent(userId), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(fields),
  }).catch(() => {});
}

async function validateApiKey(key, env) {
  const res = await fetch(env.SUPABASE_URL + '/rest/v1/api_keys?key=eq.' + encodeURIComponent(key) + '&active=eq.true&select=*', {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

async function logApiUsage(id, inTok, outTok, env) {
  await fetch(env.SUPABASE_URL + '/rest/v1/rpc/increment_api_usage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY },
    body: JSON.stringify({ p_id: id, p_in: inTok, p_out: outTok }),
  }).catch(() => {}); // TODO: create increment_api_usage RPC or use PATCH
}

/* ── Utilities ─────────────────────────────────────────────────── */
function passthroughStream(upstream) {
  if (!upstream.ok) {
    return upstream.text().then(t => json({ error: 'Upstream error', detail: t }, upstream.status));
  }
  return new Response(upstream.body, {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
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

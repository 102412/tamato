/* ═══════════════════════════════════════════════════════════════════
   TAMATO — OAuth Callback
   Exchanges the auth code for tokens, saves to profiles.connector_tokens,
   then closes the popup and signals the opener.
   Env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, plus per-provider secrets:
     GOOGLE_CONNECTOR_CLIENT_ID / _SECRET
     STRIPE_CONNECT_CLIENT_ID  + STRIPE_SECRET_KEY
     CALENDLY_CLIENT_ID / _SECRET
     PAYPAL_CLIENT_ID / _SECRET
     MAILCHIMP_CLIENT_ID / _SECRET
     NOTION_CLIENT_ID / _SECRET
     INSTAGRAM_CLIENT_ID / _SECRET
     SPOTIFY_CLIENT_ID / _SECRET
═══════════════════════════════════════════════════════════════════ */

const BASE_URL = 'https://tamato-ai.vercel.app';

/* ── Token exchange configs ────────────────────────────────────── */
const TOKEN_CONFIGS = {
  google: {
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: () => process.env.GOOGLE_CONNECTOR_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CONNECTOR_CLIENT_SECRET,
    mapTokens: async (data) => ({
      access_token: data.access_token,
      refresh_token: data.refresh_token || null,
      email: await fetchJson('https://www.googleapis.com/oauth2/v2/userinfo', data.access_token).then(d => d.email || '').catch(() => ''),
    }),
  },
  stripe: {
    tokenUrl: 'https://connect.stripe.com/oauth/token',
    clientId: () => process.env.STRIPE_CONNECT_CLIENT_ID,
    clientSecret: () => process.env.STRIPE_SECRET_KEY,
    mapTokens: (data) => ({
      access_token: data.access_token,
      account_id: data.stripe_user_id || '',
    }),
  },
  calendly: {
    tokenUrl: 'https://auth.calendly.com/oauth/token',
    clientId: () => process.env.CALENDLY_CLIENT_ID,
    clientSecret: () => process.env.CALENDLY_CLIENT_SECRET,
    mapTokens: async (data) => ({
      access_token: data.access_token,
      refresh_token: data.refresh_token || null,
      username: await fetchJson('https://api.calendly.com/users/me', data.access_token).then(d => d.resource?.slug || '').catch(() => ''),
    }),
  },
  paypal: {
    tokenUrl: 'https://api-m.paypal.com/v1/oauth2/token',
    clientId: () => process.env.PAYPAL_CLIENT_ID,
    clientSecret: () => process.env.PAYPAL_CLIENT_SECRET,
    useBasicAuth: true,
    extraBody: { grant_type: 'authorization_code' },
    mapTokens: (data) => ({
      access_token: data.access_token,
      refresh_token: data.refresh_token || null,
    }),
  },
  mailchimp: {
    tokenUrl: 'https://login.mailchimp.com/oauth2/token',
    clientId: () => process.env.MAILCHIMP_CLIENT_ID,
    clientSecret: () => process.env.MAILCHIMP_CLIENT_SECRET,
    mapTokens: async (data) => ({
      access_token: data.access_token,
      list_id: await fetchJson(
        'https://login.mailchimp.com/oauth2/metadata',
        data.access_token
      ).then(d => d.dc || '').catch(() => ''),
    }),
  },
  notion: {
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    clientId: () => process.env.NOTION_CLIENT_ID,
    clientSecret: () => process.env.NOTION_CLIENT_SECRET,
    useBasicAuth: true,
    extraHeaders: { 'Notion-Version': '2022-06-28' },
    mapTokens: (data) => ({
      access_token: data.access_token,
      workspace_id: data.workspace_id || '',
    }),
  },
  instagram: {
    tokenUrl: 'https://api.instagram.com/oauth/access_token',
    clientId: () => process.env.INSTAGRAM_CLIENT_ID,
    clientSecret: () => process.env.INSTAGRAM_CLIENT_SECRET,
    mapTokens: (data) => ({
      access_token: data.access_token,
      user_id: String(data.user_id || ''),
    }),
  },
  spotify: {
    tokenUrl: 'https://accounts.spotify.com/api/token',
    clientId: () => process.env.SPOTIFY_CLIENT_ID,
    clientSecret: () => process.env.SPOTIFY_CLIENT_SECRET,
    useBasicAuth: true,
    mapTokens: async (data) => ({
      access_token: data.access_token,
      refresh_token: data.refresh_token || null,
      user_id: await fetchJson('https://api.spotify.com/v1/me', data.access_token).then(d => d.id || '').catch(() => ''),
    }),
  },
};

/* ── Helpers ───────────────────────────────────────────────────── */
async function fetchJson(url, bearerToken) {
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + bearerToken } });
  return r.json();
}

async function exchangeCode(cfg, code) {
  const clientId = cfg.clientId();
  const clientSecret = cfg.clientSecret();
  const callbackUrl = BASE_URL + '/api/oauth/callback';

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: callbackUrl,
    ...(!cfg.useBasicAuth ? { client_id: clientId, client_secret: clientSecret } : {}),
    ...(cfg.extraBody || {}),
  });

  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', ...(cfg.extraHeaders || {}) };
  if (cfg.useBasicAuth) {
    headers['Authorization'] = 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64');
  }

  const r = await fetch(cfg.tokenUrl, { method: 'POST', headers, body: body.toString() });
  const text = await r.text();
  if (!r.ok) throw new Error('Token exchange failed (' + r.status + '): ' + text);
  return JSON.parse(text);
}

async function getUserId(jwt) {
  const r = await fetch(process.env.SUPABASE_URL + '/auth/v1/user', {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_KEY,
      Authorization: 'Bearer ' + jwt,
    },
  });
  if (!r.ok) return null;
  const d = await r.json();
  return d.id || null;
}

async function saveTokens(userId, provider, tokens) {
  const SUPA = process.env.SUPABASE_URL;
  const KEY  = process.env.SUPABASE_SERVICE_KEY;

  // Read existing connector_tokens
  const get = await fetch(SUPA + '/rest/v1/profiles?id=eq.' + userId + '&select=connector_tokens', {
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY },
  });
  const rows = await get.json();
  const existing = (rows[0] && rows[0].connector_tokens) || {};

  await fetch(SUPA + '/rest/v1/profiles?id=eq.' + userId, {
    method: 'PATCH',
    headers: {
      apikey: KEY,
      Authorization: 'Bearer ' + KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ connector_tokens: { ...existing, [provider]: tokens } }),
  });
}

function closePage(provider, origin, success, errMsg) {
  const safeOrigin = (origin || '*').replace(/'/g, '');
  const payload = success
    ? `{ tm_connector: '${provider}' }`
    : `{ tm_connector_error: '${provider}', message: '${(errMsg || 'error').replace(/'/g, '')}' }`;

  return `<!DOCTYPE html><html><head><title>Connecting…</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#1C1917;color:#FAF9F7}</style>
</head><body>
<p>${success ? '✓ Connected! Closing…' : '✗ ' + (errMsg || 'Connection failed.')}</p>
<script>
try {
  if (window.opener) {
    window.opener.postMessage(${payload}, '${safeOrigin}');
  }
} catch(e) {}
setTimeout(function(){ window.close(); }, 800);
</script>
</body></html>`;
}

/* ── Handler ────────────────────────────────────────────────────── */
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html');

  const { code, state, error } = req.query;

  let stateData = {};
  try { stateData = JSON.parse(Buffer.from(state || '', 'base64').toString()); } catch {}

  const { provider, token, origin } = stateData;

  if (error || !code) {
    return res.send(closePage(provider, origin, false, error || 'No code returned'));
  }

  const cfg = TOKEN_CONFIGS[provider];
  if (!cfg) {
    return res.send(closePage(provider, origin, false, 'Unknown provider'));
  }

  try {
    const tokenData = await exchangeCode(cfg, code);
    const tokens    = await cfg.mapTokens(tokenData);
    const userId    = await getUserId(token);

    if (!userId) {
      return res.send(closePage(provider, origin, false, 'Session expired — please log in again'));
    }

    await saveTokens(userId, provider, tokens);
    res.send(closePage(provider, origin, true));
  } catch (e) {
    console.error('[oauth callback]', provider, e.message);
    res.send(closePage(provider, origin, false, e.message));
  }
};

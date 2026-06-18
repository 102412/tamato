/* ═══════════════════════════════════════════════════════════════════
   TAMATO — OAuth Callback
   Env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, plus per-provider:
     GOOGLE_CONNECTOR_CLIENT_ID / _SECRET
     STRIPE_CONNECT_CLIENT_ID  + STRIPE_SECRET_KEY
     CALENDLY_CLIENT_ID / _SECRET
     MAILCHIMP_CLIENT_ID / _SECRET
═══════════════════════════════════════════════════════════════════ */

const BASE_URL = 'https://tamato-ai.vercel.app';

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
  mailchimp: {
    tokenUrl: 'https://login.mailchimp.com/oauth2/token',
    clientId: () => process.env.MAILCHIMP_CLIENT_ID,
    clientSecret: () => process.env.MAILCHIMP_CLIENT_SECRET,
    mapTokens: async (data) => ({
      access_token: data.access_token,
      list_id: await fetchJson('https://login.mailchimp.com/oauth2/metadata', data.access_token).then(d => d.dc || '').catch(() => ''),
    }),
  },
};

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
try { if (window.opener) window.opener.postMessage(${payload}, '${safeOrigin}'); } catch(e) {}
setTimeout(function(){ window.close(); }, 800);
</script>
</body></html>`;
}

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

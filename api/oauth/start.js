/* ═══════════════════════════════════════════════════════════════════
   TAMATO — OAuth Start
   Env vars needed:
     GOOGLE_CONNECTOR_CLIENT_ID
     STRIPE_CONNECT_CLIENT_ID
     CALENDLY_CLIENT_ID
     MAILCHIMP_CLIENT_ID
═══════════════════════════════════════════════════════════════════ */

const BASE_URL = 'https://tamato-ai.vercel.app';

const PROVIDERS = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    clientId: process.env.GOOGLE_CONNECTOR_CLIENT_ID,
    scopes: 'openid email profile https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/youtube.readonly',
    extra: { access_type: 'offline', prompt: 'consent' },
  },
  stripe: {
    authUrl: 'https://connect.stripe.com/oauth/authorize',
    clientId: process.env.STRIPE_CONNECT_CLIENT_ID,
    scopes: 'read_write',
    extra: { stripe_landing: 'login' },
  },
  calendly: {
    authUrl: 'https://auth.calendly.com/oauth/authorize',
    clientId: process.env.CALENDLY_CLIENT_ID,
    scopes: 'default',
  },
  mailchimp: {
    authUrl: 'https://login.mailchimp.com/oauth2/authorize',
    clientId: process.env.MAILCHIMP_CLIENT_ID,
    scopes: '',
  },
};

module.exports = function handler(req, res) {
  const { provider, token, origin } = req.query;
  const cfg = PROVIDERS[provider];

  if (!cfg) {
    return res.status(400).send('Unknown provider: ' + provider);
  }
  if (!cfg.clientId) {
    return res.status(503).send(
      `<html><body style="font-family:sans-serif;padding:2rem;background:#1C1917;color:#F5F0EB">
        <h2>${provider} not yet configured</h2>
        <p>Add <code>${provider.toUpperCase().replace(/-/g,'_')}_CLIENT_ID</code> to Vercel environment variables.</p>
        <script>setTimeout(window.close, 4000);</script>
      </body></html>`
    );
  }

  const callbackUrl = BASE_URL + '/api/oauth/callback';
  const state = Buffer.from(JSON.stringify({ provider, token, origin })).toString('base64');

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: callbackUrl,
    response_type: 'code',
    state,
    ...(cfg.scopes ? { scope: cfg.scopes } : {}),
    ...(cfg.extra || {}),
  });

  res.redirect(302, cfg.authUrl + '?' + params.toString());
};

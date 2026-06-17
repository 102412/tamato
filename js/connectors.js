/* ═══════════════════════════════════════════════════════════════════
   TAMATO — CONNECTORS
   Nine OAuth integrations. Tokens stored in profiles.connector_tokens
   (encrypted at rest via Supabase Vault). OAuth handled server-side;
   frontend opens the popup and reads the connected state.
═══════════════════════════════════════════════════════════════════ */
import { getProfile, updateProfile } from './supabase.js';

export const CONNECTORS = [
  { id: 'google',    name: 'Google',    desc: 'Maps embed, Sheets, YouTube',  fields: ['access_token', 'refresh_token', 'email'] },
  { id: 'stripe',    name: 'Stripe',    desc: 'Payments via Stripe Connect',  fields: ['access_token', 'account_id'] },
  { id: 'calendly',  name: 'Calendly',  desc: 'Booking links',                fields: ['access_token', 'username'] },
  { id: 'paypal',    name: 'PayPal',    desc: 'Payments',                     fields: ['access_token', 'email'] },
  { id: 'mailchimp', name: 'Mailchimp', desc: 'Email signups',                fields: ['access_token', 'list_id'] },
  { id: 'notion',    name: 'Notion',    desc: 'Embed Notion content',         fields: ['access_token', 'workspace_id'] },
  { id: 'instagram', name: 'Instagram', desc: 'Feed embed',                   fields: ['access_token', 'user_id'] },
  { id: 'opentable', name: 'OpenTable', desc: 'Reservations',                 fields: ['access_token', 'restaurant_id'] },
  { id: 'spotify',   name: 'Spotify',   desc: 'Embed playlists',              fields: ['access_token', 'user_id'] },
];

/* Embed connectors expose credentials in exported source; data connectors
   become static/mailto fallbacks on export. */
export const EMBED_CONNECTORS = ['google', 'instagram', 'spotify', 'notion', 'calendly', 'opentable'];
export const DATA_CONNECTORS  = ['stripe', 'paypal', 'mailchimp'];

/** OAuth start endpoint (server route exchanges code, writes tokens). */
export const OAUTH_ENDPOINT = '/api/oauth/start'; // TODO: deploy backend route

export function isConnected(profile, id) {
  const t = (profile && profile.connector_tokens) || {};
  return !!(t[id] && t[id].access_token);
}

export function connectedAccount(profile, id) {
  const t = (profile && profile.connector_tokens) || {};
  const c = t[id] || {};
  return c.email || c.username || c.account_id || c.user_id || c.workspace_id || c.restaurant_id || '';
}

/** Open OAuth popup; resolves when the popup signals completion. */
export function connect(id) {
  return new Promise((resolve) => {
    const url = OAUTH_ENDPOINT + '?provider=' + encodeURIComponent(id) + '&origin=' + encodeURIComponent(location.origin);
    const popup = window.open(url, 'tm_oauth_' + id, 'width=520,height=640');
    function onMsg(e) {
      if (e.data && e.data.tm_connector === id) {
        window.removeEventListener('message', onMsg);
        try { popup && popup.close(); } catch (_) {}
        resolve(true);
      }
    }
    window.addEventListener('message', onMsg);
    // fallback: poll for popup close
    const timer = setInterval(() => {
      if (popup && popup.closed) { clearInterval(timer); window.removeEventListener('message', onMsg); resolve(true); }
    }, 600);
  });
}

/** Remove a connector's tokens. User must revoke in the service manually. */
export async function disconnect(id) {
  const profile = await getProfile();
  const tokens = Object.assign({}, profile.connector_tokens || {});
  delete tokens[id];
  await updateProfile({ connector_tokens: tokens });
  return tokens;
}

/** Active connectors for the current profile (used by export risk modal). */
export function activeConnectors(profile) {
  return CONNECTORS.filter(c => isConnected(profile, c.id)).map(c => c.id);
}

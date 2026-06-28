/* ═══════════════════════════════════════════════════════════════════
   TAMATO — CONNECTORS
   Four OAuth integrations. Tokens stored in profiles.connector_tokens.
   OAuth handled server-side; frontend opens popup, reads connected state.
═══════════════════════════════════════════════════════════════════ */
import { getProfile, updateProfile, getSession } from './supabase.js';

export const CONNECTORS = [
  { id: 'google',    name: 'Google',    desc: 'Maps embed, Sheets, YouTube',   fields: ['access_token', 'refresh_token', 'email'] },
  { id: 'stripe',    name: 'Stripe',    desc: 'Payments via Stripe Connect',   fields: ['access_token', 'account_id'] },
  { id: 'calendly',  name: 'Calendly',  desc: 'Booking & scheduling links',    fields: ['access_token', 'username'] },
  { id: 'mailchimp', name: 'Mailchimp', desc: 'Email list signups',            fields: ['access_token', 'list_id'] },
];

export const EMBED_CONNECTORS = ['google', 'calendly'];
export const DATA_CONNECTORS  = ['stripe', 'mailchimp'];

export const OAUTH_ENDPOINT = '/api/oauth/start';

export function isConnected(profile, id) {
  const t = (profile && profile.connector_tokens) || {};
  return !!(t[id] && t[id].access_token);
}

export function connectedAccount(profile, id) {
  const t = (profile && profile.connector_tokens) || {};
  const c = t[id] || {};
  return c.email || c.username || c.account_id || c.list_id || '';
}

/** Risk acknowledgment shown once before any OAuth connect. */
function connectRiskModal(name) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'tm-modal-overlay';
    overlay.innerHTML = `
      <div class="tm-modal" style="position:relative">
        <h2 class="tm-modal-title">Connect ${name}?</h2>
        <p class="tm-modal-sub">Connectors are used at your own risk.</p>
        <p style="font-size:14px;color:var(--tm-text-2);margin-bottom:var(--sp-4)">
          By connecting, you acknowledge that your ${name} credentials may be
          embedded in exported site files in plain text, and that Tamato is not
          liable for any unauthorized access, data loss, or financial harm
          resulting from your use of this connector. See our
          <a href="/terms.html" target="_blank" style="color:var(--tm-accent)">Terms of Service §13</a> for full details.
        </p>
        <label class="checkbox-row" style="margin-bottom:var(--sp-4)"><input type="checkbox" id="connAckChk"> I understand and accept this risk.</label>
        <div class="tm-row" style="justify-content:flex-end">
          <button class="tm-btn tm-btn-ghost" id="connAckCancel">Cancel</button>
          <button class="tm-btn tm-btn-primary" id="connAckGo" disabled>Connect</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const chk = overlay.querySelector('#connAckChk');
    const go = overlay.querySelector('#connAckGo');
    chk.addEventListener('change', () => { go.disabled = !chk.checked; });
    overlay.querySelector('#connAckCancel').addEventListener('click', () => { overlay.remove(); resolve(false); });
    go.addEventListener('click', () => { overlay.remove(); resolve(true); });
  });
}

/** Open OAuth popup; resolves when the popup signals completion. */
export async function connect(id) {
  const meta = CONNECTORS.find(c => c.id === id);
  const ok = await connectRiskModal(meta ? meta.name : id);
  if (!ok) return false;
  const session = await getSession();
  const token = session ? session.access_token : '';
  return new Promise((resolve) => {
    const url = OAUTH_ENDPOINT + '?provider=' + encodeURIComponent(id) + '&token=' + encodeURIComponent(token) + '&origin=' + encodeURIComponent(location.origin);
    const popup = window.open(url, 'tm_oauth_' + id, 'width=520,height=640');
    function onMsg(e) {
      if (e.data && e.data.tm_connector === id) {
        window.removeEventListener('message', onMsg);
        try { popup && popup.close(); } catch (_) {}
        resolve(true);
      }
    }
    window.addEventListener('message', onMsg);
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

/* ═══════════════════════════════════════════════════════════════════
   TAMATO BUILD — EXPORT
   Lazy-loads JSZip. Free tier gets an attribution comment; paid is clean.
   Active connectors trigger a risk-acknowledgment modal before download.
═══════════════════════════════════════════════════════════════════ */
import { getTier } from '/js/tiers.js';
import { activeConnectors, DATA_CONNECTORS } from '/js/connectors.js';
import { supabase, getUser, toast } from '/js/supabase.js';

const JSZIP_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
const FREE_COMMENT = '<!-- Built with Tamato | tamato.design -->\n';
const README = `Built with Tamato — tamato.design | Your code. Forever.`;

let _jszip = null;
async function loadJSZip() {
  if (window.JSZip) return window.JSZip;
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = JSZIP_CDN; s.onload = res; s.onerror = () => rej(new Error('JSZip failed to load')); document.head.appendChild(s); });
  return window.JSZip;
}

/** Swap data-connector calls to mailto fallbacks; keep embed connectors. */
function neutralizeConnectors(html) {
  // Best-effort: replace form actions pointing at connector endpoints with mailto.
  return html.replace(/action=["'][^"']*(stripe|paypal|mailchimp)[^"']*["']/gi, 'action="mailto:hello@example.com"');
}

/**
 * Run export. `state` = { html:{desktop,mobile}, site }, `profile`.
 * Shows risk modal if there are active connectors. Returns when done.
 */
export async function runExport(state, profile, { onHostingHelp } = {}) {
  const tier = getTier(profile);
  if (tier.build.exportLocked) { toast('Export is locked on your plan. Upgrade to export.', 'error'); return; }

  const active = activeConnectors(profile);
  if (active.length) {
    const ok = await riskModal(active);
    if (!ok) return;
    const user = await getUser();
    await supabase.from('credit_transactions').insert({ user_id: user.id, amount: 0, type: 'export_ack', product: 'build', description: 'connectors:' + active.join(',') }).catch(() => {});
  }

  const isFree = tier.id === 'free';
  let desktop = state.html.desktop || '';
  let mobile = state.html.mobile || '';
  if (active.some(c => DATA_CONNECTORS.includes(c))) { desktop = neutralizeConnectors(desktop); mobile = neutralizeConnectors(mobile); }
  if (isFree) { desktop = FREE_COMMENT + desktop; mobile = FREE_COMMENT + mobile; }

  try {
    const JSZip = await loadJSZip();
    const zip = new JSZip();
    zip.file('index.html', desktop);
    zip.file('mobile.html', mobile);
    zip.file('README.txt', README);
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = (state.site?.name || 'tamato-site').replace(/\s+/g, '-').toLowerCase() + '.zip';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast('Exported.', 'success');
    onHostingHelp && onHostingHelp();
  } catch (e) { toast('Export failed: ' + e.message, 'error'); }
}

function riskModal(active) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'tm-modal-overlay';
    overlay.innerHTML = `
      <div class="tm-modal" style="position:relative">
        <h2 class="tm-modal-title">Before you export</h2>
        <p class="tm-modal-sub">You have active connectors: <b>${active.join(', ')}</b>.</p>
        <p style="font-size:14px;color:var(--tm-text-2);margin-bottom:var(--sp-4)">
          On export, data connectors (Stripe, PayPal, Mailchimp) become static
          <code>mailto:</code> fallbacks. Embed connectors keep their credentials
          in plain text, visible in your exported source. You accept full
          responsibility for the exported code. Tamato is not liable for credentials
          you choose to ship.
        </p>
        <label class="checkbox-row" style="margin-bottom:var(--sp-4)"><input type="checkbox" id="ackChk"> I understand and accept responsibility.</label>
        <div class="tm-row" style="justify-content:flex-end">
          <button class="tm-btn tm-btn-ghost" id="ackCancel">Cancel</button>
          <button class="tm-btn tm-btn-primary" id="ackGo" disabled>I Understand, Export</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const chk = overlay.querySelector('#ackChk');
    const go = overlay.querySelector('#ackGo');
    chk.addEventListener('change', () => { go.disabled = !chk.checked; });
    overlay.querySelector('#ackCancel').addEventListener('click', () => { overlay.remove(); resolve(false); });
    go.addEventListener('click', () => { overlay.remove(); resolve(true); });
  });
}

/* ═══════════════════════════════════════════════════════════════════
   TAMATO BUILD — DEV MODE
   CodeMirror code editor (lazy-loaded). Pro/Agency included; Single Site
   is a +$5 add-on; Free is locked. Live preview with 500ms debounce.
═══════════════════════════════════════════════════════════════════ */
import { getTier } from '/js/tiers.js';
import { checkout } from '/js/stripe.js';
import { toast } from '/js/supabase.js';

const CM_JS = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js';
const CM_HTMLMIXED = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/htmlmixed/htmlmixed.min.js';
const CM_XML = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/xml/xml.min.js';
const CM_JS_MODE = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/javascript/javascript.min.js';
const CM_CSS_MODE = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/css/css.min.js';
const CM_SEARCH = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/search/search.min.js';
const CM_SEARCHCURSOR = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/search/searchcursor.min.js';
const CM_DIALOG = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/dialog/dialog.min.js';
const CM_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css';
const CM_THEME = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/theme/material-darker.min.css';

let loaded = false;
async function loadCodeMirror() {
  if (loaded) return;
  function css(href) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l); }
  function js(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
  css(CM_CSS); css(CM_THEME);
  await js(CM_JS);
  await Promise.all([js(CM_XML), js(CM_JS_MODE), js(CM_CSS_MODE)]);
  await js(CM_HTMLMIXED);
  await js(CM_SEARCHCURSOR); await js(CM_DIALOG); await js(CM_SEARCH);
  loaded = true;
}

export function devModeStatus(profile) {
  const tier = getTier(profile);
  if (tier.build.devMode === true) return 'enabled';
  if (tier.build.devMode === 'addon') return profile.dev_mode ? 'enabled' : 'addon';
  return 'locked';
}

/**
 * Open the dev editor. `host` is a container element. `state` holds html.
 * onChange(view, html) fires (debounced 500ms) as the user types.
 */
export async function openDevMode(host, state, onChange) {
  await loadCodeMirror();
  host.innerHTML = `
    <div class="dev-tabs">
      <button class="dev-tab active" data-view="desktop">Desktop HTML</button>
      <button class="dev-tab" data-view="mobile">Mobile HTML</button>
      <button class="tm-btn tm-btn-text tm-btn-sm" id="devFormat" style="margin-left:auto">Auto-format</button>
    </div>
    <div class="dev-editor" id="devEditor"></div>`;

  const cm = window.CodeMirror(host.querySelector('#devEditor'), {
    value: state.html.desktop || '', mode: 'htmlmixed', theme: 'material-darker',
    lineNumbers: true, lineWrapping: true, extraKeys: { 'Ctrl-H': 'replace', 'Cmd-H': 'replace' },
  });

  let view = 'desktop', timer = null;
  cm.on('change', () => {
    state.html[view] = cm.getValue();
    clearTimeout(timer);
    timer = setTimeout(() => onChange(view, cm.getValue()), 500);
  });

  host.querySelectorAll('.dev-tab').forEach(tab => tab.addEventListener('click', () => {
    host.querySelectorAll('.dev-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    view = tab.dataset.view;
    cm.setValue(state.html[view] || '');
  }));

  host.querySelector('#devFormat').addEventListener('click', () => {
    cm.setValue(basicFormat(cm.getValue())); state.html[view] = cm.getValue();
  });

  setTimeout(() => cm.refresh(), 50);
  return cm;
}

function basicFormat(html) {
  // lightweight indentation normalizer
  let indent = 0; const out = [];
  html.replace(/>\s*</g, '>\n<').split('\n').forEach(line => {
    line = line.trim(); if (!line) return;
    if (/^<\//.test(line)) indent = Math.max(0, indent - 1);
    out.push('  '.repeat(indent) + line);
    if (/^<[^/!][^>]*[^/]>$/.test(line) && !/^<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)/.test(line)) indent++;
  });
  return out.join('\n');
}

/** Show upgrade/add-on modal when dev mode isn't available. */
export function showDevUpgrade(profile) {
  const tier = getTier(profile);
  const overlay = document.createElement('div');
  overlay.className = 'tm-modal-overlay';
  const isAddon = tier.build.devMode === 'addon';
  overlay.innerHTML = `
    <div class="tm-modal" style="position:relative;max-width:400px">
      <h2 class="tm-modal-title">Dev Mode</h2>
      <p class="tm-modal-sub">${isAddon ? 'Unlock full code editing for this account.' : 'Upgrade your plan to access Dev Mode.'}</p>
      <div class="tm-row" style="justify-content:flex-end">
        <button class="tm-btn tm-btn-ghost" id="dmClose">Close</button>
        ${isAddon ? '<button class="tm-btn tm-btn-primary" id="dmBuy">Unlock — $5 one-time</button>' : '<a class="tm-btn tm-btn-primary" href="/pricing.html">View plans</a>'}
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#dmClose').addEventListener('click', () => overlay.remove());
  const buy = overlay.querySelector('#dmBuy');
  if (buy) buy.addEventListener('click', async () => {
    try { await checkout('dev_addon', { userId: profile.id, email: profile.email }); }
    catch { toast('Could not start checkout.', 'error'); }
  });
}

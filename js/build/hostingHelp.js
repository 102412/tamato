/* ═══════════════════════════════════════════════════════════════════
   TAMATO BUILD — HOSTING HELP CHAT
   Slides in from the right after export. Pythm-4.5o mini (free).
═══════════════════════════════════════════════════════════════════ */
import { callModel } from '/js/models.js';

const SYS = `You are Tamato's hosting assistant. User just downloaded index.html (desktop) and mobile.html. Help them go live. Recommend free hosting first: Netlify, GitHub Pages, Cloudflare Pages. Step-by-step instructions. Assume zero technical knowledge. Be encouraging and clear.`;

const QUICK = ['Host it free', 'Connect a domain', 'Share it now', 'I need help'];

let panel = null, history = [];

export function openHostingHelp() {
  if (panel) { panel.classList.add('open'); return; }
  panel = document.createElement('div');
  panel.className = 'hosting-panel open';
  panel.innerHTML = `
    <div class="hp-head"><b>Go live</b><button class="tm-btn tm-btn-text tm-btn-sm" id="hpClose">✕</button></div>
    <div class="hp-body" id="hpBody">
      <div class="hp-msg ai">Nice — your files are downloaded. Want me to walk you through putting your site online for free?</div>
    </div>
    <div class="hp-quick" id="hpQuick">${QUICK.map(q => `<button class="tm-pill" data-q="${q}">${q}</button>`).join('')}</div>
    <div class="hp-input"><input class="tm-input" id="hpText" placeholder="Ask anything about hosting…"><button class="tm-btn tm-btn-primary tm-btn-sm" id="hpSend">Send</button></div>`;
  document.body.appendChild(panel);

  const body = panel.querySelector('#hpBody');
  const text = panel.querySelector('#hpText');

  panel.querySelector('#hpClose').addEventListener('click', () => panel.classList.remove('open'));
  panel.querySelectorAll('#hpQuick .tm-pill').forEach(b => b.addEventListener('click', () => send(b.dataset.q)));
  panel.querySelector('#hpSend').addEventListener('click', () => send(text.value));
  text.addEventListener('keydown', e => { if (e.key === 'Enter') send(text.value); });

  async function send(msg) {
    msg = (msg || '').trim(); if (!msg) return;
    text.value = '';
    add('user', msg);
    history.push({ role: 'user', content: msg });
    const typing = add('ai', '…');
    try {
      const { text: reply } = await callModel({ modelId: 'PYTHM_MINI', system: SYS, messages: history, maxTokens: 1200 });
      typing.textContent = reply;
      history.push({ role: 'assistant', content: reply });
    } catch { typing.textContent = 'Sorry — try again in a moment.'; }
    body.scrollTop = body.scrollHeight;
  }
  function add(role, content) {
    const el = document.createElement('div');
    el.className = 'hp-msg ' + role; el.textContent = content;
    body.appendChild(el); body.scrollTop = body.scrollHeight; return el;
  }
}

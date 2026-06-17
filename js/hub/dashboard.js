/* ═══════════════════════════════════════════════════════════════════
   TAMATO — DASHBOARD
   Greeting, credit meter, reload modal, unified activity feed with
   project-card color absorption, connectors panel.
═══════════════════════════════════════════════════════════════════ */
import {
  requireAuth, getProfile, signOut, toggleTheme, syncThemeFromProfile,
  listSites, listConversations, listDesignSystems, initials, timeAgo, toast,
} from '/js/supabase.js';
import { totalCredits, creditBreakdown, RELOAD_PACKAGES } from '/js/credits.js';
import { checkout, STRIPE_PRODUCTS } from '/js/stripe.js';
import { CONNECTORS, isConnected, connectedAccount, connect, disconnect } from '/js/connectors.js';

let profile = null;

(async function init() {
  const session = await requireAuth();
  if (!session) return;
  profile = await getProfile();
  syncThemeFromProfile(profile);
  renderTopbar();
  renderActivity();
  wireUI();
})();

/* ── Topbar ────────────────────────────────────────────────────── */
function greetWord() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function renderTopbar() {
  const name = (profile.email || '').split('@')[0];
  document.getElementById('greeting').textContent = `${greetWord()}, ${name}`;
  document.getElementById('avatar').textContent = initials(profile.email);

  const total = totalCredits(profile);
  document.getElementById('creditCount').textContent = total.toLocaleString();
  const bd = creditBreakdown(profile);
  const tip = document.getElementById('creditTooltip');
  if (bd.split) tip.innerHTML = `AI: ${bd.ai} · Studio: ${bd.studio}`;
  else tip.textContent = 'One shared pool across all products';
}

/* ── Activity feed ─────────────────────────────────────────────── */
async function renderActivity() {
  const [sites, convos, systems] = await Promise.all([listSites(), listConversations(), listDesignSystems()]);
  const items = [];

  sites.forEach(s => items.push({
    kind: 'build', when: s.updated_at, title: s.name || 'Untitled Site',
    color: s.primary_color || 'var(--tm-accent)', href: `/build/?site=${s.id}`,
    icon: '🏗', tint: s.primary_color,
  }));
  convos.forEach(c => {
    const first = Array.isArray(c.messages) && c.messages[0] ? (c.messages[0].content || '') : '';
    const line = typeof first === 'string' ? first : '(message)';
    items.push({ kind: 'ai', when: c.updated_at, title: c.title || line.slice(0, 50) || 'Conversation',
      color: 'var(--tm-accent)', href: `/ai/?conv=${c.id}`, icon: '💬', tint: '#B85C52' });
  });
  systems.forEach(d => {
    const colors = d.tokens && d.tokens.colors ? Object.values(d.tokens.colors).filter(v => typeof v === 'string' && v.startsWith('#')).slice(0, 5) : [];
    items.push({ kind: 'studio', when: d.updated_at, title: d.name || 'Design System',
      color: colors[0] || 'var(--tm-accent)', href: `/studio/?ds=${d.id}`, icon: '🎨', tint: colors[0], swatches: colors });
  });

  items.sort((a, b) => new Date(b.when) - new Date(a.when));
  const top = items.slice(0, 20);

  const grid = document.getElementById('activity');
  if (!top.length) {
    grid.innerHTML = `<p class="tm-muted">No projects yet. <a href="/build/" style="color:var(--tm-accent)">Build your first site →</a></p>`;
    return;
  }
  grid.innerHTML = top.map(it => `
    <a class="activity-card" href="${it.href}" data-tint="${it.tint || ''}">
      <div class="ac-head">
        <span class="ac-icon">${it.icon}</span>
        <span class="ac-title">${escapeHtml(it.title)}</span>
        ${it.kind !== 'ai' ? `<span class="tm-dot" style="background:${it.color}"></span>` : ''}
      </div>
      <div class="ac-meta">${it.kind} · ${timeAgo(it.when)}</div>
      ${it.swatches && it.swatches.length ? `<div class="swatch-row">${it.swatches.map(c => `<span class="swatch" style="background:${c}"></span>`).join('')}</div>` : ''}
    </a>`).join('');

  // color absorption on hover
  grid.querySelectorAll('.activity-card').forEach(card => {
    const tint = card.dataset.tint || '#B85C52';
    card.addEventListener('mouseenter', () => { card.style.background = hexTint(tint, 0.12); card.style.borderColor = hexTint(tint, 0.4); });
    card.addEventListener('mouseleave', () => { card.style.background = ''; card.style.borderColor = ''; });
  });
}

function hexTint(hex, alpha) {
  if (!hex || !hex.startsWith('#')) return `rgba(184,92,82,${alpha})`;
  let h = hex.slice(1); if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
function escapeHtml(s) { return (s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/* ── UI wiring ─────────────────────────────────────────────────── */
function wireUI() {
  document.getElementById('signOut').addEventListener('click', signOut);
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  document.getElementById('themeToggle2').addEventListener('click', toggleTheme);

  // Reload modal
  const reloadModal = document.getElementById('reloadModal');
  const grid = document.getElementById('reloadGrid');
  grid.innerHTML = RELOAD_PACKAGES.map(p => `
    <div class="reload-card" data-credits="${p.credits}">
      <div class="rc-credits">${p.credits.toLocaleString()}</div>
      <div class="rc-price">${p.usd}</div>
    </div>`).join('');
  document.getElementById('addCredits').addEventListener('click', () => reloadModal.classList.remove('tm-hidden'));
  document.getElementById('reloadClose').addEventListener('click', () => reloadModal.classList.add('tm-hidden'));
  reloadModal.addEventListener('click', e => { if (e.target === reloadModal) reloadModal.classList.add('tm-hidden'); });
  grid.querySelectorAll('.reload-card').forEach(c => c.addEventListener('click', async () => {
    const key = 'credits_' + c.dataset.credits;
    if (!STRIPE_PRODUCTS[key]) return;
    try { await checkout(key, { userId: profile.id, email: profile.email }); }
    catch { toast('Could not start checkout. Try again.', 'error'); }
  }));

  // Connectors modal
  const connModal = document.getElementById('connModal');
  renderConnectors();
  document.getElementById('connectorsBtn').addEventListener('click', () => connModal.classList.remove('tm-hidden'));
  document.getElementById('connClose').addEventListener('click', () => connModal.classList.add('tm-hidden'));
  connModal.addEventListener('click', e => { if (e.target === connModal) connModal.classList.add('tm-hidden'); });
}

function renderConnectors() {
  const list = document.getElementById('connList');
  list.innerHTML = CONNECTORS.map(c => {
    const on = isConnected(profile, c.id);
    const acct = connectedAccount(profile, c.id);
    return `<div class="conn-row" data-id="${c.id}">
      <span class="tm-dot ${on ? 'tm-dot-green' : 'tm-dot-gray'}"></span>
      <div class="tm-grow"><div class="cn-name">${c.name}</div><div class="cn-desc">${on && acct ? acct : c.desc}</div></div>
      <button class="tm-btn ${on ? 'tm-btn-ghost' : 'tm-btn-primary'} tm-btn-sm" data-action="${on ? 'disconnect' : 'connect'}">${on ? 'Disconnect' : 'Connect'}</button>
    </div>`;
  }).join('');
  list.querySelectorAll('button').forEach(btn => btn.addEventListener('click', async (e) => {
    const id = e.target.closest('.conn-row').dataset.id;
    const action = e.target.dataset.action;
    if (action === 'connect') { await connect(id); profile = await getProfile(); }
    else { await disconnect(id); profile = await getProfile(); }
    renderConnectors();
  }));
}

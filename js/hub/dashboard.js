/* ═══════════════════════════════════════════════════════════════════
   TAMATO — DASHBOARD
   Glass module switcher: Overview / Build / AI / Studio / Connectors / Credits
   Ambient gradient tints toward hovered card color via --db-amb-color.
═══════════════════════════════════════════════════════════════════ */
import {
  requireAuth, getProfile, signOut, toggleTheme, syncThemeFromProfile,
  listSites, listConversations, listDesignSystems, initials, timeAgo, toast,
} from '/js/supabase.js';
import { totalCredits, creditBreakdown, RELOAD_PACKAGES } from '/js/credits.js';
import { checkout, STRIPE_PRODUCTS } from '/js/stripe.js';
import { CONNECTORS, isConnected, connectedAccount, connect, disconnect } from '/js/connectors.js';

let profile = null;
let allSites = [], allConvos = [], allSystems = [];

(async function init() {
  const session = await requireAuth();
  if (!session) return;
  profile = await getProfile();
  syncThemeFromProfile(profile);
  renderTopbar();
  wireUI();
  resumePendingCheckout();
  // Position indicator after first paint (DOM widths available)
  requestAnimationFrame(() => positionIndicator(document.querySelector('.module-tab.active')));

  // Load all data in parallel then render all module panels at once
  [allSites, allConvos, allSystems] = await Promise.all([
    listSites(), listConversations(), listDesignSystems(),
  ]);
  renderAllModules();
})();

/* If the user clicked Buy on /pricing.html before signing in, resume
   that checkout automatically once they land here post-signup/login. */
function resumePendingCheckout() {
  const productKey = sessionStorage.getItem('tm_pending_checkout');
  if (!productKey) return;
  sessionStorage.removeItem('tm_pending_checkout');
  if (!STRIPE_PRODUCTS[productKey]) return;
  checkout(productKey, { userId: profile.id, email: profile.email })
    .catch(e => toast(e.message || 'Could not start checkout.', 'error'));
}

/* ── Topbar ────────────────────────────────────────────────────── */
function greetWord() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function renderTopbar() {
  const name = (profile.email || '').split('@')[0];
  document.getElementById('topGreeting').textContent = `${greetWord()}, ${name}`;
  document.getElementById('avatar').textContent      = initials(profile.email);

  const total = totalCredits(profile);
  document.getElementById('creditCount').textContent = total.toLocaleString();

  const bd  = creditBreakdown(profile);
  const tip = document.getElementById('creditTooltip');
  if (bd.split) tip.innerHTML = `AI: ${bd.ai} · Studio: ${bd.studio}`;
  else          tip.textContent = 'One shared pool across all products';
}

/* ── Render all module panels ──────────────────────────────────── */
function renderAllModules() {
  renderOverview();
  renderBuild();
  renderAI();
  renderStudio();
  renderConnectors('connListInline');
  renderConnectors('connList');
  renderCredits();
}

/* ── Overview ──────────────────────────────────────────────────── */
function renderOverview() {
  const total    = totalCredits(profile);
  const weekAgo  = Date.now() - 7 * 24 * 3600 * 1000;
  const recentAI = allConvos.filter(c => new Date(c.updated_at).getTime() > weekAgo).length;
  const parts    = [];
  if (allSites.length) parts.push(`${allSites.length} site${allSites.length !== 1 ? 's' : ''} in Build`);
  if (recentAI)        parts.push(`${recentAI} AI conversation${recentAI !== 1 ? 's' : ''} this week`);
  parts.push(`${total.toLocaleString()} credits left`);
  document.getElementById('dbSummary').textContent = 'You have ' + parts.join(', ') + '.';

  const items = buildActivityItems();
  const grid  = document.getElementById('activity');
  if (!items.length) {
    grid.innerHTML = `<p class="tm-muted">No projects yet. <a href="/build/" style="color:var(--tm-accent)">Build your first site →</a></p>`;
  } else {
    grid.innerHTML = items.slice(0, 20).map(cardHtml).join('');
    wireHover(grid);
  }

  renderWeekStats();
}

function renderWeekStats() {
  const el = document.getElementById('dbWeekStats');
  if (!el) return;
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const isRecent = d => new Date(d).getTime() > weekAgo;
  const stats = [
    { value: allSites.filter(s  => isRecent(s.updated_at)).length, label: 'sites edited this week' },
    { value: allConvos.filter(c => isRecent(c.updated_at)).length, label: 'AI conversations' },
    { value: allSystems.filter(d => isRecent(d.updated_at)).length, label: 'design systems' },
  ];
  // Only show the strip when there's at least something to report
  const hasActivity = stats.some(s => s.value > 0);
  el.style.display = hasActivity ? '' : 'none';
  if (hasActivity) {
    el.innerHTML = stats.map(s => `
      <div class="db-stat">
        <span class="db-stat-num">${s.value}</span>
        <span class="db-stat-label">${s.label}</span>
      </div>`).join('');
  }
}

/* ── Build ─────────────────────────────────────────────────────── */
function renderBuild() {
  const grid  = document.getElementById('buildSites');
  const items = allSites.slice(0, 12).map(s => ({
    kind: 'build', when: s.updated_at,
    title: s.name || ('Site · ' + timeAgo(s.updated_at)),
    color: s.primary_color || 'var(--tm-accent)',
    href: `/build/?site=${s.id}`, icon: '🏗', tint: s.primary_color,
  }));
  if (!items.length) {
    grid.innerHTML = `<p class="tm-muted">No sites yet. <a href="/build/" style="color:var(--tm-accent)">Build your first →</a></p>`;
    return;
  }
  grid.innerHTML = items.map(cardHtml).join('');
  wireHover(grid);
}

/* ── AI ────────────────────────────────────────────────────────── */
function renderAI() {
  const list = document.getElementById('aiConvos');
  if (!allConvos.length) {
    list.innerHTML = `<p class="tm-muted">No conversations yet. <a href="/ai/" style="color:var(--tm-accent)">Start one →</a></p>`;
    return;
  }
  list.innerHTML = allConvos.slice(0, 8).map(c => {
    const first   = Array.isArray(c.messages) && c.messages[0] ? c.messages[0].content || '' : '';
    const preview = typeof first === 'string' ? first.slice(0, 80) : '';
    const title   = c.title || preview.slice(0, 50) || 'Conversation';
    return `<a class="convo-item" href="/ai/?conv=${c.id}">
      <span class="convo-icon">💬</span>
      <div>
        <div class="convo-title">${escapeHtml(title)}</div>
        <div class="convo-meta">AI · ${timeAgo(c.updated_at)}</div>
      </div>
    </a>`;
  }).join('');
}

/* ── Studio ────────────────────────────────────────────────────── */
function renderStudio() {
  const grid  = document.getElementById('studioSystems');
  const items = allSystems.slice(0, 12).map(d => {
    const colors = d.tokens && d.tokens.colors
      ? Object.values(d.tokens.colors).filter(v => typeof v === 'string' && v.startsWith('#')).slice(0, 5)
      : [];
    const aesthetic = d.tokens && d.tokens.aesthetic ? d.tokens.aesthetic.slice(0, 30) : '';
    return {
      kind: 'studio', when: d.updated_at,
      title: d.name || aesthetic || ('Design system · ' + timeAgo(d.updated_at)),
      href: `/studio/?ds=${d.id}`, icon: '🎨',
      tint: colors[0], swatches: colors, color: colors[0] || 'var(--tm-accent)',
    };
  });
  if (!items.length) {
    grid.innerHTML = `<p class="tm-muted">No design systems yet. <a href="/studio/" style="color:var(--tm-accent)">Create one →</a></p>`;
    return;
  }
  grid.innerHTML = items.map(cardHtml).join('');
  wireHover(grid);
}

/* ── Connectors ────────────────────────────────────────────────── */
function renderConnectors(listId) {
  const list = document.getElementById(listId);
  if (!list) return;
  list.innerHTML = CONNECTORS.map(c => {
    const on   = isConnected(profile, c.id);
    const acct = connectedAccount(profile, c.id);
    return `<div class="conn-row" data-id="${c.id}">
      <span class="tm-dot ${on ? 'tm-dot-green' : 'tm-dot-gray'}"></span>
      <div class="tm-grow">
        <div class="cn-name">${c.name}</div>
        <div class="cn-desc">${on && acct ? acct : c.desc}</div>
      </div>
      <button class="tm-btn ${on ? 'tm-btn-ghost' : 'tm-btn-primary'} tm-btn-sm"
              data-action="${on ? 'disconnect' : 'connect'}">${on ? 'Disconnect' : 'Connect'}</button>
    </div>`;
  }).join('');
  list.querySelectorAll('button').forEach(btn => btn.addEventListener('click', async e => {
    const row    = e.target.closest('.conn-row');
    const id     = row.dataset.id;
    const action = e.target.dataset.action;
    if (action === 'connect') { await connect(id); profile = await getProfile(); }
    else                      { await disconnect(id); profile = await getProfile(); }
    renderConnectors('connList');
    renderConnectors('connListInline');
  }));
}

/* ── Credits ───────────────────────────────────────────────────── */
function renderCredits() {
  const total = totalCredits(profile);
  const bd    = creditBreakdown(profile);

  const display = document.getElementById('creditsDisplay');
  display.textContent = total.toLocaleString();
  if (total < 20) display.classList.add('low');

  const breakdown = document.getElementById('creditsBreakdown');
  breakdown.textContent = bd.split ? `AI: ${bd.ai} · Studio: ${bd.studio}` : 'Shared pool across all products';

  buildReloadGrid('reloadGridInline');
}

function buildReloadGrid(elId) {
  const grid = document.getElementById(elId);
  if (!grid) return;
  grid.innerHTML = RELOAD_PACKAGES.map(p => `
    <div class="reload-card" data-credits="${p.credits}">
      <div class="rc-credits">${p.credits.toLocaleString()}</div>
      <div class="rc-price">${p.usd}</div>
    </div>`).join('');
  grid.querySelectorAll('.reload-card').forEach(c => c.addEventListener('click', async () => {
    const key = 'credits_' + c.dataset.credits;
    if (!STRIPE_PRODUCTS[key]) return;
    try { await checkout(key, { userId: profile.id, email: profile.email }); }
    catch { toast('Could not start checkout. Try again.', 'error'); }
  }));
}

/* ── Activity card helpers ─────────────────────────────────────── */
function buildActivityItems() {
  const items = [];
  allSites.forEach(s => items.push({
    kind: 'build', when: s.updated_at,
    title: s.name || ('Site · ' + timeAgo(s.updated_at)),
    color: s.primary_color || 'var(--tm-accent)',
    href: `/build/?site=${s.id}`, icon: '🏗', tint: s.primary_color,
  }));
  allConvos.forEach(c => {
    const first = Array.isArray(c.messages) && c.messages[0] ? c.messages[0].content || '' : '';
    const line  = typeof first === 'string' ? first.trim() : '';
    items.push({
      kind: 'ai', when: c.updated_at,
      title: c.title || (line.slice(0, 42) + (line.length > 42 ? '…' : '')) || 'New chat',
      color: 'var(--tm-accent)', href: `/ai/?conv=${c.id}`, icon: '💬', tint: '#B85C52',
    });
  });
  allSystems.forEach(d => {
    const colors = d.tokens && d.tokens.colors
      ? Object.values(d.tokens.colors).filter(v => typeof v === 'string' && v.startsWith('#')).slice(0, 5)
      : [];
    const aesthetic = d.tokens && d.tokens.aesthetic ? d.tokens.aesthetic.slice(0, 30) : '';
    items.push({
      kind: 'studio', when: d.updated_at,
      title: d.name || aesthetic || ('Design system · ' + timeAgo(d.updated_at)),
      color: colors[0] || 'var(--tm-accent)',
      href: `/studio/?ds=${d.id}`, icon: '🎨', tint: colors[0], swatches: colors,
    });
  });
  items.sort((a, b) => new Date(b.when) - new Date(a.when));
  return items;
}

function cardHtml(it) {
  return `<a class="activity-card" href="${it.href}" data-tint="${it.tint || ''}">
    <div class="ac-head">
      <span class="ac-icon">${it.icon}</span>
      <span class="ac-title">${escapeHtml(it.title)}</span>
      ${it.kind !== 'ai' ? `<span class="tm-dot" style="background:${it.color}"></span>` : ''}
    </div>
    <div class="ac-meta">${it.kind} · ${timeAgo(it.when)}</div>
    ${it.swatches && it.swatches.length ? `<div class="swatch-row">${it.swatches.map(c => `<span class="swatch" style="background:${c}"></span>`).join('')}</div>` : ''}
  </a>`;
}

function wireHover(container) {
  const ambient = document.getElementById('dbAmbient');
  container.querySelectorAll('.activity-card').forEach(card => {
    const tint = card.dataset.tint || '#B85C52';
    card.addEventListener('mouseenter', () => {
      card.style.background   = hexTint(tint, 0.12);
      card.style.borderColor  = hexTint(tint, 0.4);
      // Tint ambient blobs toward hovered color
      if (ambient && tint && tint.startsWith('#')) {
        const [r, g, b] = hexToRgb(tint);
        ambient.style.setProperty('--db-amb-color', `${r}, ${g}, ${b}`);
      }
    });
    card.addEventListener('mouseleave', () => {
      card.style.background  = '';
      card.style.borderColor = '';
      if (ambient) ambient.style.removeProperty('--db-amb-color');
    });
  });
}

/* ── Module switcher ───────────────────────────────────────────── */
function switchModule(module) {
  const current  = document.querySelector('.module-panel.active');
  const incoming = document.querySelector(`.module-panel[data-module="${module}"]`);
  if (!incoming || incoming === current) return;

  // Update tab active class + sliding indicator
  document.querySelectorAll('.module-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.module === module));
  positionIndicator(document.querySelector(`.module-tab[data-module="${module}"]`));

  // Exit current panel
  if (current) {
    current.classList.remove('active');
    current.classList.add('exiting');
    setTimeout(() => current.classList.remove('exiting'), 200);
  }

  // Enter incoming panel with 50ms stagger
  setTimeout(() => incoming.classList.add('active'), 50);
}

function positionIndicator(tab) {
  const indicator = document.getElementById('tabIndicator');
  const bar       = document.getElementById('moduleTabs');
  if (!tab || !indicator || !bar) return;
  // Use offsetLeft (layout position, scroll-independent) rather than
  // getBoundingClientRect (viewport position, scroll-dependent) — the
  // tab bar scrolls horizontally on mobile, and rect-diffing double
  // counts that scroll offset, throwing the indicator off by however
  // far the bar has been scrolled.
  indicator.style.transform = `translateX(${tab.offsetLeft - 5}px)`;
  indicator.style.width     = `${tab.offsetWidth}px`;
  tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
}

/* ── UI wiring ─────────────────────────────────────────────────── */
function wireUI() {
  document.getElementById('signOut')?.addEventListener('click', signOut);
  document.getElementById('themeToggle')?.addEventListener('click', () => {
    toggleTheme();
    requestAnimationFrame(() => positionIndicator(document.querySelector('.module-tab.active')));
  });
  document.getElementById('themeToggle2').addEventListener('click', () => {
    toggleTheme();
    requestAnimationFrame(() => positionIndicator(document.querySelector('.module-tab.active')));
  });

  // Module tab clicks
  document.querySelectorAll('.module-tab').forEach(tab =>
    tab.addEventListener('click', () => switchModule(tab.dataset.module)));

  // Sidebar connectors → switch to Connectors module
  document.getElementById('connectorsBtn')?.addEventListener('click', () => switchModule('connectors'));

  // Topbar "Add Credits" → switch to Credits module
  document.getElementById('addCredits').addEventListener('click', () => switchModule('credits'));

  // Reload modal (fallback — kept but not the primary path)
  const reloadModal = document.getElementById('reloadModal');
  buildReloadGrid('reloadGrid');
  document.getElementById('reloadClose').addEventListener('click', () => reloadModal.classList.add('tm-hidden'));
  reloadModal.addEventListener('click', e => { if (e.target === reloadModal) reloadModal.classList.add('tm-hidden'); });

  // Connectors modal (fallback)
  const connModal = document.getElementById('connModal');
  document.getElementById('connClose').addEventListener('click', () => connModal.classList.add('tm-hidden'));
  connModal.addEventListener('click', e => { if (e.target === connModal) connModal.classList.add('tm-hidden'); });

  // Reposition indicator on window resize
  window.addEventListener('resize', () =>
    positionIndicator(document.querySelector('.module-tab.active')), { passive: true });
}

/* ── Utilities ─────────────────────────────────────────────────── */
function hexTint(hex, alpha) {
  if (!hex || !hex.startsWith('#')) return `rgba(184,92,82,${alpha})`;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
function hexToRgb(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function escapeHtml(s) {
  return (s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

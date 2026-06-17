/* ═══════════════════════════════════════════════════════════════════
   TAMATO AI — @ MENTION SITE INTEGRATION
   Typing @ opens a dropdown of the user's sites. Selecting one tags it;
   on send, that site's HTML is included in the message context.
═══════════════════════════════════════════════════════════════════ */
import { listSites, getSite } from '/js/supabase.js';

let sites = [];
const tagged = new Map(); // name → site id

export async function initMentions() { sites = await listSites(); }

/**
 * Attach @-mention behavior to a textarea + menu element.
 * Returns a helper to resolve tagged-site context for the current input.
 */
export function attachMentions(textarea, menu) {
  let open = false, sel = 0, matches = [];

  function close() { menu.classList.remove('open'); open = false; }
  function render() {
    menu.innerHTML = matches.map((s, i) =>
      `<div class="mention-row ${i === sel ? 'sel' : ''}" data-i="${i}"><span class="tm-dot" style="background:${s.primary_color || 'var(--tm-accent)'}"></span>${escapeHtml(s.name || 'Untitled')}</div>`).join('')
      || '<div class="mention-row tm-dim">No sites</div>';
    menu.querySelectorAll('.mention-row[data-i]').forEach(r => r.addEventListener('click', () => choose(+r.dataset.i)));
    menu.classList.add('open'); open = true;
  }
  function choose(i) {
    const s = matches[i]; if (!s) return;
    tagged.set(s.name || 'Untitled', s.id);
    const val = textarea.value.replace(/@(\w*)$/, '@' + (s.name || 'Untitled').replace(/\s+/g, '') + ' ');
    textarea.value = val; close(); textarea.focus();
  }

  textarea.addEventListener('input', () => {
    const m = textarea.value.match(/@(\w*)$/);
    if (m) { const q = m[1].toLowerCase(); matches = sites.filter(s => (s.name || '').toLowerCase().replace(/\s+/g, '').includes(q)).slice(0, 8); sel = 0; render(); }
    else close();
  });
  textarea.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % matches.length; render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + matches.length) % matches.length; render(); }
    else if (e.key === 'Enter' && matches.length) { e.preventDefault(); choose(sel); }
    else if (e.key === 'Escape') close();
  });
}

/** Build a context string for any sites tagged in `text`. */
export async function resolveContext(text) {
  const ctx = [];
  for (const [name, id] of tagged) {
    const stripped = name.replace(/\s+/g, '');
    if (text.includes('@' + stripped) || text.includes('@' + name)) {
      const site = await getSite(id);
      if (site) ctx.push(`[Referenced site "${name}"]\n${(site.desktop_html || '').slice(0, 12000)}`);
    }
  }
  return ctx.length ? '\n\n--- Site context ---\n' + ctx.join('\n\n') : '';
}

function escapeHtml(s) { return (s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

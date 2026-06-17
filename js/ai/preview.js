/* ═══════════════════════════════════════════════════════════════════
   TAMATO AI — LIVE HTML PREVIEW
   Detect complete HTML in a response and render it inline below the
   message with Send-to-Build / Regenerate / Copy actions.
═══════════════════════════════════════════════════════════════════ */
import { createSite, toast } from '/js/supabase.js';

/** Does the text contain a complete HTML document? */
export function containsHTML(text) {
  return /<!DOCTYPE html>/i.test(text) || /<html[\s>]/i.test(text);
}

/** Extract the HTML document from a response (handles code fences). */
export function extractHTML(text) {
  const fence = text.match(/```html\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const start = text.search(/<!DOCTYPE html>|<html[\s>]/i);
  if (start === -1) return text;
  let end = text.lastIndexOf('</html>');
  return end === -1 ? text.slice(start) : text.slice(start, end + 7);
}

/** Mount a live preview into `container`. onRegenerate optional. */
export function mountPreview(container, html, { onRegenerate } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'ai-preview';
  const frame = document.createElement('iframe');
  frame.sandbox = 'allow-scripts allow-same-origin allow-forms';
  frame.srcdoc = html;
  const bar = document.createElement('div');
  bar.className = 'ai-preview-bar';
  bar.innerHTML = `
    <button class="tm-btn tm-btn-primary tm-btn-sm" data-act="build">Send to Tamato.build</button>
    <button class="tm-btn tm-btn-ghost tm-btn-sm" data-act="regen">Regenerate</button>
    <button class="tm-btn tm-btn-ghost tm-btn-sm" data-act="copy">Copy HTML</button>`;
  wrap.append(frame, bar);
  container.appendChild(wrap);

  bar.querySelector('[data-act="copy"]').addEventListener('click', () => {
    navigator.clipboard.writeText(html).then(() => toast('HTML copied.', 'success'));
  });
  bar.querySelector('[data-act="regen"]').addEventListener('click', () => onRegenerate && onRegenerate());
  bar.querySelector('[data-act="build"]').addEventListener('click', async () => {
    const site = await createSite({ name: 'From Tamato AI', desktop_html: html, mobile_html: html, model_used: 'ai' });
    if (site) { toast('Sent to Build.', 'success'); window.open('/build/?site=' + site.id, '_blank'); }
    else toast('Could not send to Build.', 'error');
  });
}

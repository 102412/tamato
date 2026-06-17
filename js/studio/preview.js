/* ═══════════════════════════════════════════════════════════════════
   TAMATO STUDIO — LIVE COMPONENT PREVIEW
   Six real components rendered from the current tokens. 100ms debounce.
═══════════════════════════════════════════════════════════════════ */

function v(tokens, group, key, fallback) { return (tokens[group] && tokens[group][key]) || fallback; }

export function renderPreview(container, tokens) {
  const c = tokens.colors || {}, t = tokens.typography || {}, b = tokens.borders || {}, s = tokens.shadows || {};
  const fontHead = `'${t.heading_font || 'sans-serif'}', sans-serif`;
  const fontBody = `'${t.body_font || 'sans-serif'}', sans-serif`;
  const radMd = b.radius_md || '6px', radLg = b.radius_lg || '8px';

  const blocks = [
    ['Navigation', `<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 24px;background:${c.surface};border-bottom:${b.width||'1px'} ${b.style||'solid'} ${c.border};font-family:${fontBody}">
      <strong style="font-family:${fontHead};color:${c.text}">Logo</strong>
      <div style="display:flex;gap:24px;align-items:center;color:${c.text_secondary};font-size:14px"><span>Home</span><span>About</span><span>Pricing</span>
      <span style="background:${c.primary};color:#fff;padding:8px 16px;border-radius:${radMd};font-weight:600">Get started</span></div></div>`],

    ['Hero', `<div style="padding:64px 32px;background:${c.background};text-align:center;font-family:${fontBody}">
      <h1 style="font-family:${fontHead};font-weight:${t.heading_weight||700};color:${c.text};font-size:40px;margin:0 0 12px">A bold headline</h1>
      <p style="color:${c.text_secondary};font-size:18px;margin:0 0 24px">Supporting copy that explains the value in one calm sentence.</p>
      <div style="display:flex;gap:12px;justify-content:center">
        <span style="background:${c.primary};color:#fff;padding:12px 24px;border-radius:${radMd};font-weight:600">Primary</span>
        <span style="border:1px solid ${c.border};color:${c.text};padding:12px 24px;border-radius:${radMd};font-weight:600">Secondary</span></div></div>`],

    ['Buttons', `<div style="padding:24px;background:${c.surface};display:flex;gap:12px;flex-wrap:wrap;font-family:${fontBody}">
      <span style="background:${c.primary};color:#fff;padding:10px 20px;border-radius:${radMd};font-weight:600">Primary</span>
      <span style="background:${c.secondary};color:#fff;padding:10px 20px;border-radius:${radMd};font-weight:600">Secondary</span>
      <span style="background:transparent;border:1px solid ${c.border};color:${c.text};padding:10px 20px;border-radius:${radMd};font-weight:600">Ghost</span>
      <span style="background:#C0392B;color:#fff;padding:10px 20px;border-radius:${radMd};font-weight:600">Destructive</span></div>`],

    ['Card', `<div style="padding:24px;background:${c.background};font-family:${fontBody}"><div style="background:${c.surface};border:1px solid ${c.border};border-radius:${radLg};overflow:hidden;max-width:320px;box-shadow:${s.md||'none'}">
      <div style="height:120px;background:${c.primary};opacity:.85"></div>
      <div style="padding:20px"><h3 style="font-family:${fontHead};color:${c.text};margin:0 0 8px">Card title</h3>
      <p style="color:${c.text_secondary};font-size:14px;margin:0 0 16px">A short description of this card's content goes here.</p>
      <span style="color:${c.primary};font-weight:600;font-size:14px">Learn more →</span></div></div></div>`],

    ['Input', `<div style="padding:24px;background:${c.surface};font-family:${fontBody};max-width:360px">
      <label style="display:block;color:${c.text};font-weight:600;font-size:13px;margin-bottom:6px">Email address</label>
      <input placeholder="you@example.com" style="width:100%;padding:10px 12px;border:1px solid ${c.border};border-radius:${radMd};background:${c.background};color:${c.text};font-family:${fontBody}">
      <p style="color:${c.text_secondary};font-size:12px;margin:6px 0 0">We'll never share your email.</p></div>`],

    ['Footer', `<div style="padding:32px 24px;background:${c.surface};border-top:1px solid ${c.border};display:flex;justify-content:space-between;align-items:center;font-family:${fontBody};flex-wrap:wrap;gap:12px">
      <strong style="font-family:${fontHead};color:${c.text}">Logo</strong>
      <div style="display:flex;gap:20px;color:${c.text_secondary};font-size:13px"><span>Terms</span><span>Privacy</span><span>Contact</span></div>
      <span style="color:${c.text_secondary};font-size:12px">© 2026</span></div>`],
  ];

  container.innerHTML = blocks.map(([label, html]) =>
    `<div class="pv-block"><div class="pv-label">${label}</div>${html}</div>`).join('');
}

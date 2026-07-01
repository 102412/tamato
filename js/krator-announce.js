/* ═══════════════════════════════════════════════════════════════════
   TAMATO — KRATOR ANNOUNCEMENT POPUP
   One-time dismissible announcement for Krator (Fable 5) launch.
   Shown once per browser via localStorage; never again after dismiss.
═══════════════════════════════════════════════════════════════════ */
(function () {
  if (localStorage.getItem('tm_krator_announcement_seen')) return;

  function init() {
    const style = document.createElement('style');
    style.textContent = `
      .krator-word {
        font-family: 'Cinzel', serif;
        font-weight: 700;
        letter-spacing: 0.03em;
        color: var(--tm-accent);
      }
      .krator-overlay {
        position: fixed; inset: 0; z-index: 9999;
        background: rgba(0,0,0,0.65);
        display: flex; align-items: center; justify-content: center;
        padding: 16px;
        animation: kraFadeIn 250ms ease forwards;
      }
      .krator-card {
        background: var(--tm-bg, #0f0a08);
        border: 1px solid var(--tm-border, rgba(255,255,255,0.1));
        border-radius: 16px;
        padding: 36px 40px 32px;
        max-width: 440px; width: 100%;
        position: relative;
        animation: kraScaleIn 250ms ease forwards;
      }
      .krator-close {
        position: absolute; top: 16px; right: 16px;
        background: none; border: none; cursor: pointer;
        color: var(--tm-text-2, rgba(255,255,255,0.45));
        font-size: 18px; line-height: 1; padding: 4px 8px;
        border-radius: 6px; transition: color 120ms;
      }
      .krator-close:hover { color: var(--tm-text, #F4F4F5); }
      .krator-eyebrow {
        font-family: 'Roboto Mono', monospace;
        font-size: 11px; letter-spacing: 0.12em;
        color: var(--tm-accent, #FF4D2A);
        margin-bottom: 12px; text-transform: uppercase;
      }
      .krator-headline {
        font-size: clamp(24px, 5vw, 30px);
        font-weight: 700; line-height: 1.2;
        margin-bottom: 14px;
        color: var(--tm-text, #F4F4F5);
      }
      .krator-sub {
        font-size: 14px; line-height: 1.6;
        color: var(--tm-text-2, rgba(255,255,255,0.55));
        margin-bottom: 28px;
      }
      .krator-btn {
        display: inline-flex; align-items: center; justify-content: center;
        background: var(--tm-accent, #FF4D2A);
        color: #fff; border: none; border-radius: 8px;
        padding: 10px 28px; font-size: 14px; font-weight: 600;
        cursor: pointer; transition: opacity 120ms;
      }
      .krator-btn:hover { opacity: 0.88; }
      @keyframes kraFadeIn  { from { opacity: 0; } to { opacity: 1; } }
      @keyframes kraScaleIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.className = 'krator-overlay';
    overlay.innerHTML = `
      <div class="krator-card" role="dialog" aria-modal="true" aria-label="Krator announcement">
        <button class="krator-close" id="kraClose" aria-label="Dismiss">✕</button>
        <div class="krator-eyebrow">Now Available</div>
        <div class="krator-headline">Fable 5 is back. Meet <span class="krator-word">Krator</span>.</div>
        <div class="krator-sub">Our new frontier-class model. Beyond Megisto. Available now on Pro+, Agency, and Brand Wide.</div>
        <button class="krator-btn" id="kraGotIt">Got it</button>
      </div>`;
    document.body.appendChild(overlay);

    function dismiss() {
      localStorage.setItem('tm_krator_announcement_seen', 'true');
      overlay.remove();
    }

    document.getElementById('kraClose').addEventListener('click', dismiss);
    document.getElementById('kraGotIt').addEventListener('click', dismiss);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) dismiss(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

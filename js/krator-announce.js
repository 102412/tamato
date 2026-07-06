/* ═══════════════════════════════════════════════════════════════════
   TAMATO — KRATOR 5 ANNOUNCEMENT POPUP
   One-time dismissible announcement for Krator 5 (Fable 5) launch.
   Shown once per browser via localStorage; never again after dismiss.
═══════════════════════════════════════════════════════════════════ */
(function () {
  if (localStorage.getItem('tm_krator5_announcement_seen')) return;

  function init() {
    const style = document.createElement('style');
    style.textContent = `
      .krator-word {
        font-family: 'Cinzel', serif;
        font-weight: 700;
        letter-spacing: 0.04em;
        color: var(--tm-accent);
      }
      .krator-overlay {
        position: fixed; inset: 0; z-index: 9999;
        background: rgba(0,0,0,0.72);
        display: flex; align-items: center; justify-content: center;
        padding: 16px;
        animation: kraFadeIn 300ms ease forwards;
      }
      .krator-card {
        background: var(--tm-bg);
        border: 1px solid var(--tm-accent-dim);
        border-radius: 18px;
        padding: 40px 44px 36px;
        max-width: 460px; width: 100%;
        position: relative;
        overflow: hidden;
        box-shadow: 0 0 80px var(--tm-accent-glow), 0 24px 64px rgba(0,0,0,0.6);
        animation: kraScaleIn 300ms cubic-bezier(0.22,1,0.36,1) forwards;
      }
      .krator-card::before {
        content: '';
        position: absolute; top: 0; left: -200%; width: 200%; height: 2px;
        background: linear-gradient(90deg, transparent 0%, var(--tm-accent) 50%, transparent 100%);
        animation: kraSweep 1.4s ease 280ms forwards;
      }
      .krator-card::after {
        content: '';
        position: absolute; inset: 0; border-radius: 18px; pointer-events: none;
        background: radial-gradient(ellipse at 50% 0%, var(--tm-accent-glow) 0%, transparent 65%);
      }
      .krator-close {
        position: absolute; top: 16px; right: 16px;
        background: none; border: none; cursor: pointer;
        color: var(--tm-text-2);
        font-size: 18px; line-height: 1; padding: 4px 8px;
        border-radius: 6px; transition: color 120ms;
        z-index: 1;
      }
      .krator-close:hover { color: var(--tm-text); }
      .krator-eyebrow {
        font-family: var(--font-mono);
        font-size: 11px; letter-spacing: 0.12em;
        color: var(--tm-accent);
        margin-bottom: 14px; text-transform: uppercase;
        position: relative; z-index: 1;
      }
      .krator-headline {
        font-size: clamp(26px, 5.5vw, 34px);
        font-weight: 700; line-height: 1.15;
        margin-bottom: 16px;
        color: var(--tm-text);
        position: relative; z-index: 1;
      }
      .krator-sub {
        font-size: 14px; line-height: 1.65;
        color: var(--tm-text-2);
        margin-bottom: 32px;
        position: relative; z-index: 1;
      }
      .krator-btn {
        display: inline-flex; align-items: center; justify-content: center;
        background: var(--tm-accent);
        color: var(--tm-bg); border: none; border-radius: 8px;
        padding: 11px 32px; font-size: 14px; font-weight: 700;
        cursor: pointer; transition: opacity 120ms;
        position: relative; z-index: 1;
        letter-spacing: 0.01em;
      }
      .krator-btn:hover { opacity: 0.88; }
      @keyframes kraFadeIn  { from { opacity: 0; } to { opacity: 1; } }
      @keyframes kraScaleIn { from { opacity: 0; transform: scale(0.94) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
      @keyframes kraSweep   { from { left: -200%; } to { left: 200%; } }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.className = 'krator-overlay';
    overlay.innerHTML = `
      <div class="krator-card" role="dialog" aria-modal="true" aria-label="Krator 5 announcement">
        <button class="krator-close" id="kraClose" aria-label="Dismiss">✕</button>
        <div class="krator-eyebrow">Now Available</div>
        <div class="krator-headline">Meet <span class="krator-word">Krator</span> 5.</div>
        <div class="krator-sub">Our frontier-class model, built on Claude Fable 5. Beyond Megisto in every way. Available now on Pro + Krator 5, Agency, and Brand Wide.</div>
        <button class="krator-btn" id="kraGotIt">Explore Krator 5 →</button>
      </div>`;
    document.body.appendChild(overlay);

    function dismiss() {
      localStorage.setItem('tm_krator5_announcement_seen', 'true');
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

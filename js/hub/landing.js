/* ═══════════════════════════════════════════════════════════════════
   TAMATO — LANDING PAGE
   Parallax background, hero fade, scroll-reveal glass cards, admin modal.
═══════════════════════════════════════════════════════════════════ */
import { ADMIN_CODES } from '/js/supabase.js';

const bgImg     = document.querySelector('.lp-bg-img');
const hero      = document.getElementById('hero');
const scrollCue = document.getElementById('scrollCue');

/* ── Parallax + hero fade ────────────────────────────────────────── */
let ticking = false;
window.addEventListener('scroll', () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    const y  = window.scrollY;
    const vh = window.innerHeight;
    if (bgImg) bgImg.style.transform = `scale(1.08) translateY(${(y * 0.22).toFixed(1)}px)`;
    if (hero)  hero.style.opacity    = Math.max(0, 1 - y / (vh * 0.62)).toFixed(3);
    if (scrollCue) scrollCue.classList.toggle('hidden', y > 90);
    ticking = false;
  });
}, { passive: true });

/* ── Scroll-reveal for glass cards, features, pricing ──────────── */
const revealObs = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('in-view');
      revealObs.unobserve(e.target);
    }
  });
}, { threshold: 0.1 });

['.lp-glass-grid', '.lp-feature-grid', '.price-grid'].forEach(sel => {
  document.querySelectorAll(`${sel} > *`).forEach((el, i) => {
    el.style.transitionDelay = `${i * 80}ms`;
    revealObs.observe(el);
  });
});

/* ── Admin modal ────────────────────────────────────────────────── */
const modal     = document.getElementById('adminModal');
const codeInput = document.getElementById('adminCode');
const adminErr  = document.getElementById('adminErr');
const adminCard = modal.querySelector('.tm-modal');

document.getElementById('adminBtn').addEventListener('click', () => {
  modal.classList.remove('tm-hidden');
  codeInput.value = '';
  adminErr.textContent = '';
  codeInput.focus();
});
document.getElementById('adminCancel').addEventListener('click', () => modal.classList.add('tm-hidden'));
modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('tm-hidden'); });

function tryEnter() {
  const code = codeInput.value.trim();
  if (ADMIN_CODES.includes(code)) {
    sessionStorage.setItem('tm_admin_ok', '1');
    location.href = '/admin.html';
  } else {
    adminErr.textContent = 'Invalid access code.';
    codeInput.value = '';
    adminCard.classList.remove('tm-shake');
    void adminCard.offsetWidth;
    adminCard.classList.add('tm-shake');
  }
}
document.getElementById('adminEnter').addEventListener('click', tryEnter);
codeInput.addEventListener('keydown', e => { if (e.key === 'Enter') tryEnter(); });

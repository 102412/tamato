/* ═══════════════════════════════════════════════════════════════════
   TAMATO — LANDING PAGE
   Scroll-reveal fades, "How it works" scrollytelling, admin modal.
═══════════════════════════════════════════════════════════════════ */
import { ADMIN_CODES } from '/js/supabase.js';

/* ── Scroll-reveal ───────────────────────────────────────────────── */
const revealObs = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('in-view');
      revealObs.unobserve(e.target);
    }
  });
}, { threshold: 0.15 });
document.querySelectorAll('.scroll-reveal').forEach(el => revealObs.observe(el));

/* ── How it works — active stage + dot sync ─────────────────────── */
const stages = document.querySelectorAll('.stage');
const dots = document.querySelectorAll('.how-dot');

const stageObs = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    const n = e.target.dataset.stage;
    if (e.isIntersecting) {
      e.target.classList.add('active');
      dots.forEach(d => d.classList.toggle('active', d.dataset.dot === n));
    } else {
      e.target.classList.remove('active');
    }
  });
}, { threshold: 0.5 });
stages.forEach(s => stageObs.observe(s));

/* ── Stage 3 fake token counter ──────────────────────────────────── */
const counterEl = document.getElementById('s3Counter');
const stage3 = document.querySelector('.stage[data-stage="3"]');
if (counterEl && stage3) {
  let started = false;
  const counterObs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting && !started) {
        started = true;
        let n = 0;
        const tick = setInterval(() => {
          n += Math.floor(Math.random() * 60) + 20;
          counterEl.textContent = `generating · ${n} tokens`;
          if (n > 1200) clearInterval(tick);
        }, 280);
      }
    });
  }, { threshold: 0.4 });
  counterObs.observe(stage3);
}

/* ── Admin modal ─────────────────────────────────────────────────── */
const modal     = document.getElementById('adminModal');
const codeInput = document.getElementById('adminCode');
const adminErr  = document.getElementById('adminErr');
const adminCard = modal.querySelector('.tmodal');

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

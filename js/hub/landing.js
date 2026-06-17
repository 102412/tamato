/* ═══════════════════════════════════════════════════════════════════
   TAMATO — LANDING PAGE
   Scroll sequence: hero fades → pyramid fades in → slides left →
   product cards emerge from behind → pyramid fades out.
   Plus admin access modal.
═══════════════════════════════════════════════════════════════════ */
import { ADMIN_CODES } from '/js/supabase.js';

const hero = document.getElementById('hero');
const pyramid = document.getElementById('pyramid');
const cards = Array.from(document.querySelectorAll('.lp-card'));
const stage = document.getElementById('stage');

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function onScroll() {
  const y = window.scrollY;
  const vh = window.innerHeight;
  const stageTop = stage.offsetTop;
  const stageH = stage.offsetHeight;

  // 1. hero fades out over first viewport
  const heroFade = clamp(1 - y / (vh * 0.7), 0, 1);
  hero.style.opacity = heroFade;

  // progress through the stage (0 → 1)
  const p = clamp((y - (stageTop - vh)) / stageH, 0, 1);

  // 2/3. pyramid fades in (0–0.25), slides left (0.25–0.6), fades out (0.7–1)
  const pyIn = clamp(p / 0.25, 0, 1);
  const pyOut = clamp((p - 0.7) / 0.3, 0, 1);
  const slide = clamp((p - 0.25) / 0.35, 0, 1);
  pyramid.style.opacity = (pyIn * (1 - pyOut)).toFixed(3);
  pyramid.style.transform = `translate(calc(-50% - ${slide * 60}vw), -50%)`;

  // 4/5. cards emerge from behind pyramid, staggered
  cards.forEach((card, i) => {
    const start = 0.35 + i * 0.12;
    const cp = clamp((p - start) / 0.25, 0, 1);
    card.style.opacity = cp.toFixed(3);
    card.style.transform = `translateX(${(1 - cp) * 60}vw)`;
  });
}

window.addEventListener('scroll', () => requestAnimationFrame(onScroll), { passive: true });
window.addEventListener('resize', onScroll);
onScroll();

/* ── Admin modal ───────────────────────────────────────────────── */
const modal = document.getElementById('adminModal');
const codeInput = document.getElementById('adminCode');
const adminErr = document.getElementById('adminErr');
const adminCard = modal.querySelector('.tm-modal');

document.getElementById('adminBtn').addEventListener('click', () => {
  modal.classList.remove('tm-hidden'); codeInput.value = ''; adminErr.textContent = ''; codeInput.focus();
});
document.getElementById('adminCancel').addEventListener('click', () => modal.classList.add('tm-hidden'));
modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('tm-hidden'); });

function tryEnter() {
  const code = codeInput.value.trim();
  if (ADMIN_CODES.includes(code)) {
    sessionStorage.setItem('tm_admin_ok', '1');
    location.href = '/admin.html';
  } else {
    adminErr.textContent = 'Invalid access code.';
    codeInput.value = '';
    adminCard.classList.remove('tm-shake'); void adminCard.offsetWidth; adminCard.classList.add('tm-shake');
  }
}
document.getElementById('adminEnter').addEventListener('click', tryEnter);
codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryEnter(); });

/* ═══════════════════════════════════════════════════════════════════
   TAMATO — LANDING PAGE
   Scroll sequence:
     1. Hero fades out as user scrolls
     2. Device stage (400vh): laptop frame pinned, 3 content stages
        animate inside the screen as scroll progresses
     3. Floating cards belt animates via CSS only
   Plus admin access modal.
═══════════════════════════════════════════════════════════════════ */
import { ADMIN_CODES } from '/js/supabase.js';

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/* ── DOM refs ──────────────────────────────────────────────────── */
const hero        = document.getElementById('hero');
const deviceStage = document.getElementById('deviceStage');
const dimOverlay  = document.getElementById('dimOverlay');
const scrollCue   = document.getElementById('scrollCue');
const pane1       = document.getElementById('pane1');
const pane2       = document.getElementById('pane2');
const pane3       = document.getElementById('pane3');
const screenCards = [
  document.getElementById('sc0'),
  document.getElementById('sc1'),
  document.getElementById('sc2'),
];
const screenFeats = [
  document.getElementById('sf0'),
  document.getElementById('sf1'),
  document.getElementById('sf2'),
  document.getElementById('sf3'),
];

/* ── Scroll handler ────────────────────────────────────────────── */
let inStage = false;

function onScroll() {
  const y  = window.scrollY;
  const vh = window.innerHeight;

  // 1. Hero fades out over the first 70% of a viewport height of scroll
  const heroFade = clamp(1 - y / (vh * 0.7), 0, 1);
  hero.style.opacity = heroFade.toFixed(3);

  // 2. Device stage scroll progress (0 → 1)
  if (!inStage) {
    // When not in stage, ensure dim is cleared
    dimOverlay.style.opacity = '0';
    return;
  }

  const stageTop = deviceStage.offsetTop;
  const stageH   = deviceStage.offsetHeight;
  const p = clamp((y - stageTop) / (stageH - vh), 0, 1);

  animateDevice(p);
}

function animateDevice(p) {
  /* ── Dim overlay ────────────────────────────────────────────── */
  // Fades IN at start of stage, stays, fades OUT at end
  let dimOp;
  if      (p < 0.08) dimOp = p / 0.08;
  else if (p > 0.88) dimOp = (1 - p) / 0.12;
  else               dimOp = 1;
  dimOverlay.style.opacity = (dimOp * 0.68).toFixed(3);

  /* ── Scroll cue ─────────────────────────────────────────────── */
  if (p > 0.03) scrollCue.classList.add('hidden');
  else          scrollCue.classList.remove('hidden');

  /* ── Stage 1 — Pyramid ──────────────────────────────────────── */
  // Fade in:  p 0.00 → 0.12
  // Hold:     p 0.12 → 0.26
  // Fade out: p 0.26 → 0.36
  const s1in  = clamp(p / 0.12, 0, 1);
  const s1out = clamp((p - 0.26) / 0.10, 0, 1);
  pane1.style.opacity = (s1in * (1 - s1out)).toFixed(3);

  /* ── Stage 2 — Product cards ────────────────────────────────── */
  // Fade in:  p 0.32 → 0.42
  // Hold:     p 0.42 → 0.60
  // Fade out: p 0.60 → 0.70
  const s2in  = clamp((p - 0.32) / 0.10, 0, 1);
  const s2out = clamp((p - 0.60) / 0.10, 0, 1);
  const s2    = s2in * (1 - s2out);
  pane2.style.opacity = s2.toFixed(3);

  // Cards slide in staggered, slide out with pane
  screenCards.forEach((card, i) => {
    if (!card) return;
    const start = 0.32 + i * 0.05;
    const cp    = clamp((p - start) / 0.10, 0, 1) * (1 - s2out);
    card.style.opacity   = cp.toFixed(3);
    card.style.transform = `translateX(${((1 - clamp((p - start) / 0.10, 0, 1)) * 36).toFixed(1)}px)`;
  });

  /* ── Stage 3 — Feature highlights ──────────────────────────── */
  // Fade in:  p 0.66 → 0.76
  // Hold through end
  const s3in = clamp((p - 0.66) / 0.10, 0, 1);
  pane3.style.opacity = s3in.toFixed(3);

  screenFeats.forEach((feat, i) => {
    if (!feat) return;
    const start = 0.66 + i * 0.04;
    const fp    = clamp((p - start) / 0.10, 0, 1);
    feat.style.opacity   = fp.toFixed(3);
    feat.style.transform = `translateY(${((1 - fp) * 10).toFixed(1)}px)`;
  });
}

/* ── IntersectionObserver — only run scroll math when stage is near ── */
const stageObs = new IntersectionObserver((entries) => {
  inStage = entries[0].isIntersecting;
  if (!inStage) {
    dimOverlay.style.opacity = '0';
  }
}, { threshold: 0, rootMargin: '100px 0px 100px 0px' });

stageObs.observe(deviceStage);

/* ── Attach scroll listener ────────────────────────────────────── */
let ticking = false;
window.addEventListener('scroll', () => {
  if (!ticking) {
    requestAnimationFrame(() => { onScroll(); ticking = false; });
    ticking = true;
  }
}, { passive: true });

window.addEventListener('resize', onScroll);
onScroll();

/* ── Admin modal ───────────────────────────────────────────────── */
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
modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('tm-hidden'); });

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
codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryEnter(); });

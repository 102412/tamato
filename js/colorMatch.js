/* ═══════════════════════════════════════════════════════════════════
   TAMATO — DYNAMIC UI COLOR MATCHING
   Extract dominant colors from generated HTML, mix into --tm-dynamic-*
   at low opacity, verify contrast, apply to .tm-shell with 800ms ease.
   Default export: ColorMatch { run(iframe, html), resetToDefaults() }
═══════════════════════════════════════════════════════════════════ */

const DEFAULTS = {
  dark:  { bg: '#1C1917', surface: '#252220', accent: '#B85C52', border: '#3A3633' },
  light: { bg: '#FAF9F7', surface: '#FFFFFF', accent: '#B85C52', border: '#E0DBD5' },
};

function theme() { return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }

function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}
function brightness([r, g, b]) { return 0.299 * r + 0.587 * g + 0.114 * b; }

function relLum([r, g, b]) {
  const a = [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}
function contrast(c1, c2) {
  const l1 = relLum(c1), l2 = relLum(c2);
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}
function mix(a, b, t) { return a.map((v, i) => v + (b[i] - v) * t); }

/** Pull all hex + rgb() colors out of an HTML string. */
function extractColors(html) {
  const out = [];
  const hexRe = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
  const rgbRe = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/g;
  let m;
  while ((m = hexRe.exec(html))) out.push(hexToRgb(m[0]));
  while ((m = rgbRe.exec(html))) out.push([+m[1], +m[2], +m[3]]);
  return out.filter(c => { const b = brightness(c); return b >= 20 && b <= 235; });
}

/** K-means clustering. k=3, 10 iterations. */
function kmeans(points, k = 3, iters = 10) {
  if (points.length === 0) return [];
  if (points.length <= k) return points;
  let centroids = [];
  const step = Math.floor(points.length / k);
  for (let i = 0; i < k; i++) centroids.push(points[i * step].slice());

  for (let it = 0; it < iters; it++) {
    const buckets = Array.from({ length: k }, () => []);
    for (const p of points) {
      let best = 0, bd = Infinity;
      for (let i = 0; i < k; i++) {
        const d = (p[0]-centroids[i][0])**2 + (p[1]-centroids[i][1])**2 + (p[2]-centroids[i][2])**2;
        if (d < bd) { bd = d; best = i; }
      }
      buckets[best].push(p);
    }
    centroids = buckets.map((b, i) => {
      if (!b.length) return centroids[i];
      const sum = b.reduce((a, p) => [a[0]+p[0], a[1]+p[1], a[2]+p[2]], [0,0,0]);
      return sum.map(v => v / b.length);
    });
  }
  return centroids;
}

const ColorMatch = {
  /**
   * Extract dominant colors from `html` and tint the dynamic shell vars.
   * `iframe` accepted for API compatibility (analysis uses the html string).
   */
  run(iframe, html) {
    try {
      const mode = theme();
      const colors = extractColors(html || '');
      if (colors.length < 3) return this.resetToDefaults();

      const centroids = kmeans(colors, 3, 10);
      // dominant = the centroid with most saturation/contrast against bg
      const baseBg = hexToRgb(DEFAULTS[mode].bg);
      const baseSurface = hexToRgb(DEFAULTS[mode].surface);
      const baseBorder = hexToRgb(DEFAULTS[mode].border);
      const accent = centroids.reduce((best, c) =>
        (Math.abs(brightness(c) - brightness(baseBg)) > Math.abs(brightness(best) - brightness(baseBg)) ? c : best), centroids[0]);

      const opacity = 0.12; // 10-15%
      const dynBg = mix(baseBg, accent, opacity * 0.8);
      const dynSurface = mix(baseSurface, accent, opacity);
      const dynBorder = mix(baseBorder, accent, opacity * 1.2);

      // verify contrast of text against dynamic bg
      const text = hexToRgb(mode === 'light' ? '#1C1917' : '#F5F0EB');
      if (contrast(text, dynBg) < 4.5) return this.resetToDefaults();

      const root = document.documentElement;
      root.style.setProperty('--tm-dynamic-bg', rgbToHex(dynBg));
      root.style.setProperty('--tm-dynamic-surface', rgbToHex(dynSurface));
      root.style.setProperty('--tm-dynamic-accent', rgbToHex(accent));
      root.style.setProperty('--tm-dynamic-border', rgbToHex(dynBorder));
      this._applyToShell();
    } catch (e) {
      console.warn('[colorMatch]', e.message);
      this.resetToDefaults();
    }
  },

  resetToDefaults() {
    const mode = theme();
    const d = DEFAULTS[mode];
    const root = document.documentElement;
    root.style.setProperty('--tm-dynamic-bg', d.bg);
    root.style.setProperty('--tm-dynamic-surface', d.surface);
    root.style.setProperty('--tm-dynamic-accent', d.accent);
    root.style.setProperty('--tm-dynamic-border', d.border);
    this._applyToShell();
  },

  _applyToShell() {
    document.querySelectorAll('.tm-shell').forEach(el => {
      el.style.transition = 'background 800ms ease, border-color 800ms ease';
    });
  },
};

export default ColorMatch;

/* ═══════════════════════════════════════════════════════════════════
   TAMATO BUILD — GENERATION CORE
   Exports: generate, aiEdit, switchView, setCurrentModel, getCurrentState
   Two streaming calls per generation (desktop then mobile). Credits
   deducted only after success. Color match + autosave after each.
═══════════════════════════════════════════════════════════════════ */
import { streamModel, callModel } from '/js/models.js';
import { canGenerate, canEdit, recordGeneration, recordEdit } from '/js/tiers.js';
import { estimateCost, hasEnough, deductCredits } from '/js/credits.js';
import { createSite, saveSite, getProfile } from '/js/supabase.js';
import ColorMatch from '/js/colorMatch.js';
import { classifySafety, classifyIntent } from '/js/build/safety.js';

/* ── State ─────────────────────────────────────────────────────── */
const state = {
  profile: null,
  site: null,              // { id, name, ... }
  view: 'desktop',         // 'desktop' | 'mobile'
  model: 'PYTHM_MINI',
  html: { desktop: '', mobile: '' },
  chat: [],                // [{ role, content }]
  abort: null,
};
const handlers = {};       // ui hooks registered by the page

export function init({ profile, site, ui }) {
  state.profile = profile;
  if (site) loadSite(site);
  Object.assign(handlers, ui || {});
}
export function getCurrentState() { return state; }
export function setCurrentModel(id) { state.model = id; }
export function switchView(view) { state.view = view; handlers.renderCanvas && handlers.renderCanvas(state.html[view], view); }

export function loadSite(site) {
  state.site = site;
  state.html.desktop = site.desktop_html || '';
  state.html.mobile = site.mobile_html || '';
  state.model = site.model_used || state.model;
  handlers.renderCanvas && handlers.renderCanvas(state.html[state.view], state.view);
  if (state.html.desktop) ColorMatch.run(null, state.html.desktop);
}

/* ── Prompts ───────────────────────────────────────────────────── */
const DESKTOP_SYS = `You are an expert web designer and developer. Generate a complete, production-ready, single-file HTML website.
Rules:
- Complete site in one HTML file. All CSS in style tag. All JS in script tag.
- Completely unique design — no generic templates, no Bootstrap, no cookie-cutter layouts.
- Every site must look structurally different from any other site ever generated.
- Real, specific placeholder content relevant to the described business.
- Desktop-optimized (min-width: 1024px).
- Always include: navigation, hero, minimum 3 content sections, footer.
- Modern CSS: flexbox, grid, custom properties, clamp() for fluid type.
- Scroll-triggered animations, hover micro-interactions, smooth transitions.
- Bold intentional design decisions — typography hierarchy, whitespace, color.
- Google Fonts only (import via @import in style tag).
- Return ONLY raw HTML starting with <!DOCTYPE html>. No explanation. No markdown. No code fences.`;

const MOBILE_SYS = `You are an expert mobile web designer. Generate a complete mobile-optimized HTML website.
Rules:
- Complete site in one HTML file. All CSS in style tag. All JS in script tag.
- Mobile-first for screens under 768px — assume 375px viewport.
- Match brand identity, colors, content of desktop version — restructured for mobile.
- Touch-friendly tap targets (minimum 44px height).
- Stacked single-column layouts — no multi-column grids. Hamburger navigation. Minimum 16px body text.
- No hover-only interactions. Google Fonts only.
- Return ONLY raw HTML starting with <!DOCTYPE html>. No explanation. No markdown. No code fences.`;

const EDIT_SYS = `You are editing an existing website. You receive the complete current HTML and an edit instruction.
Rules:
- Return the COMPLETE modified HTML — never just the changed section.
- Make ONLY the described changes.
- Preserve all existing content, structure, styling not mentioned.
- Keep all animations and interactions.
- Return ONLY raw HTML starting with <!DOCTYPE html>. No explanation. No markdown. No code fences.`;

const userMsg = (prompt) => `Business/site description: ${prompt}
Generate a complete, unique, visually impressive website. Make design decisions a senior designer at a top agency would be proud of.`;

function stripFences(html) {
  return (html || '').replace(/^```html?\s*/i, '').replace(/```\s*$/i, '').trim();
}

/* ── Generation ────────────────────────────────────────────────── */
export async function generate(prompt) {
  const profile = state.profile = await getProfile();

  // 1. safety (silent)
  const safe = await classifySafety(prompt, profile);
  if (safe === 'BLOCKED') { handlers.blocked && handlers.blocked("This prompt violates Tamato's acceptable use policy."); return; }
  if (profile.account_suspended) { handlers.blocked && handlers.blocked('Your account is suspended.'); return; }

  // 2. tier + credit gate
  const gate = canGenerate(profile, state.model, 'build');
  if (!gate.ok) { handlers.gateFail && handlers.gateFail(gate.reason); return; }
  const est = estimateCost('build', 'gen', state.model, prompt.length, 6000);
  if (!hasEnough(profile, 'build', est)) { handlers.needCredits && handlers.needCredits(est, profile.credits); return; }

  state.abort = new AbortController();
  ColorMatch.resetToDefaults();
  handlers.genStart && handlers.genStart();

  try {
    // 3. desktop, then mobile (both streaming); delay between to stay under rate limits
    const desktop = await runStream('desktop', DESKTOP_SYS, userMsg(prompt));
    if (state.abort.signal.aborted) return;
    await new Promise(r => setTimeout(r, 2000));
    if (state.abort.signal.aborted) return;
    const mobile = await runStream('mobile', MOBILE_SYS, userMsg(prompt));

    state.html.desktop = stripFences(desktop.text);
    state.html.mobile = stripFences(mobile.text);

    const usage = { input: desktop.usage.input + mobile.usage.input, output: desktop.usage.output + mobile.usage.output };
    await deductCredits(profile, { product: 'build', action: 'gen', modelId: state.model, usage, description: prompt.slice(0, 80) });
    await recordGeneration(profile, state.model);

    await persist(prompt);
    ColorMatch.run(null, state.html.desktop);
    handlers.genComplete && handlers.genComplete(state.html, state.view);
  } catch (e) {
    if (e.name === 'AbortError') { handlers.genCancelled && handlers.genCancelled(); return; }
    handlers.genError && handlers.genError(e.message || 'Generation failed.');
  } finally {
    state.abort = null;
  }
}

async function runStream(which, system, content) {
  return streamModel({
    modelId: state.model, system, messages: [{ role: 'user', content }],
    maxTokens: 8000, signal: state.abort.signal,
    onDelta: (chunk) => handlers.streamDelta && handlers.streamDelta(which, chunk),
  }).then(res => { handlers.streamDone && handlers.streamDone(which); return res; });
}

export function pause() { /* UI keeps partial; stop reading by aborting current stream */ if (state.abort) state.abort.abort(); }
export function cancel() { if (state.abort) state.abort.abort(); }

/* ── AI edit ─────────────────────────────────────────────────────
   target: 'desktop' | 'mobile' | 'both' (default)               */
export async function aiEdit(instruction, target = 'both') {
  const profile = state.profile = await getProfile();
  if (!state.html.desktop) { handlers.gateFail && handlers.gateFail('no_site'); return; }

  const gate = canEdit(profile, state.model, 'build');
  if (!gate.ok) { handlers.gateFail && handlers.gateFail(gate.reason); return; }

  const doDesktop = target === 'desktop' || target === 'both';
  const doMobile  = target === 'mobile'  || target === 'both';

  const desktopSrc = state.html.desktop;
  const mobileSrc  = state.html.mobile || state.html.desktop;
  const totalLen   = (doDesktop ? desktopSrc.length : 0) + (doMobile ? mobileSrc.length : 0) + instruction.length * (doDesktop && doMobile ? 2 : 1);
  const est = estimateCost('build', 'edit', state.model, totalLen, 6000);
  if (!hasEnough(profile, 'build', est)) { handlers.needCredits && handlers.needCredits(est, profile.credits); return; }

  handlers.editStart && handlers.editStart();
  state.abort = new AbortController();
  try {
    const editOne = (html) => callModel({
      modelId: state.model, system: EDIT_SYS, signal: state.abort.signal,
      messages: [{ role: 'user', content: `CURRENT HTML:\n${html}\n\nEDIT INSTRUCTION:\n${instruction}` }],
      maxTokens: 8000,
    });

    const [dRes, mRes] = await Promise.all([
      doDesktop ? editOne(desktopSrc) : Promise.resolve(null),
      doMobile  ? editOne(mobileSrc)  : Promise.resolve(null),
    ]);

    if (dRes) state.html.desktop = stripFences(dRes.text);
    if (mRes) state.html.mobile  = stripFences(mRes.text);

    const usage = {
      input:  (dRes?.usage.input  || 0) + (mRes?.usage.input  || 0),
      output: (dRes?.usage.output || 0) + (mRes?.usage.output || 0),
    };
    await deductCredits(profile, { product: 'build', action: 'edit', modelId: state.model, usage, description: 'edit: ' + instruction.slice(0, 60) });
    await recordEdit(profile, state.model);
    await persist(state.site ? state.site.prompt : '');
    ColorMatch.run(null, state.html.desktop);
    handlers.editComplete && handlers.editComplete(state.html, state.view);
  } catch (e) {
    if (e.name === 'AbortError') return;
    handlers.editError && handlers.editError(e.message || 'Edit failed.');
  } finally { state.abort = null; }
}

/* ── Chat (free, no credits) ───────────────────────────────────── */
const CHAT_SYS = (prompt, tier) => `You are Tamato's AI assistant in a website builder. Help users build better websites and grow their businesses. You know their current site and business context. Answer questions about design, content, SEO, hosting, business strategy. Be concise, direct, genuinely helpful. Never generic. Never verbose.
Current site prompt: ${prompt || '(none yet)'}
User tier: ${tier}`;

export async function chat(message, tier) {
  state.chat.push({ role: 'user', content: message });
  handlers.chatUser && handlers.chatUser(message);
  try {
    const { text } = await callModel({
      modelId: 'PYTHM_MINI', system: CHAT_SYS(state.site && state.site.prompt, tier),
      messages: state.chat, maxTokens: 2000,
    });
    state.chat.push({ role: 'assistant', content: text });
    handlers.chatReply && handlers.chatReply(text);
  } catch (e) { handlers.chatReply && handlers.chatReply('Sorry — I could not respond just now.'); }
}

/* ── Intent routing helper for the prompt bar ──────────────────── */
export async function route(message) {
  return classifyIntent(message, !!state.html.desktop);
}

/* ── Persist / autosave ────────────────────────────────────────── */
export async function persist(prompt) {
  const primary = extractPrimaryColor(state.html.desktop);
  const fields = {
    desktop_html: state.html.desktop, mobile_html: state.html.mobile,
    model_used: state.model, primary_color: primary,
  };
  if (prompt) fields.prompt = prompt;
  if (state.site && state.site.id) {
    const version = { saved_at: new Date().toISOString(), model: state.model };
    fields.version_history = [...(state.site.version_history || []), version];
    const saved = await saveSite(state.site.id, fields);
    if (saved) state.site = saved;
  } else {
    const created = await createSite({ name: 'Untitled Site', ...fields });
    if (created) state.site = created;
  }
  handlers.saved && handlers.saved();
  sessionStorage.setItem('tm_build_backup', JSON.stringify(state.html));
}

function extractPrimaryColor(html) {
  const m = (html || '').match(/#[0-9a-fA-F]{6}/);
  return m ? m[0] : '#B85C52';
}

export function setHtml(view, html) { state.html[view] = html; }
export function setSiteName(name) { if (state.site) state.site.name = name; }

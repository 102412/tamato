/* ═══════════════════════════════════════════════════════════════════
   TAMATO AI — CHAT CONTROLLER
   Conversation management, streaming responses with markdown, credit
   deduction, inline HTML preview, image uploads, @ mentions.
═══════════════════════════════════════════════════════════════════ */
import {
  requireAuth, getProfile, syncThemeFromProfile, toggleTheme, initials, timeAgo, toast,
  listConversations, createConversation, saveConversation, deleteConversation,
} from '/js/supabase.js';
import { getTier, getModelSelectorState } from '/js/tiers.js';
import { getModel, streamModel } from '/js/models.js';
import { estimateCost, hasEnough, deductCredits, costFromUsage, totalCredits } from '/js/credits.js';
import { containsHTML, extractHTML, mountPreview } from '/js/ai/preview.js';
import { initMentions, attachMentions, resolveContext } from '/js/ai/mentions.js';

const $ = id => document.getElementById(id);
const SYS = `You are Tamato AI — a sharp, capable assistant for builders and small businesses. When asked to create a webpage or component, return a single complete HTML document (starting with <!DOCTYPE html>) so it can render live. Otherwise answer with clear, concise markdown.`;

let profile, tier, model = 'PYTHM_MINI', conv = null, images = [];

(async function init() {
  if (!await requireAuth()) return;
  profile = await getProfile();
  tier = getTier(profile);
  syncThemeFromProfile(profile);
  $('avatar').textContent = initials(profile.email);
  $('creditCount').textContent = totalCredits(profile).toLocaleString();
  await initMentions();
  attachMentions($('text'), $('mentionMenu'));
  renderModelMenu();
  await renderConvList();
  wire();

  const params = new URLSearchParams(location.search);
  if (params.get('conv')) await loadConv(params.get('conv'));
  else openStartModal();

  const pre = sessionStorage.getItem('tm_ai_prefill');
  if (pre) { $('text').value = pre; sessionStorage.removeItem('tm_ai_prefill'); }
})();

/* ── Start modal: New vs Continue ──────────────────────────────── */
async function openStartModal() {
  const convs = await listConversations();
  const last = convs[0];
  const overlay = document.createElement('div');
  overlay.className = 'tm-modal-overlay';
  overlay.innerHTML = `
    <div class="tm-modal" style="max-width:400px">
      <h2 class="tm-modal-title">Tamato AI</h2>
      <p class="tm-modal-sub">Start fresh or pick up where you left off.</p>
      <div class="tm-col">
        <button class="tm-btn tm-btn-primary" id="sm_new">New conversation</button>
        ${last ? `<button class="tm-btn tm-btn-ghost" id="sm_cont">Continue: ${escapeHtml((last.title || 'Last conversation').slice(0, 30))}</button>` : ''}
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#sm_new').addEventListener('click', async () => { overlay.remove(); await newConv(); });
  const cont = overlay.querySelector('#sm_cont');
  if (cont) cont.addEventListener('click', async () => { overlay.remove(); await loadConv(last.id); });
}

/* ── Conversations ─────────────────────────────────────────────── */
async function newConv() {
  conv = await createConversation({ title: 'New Conversation', messages: [], model_used: model });
  $('messages').innerHTML = '';
  await renderConvList();
}
async function loadConv(id) {
  const convs = await listConversations();
  conv = convs.find(c => c.id === id);
  if (!conv) return newConv();
  $('messages').innerHTML = '';
  (conv.messages || []).forEach(m => addMessage(m.role, m.content, false));
  await renderConvList();
}
async function renderConvList() {
  const convs = await listConversations();
  const list = $('convList');
  list.innerHTML = convs.map(c => `
    <div class="ai-conv ${conv && c.id === conv.id ? 'active' : ''}" data-id="${c.id}">
      <div class="cv-title">${escapeHtml(c.title || 'New Conversation')}</div>
      <div class="cv-time">${timeAgo(c.updated_at)}</div>
      <span class="cv-del" data-del="${c.id}">✕</span>
    </div>`).join('') || '<p class="tm-dim" style="padding:var(--sp-3)">No conversations yet.</p>';
  list.querySelectorAll('.ai-conv').forEach(el => el.addEventListener('click', e => { if (!e.target.dataset.del) loadConv(el.dataset.id); }));
  list.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async (e) => { e.stopPropagation(); await deleteConversation(b.dataset.del); if (conv && conv.id === b.dataset.del) { conv = null; $('messages').innerHTML = ''; } renderConvList(); }));
}

/* ── Send ──────────────────────────────────────────────────────── */
async function send() {
  const text = $('text').value.trim();
  if (!text && !images.length) { shake($('text')); return; }
  if (!conv) await newConv();

  const perUnit = getModel(model).credits_per_unit;
  const est = estimateCost('ai', 'chat', model, text.length, 1500);
  if (perUnit > 0 && !hasEnough(profile, 'ai', est)) { toast(`Need ~${est} credits. Add more to use ${getModel(model).name}.`, 'error', 5000); return; }

  const ctx = await resolveContext(text);
  const userContent = buildUserContent(text + ctx, images);
  $('text').value = ''; $('text').style.height = 'auto';
  const uiImages = images.slice(); images = []; renderThumbs();

  addMessage('user', text, false, uiImages);
  conv.messages.push({ role: 'user', content: userContent });
  if (conv.messages.length === 1) { conv.title = text.slice(0, 50) || 'New Conversation'; }

  const aiEl = addMessage('ai', '', true);
  const bubble = aiEl.querySelector('.ai-bubble');
  let full = '';
  try {
    const { usage } = await streamModel({
      modelId: model, system: SYS, messages: conv.messages, maxTokens: 4000,
      onDelta: (chunk) => { full += chunk; bubble.innerHTML = renderMarkdown(full); scrollDown(); },
    });
    conv.messages.push({ role: 'assistant', content: full });
    if (perUnit > 0) { await deductCredits(profile, { product: 'ai', action: 'chat', modelId: model, usage, description: 'ai chat' }); refreshCredits(); }
    if (containsHTML(full) && tier.ai.livePreview) {
      mountPreview(aiEl.querySelector('.ai-msg-wrap') || aiEl, extractHTML(full), { onRegenerate: () => { $('text').value = 'Regenerate that page with a different layout.'; send(); } });
    }
    await saveConversation(conv.id, { title: conv.title, messages: conv.messages, model_used: model });
    renderConvList();
  } catch (e) {
    bubble.innerHTML = '<span class="tm-dim">Sorry — something went wrong. Try again.</span>';
  }
}

function buildUserContent(text, imgs) {
  if (!imgs.length) return text;
  return [{ type: 'text', text }, ...imgs.map(d => ({ type: 'image', source: { type: 'base64', media_type: d.type, data: d.b64 } }))];
}

/* ── Messages / markdown ───────────────────────────────────────── */
function addMessage(role, content, typing, imgs) {
  const wrap = document.createElement('div'); wrap.className = 'ai-msg-wrap';
  const row = document.createElement('div'); row.className = 'ai-msg ' + role;
  const bubble = document.createElement('div'); bubble.className = 'ai-bubble';
  if (typing) bubble.innerHTML = '<span class="ai-typing tm-pulse">Tamato is thinking…</span>';
  else bubble.innerHTML = role === 'ai' ? renderMarkdown(content) : escapeHtml(content);
  if (imgs && imgs.length) { const t = document.createElement('div'); t.className = 'ai-thumbs'; t.innerHTML = imgs.map(d => `<img class="ai-thumb" src="data:${d.type};base64,${d.b64}">`).join(''); bubble.prepend(t); }
  row.appendChild(bubble); wrap.appendChild(row);
  $('messages').appendChild(wrap); scrollDown();
  return wrap;
}
function scrollDown() { const m = $('messages'); m.scrollTop = m.scrollHeight; }

function renderMarkdown(md) {
  let h = escapeHtml(md);
  const blocks = [];
  h = h.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => { blocks.push(code); return ` ${blocks.length - 1} `; });
  h = h.replace(/^### (.*)$/gm, '<h3>$1</h3>').replace(/^## (.*)$/gm, '<h2>$1</h2>').replace(/^# (.*)$/gm, '<h1>$1</h1>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/^\s*[-*] (.*)$/gm, '<li>$1</li>').replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:var(--tm-accent)">$1</a>');
  h = h.split(/\n{2,}/).map(p => /^<(h\d|ul|pre|table)/.test(p.trim()) ? p : '<p>' + p.replace(/\n/g, '<br>') + '</p>').join('');
  h = h.replace(/ (\d+) /g, (_, i) => `<pre><button class="tm-btn tm-btn-text tm-btn-sm copy-btn" onclick="navigator.clipboard.writeText(this.nextElementSibling.textContent)">copy</button><code>${escapeHtml(blocks[+i])}</code></pre>`);
  return h;
}
function escapeHtml(s) { return (typeof s === 'string' ? s : '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/* ── Model selector ────────────────────────────────────────────── */
function renderModelMenu() {
  const menu = $('modelMenu');
  menu.innerHTML = getModelSelectorState(profile, 'ai').map(r => `
    <div class="ai-model-row ${r.state !== 'available' ? 'disabled' : ''}" data-id="${r.id}" title="${r.tooltip}">
      <div class="mr-name"><span>${r.name}</span><span class="tm-dim">${r.credits_per_unit === 0 ? 'free' : r.credits_per_unit + '/unit'}</span></div>
      <div class="mr-desc">${r.description}</div>
    </div>`).join('');
  menu.querySelectorAll('.ai-model-row:not(.disabled)').forEach(row => row.addEventListener('click', () => {
    model = row.dataset.id; $('modelBtn').textContent = getModel(model).name + ' ▾'; menu.classList.remove('open');
  }));
}

/* ── Images ────────────────────────────────────────────────────── */
function renderThumbs() { $('thumbs').innerHTML = images.map(d => `<img class="ai-thumb" src="data:${d.type};base64,${d.b64}">`).join(''); }
async function handleFiles(files) {
  if (!tier.ai.imageUploads) { toast('Image uploads are available on paid plans.', 'error'); return; }
  for (const f of files) {
    if (f.size > 10 * 1024 * 1024) { toast(f.name + ' is over 10MB.', 'error'); continue; }
    const b64 = await fileToB64(f);
    images.push({ type: f.type, b64 });
  }
  renderThumbs();
}
function fileToB64(file) { return new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.readAsDataURL(file); }); }

async function refreshCredits() { profile = await getProfile(); $('creditCount').textContent = totalCredits(profile).toLocaleString(); }
function shake(el) { el.classList.remove('tm-shake'); void el.offsetWidth; el.classList.add('tm-shake'); }

/* ── Wiring ────────────────────────────────────────────────────── */
function wire() {
  $('sendBtn').addEventListener('click', send);
  $('text').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !$('mentionMenu').classList.contains('open')) { e.preventDefault(); send(); } });
  $('text').addEventListener('input', () => { $('text').style.height = 'auto'; $('text').style.height = Math.min($('text').scrollHeight, 160) + 'px'; });
  $('newConvBtn').addEventListener('click', newConv);
  $('themeBtn').addEventListener('click', toggleTheme);
  $('modelBtn').addEventListener('click', () => $('modelMenu').classList.toggle('open'));
  document.addEventListener('click', e => { if (!e.target.closest('.ai-model-wrap')) $('modelMenu').classList.remove('open'); });
  $('attachBtn').addEventListener('click', () => { if (!tier.ai.imageUploads) return toast('Image uploads are available on paid plans.', 'error'); $('fileInput').click(); });
  $('fileInput').addEventListener('change', e => handleFiles(Array.from(e.target.files)));
}

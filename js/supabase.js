/* ═══════════════════════════════════════════════════════════════════
   TAMATO — SUPABASE CLIENT + AUTH + DATA LAYER
   One instance for all four products.
═══════════════════════════════════════════════════════════════════ */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

/* ── Constants (set for this deployment) ───────────────────────── */
export const SUPABASE_URL = 'https://yhddvyncsxpcnvtvkajw.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloZGR2eW5jc3hwY252dHZrYWp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNzkxOTIsImV4cCI6MjA5NTk1NTE5Mn0.CTlfSLnHtOZ0DkZZT4-Z2sSfKleky0wo8ltQWBc7ar4';

export const SUPPORT_EMAIL = 'support@tamato.design';
export const ADMIN_EMAIL = 'ryland@tamato.design';
export const ADMIN_CODES = ['ryland-admin', 'admin-2'];
export const MELIO_EXPIRY_DAYS = 365;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/* ── Session ───────────────────────────────────────────────────── */
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

/** Redirect to /login.html if no active session. Returns the session. */
export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    // preserve where we wanted to go
    sessionStorage.setItem('tm_redirect_after_login', location.pathname + location.search);
    location.href = '/login.html';
    return null;
  }
  return session;
}

/* ── Auth actions ──────────────────────────────────────────────── */
export async function signUpEmail(email, password) {
  return supabase.auth.signUp({ email, password });
}

export async function signInEmail(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signInGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: location.origin + '/dashboard.html' },
  });
}

export async function signOut() {
  await supabase.auth.signOut();
  location.href = '/index.html';
}

/* ── Profile ───────────────────────────────────────────────────── */
export async function getProfile() {
  const user = await getUser();
  if (!user) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (error) { console.warn('[profile]', error.message); return null; }
  return data;
}

export async function updateProfile(patch) {
  const user = await getUser();
  if (!user) return null;
  const { data, error } = await supabase.from('profiles').update(patch).eq('id', user.id).select().single();
  if (error) { console.warn('[profile update]', error.message); return null; }
  return data;
}

/* ── Sites (Build) ─────────────────────────────────────────────── */
export async function listSites() {
  const user = await getUser();
  if (!user) return [];
  const { data } = await supabase.from('sites').select('*').eq('user_id', user.id).order('updated_at', { ascending: false });
  return data || [];
}

export async function getSite(id) {
  const { data } = await supabase.from('sites').select('*').eq('id', id).single();
  return data;
}

export async function createSite(fields) {
  const user = await getUser();
  if (!user) return null;
  const { data, error } = await supabase.from('sites').insert({ user_id: user.id, ...fields }).select().single();
  if (error) { console.warn('[site create]', error.message); return null; }
  return data;
}

export async function saveSite(id, fields) {
  const { data, error } = await supabase.from('sites').update(fields).eq('id', id).select().single();
  if (error) { console.warn('[site save]', error.message); return null; }
  return data;
}

export async function deleteSite(id) {
  await supabase.from('sites').delete().eq('id', id);
}

/* ── AI conversations ──────────────────────────────────────────── */
export async function listConversations() {
  const user = await getUser();
  if (!user) return [];
  const { data } = await supabase.from('ai_conversations').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(30);
  return data || [];
}

export async function createConversation(fields) {
  const user = await getUser();
  if (!user) return null;
  const { data, error } = await supabase.from('ai_conversations').insert({ user_id: user.id, ...fields }).select().single();
  if (error) { console.warn('[conv create]', error.message); return null; }
  return data;
}

export async function saveConversation(id, fields) {
  const { data } = await supabase.from('ai_conversations').update(fields).eq('id', id).select().single();
  return data;
}

export async function deleteConversation(id) {
  await supabase.from('ai_conversations').delete().eq('id', id);
}

/* ── Design systems (Studio) ───────────────────────────────────── */
export async function listDesignSystems() {
  const user = await getUser();
  if (!user) return [];
  const { data } = await supabase.from('design_systems').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(10);
  return data || [];
}

export async function createDesignSystem(fields) {
  const user = await getUser();
  if (!user) return null;
  const { data, error } = await supabase.from('design_systems').insert({ user_id: user.id, ...fields }).select().single();
  if (error) { console.warn('[ds create]', error.message); return null; }
  return data;
}

export async function saveDesignSystem(id, fields) {
  const { data } = await supabase.from('design_systems').update(fields).eq('id', id).select().single();
  return data;
}

export async function deleteDesignSystem(id) {
  await supabase.from('design_systems').delete().eq('id', id);
}

/* ── Credit transactions / activity feed ───────────────────────── */
export async function logTransaction({ amount, type, product, model_used, description }) {
  const user = await getUser();
  if (!user) return;
  await supabase.from('credit_transactions').insert({
    user_id: user.id, amount, type, product, model_used: model_used || null, description: description || null,
  });
}

export async function recentTransactions(limit = 20) {
  const user = await getUser();
  if (!user) return [];
  const { data } = await supabase.from('credit_transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(limit);
  return data || [];
}

/* ── Melio applications ────────────────────────────────────────── */
export async function submitMelioApplication(fields) {
  const { error } = await supabase.from('melio_applications').insert(fields);
  return !error;
}

/* ── Storage (Studio image uploads) ────────────────────────────── */
export async function uploadImage(bucket, path, file) {
  const { data, error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) { console.warn('[upload]', error.message); return null; }
  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(data.path);
  return pub.publicUrl;
}

/* ── Utility: SHA-256 hash (for safety prompt logging) ─────────── */
export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ═══════════════════════════════════════════════════════════════
   SHARED UI HELPERS (loaded on every page via this module)
═══════════════════════════════════════════════════════════════ */

/** Apply theme to <html> immediately; persist to localStorage + profile. */
export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;
  localStorage.setItem('tm_theme', theme);
}

/** Read preferred theme: localStorage → default dark. Call before paint. */
export function initThemeSync() {
  const saved = localStorage.getItem('tm_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  document.documentElement.style.colorScheme = saved;
  return saved;
}

/** Sync theme from profile once loaded (profile wins if differs). */
export function syncThemeFromProfile(profile) {
  if (profile && profile.theme && profile.theme !== localStorage.getItem('tm_theme')) {
    applyTheme(profile.theme);
  }
}

export async function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const next = current === 'light' ? 'dark' : 'light';
  applyTheme(next);
  const session = await getSession();
  if (session) updateProfile({ theme: next });
  return next;
}

/** Toast notifications. variant: 'default' | 'error' | 'success'. */
export function toast(message, variant = 'default', ms = 3500) {
  let stack = document.querySelector('.tm-toast-stack');
  if (!stack) { stack = document.createElement('div'); stack.className = 'tm-toast-stack'; document.body.appendChild(stack); }
  const el = document.createElement('div');
  el.className = 'tm-toast' + (variant === 'error' ? ' tm-toast-error' : variant === 'success' ? ' tm-toast-success' : '');
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 200); }, ms);
}

export function timeAgo(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
  const days = Math.floor(h / 24); if (days < 30) return days + 'd ago';
  return d.toLocaleDateString();
}

export function initials(nameOrEmail) {
  if (!nameOrEmail) return '?';
  const base = nameOrEmail.includes('@') ? nameOrEmail.split('@')[0] : nameOrEmail;
  const parts = base.split(/[.\s_-]+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || base[0].toUpperCase();
}

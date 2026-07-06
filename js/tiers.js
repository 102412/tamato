/* ═══════════════════════════════════════════════════════════════════
   TAMATO — TIER SYSTEM
   Exports: TIERS, MODELS, canGenerate, canEdit, recordGeneration,
   recordEdit, getRemainingCounts, getModelSelectorState
═══════════════════════════════════════════════════════════════════ */
import { MODELS, MODEL_ORDER, getModel } from './models.js';
import { updateProfile } from './supabase.js';

export { MODELS, MODEL_ORDER };

/* Model availability per tier — which model IDs each tier may use. */
const ALL_MODELS    = ['PYTHM_MINI', 'PYTHM', 'METRIO', 'MEGISTO'];
const KRATOR_MODELS = ['PYTHM_MINI', 'PYTHM', 'METRIO', 'MEGISTO', 'KRATOR'];
const FREE_MODELS   = ['PYTHM_MINI'];
const NO_OPUS       = ['PYTHM_MINI', 'PYTHM', 'METRIO'];

const OWNER_EMAIL = 'rylandritchie12@gmail.com';
export const isOwner = (profile) => !!(profile && profile.email === OWNER_EMAIL);

export const TIERS = {
  owner: {
    id: 'owner', name: 'Owner', price: 'Unlimited',
    models: { build: KRATOR_MODELS, ai: KRATOR_MODELS, studio: KRATOR_MODELS },
    build: { genLifetime: Infinity, editLifetime: Infinity, freeChat: true, devMode: true, exportLocked: false, siteCap: Infinity, dailyGenCap: Infinity },
    ai: { imageUploads: true, livePreview: true, mentions: true },
    studio: { creationLifetime: Infinity, viewOnly: false, exportLocked: false, livePreview: true, freeMonthly: Infinity },
    creditsInitial: 999999, pools: 'shared',
  },
  free: {
    id: 'free', name: 'Free', price: '$0',
    models: { build: FREE_MODELS, ai: FREE_MODELS, studio: FREE_MODELS },
    build: { genLifetime: 1, editLifetime: 5, freeChat: true, devMode: false, exportLocked: true, siteCap: Infinity, dailyGenCap: Infinity },
    ai: { imageUploads: false, livePreview: false, mentions: false },
    studio: { creationLifetime: 1, viewOnly: true, exportLocked: true, livePreview: true, freeMonthly: 0 },
    creditsInitial: 0, pools: 'shared',
  },
  single: {
    id: 'single', name: 'Single Site', price: '$14.97 one-time',
    models: { build: NO_OPUS, ai: NO_OPUS, studio: ALL_MODELS },
    build: { genLifetime: Infinity, editLifetime: Infinity, freeChat: true, devMode: 'addon', exportLocked: false, siteCap: Infinity, dailyGenCap: Infinity },
    ai: { imageUploads: true, livePreview: true, mentions: true },
    studio: { creationLifetime: Infinity, viewOnly: false, exportLocked: false, livePreview: true, freeMonthly: 0 },
    creditsInitial: 150, pools: 'shared', creditsNeverExpire: true,
  },
  pro: {
    id: 'pro', name: 'Pro', price: '$29.99/mo · $341.89/yr',
    models: { build: ALL_MODELS, ai: ALL_MODELS, studio: ALL_MODELS },
    build: { genLifetime: Infinity, editLifetime: Infinity, freeChat: true, devMode: true, exportLocked: false, siteCap: 10, dailyGenCap: 5 },
    ai: { imageUploads: true, livePreview: true, mentions: true },
    studio: { creationLifetime: Infinity, viewOnly: false, exportLocked: false, livePreview: true, freeMonthly: 5 },
    creditsMonthly: 500, pools: 'shared', annualBonus: 200,
  },
  pro_krator: {
    id: 'pro_krator', name: 'Pro + Krator 5', price: '$37.97/mo · $432.85/yr',
    models: { build: KRATOR_MODELS, ai: KRATOR_MODELS, studio: KRATOR_MODELS },
    build: { genLifetime: Infinity, editLifetime: Infinity, freeChat: true, devMode: true, exportLocked: false, siteCap: 10, dailyGenCap: 5 },
    ai: { imageUploads: true, livePreview: true, mentions: true },
    studio: { creationLifetime: Infinity, viewOnly: false, exportLocked: false, livePreview: true, freeMonthly: 5 },
    creditsMonthly: 500, pools: 'shared', annualBonus: 200,
  },
  agency3: {
    id: 'agency3', name: 'Agency 3', price: '$99.97/mo · $1,139.66/yr',
    models: { build: KRATOR_MODELS, ai: KRATOR_MODELS, studio: KRATOR_MODELS },
    build: { genLifetime: Infinity, editLifetime: Infinity, freeChat: true, devMode: true, exportLocked: false, siteCap: 10, dailyGenCap: 5 },
    ai: { imageUploads: true, livePreview: true, mentions: true },
    studio: { creationLifetime: Infinity, viewOnly: false, exportLocked: false, livePreview: true, freeMonthly: 5 },
    creditsMonthly: 2400, pools: 'shared', seats: 3, annualBonus: 200,
  },
  agency5: {
    id: 'agency5', name: 'Agency 5', price: '$134.97/mo · $1,538.66/yr',
    models: { build: KRATOR_MODELS, ai: KRATOR_MODELS, studio: KRATOR_MODELS },
    build: { genLifetime: Infinity, editLifetime: Infinity, freeChat: true, devMode: true, exportLocked: false, siteCap: 10, dailyGenCap: 5 },
    ai: { imageUploads: true, livePreview: true, mentions: true },
    studio: { creationLifetime: Infinity, viewOnly: false, exportLocked: false, livePreview: true, freeMonthly: 5 },
    creditsMonthly: 4000, pools: 'shared', seats: 5, annualBonus: 200,
  },
  agency10: {
    id: 'agency10', name: 'Agency 10', price: '$216.97/mo · $2,473.46/yr',
    models: { build: KRATOR_MODELS, ai: KRATOR_MODELS, studio: KRATOR_MODELS },
    build: { genLifetime: Infinity, editLifetime: Infinity, freeChat: true, devMode: true, exportLocked: false, siteCap: 10, dailyGenCap: 5 },
    ai: { imageUploads: true, livePreview: true, mentions: true },
    studio: { creationLifetime: Infinity, viewOnly: false, exportLocked: false, livePreview: true, freeMonthly: 5 },
    creditsMonthly: 6000, pools: 'shared', seats: 10, annualBonus: 200,
  },
  brandwide: {
    id: 'brandwide', name: 'Brand Wide', price: '$107.97/mo · $1,230.88/yr',
    models: { build: KRATOR_MODELS, ai: ALL_MODELS, studio: KRATOR_MODELS },
    build: { genLifetime: Infinity, editLifetime: Infinity, freeChat: true, devMode: true, exportLocked: false, siteCap: 10, dailyGenCap: 5 },
    ai: { imageUploads: true, livePreview: true, mentions: true },
    studio: { creationLifetime: Infinity, viewOnly: false, exportLocked: false, livePreview: true, freeMonthly: 5 },
    pools: 'split', aiCreditsMonthly: 600, studioCreditsMonthly: 800, annualBonus: 200,
  },
  melio: {
    id: 'melio', name: 'Melio', price: 'Invite only',
    models: { build: FREE_MODELS, ai: FREE_MODELS, studio: FREE_MODELS },
    build: { genLifetime: Infinity, editLifetime: Infinity, freeChat: true, devMode: false, exportLocked: false, siteCap: 10, dailyGenCap: Infinity },
    ai: { imageUploads: false, livePreview: false, mentions: false },
    studio: { creationLifetime: 1, viewOnly: true, exportLocked: true, livePreview: true, freeMonthly: 0 },
    creditsInitial: 0, pools: 'shared',
  },
};

export function getTier(profile) {
  if (isOwner(profile)) return TIERS.owner;
  const id = (profile && profile.tier) || 'free';
  const tier = TIERS[id] || TIERS.free;
  // Single Site + Megisto/Krator addon: unlock those two models on the same 150-credit pool
  if (tier.id === 'single' && profile && profile.single_site_megisto_krator_addon) {
    return {
      ...tier,
      models: { build: KRATOR_MODELS, ai: KRATOR_MODELS, studio: KRATOR_MODELS },
    };
  }
  return tier;
}

/** Which pool a product draws from for a given profile. */
export function poolForProduct(profile, product) {
  const tier = getTier(profile);
  if (tier.pools === 'split') {
    return product === 'ai' ? 'ai_credits' : 'studio_credits'; // build+studio share studio pool
  }
  return 'credits';
}

export function poolBalance(profile, product) {
  const key = poolForProduct(profile, product);
  return profile ? (profile[key] || 0) : 0;
}

/* ── Build: generation gating ──────────────────────────────────── */
export function canGenerate(profile, modelId, product = 'build') {
  const tier = getTier(profile);
  if (profile && profile.account_suspended) return { ok: false, reason: 'suspended' };
  if (!tier.models[product].includes(modelId)) return { ok: false, reason: 'model_locked' };

  if (product === 'build') {
    const b = tier.build;
    if (profile && profile.build_gen_lifetime >= b.genLifetime) return { ok: false, reason: 'gen_limit' };
    if (Number.isFinite(b.dailyGenCap)) {
      const today = new Date().toDateString();
      const reset = profile && profile.build_daily_reset ? new Date(profile.build_daily_reset).toDateString() : null;
      const used = reset === today ? (profile.build_daily_gen || 0) : 0;
      if (used >= b.dailyGenCap) return { ok: false, reason: 'daily_cap' };
    }
    if (Number.isFinite(b.siteCap) && profile && profile.build_sites_created >= b.siteCap) return { ok: false, reason: 'site_cap' };
  }
  return { ok: true };
}

/* ── Build: edit gating ────────────────────────────────────────── */
export function canEdit(profile, modelId, product = 'build') {
  const tier = getTier(profile);
  if (profile && profile.account_suspended) return { ok: false, reason: 'suspended' };
  if (!tier.models[product].includes(modelId)) return { ok: false, reason: 'model_locked' };
  if (product === 'build') {
    const b = tier.build;
    // free-model edits limited to editLifetime; paid models unlimited within credits
    if (modelId === 'PYTHM_MINI' && Number.isFinite(b.editLifetime)) {
      if (profile && profile.build_edit_lifetime >= b.editLifetime) return { ok: false, reason: 'edit_limit' };
    }
  }
  return { ok: true };
}

/* ── Record actions (increments counters in profile) ───────────── */
export async function recordGeneration(profile, modelId) {
  if (isOwner(profile)) return;
  const today = new Date().toDateString();
  const reset = profile.build_daily_reset ? new Date(profile.build_daily_reset).toDateString() : null;
  const daily = reset === today ? (profile.build_daily_gen || 0) + 1 : 1;
  const patch = {
    build_gen_count: (profile.build_gen_count || 0) + 1,
    build_gen_lifetime: (profile.build_gen_lifetime || 0) + 1,
    build_daily_gen: daily,
    build_daily_reset: new Date().toISOString(),
    build_sites_created: (profile.build_sites_created || 0) + 1,
  };
  Object.assign(profile, patch);
  return updateProfile(patch);
}

export async function recordEdit(profile, modelId) {
  if (isOwner(profile)) return;
  if (modelId === 'PYTHM_MINI') {
    const patch = { build_edit_lifetime: (profile.build_edit_lifetime || 0) + 1 };
    Object.assign(profile, patch);
    return updateProfile(patch);
  }
  return null;
}

export async function recordStudioCreation(profile) {
  const patch = {
    studio_creations_count: (profile.studio_creations_count || 0) + 1,
    studio_creations_lifetime: (profile.studio_creations_lifetime || 0) + 1,
  };
  Object.assign(profile, patch);
  return updateProfile(patch);
}

/* ── Remaining counts (for UI display) ─────────────────────────── */
export function getRemainingCounts(profile) {
  const tier = getTier(profile);
  const b = tier.build, s = tier.studio;
  const today = new Date().toDateString();
  const reset = profile && profile.build_daily_reset ? new Date(profile.build_daily_reset).toDateString() : null;
  const dailyUsed = reset === today ? (profile.build_daily_gen || 0) : 0;
  return {
    buildGen: Number.isFinite(b.genLifetime) ? Math.max(0, b.genLifetime - (profile?.build_gen_lifetime || 0)) : Infinity,
    buildEdit: Number.isFinite(b.editLifetime) ? Math.max(0, b.editLifetime - (profile?.build_edit_lifetime || 0)) : Infinity,
    buildDaily: Number.isFinite(b.dailyGenCap) ? Math.max(0, b.dailyGenCap - dailyUsed) : Infinity,
    studioCreations: Number.isFinite(s.creationLifetime) ? Math.max(0, s.creationLifetime - (profile?.studio_creations_lifetime || 0)) : Infinity,
  };
}

/* ── Model selector state per product ──────────────────────────── */
/** Returns array of { id, name, description, credits_per_unit, state, tooltip } */
export function getModelSelectorState(profile, product) {
  const tier = getTier(profile);
  const allowed = tier.models[product] || [];
  const balance = isOwner(profile) ? Infinity : poolBalance(profile, product);
  return MODEL_ORDER.map(id => {
    const m = getModel(id);
    let state = 'available', tooltip = '';
    if (!allowed.includes(id)) {
      state = 'locked';
      tooltip = id === 'KRATOR'
        ? 'Available on Pro + Krator 5, all Agency plans, and Brand Wide'
        : 'Upgrade your plan to use ' + m.name;
    } else if (!m.always_free && balance < m.credits_per_unit) {
      state = 'no_credits';
      tooltip = 'Not enough credits — add more to use ' + m.name;
    }
    return { id, name: m.name, description: m.description, credits_per_unit: m.credits_per_unit, state, tooltip };
  });
}

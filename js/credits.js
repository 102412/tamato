/* ═══════════════════════════════════════════════════════════════════
   TAMATO — UNIVERSAL CREDIT SYSTEM
   One currency. Standard tiers share one pool; Brand Wide splits into
   AI (/ai only) and Studio (/build + /studio) pools.
   Deduct ONLY after a successful API response.
═══════════════════════════════════════════════════════════════════ */
import { unitsFromTokens, getModel } from './models.js';
import { poolForProduct, getTier, isOwner } from './tiers.js';
import { updateProfile, logTransaction } from './supabase.js';

/* ── Reload packages ───────────────────────────────────────────── */
export const RELOAD_PACKAGES = [
  { credits: 100,  price: 3.00,  label: '100 credits',  usd: '$3.00' },
  { credits: 200,  price: 5.00,  label: '200 credits',  usd: '$5.00' },
  { credits: 300,  price: 7.00,  label: '300 credits',  usd: '$7.00' },
  { credits: 400,  price: 9.00,  label: '400 credits',  usd: '$9.00' },
  { credits: 500,  price: 11.00, label: '500 credits',  usd: '$11.00' },
  { credits: 2000, price: 35.00, label: '2000 credits', usd: '$35.00' },
];

/* ── Per-product per-unit credit costs ─────────────────────────── */
/* These OVERRIDE model.credits_per_unit for product-specific rates. */
export const BUILD_GEN_COST  = { PYTHM_MINI: 0, PYTHM: 1, METRIO: 3, MEGISTO: 10, KRATOR: 28 };
export const BUILD_EDIT_COST = { PYTHM_MINI: 0, PYTHM: 0, METRIO: 1, MEGISTO: 5,  KRATOR: 22 };
export const AI_COST         = { PYTHM_MINI: 0, PYTHM: 1, METRIO: 2, MEGISTO: 6,  KRATOR: 28 };
export const STUDIO_FLAT     = 30; // design system creation / extra creation

/** Per-unit credit cost for a given product + action + model. */
export function perUnitCost(product, action, modelId) {
  if (product === 'build') return (action === 'edit' ? BUILD_EDIT_COST : BUILD_GEN_COST)[modelId] ?? 0;
  if (product === 'ai') return AI_COST[modelId] ?? 0;
  return getModel(modelId).credits_per_unit;
}

/** Final credit cost from real token usage. */
export function costFromUsage(product, action, modelId, usage) {
  const units = unitsFromTokens(usage.input || 0, usage.output || 0);
  return units * perUnitCost(product, action, modelId);
}

/** Pre-flight estimate so we can warn before spending. */
export function estimateCost(product, action, modelId, promptLen = 0, expectedOutTokens = 4000) {
  const inTokens = Math.ceil(promptLen / 4);
  const units = unitsFromTokens(inTokens, expectedOutTokens);
  return units * perUnitCost(product, action, modelId);
}

export function hasEnough(profile, product, amount) {
  if (amount <= 0) return true;
  if (isOwner(profile)) return true;
  const key = poolForProduct(profile, product);
  return (profile[key] || 0) >= amount;
}

/**
 * Deduct credits from the correct pool AFTER a successful response.
 * Logs a transaction. Returns the new balance, or null on failure.
 */
export async function deductCredits(profile, { product, action, modelId, usage, description }) {
  if (isOwner(profile)) return 999999;
  const amount = costFromUsage(product, action, modelId, usage);
  if (amount <= 0) {
    await logTransaction({ amount: 0, type: action, product, model_used: modelId, description });
    return profile[poolForProduct(profile, product)] || 0;
  }
  const key = poolForProduct(profile, product);
  const next = Math.max(0, (profile[key] || 0) - amount);
  profile[key] = next;
  await updateProfile({ [key]: next });
  await logTransaction({ amount: -amount, type: action, product, model_used: modelId, description });
  return next;
}

/** Flat deduction (Studio creations). */
export async function deductFlat(profile, { product, amount, description, modelId }) {
  const key = poolForProduct(profile, product);
  const next = Math.max(0, (profile[key] || 0) - amount);
  profile[key] = next;
  await updateProfile({ [key]: next });
  await logTransaction({ amount: -amount, type: 'creation', product, model_used: modelId || null, description });
  return next;
}

/** Add credits (Stripe webhook confirmation / reload). */
export async function addCredits(profile, amount, { pool = 'credits', description } = {}) {
  const next = (profile[pool] || 0) + amount;
  profile[pool] = next;
  await updateProfile({ [pool]: next });
  await logTransaction({ amount, type: 'reload', product: 'hub', description: description || 'Credit reload' });
  return next;
}

/** Total spendable across pools (for display). */
export function totalCredits(profile) {
  if (isOwner(profile)) return 999999;
  const tier = getTier(profile);
  if (tier.pools === 'split') return (profile.ai_credits || 0) + (profile.studio_credits || 0);
  return profile.credits || 0;
}

export function creditBreakdown(profile) {
  const tier = getTier(profile);
  if (tier.pools === 'split') {
    return { split: true, ai: profile.ai_credits || 0, studio: profile.studio_credits || 0 };
  }
  return { split: false, total: profile.credits || 0 };
}

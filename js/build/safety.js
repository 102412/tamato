/* ═══════════════════════════════════════════════════════════════════
   TAMATO BUILD — CONTENT SAFETY + INTENT CLASSIFICATION
   Runs silently before every generation. User sees nothing unless BLOCKED.
   Classification always uses the free model and costs 0 credits.
═══════════════════════════════════════════════════════════════════ */
import { callModel } from '/js/models.js';
import { sha256, supabase, getUser, updateProfile } from '/js/supabase.js';

const SAFETY_SYS = `You are a content safety classifier. Analyze this website prompt and return only one word: SAFE or BLOCKED. BLOCKED if the prompt contains: illegal activity, sexual content, content involving minors under 13, fraud, scams, phishing, weapons, drugs, hate speech, extremism, or anything that could facilitate harm. SAFE for all legitimate business and personal websites. Return only SAFE or BLOCKED.`;

const INTENT_SYS = `Classify this message as exactly one of: GENERATE, EDIT, or CHAT. GENERATE: creating a new website. EDIT: modifying current website. CHAT: question or conversation. Reply with only the single uppercase word.`;

/** Returns 'SAFE' | 'BLOCKED'. Logs + strikes on BLOCKED. */
export async function classifySafety(prompt, profile) {
  let verdict = 'SAFE';
  try {
    const { text } = await callModel({
      modelId: 'PYTHM_MINI', system: SAFETY_SYS,
      messages: [{ role: 'user', content: prompt }], maxTokens: 8,
    });
    verdict = /BLOCKED/i.test(text) ? 'BLOCKED' : 'SAFE';
  } catch (_) { verdict = 'SAFE'; } // fail open on classifier error, do not block legit users

  if (verdict === 'BLOCKED' && profile) {
    try {
      const user = await getUser();
      const hash = await sha256(prompt);
      await supabase.from('credit_transactions').insert({
        user_id: user.id, amount: 0, type: 'safety_block', product: 'build',
        description: 'prompt_hash:' + hash,
      });
      const strikes = (profile.strike_count || 0) + 1;
      const patch = { strike_count: strikes };
      if (strikes >= 3) patch.account_suspended = true;
      Object.assign(profile, patch);
      await updateProfile(patch);
    } catch (e) { console.warn('[safety log]', e.message); }
  }
  return verdict;
}

/** Returns 'GENERATE' | 'EDIT' | 'CHAT'. */
export async function classifyIntent(message, hasCurrentSite) {
  try {
    const { text } = await callModel({
      modelId: 'PYTHM_MINI', system: INTENT_SYS,
      messages: [{ role: 'user', content: message }], maxTokens: 4,
    });
    const word = (text.match(/GENERATE|EDIT|CHAT/i) || [])[0];
    if (word) {
      const up = word.toUpperCase();
      // can't EDIT what doesn't exist
      if (up === 'EDIT' && !hasCurrentSite) return 'GENERATE';
      return up;
    }
  } catch (_) {}
  return hasCurrentSite ? 'EDIT' : 'GENERATE';
}

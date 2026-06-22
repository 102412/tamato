/* ═══════════════════════════════════════════════════════════════════
   TAMATO — UNIVERSAL MODEL SYSTEM
   Four models, identical across /build, /ai, /studio. Same names,
   same backends, same credit units everywhere.
═══════════════════════════════════════════════════════════════════ */

export const WORKER_URL = 'https://tamatoaiworker.ryland-ritchie.workers.dev/';

export const MODELS = {
  PYTHM_MINI: {
    id: 'PYTHM_MINI',
    name: 'Pythm-4.5o mini',
    backend: 'gemma2-9b-it',
    provider: 'groq',
    credits_per_unit: 0,
    always_free: true,
    max_tokens: 8000,
    description: 'Fast. Free. Always available.',
  },
  PYTHM: {
    id: 'PYTHM',
    name: 'Pythm 4.5',
    backend: 'claude-haiku-4-5',
    provider: 'anthropic',
    credits_per_unit: 1,
    description: 'Clean quality. 1 credit/unit.',
  },
  METRIO: {
    id: 'METRIO',
    name: 'Metrio 4.6',
    backend: 'claude-sonnet-4-6',
    provider: 'anthropic',
    credits_per_unit: 3,
    description: 'Balanced precision. 3 credits/unit.',
  },
  MEGISTO: {
    id: 'MEGISTO',
    name: 'Megisto 4.8',
    backend: 'claude-opus-4-8',
    provider: 'anthropic',
    credits_per_unit: 8,
    description: 'Maximum quality. 8 credits/unit.',
  },
};

export const MODEL_ORDER = ['PYTHM_MINI', 'PYTHM', 'METRIO', 'MEGISTO'];

/* Credit unit = per 3,000 words (input + output). ~4,000 tokens. */
export const WORDS_PER_UNIT = 3000;
export const TOKENS_PER_WORD = 1.33;

/** Convert combined token count → billable credit units (min 1). */
export function unitsFromTokens(inputTokens, outputTokens) {
  const words = (inputTokens + outputTokens) / TOKENS_PER_WORD;
  return Math.max(1, Math.ceil(words / WORDS_PER_UNIT));
}

/** Estimate units from a character count (rough pre-flight estimate). */
export function estimateUnitsFromText(text) {
  const approxTokens = Math.ceil((text || '').length / 4) + 2000; // + expected output
  return unitsFromTokens(approxTokens, 0);
}

export function getModel(id) { return MODELS[id] || MODELS.PYTHM_MINI; }

/* ── Worker calls ──────────────────────────────────────────────── */
/**
 * Non-streaming completion. Returns { text, usage:{input,output} }.
 * messages: [{ role, content }]  content may be string or content blocks.
 */
export async function callModel({ modelId, system, messages, maxTokens = 8000, signal }) {
  const m = getModel(modelId);
  const payload = {
    model: m.backend,
    messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
    stream: false,
    max_tokens: maxTokens,
  };
  const res = await fetch(WORKER_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), signal,
  });
  if (!res.ok) throw new Error('Model request failed (' + res.status + ')');
  const data = await res.json();
  const text =
    data.text ??
    (data.content && data.content[0] && data.content[0].text) ??
    (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ??
    '';
  const usage = data.usage || {};
  return {
    text,
    usage: {
      input: usage.input_tokens ?? usage.prompt_tokens ?? 0,
      output: usage.output_tokens ?? usage.completion_tokens ?? 0,
    },
  };
}

/**
 * Streaming completion. Calls onDelta(textChunk) as tokens arrive.
 * Returns { text, usage } once complete. Supports AbortSignal.
 */
export async function streamModel({ modelId, system, messages, maxTokens = 8000, signal, onDelta }) {
  const m = getModel(modelId);
  const payload = {
    model: m.backend,
    messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
    stream: true,
    max_tokens: m.max_tokens ? Math.min(maxTokens, m.max_tokens) : maxTokens,
  };
  const res = await fetch(WORKER_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), signal,
  });
  if (!res.ok || !res.body) {
    let detail = '';
    try { const e = await res.clone().json(); detail = e.detail || e.error || ''; } catch (_) {}
    const status = res.status;
    if (status === 429) throw new Error('Rate limit reached — try again in a moment.');
    if (status === 400) throw new Error('Prompt too large — shorten your input and try again.');
    throw new Error('Model stream failed (' + status + ')' + (detail ? ': ' + detail : ''));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', full = '', usage = { input: 0, output: 0 };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const json = trimmed.slice(5).trim();
      if (json === '[DONE]') continue;
      try {
        const evt = JSON.parse(json);
        // Anthropic SSE
        if (evt.type === 'content_block_delta' && evt.delta && evt.delta.text) {
          full += evt.delta.text; onDelta && onDelta(evt.delta.text);
        } else if (evt.type === 'message_start' && evt.message && evt.message.usage) {
          usage.input = evt.message.usage.input_tokens || 0;
        } else if (evt.type === 'message_delta' && evt.usage) {
          usage.output = evt.usage.output_tokens || usage.output;
        }
        // OpenAI/Groq SSE
        else if (evt.choices && evt.choices[0]) {
          const d = evt.choices[0].delta;
          if (d && d.content) { full += d.content; onDelta && onDelta(d.content); }
          if (evt.usage) { usage.input = evt.usage.prompt_tokens || usage.input; usage.output = evt.usage.completion_tokens || usage.output; }
        }
      } catch (_) { /* ignore keep-alive / partial */ }
    }
  }
  if (!usage.output) usage.output = Math.ceil(full.length / 4);
  return { text: full, usage };
}

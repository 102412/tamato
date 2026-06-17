/* ═══════════════════════════════════════════════════════════════════
   TAMATO STUDIO — EXTRACTOR
   Upload up to 3 images, send to Megisto 4.8 vision, parse the design
   system JSON. 30 credits flat per creation (subject to free allowance).
═══════════════════════════════════════════════════════════════════ */
import { callModel } from '/js/models.js';
import { uploadImage, supabase, getUser } from '/js/supabase.js';

export const EXTRACT_SYS = `You are an expert UI designer and design systems specialist. Analyze the provided image(s) and extract a complete design system. Return ONLY valid JSON with this exact structure:
{
  "colors": { "primary": "", "secondary": "", "accent": "", "background": "", "surface": "", "text": "", "text_secondary": "", "border": "" },
  "typography": { "heading_font": "", "body_font": "", "mono_font": "", "heading_weight": "", "body_weight": "", "base_size": "", "scale_ratio": "" },
  "spacing": { "base": "", "xs": "", "sm": "", "md": "", "lg": "", "xl": "", "xxl": "" },
  "borders": { "radius_sm": "", "radius_md": "", "radius_lg": "", "width": "", "style": "" },
  "shadows": { "sm": "", "md": "", "lg": "" },
  "animation": { "duration_fast": "", "duration_base": "", "duration_slow": "", "easing": "" },
  "aesthetic": "one sentence describing overall visual identity and mood"
}
Return only the JSON object. No explanation. No markdown. No code fences.`;

export const DEFAULT_TOKENS = {
  colors: { primary: '#B85C52', secondary: '#4F9D69', accent: '#E0A33E', background: '#FAF9F7', surface: '#FFFFFF', text: '#1C1917', text_secondary: '#6B6460', border: '#E0DBD5' },
  typography: { heading_font: 'Plus Jakarta Sans', body_font: 'Plus Jakarta Sans', mono_font: 'Roboto Mono', heading_weight: '700', body_weight: '400', base_size: '16px', scale_ratio: '1.25' },
  spacing: { base: '8px', xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '48px', xxl: '96px' },
  borders: { radius_sm: '4px', radius_md: '6px', radius_lg: '8px', width: '1px', style: 'solid' },
  shadows: { sm: '0 1px 2px rgba(0,0,0,0.06)', md: '0 2px 8px rgba(0,0,0,0.08)', lg: '0 8px 24px rgba(0,0,0,0.12)' },
  animation: { duration_fast: '120ms', duration_base: '300ms', duration_slow: '800ms', easing: 'ease' },
  aesthetic: 'Warm, calm, and intentional.',
};

async function fileToB64(file) { return new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.readAsDataURL(file); }); }

/** Upload images to storage + run vision extraction. Returns { tokens, urls }. */
export async function extract(files) {
  const user = await getUser();
  const urls = [];
  const blocks = [];
  for (let i = 0; i < files.length && i < 3; i++) {
    const f = files[i];
    const b64 = await fileToB64(f);
    blocks.push({ type: 'image', source: { type: 'base64', media_type: f.type, data: b64 } });
    const url = await uploadImage('studio', `${user.id}/${Date.now()}-${i}-${f.name}`, f).catch(() => null);
    if (url) urls.push(url);
  }

  const { text } = await callModel({
    modelId: 'MEGISTO', system: EXTRACT_SYS,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Extract the complete design system from these images.' }, ...blocks] }],
    maxTokens: 2000,
  });

  let tokens;
  try {
    const json = text.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
    tokens = JSON.parse(json);
  } catch (e) {
    tokens = JSON.parse(JSON.stringify(DEFAULT_TOKENS)); // fallback so the editor still opens
  }
  return { tokens, urls };
}

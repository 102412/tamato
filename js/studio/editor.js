/* ═══════════════════════════════════════════════════════════════════
   TAMATO STUDIO — TOKEN EDITOR
   Renders editable controls for every token group. onChange fires on
   each edit (debounced upstream for the preview).
═══════════════════════════════════════════════════════════════════ */

const GROUPS = [
  ['colors', 'Colors', ['primary', 'secondary', 'accent', 'background', 'surface', 'text', 'text_secondary', 'border'], 'color'],
  ['typography', 'Typography', ['heading_font', 'body_font', 'mono_font', 'heading_weight', 'body_weight', 'base_size', 'scale_ratio'], 'text'],
  ['spacing', 'Spacing', ['base', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl'], 'text'],
  ['borders', 'Borders', ['radius_sm', 'radius_md', 'radius_lg', 'width', 'style'], 'text'],
  ['shadows', 'Shadows', ['sm', 'md', 'lg'], 'text'],
  ['animation', 'Animation', ['duration_fast', 'duration_base', 'duration_slow', 'easing'], 'text'],
];

const WEIGHTS = ['300', '400', '500', '600', '700', '800'];

export function renderTokenEditor(container, tokens, onChange) {
  container.innerHTML = GROUPS.map(([key, label, fields, type]) => `
    <div class="token-group">
      <h4>${label}</h4>
      ${fields.map(f => row(key, f, (tokens[key] || {})[f] || '', type)).join('')}
    </div>`).join('');

  container.querySelectorAll('[data-group]').forEach(input => {
    input.addEventListener('input', () => {
      const g = input.dataset.group, f = input.dataset.field;
      if (!tokens[g]) tokens[g] = {};
      tokens[g][f] = input.value;
      // keep the paired color text + swatch in sync
      const pair = container.querySelector(`[data-group="${g}"][data-field="${f}"][data-pair]`);
      if (pair && pair !== input) pair.value = input.value;
      onChange(tokens);
    });
  });
}

function row(group, field, value, type) {
  const label = field.replace(/_/g, ' ');
  if (group === 'colors') {
    const safe = /^#/.test(value) ? value : '#000000';
    return `<div class="token-row"><label>${label}</label>
      <input type="color" data-group="${group}" data-field="${field}" data-pair value="${safe}">
      <input type="text" data-group="${group}" data-field="${field}" data-pair value="${value}"></div>`;
  }
  if (field === 'heading_weight' || field === 'body_weight') {
    return `<div class="token-row"><label>${label}</label>
      <select data-group="${group}" data-field="${field}">${WEIGHTS.map(w => `<option ${w === String(value) ? 'selected' : ''}>${w}</option>`).join('')}</select></div>`;
  }
  if (field === 'style') {
    return `<div class="token-row"><label>${label}</label>
      <select data-group="${group}" data-field="${field}">${['solid', 'dashed', 'dotted', 'none'].map(o => `<option ${o === value ? 'selected' : ''}>${o}</option>`).join('')}</select></div>`;
  }
  return `<div class="token-row"><label>${label}</label><input type="text" data-group="${group}" data-field="${field}" value="${escapeAttr(value)}"></div>`;
}

function escapeAttr(s) { return String(s).replace(/"/g, '&quot;'); }

/* ═══════════════════════════════════════════════════════════════════
   TAMATO BUILD — INLINE TEXT EDITOR
   Injects contenteditable behavior into the canvas iframe. Text edits
   post back to the parent which updates the stored HTML + debounced save.
═══════════════════════════════════════════════════════════════════ */

const EDITABLE = 'h1,h2,h3,h4,h5,h6,p,span,a,li,button,label,td';

/* Script injected into the generated document. */
const INJECT = `
<script>(function(){
  var SEL='${EDITABLE}';
  var active=null;
  document.addEventListener('click',function(e){
    var el=e.target.closest(SEL); if(!el) return;
    if(el.tagName==='A') e.preventDefault();
    if(active && active!==el){ commit(active); }
    active=el; el.setAttribute('contenteditable','true');
    el.style.outline='2px solid #B85C52'; el.style.outlineOffset='2px';
    el.focus();
  },true);
  document.addEventListener('click',function(e){
    if(active && !e.target.closest(SEL)){ commit(active); active=null; }
  });
  function commit(el){
    el.removeAttribute('contenteditable'); el.style.outline=''; el.style.outlineOffset='';
    parent.postMessage({ tm_edit:true, html: '<!DOCTYPE html>\\n'+document.documentElement.outerHTML }, '*');
  }
})();<\/script>`;

/** Return html with the inline-editor script injected before </body>. */
export function injectEditor(html) {
  if (!html) return html;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, INJECT + '</body>');
  return html + INJECT;
}

/** Wire the parent-side listener. onChange(newHtml) fires on each commit. */
export function listenForEdits(onChange) {
  let timer = null;
  function handler(e) {
    if (e.data && e.data.tm_edit) {
      clearTimeout(timer);
      timer = setTimeout(() => onChange(e.data.html), 30000); // 30s debounced save
      onChange(e.data.html, true); // immediate in-memory update flag
    }
  }
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

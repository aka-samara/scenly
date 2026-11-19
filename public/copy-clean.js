// Clean copy: when someone selects text in Scenly and copies it, the clipboard gets plain, readable formatting
// (bold, lists, headings, links, tables, code) without the app's dark background, text colours or fonts.
// Without this, pasting into an email or document kept the dark theme (desktop) or very faint text (phones).
// Typing fields are left alone, so copying inside a text box works as normal.
const KEEP = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'A',
  'BLOCKQUOTE', 'PRE', 'CODE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'HR', 'SUP', 'SUB', 'DIV']);
const DROP = new Set(['BUTTON', 'SVG', 'svg', 'STYLE', 'SCRIPT', 'INPUT', 'SELECT', 'TEXTAREA', 'VIDEO', 'AUDIO', 'CANVAS', 'IFRAME']);

// App controls inside a selection (code block header, message buttons, model line) are not part of the text.
const UI = '.code-head, .msg-actions, .ai-head, .xp-btn';

function clean(node) {
  node.querySelectorAll(UI).forEach((el) => el.remove());
  for (const el of [...node.children]) {
    if (DROP.has(el.tagName)) { el.remove(); continue; }
    clean(el);
    if (!KEEP.has(el.tagName)) { el.replaceWith(...el.childNodes); continue; }
    const href = el.tagName === 'A' ? el.getAttribute('href') : null;
    for (const a of [...el.attributes]) el.removeAttribute(a.name);
    if (href && /^(https?:|mailto:)/i.test(href)) el.setAttribute('href', href);
  }
  return node;
}

document.addEventListener('copy', (e) => {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount || !e.clipboardData) return;
  const at = sel.anchorNode?.nodeType === 1 ? sel.anchorNode : sel.anchorNode?.parentElement;
  if (at?.closest('input, textarea, [contenteditable="true"], .cx-edit')) return;
  const box = document.createElement('div');
  for (let i = 0; i < sel.rangeCount; i++) box.append(sel.getRangeAt(i).cloneContents());
  clean(box);
  e.clipboardData.setData('text/html', box.innerHTML);
  e.clipboardData.setData('text/plain', sel.toString());
  e.preventDefault();
});

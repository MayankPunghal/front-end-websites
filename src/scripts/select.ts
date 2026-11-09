// Themed, searchable dropdown: replaces the native <select> popup (which the browser draws white) with a combobox.
// Type to filter, arrows + Enter to pick. The real <select> stays in the DOM (visually hidden) so form posting,
// validation and change handlers are untouched.
const enhance = (sel: HTMLSelectElement) => {
  if (sel.dataset.ui) return; sel.dataset.ui = '1';
  const wrap = document.createElement('div'); wrap.className = 'ui-select';
  const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'ui-select__btn';
  inp.setAttribute('role', 'combobox'); inp.setAttribute('aria-autocomplete', 'list'); inp.setAttribute('aria-expanded', 'false');
  inp.autocomplete = 'off'; inp.spellcheck = false; inp.setAttribute('autocapitalize', 'off');
  const list = document.createElement('ul'); list.className = 'ui-select__list'; list.setAttribute('role', 'listbox'); list.hidden = true; list.id = `ui-${Math.random().toString(36).slice(2, 8)}`;
  inp.setAttribute('aria-controls', list.id);
  const lab = sel.id && document.querySelector(`label[for="${sel.id}"]`) || sel.closest('label');
  if (lab) { lab.id ||= `${list.id}-l`; inp.setAttribute('aria-labelledby', lab.id); }
  sel.before(wrap); wrap.append(sel, inp, list);
  sel.classList.add('ui-select__native'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
  const opts = [...sel.options].map((o, i) => { const li = document.createElement('li'); li.setAttribute('role', 'option'); li.textContent = o.text; li.dataset.i = String(i); li.id = `${list.id}-${i}`; li.hidden = o.disabled; list.append(li); return li; });
  const none = document.createElement('li'); none.className = 'none'; none.textContent = 'No match'; none.hidden = true; list.append(none);
  const prompt = [...sel.options].find(o => o.disabled)?.text ?? '';
  let active = 0;
  const shown = () => opts.filter(li => !li.hidden);
  const paint = () => { const o = sel.options[sel.selectedIndex]; inp.value = o && !o.disabled ? o.text : ''; inp.placeholder = prompt; opts.forEach((li, i) => li.setAttribute('aria-selected', String(i === sel.selectedIndex))); };
  const mark = (li?: HTMLElement) => { opts.forEach(x => x.classList.toggle('on', x === li)); active = li ? Number(li.dataset.i) : -1; li?.scrollIntoView({ block: 'nearest' }); inp.setAttribute('aria-activedescendant', li?.id ?? ''); };
  const filter = (q: string) => { const s = q.trim().toLowerCase(); opts.forEach((li, i) => (li.hidden = sel.options[i].disabled || !(' ' + li.textContent!.toLowerCase()).includes(' ' + s))); none.hidden = shown().length > 0; mark(shown()[0]); };
  const show = (open: boolean, all = true) => { list.hidden = !open; wrap.classList.toggle('open', open); inp.setAttribute('aria-expanded', String(open)); if (open && all) { filter(''); mark(opts[sel.selectedIndex]?.hidden ? shown()[0] : opts[sel.selectedIndex]); } };
  const pick = (i: number) => { if (i < 0 || sel.options[i].disabled) return; sel.selectedIndex = i; paint(); show(false); sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); };
  const step = (d: number) => { const v = shown(); if (!v.length) return; const k = v.findIndex(li => Number(li.dataset.i) === active); mark(v[Math.max(0, Math.min(v.length - 1, (k < 0 ? (d > 0 ? -1 : v.length) : k) + d))]); };

  inp.addEventListener('focus', () => { inp.select(); show(true); });
  inp.addEventListener('click', () => { if (list.hidden) show(true); inp.select(); });
  inp.addEventListener('input', () => { show(true, false); filter(inp.value); });
  inp.addEventListener('blur', () => { show(false); paint(); });
  list.addEventListener('pointerdown', e => e.preventDefault()); // keep focus in the input
  list.addEventListener('click', e => { const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-i]'); if (li) pick(Number(li.dataset.i)); });
  inp.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !list.hidden) { e.preventDefault(); e.stopPropagation(); show(false); paint(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (list.hidden) show(true); else step(e.key === 'ArrowDown' ? 1 : -1); }
    else if (e.key === 'Enter' && !list.hidden) { e.preventDefault(); e.stopPropagation(); const v = shown(); pick(active >= 0 ? active : v.length === 1 ? Number(v[0].dataset.i) : -1); }
  });
  sel.addEventListener('change', paint); sel.form?.addEventListener('reset', () => setTimeout(paint));
  paint();
};
export const enhanceSelects = (root: ParentNode = document) => root.querySelectorAll<HTMLSelectElement>('select').forEach(enhance);
enhanceSelects();

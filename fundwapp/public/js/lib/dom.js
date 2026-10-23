// Tiny hyperscript helper: h('div', { class: 'x', onClick: fn }, child, 'text')
const BOOL_PROPS = new Set(['checked', 'disabled', 'selected', 'required', 'readOnly', 'multiple']);

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  let deferredValue;
  for (const [key, val] of Object.entries(props || {})) {
    if (val === null || val === undefined || val === false) continue;
    if (key === 'class') el.className = val;
    else if (key === 'value') deferredValue = val; // set after <option>s exist
    else if (BOOL_PROPS.has(key)) el[key] = !!val;
    else if (key.startsWith('on') && typeof val === 'function') el.addEventListener(key.slice(2).toLowerCase(), val);
    else el.setAttribute(key, val === true ? '' : val);
  }
  append(el, children);
  if (deferredValue !== undefined) el.value = deferredValue;
  return el;
}

export function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const mount = (root, ...nodes) => root.replaceChildren(...nodes.flat(Infinity).filter(Boolean));

/** Reads a form into a plain object; checkboxes become booleans. */
export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
    else out[el.name] = el.value;
  }
  return out;
}

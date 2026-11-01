import { h } from './dom.js';

let navigator = (path) => { window.location.assign(path); };
export const setNavigator = (fn) => { navigator = fn; };
export const navigate = (path, opts) => navigator(path, opts);

/** <a> that navigates without a full page load. */
export function link(href, props, ...children) {
  return h('a', { href, ...props, onClick: (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(href);
  } }, ...children);
}

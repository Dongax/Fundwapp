/** Replaces {{variable}} placeholders. Unknown variables render as an empty string. */
export function render(template, vars = {}) {
  return String(template ?? '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const v = vars[key];
    return v === undefined || v === null ? '' : String(v);
  });
}

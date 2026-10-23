const { nanoid } = require('nanoid');

// Generates a URL-safe, unguessable slug for a fundraiser, e.g. "help-amina-Xk3ndP2q"
function generateSlug(title) {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
  return `${base}-${nanoid(8)}`;
}

module.exports = { generateSlug };

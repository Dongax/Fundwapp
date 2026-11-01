import { z } from './validate.js';
import { parse } from './validate.js';

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

export function pageParams(req) {
  const { page, page_size: pageSize } = parse(pageSchema, req.query);
  return { page, pageSize };
}

export const listResponse = ({ items, total }, { page, pageSize }) => ({ items, total, page, page_size: pageSize });

export const clientContext = (req) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

export function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

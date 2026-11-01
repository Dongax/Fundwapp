import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import config from './config/index.js';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { uploadRoot } from './services/storage/local.js';
import { getPublicByCode } from './services/campaign.service.js';
import { getSetting } from './services/settings.service.js';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const readPage = (name) => fs.readFileSync(path.join(publicDir, name), 'utf8');
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const absolute = (url) => (url?.startsWith('/') ? `${config.app.baseUrl}${url}` : url);

export function createApp() {
  const app = express();
  if (config.app.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));
  app.use(cors({ origin: config.app.corsOrigins.length ? config.app.corsOrigins : false, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  app.use('/api', globalLimiter, routes);
  app.use('/api', notFoundHandler);

  app.use('/uploads', express.static(uploadRoot, { maxAge: '7d', immutable: true }));
  app.use(express.static(publicDir, { index: false, maxAge: config.isProd ? '1h' : 0 }));

  // Single-page apps: the web app lives at "/", the admin portal at "/admin".
  app.use(async (req, res, next) => {
    if (req.method !== 'GET' || path.extname(req.path)) return next();
    if (req.path === '/admin' || req.path.startsWith('/admin/')) return res.type('html').send(readPage('admin.html'));
    let html = readPage('index.html');
    let meta = '';
    const match = req.path.match(/^\/f\/([A-Za-z0-9]+)\/?$/);
    if (match) {
      // Share previews (WhatsApp, Facebook, X) need real tags in the HTML, not JS-rendered ones.
      try {
        const f = await getPublicByCode(match[1]);
        const appName = await getSetting('app_name');
        const image = absolute(f.cover_image_url);
        meta = [
          `<title>${escapeHtml(f.title)} | ${escapeHtml(appName)}</title>`,
          `<meta property="og:title" content="${escapeHtml(f.title)}">`,
          `<meta property="og:description" content="${escapeHtml(f.description.slice(0, 200))}">`,
          `<meta property="og:url" content="${escapeHtml(`${config.app.baseUrl}/f/${f.unique_url}`)}">`,
          '<meta property="og:type" content="website">',
          image ? `<meta property="og:image" content="${escapeHtml(image)}">` : '',
          `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`,
        ].join('\n');
      } catch { /* unknown fundraiser: the SPA shows its own not-found view */ }
    }
    return res.type('html').send(html.replace('<!--META-->', meta));
  });

  app.use(errorHandler);
  return app;
}

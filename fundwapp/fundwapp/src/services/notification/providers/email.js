import nodemailer from 'nodemailer';
import config from '../../../config/index.js';
import { logger } from '../../../utils/logger.js';

const consoleProvider = {
  async send({ to, subject, body }) {
    logger.info(`[EMAIL to ${to}] ${subject}\n${body}`);
    return { id: `console-${Date.now()}`, simulated: true };
  },
};

let transporter;
const smtp = {
  async send({ to, subject, body }) {
    const { host, port, secure, user, pass } = config.email.smtp;
    if (!host) throw new Error('SMTP_HOST is required for EMAIL_PROVIDER=smtp');
    transporter ??= nodemailer.createTransport({ host, port, secure, auth: user ? { user, pass } : undefined });
    const info = await transporter.sendMail({ from: config.email.from, to, subject, text: body });
    return { id: info.messageId };
  },
};

// ---- Gmail API (HTTPS). Sends as the Gmail account that granted the refresh token. ----
const clean = (v) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim(); // header-injection guard
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const b64url = (s) => Buffer.from(s, 'utf8').toString('base64url');
const encodeHeader = (v) => (/^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`);

let gmailToken = { value: null, expiresAt: 0 };
async function gmailAccessToken() {
  if (gmailToken.value && Date.now() < gmailToken.expiresAt) return gmailToken.value;
  const { clientId, clientSecret, refreshToken, tokenUrl } = config.email.gmail;
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`Google refused the Gmail login: ${data.error_description || data.error || res.status}${data.error ? ` (${data.error})` : ''}`);
  }
  gmailToken = { value: data.access_token, expiresAt: Date.now() + (Number(data.expires_in || 3600) - 120) * 1000 };
  return gmailToken.value;
}

export function buildMime({ from, to, subject, body }) {
  const wrapped = b64(body).replace(/(.{76})/g, '$1\r\n');
  return [
    `From: ${clean(from)}`, `To: ${clean(to)}`, `Subject: ${encodeHeader(clean(subject))}`, 'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', wrapped,
  ].join('\r\n');
}

const gmail = {
  async send({ to, subject, body }) {
    const { user, clientId, clientSecret, refreshToken, apiBase } = config.email.gmail;
    if (!user || !clientId || !clientSecret || !refreshToken) {
      throw new Error('GMAIL_USER, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN are required for EMAIL_PROVIDER=gmail');
    }
    const from = config.email.from || user;
    const raw = b64url(buildMime({ from, to, subject, body }));
    const res = await fetch(`${apiBase}/gmail/v1/users/me/messages/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await gmailAccessToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Gmail rejected the message: ${data?.error?.message || res.status}${data?.error?.status ? ` (${data.error.status})` : ''}`);
    return { id: data.id };
  },
};

const providers = { console: consoleProvider, smtp, gmail };

export function getEmailProvider() {
  const provider = providers[config.email.provider];
  if (!provider) throw new Error(`Unknown EMAIL_PROVIDER "${config.email.provider}". Use: ${Object.keys(providers).join(', ')}`);
  return provider;
}

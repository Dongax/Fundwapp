import nodemailer from 'nodemailer';
import config from '../../../config/index.js';
import { logger } from '../../../utils/logger.js';

const consoleProvider = {
  async send({ to, subject, body }) {
    logger.info(`[EMAIL to ${to}] ${subject}\n${body}`);
    return { id: `console-${Date.now()}` };
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

const providers = { console: consoleProvider, smtp };

export function getEmailProvider() {
  const provider = providers[config.email.provider];
  if (!provider) throw new Error(`Unknown EMAIL_PROVIDER "${config.email.provider}". Use: ${Object.keys(providers).join(', ')}`);
  return provider;
}

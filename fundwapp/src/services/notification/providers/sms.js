import config from '../../../config/index.js';
import { logger } from '../../../utils/logger.js';

// Each provider exposes: send({ to, body }) -> { id }
const consoleProvider = {
  async send({ to, body }) {
    logger.info(`[SMS to ${to}] ${body}`);
    return { id: `console-${Date.now()}` };
  },
};

const africasTalking = {
  async send({ to, body }) {
    const { atBaseUrl, atUsername, atApiKey, atSenderId } = config.sms;
    if (!atUsername || !atApiKey) throw new Error('AT_USERNAME and AT_API_KEY are required for SMS_PROVIDER=africastalking');
    const form = new URLSearchParams({ username: atUsername, to, message: body });
    if (atSenderId) form.set('from', atSenderId);
    const res = await fetch(`${atBaseUrl}/version1/messaging`, {
      method: 'POST',
      headers: { apiKey: atApiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    const recipient = data?.SMSMessageData?.Recipients?.[0];
    if (!res.ok || !recipient || !/success|sent/i.test(recipient.status || '')) {
      throw new Error(`Africa's Talking rejected the message: ${recipient?.status || data?.SMSMessageData?.Message || res.status}`);
    }
    return { id: recipient.messageId };
  },
};

const providers = { console: consoleProvider, africastalking: africasTalking };

export function getSmsProvider() {
  const provider = providers[config.sms.provider];
  if (!provider) throw new Error(`Unknown SMS_PROVIDER "${config.sms.provider}". Use: ${Object.keys(providers).join(', ')}`);
  return provider;
}

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

const twilio = {
  async send({ to, body }) {
    const { baseUrl, accountSid, authToken, from, messagingServiceSid } = config.sms.twilio;
    if (!accountSid || !authToken || !(from || messagingServiceSid)) {
      throw new Error('TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM (or TWILIO_MESSAGING_SERVICE_SID) are required for SMS_PROVIDER=twilio');
    }
    const form = new URLSearchParams({ To: to, Body: body });
    if (messagingServiceSid) form.set('MessagingServiceSid', messagingServiceSid);
    else form.set('From', from);
    const res = await fetch(`${baseUrl}/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Twilio rejected the message: ${data.message || res.status}${data.code ? ` (error ${data.code})` : ''}`);
    return { id: data.sid };
  },
};

const vonage = {
  async send({ to, body }) {
    const { baseUrl, apiKey, apiSecret, from } = config.sms.vonage;
    if (!apiKey || !apiSecret || !from) throw new Error('VONAGE_API_KEY, VONAGE_API_SECRET and VONAGE_FROM are required for SMS_PROVIDER=vonage');
    const res = await fetch(`${baseUrl}/sms/json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, api_secret: apiSecret, from, to: to.replace(/^\+/, ''), text: body }),
    });
    const data = await res.json().catch(() => ({}));
    const msg = data?.messages?.[0];
    if (!res.ok || !msg || String(msg.status) !== '0') {
      throw new Error(`Vonage rejected the message: ${msg?.['error-text'] || res.status}${msg ? ` (status ${msg.status})` : ''}`);
    }
    return { id: msg['message-id'] };
  },
};

const providers = { console: consoleProvider, africastalking: africasTalking, twilio, vonage };

export function getSmsProvider() {
  const provider = providers[config.sms.provider];
  if (!provider) throw new Error(`Unknown SMS_PROVIDER "${config.sms.provider}". Use: ${Object.keys(providers).join(', ')}`);
  return provider;
}

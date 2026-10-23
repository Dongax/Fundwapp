import config from '../../../config/index.js';
import { badGateway } from '../../../utils/errors.js';
import { hmac, safeEqual } from '../../../utils/ids.js';
import { logger } from '../../../utils/logger.js';

// Paystack hosted checkout for cards. Amounts are sent in the currency's minor unit, which is exactly how we store them.
const secret = () => {
  if (!config.paystack.secretKey) throw badGateway('Card payments are not configured (PAYSTACK_SECRET_KEY)', 'GATEWAY_NOT_CONFIGURED');
  return config.paystack.secretKey;
};

async function api(path, init = {}) {
  const res = await fetch(`${config.paystack.baseUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${secret()}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

function interpret(tx) {
  switch (tx.status) {
    case 'success': return { status: 'succeeded', transactionId: String(tx.id ?? tx.reference), amountMinor: tx.amount };
    case 'failed': return { status: 'failed', failureReason: tx.gateway_response || 'The card was declined.' };
    case 'abandoned': return { status: 'cancelled', failureReason: 'The card payment was not completed.' };
    default: return { status: 'pending' };
  }
}

export default {
  name: 'paystack',
  supportsDecimals: true,

  async initiate({ attempt, returnUrl, fundraiser }) {
    const { ok, data } = await api('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        email: attempt.email,
        amount: attempt.amount,
        currency: config.currency.code,
        reference: attempt.id,
        callback_url: returnUrl,
        channels: ['card'],
        metadata: { fundraiser: fundraiser.unique_url, contributor: attempt.contributor_name },
      }),
    });
    if (!ok || !data.status) {
      logger.error('Paystack initialize failed', data);
      throw badGateway(data.message || 'The card processor could not start the payment');
    }
    return { gatewayReference: data.data.reference, message: null, redirectUrl: data.data.authorization_url, raw: data.data };
  },

  async query(attempt) {
    const { ok, data } = await api(`/transaction/verify/${encodeURIComponent(attempt.gateway_reference)}`);
    if (!ok || !data.status) return { status: 'pending', raw: data };
    return { ...interpret(data.data), raw: data.data };
  },

  verifySignature(req) {
    const signature = req.headers['x-paystack-signature'];
    if (!signature || !req.rawBody) return false;
    return safeEqual(hmac(secret(), req.rawBody, 'sha512'), signature);
  },

  parseCallback(req) {
    const event = req.body;
    if (!event?.data?.reference) return null;
    if (event.event === 'charge.success') return { reference: event.data.reference, ...interpret({ ...event.data, status: 'success' }), raw: event };
    if (event.event === 'charge.failed') return { reference: event.data.reference, ...interpret({ ...event.data, status: 'failed' }), raw: event };
    return null;
  },
};

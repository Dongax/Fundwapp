import config from '../../../config/index.js';
import { badGateway } from '../../../utils/errors.js';
import { nationalNumber } from '../../../utils/phone.js';
import { toMajorNumber } from '../../../utils/money.js';
import { logger } from '../../../utils/logger.js';

// Airtel Money Open API (collections). Verify paths/fields against your Airtel developer account
// (https://developers.airtel.africa) - they occasionally version the endpoints.
let tokenCache = { token: null, expiresAt: 0 };

async function accessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) return tokenCache.token;
  const { baseUrl, clientId, clientSecret } = config.airtel;
  if (!clientId || !clientSecret) throw badGateway('Airtel Money is not configured (AIRTEL_CLIENT_ID / AIRTEL_CLIENT_SECRET)', 'GATEWAY_NOT_CONFIGURED');
  const res = await fetch(`${baseUrl}/auth/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: '*/*' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
  });
  if (!res.ok) throw badGateway('Could not authenticate with Airtel Money');
  const data = await res.json();
  tokenCache = { token: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) - 60) * 1000 };
  return tokenCache.token;
}

const headers = async () => ({
  'Content-Type': 'application/json', Accept: '*/*', Authorization: `Bearer ${await accessToken()}`,
  'X-Country': config.phone.countryIso, 'X-Currency': config.currency.code,
});

// TS = success, TF = failed, TA = ambiguous, TIP = in progress, TE = expired
const STATUS = { TS: 'succeeded', TF: 'failed', TE: 'failed', TIP: 'pending', TA: 'pending', DP00800001006: 'pending' };

export default {
  name: 'airtel',
  supportsDecimals: false,

  async initiate({ attempt }) {
    const res = await fetch(`${config.airtel.baseUrl}/merchant/v2/payments/`, {
      method: 'POST',
      headers: await headers(),
      body: JSON.stringify({
        reference: 'Fundwapp',
        subscriber: { country: config.phone.countryIso, currency: config.currency.code, msisdn: nationalNumber(attempt.phone_number) },
        transaction: { amount: toMajorNumber(attempt.amount), country: config.phone.countryIso, currency: config.currency.code, id: attempt.id },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.status?.success === false) {
      logger.error('Airtel collection rejected', data);
      throw badGateway(data?.status?.message || 'Airtel Money could not start the payment');
    }
    // Airtel echoes back our transaction id; we use it as the gateway reference
    return { gatewayReference: data?.data?.transaction?.id || attempt.id, message: null, redirectUrl: null, raw: data };
  },

  async query(attempt) {
    const res = await fetch(`${config.airtel.baseUrl}/standard/v1/payments/${encodeURIComponent(attempt.gateway_reference)}`, { headers: await headers() });
    const data = await res.json().catch(() => ({}));
    const tx = data?.data?.transaction;
    if (!tx) return { status: 'pending', raw: data };
    const status = STATUS[tx.status] ?? 'pending';
    return {
      status,
      transactionId: tx.airtel_money_id || attempt.gateway_reference,
      failureReason: status === 'failed' ? (tx.message || 'The payment was declined.') : undefined,
      raw: data,
    };
  },

  parseCallback(req) {
    const tx = req.body?.transaction;
    if (!tx?.id) return null;
    const status = STATUS[tx.status_code] ?? 'pending';
    return {
      reference: tx.id, status, transactionId: tx.airtel_money_id || tx.id,
      failureReason: status === 'failed' ? (tx.message || 'The payment was declined.') : undefined, raw: req.body,
    };
  },
};

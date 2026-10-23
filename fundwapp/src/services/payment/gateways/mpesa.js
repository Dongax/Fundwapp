import config from '../../../config/index.js';
import { badGateway } from '../../../utils/errors.js';
import { msisdn } from '../../../utils/phone.js';
import { toMajorNumber, minorUnits } from '../../../utils/money.js';
import { logger } from '../../../utils/logger.js';

const BASE = { sandbox: 'https://sandbox.safaricom.co.ke', production: 'https://api.safaricom.co.ke' };
const base = () => BASE[config.mpesa.env] ?? BASE.sandbox;

let tokenCache = { token: null, expiresAt: 0 };

async function accessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) return tokenCache.token;
  const { consumerKey, consumerSecret } = config.mpesa;
  if (!consumerKey || !consumerSecret) throw badGateway('M-Pesa is not configured (MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET)', 'GATEWAY_NOT_CONFIGURED');
  const res = await fetch(`${base()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')}` },
  });
  if (!res.ok) throw badGateway('Could not authenticate with M-Pesa');
  const data = await res.json();
  tokenCache = { token: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) - 60) * 1000 };
  return tokenCache.token;
}

async function call(path, payload) {
  const res = await fetch(`${base()}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

const timestamp = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14); // YYYYMMDDHHmmss (UTC)
const password = (ts) => Buffer.from(`${config.mpesa.shortcode}${config.mpesa.passkey}${ts}`).toString('base64');

function requireStkConfig() {
  const { shortcode, passkey } = config.mpesa;
  if (!shortcode || !passkey) throw badGateway('M-Pesa is not configured (MPESA_SHORTCODE / MPESA_PASSKEY)', 'GATEWAY_NOT_CONFIGURED');
}

export default {
  name: 'mpesa',
  supportsDecimals: false,

  /** STK push (SDD 4.1 step 3). */
  async initiate({ attempt, callbackUrl, fundraiser }) {
    requireStkConfig();
    const ts = timestamp();
    const { ok, data } = await call('/mpesa/stkpush/v1/processrequest', {
      BusinessShortCode: config.mpesa.shortcode,
      Password: password(ts),
      Timestamp: ts,
      TransactionType: config.mpesa.transactionType,
      Amount: toMajorNumber(attempt.amount),
      PartyA: msisdn(attempt.phone_number),
      PartyB: config.mpesa.partyB,
      PhoneNumber: msisdn(attempt.phone_number),
      CallBackURL: callbackUrl,
      AccountReference: fundraiser.unique_url.slice(0, 12),
      TransactionDesc: 'Fundraiser',
    });
    if (!ok || String(data.ResponseCode) !== '0') {
      logger.error('M-Pesa STK push rejected', data);
      throw badGateway(data.errorMessage || data.ResponseDescription || 'M-Pesa could not start the payment');
    }
    return { gatewayReference: data.CheckoutRequestID, message: data.CustomerMessage, redirectUrl: null, raw: data };
  },

  /** STK query - used for reconciliation and when a callback is late. */
  async query(attempt) {
    requireStkConfig();
    const ts = timestamp();
    const { data } = await call('/mpesa/stkpushquery/v1/query', {
      BusinessShortCode: config.mpesa.shortcode, Password: password(ts), Timestamp: ts, CheckoutRequestID: attempt.gateway_reference,
    });
    // Daraja answers with an error (or no ResultCode) while the customer is still deciding
    if (data.errorCode || data.errorMessage || data.ResultCode === undefined) return { status: 'pending', raw: data };
    return interpretResult(Number(data.ResultCode), data.ResultDesc, attempt.gateway_reference, null, data);
  },

  /** Callback payload -> neutral outcome. Authenticity is established by the URL secret + a confirmation query in the payment service. */
  parseCallback(req) {
    const cb = req.body?.Body?.stkCallback;
    if (!cb?.CheckoutRequestID) return null;
    const items = cb.CallbackMetadata?.Item ?? [];
    const meta = Object.fromEntries(items.map((i) => [i.Name, i.Value]));
    return {
      ...interpretResult(Number(cb.ResultCode), cb.ResultDesc, cb.CheckoutRequestID, meta.MpesaReceiptNumber, req.body),
      amountMinor: meta.Amount === undefined ? undefined : Math.round(Number(meta.Amount) * 10 ** minorUnits),
    };
  },

  /** B2C payout (withdrawals). Result arrives on the B2C result callback. */
  async disburse({ withdrawal, resultUrl, timeoutUrl }) {
    const c = config.mpesa;
    if (!c.initiatorName || !c.securityCredential || !c.b2cShortcode) {
      throw badGateway('M-Pesa B2C is not configured (MPESA_INITIATOR_NAME / MPESA_SECURITY_CREDENTIAL / MPESA_B2C_SHORTCODE)', 'GATEWAY_NOT_CONFIGURED');
    }
    const { ok, data } = await call('/mpesa/b2c/v1/paymentrequest', {
      OriginatorConversationID: withdrawal.id,
      InitiatorName: c.initiatorName,
      SecurityCredential: c.securityCredential,
      CommandID: c.b2cCommandId,
      Amount: toMajorNumber(withdrawal.net_amount),
      PartyA: c.b2cShortcode,
      PartyB: msisdn(withdrawal.payout_destination),
      Remarks: 'Fundraiser payout',
      QueueTimeOutURL: timeoutUrl,
      ResultURL: resultUrl,
      Occasion: withdrawal.id.slice(0, 8),
    });
    if (!ok || String(data.ResponseCode) !== '0') {
      throw badGateway(data.errorMessage || data.ResponseDescription || 'M-Pesa could not start the payout');
    }
    return { status: 'processing', reference: data.ConversationID, raw: data };
  },

  parseB2cResult(req) {
    const r = req.body?.Result;
    if (!r?.OriginatorConversationID) return null;
    const params = Object.fromEntries((r.ResultParameters?.ResultParameter ?? []).map((p) => [p.Key, p.Value]));
    return {
      withdrawalId: r.OriginatorConversationID,
      success: Number(r.ResultCode) === 0,
      reference: r.TransactionID || params.TransactionReceipt || null,
      failureReason: Number(r.ResultCode) === 0 ? null : r.ResultDesc,
      raw: req.body,
    };
  },
};

function interpretResult(code, desc, reference, receipt, raw) {
  if (code === 0) return { reference, status: 'succeeded', transactionId: receipt || reference, raw };
  if (code === 1032) return { reference, status: 'cancelled', failureReason: 'You cancelled the payment on your phone.', raw };
  return { reference, status: 'failed', failureReason: desc || 'The payment was declined.', raw };
}


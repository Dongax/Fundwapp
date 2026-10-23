const axios = require('axios');
const config = require('../../config');

const BASE_URL = config.mpesa.env === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

async function getAccessToken() {
  const auth = Buffer.from(`${config.mpesa.consumerKey}:${config.mpesa.consumerSecret}`).toString('base64');
  const { data } = await axios.get(
    `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${auth}` } }
  );
  return data.access_token;
}

function timestampNow() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// Initiates an M-Pesa STK push (Lipa na M-Pesa Online) prompt on the contributor's phone.
async function stkPush({ phoneNumber, amount, accountReference, transactionDesc }) {
  const accessToken = await getAccessToken();
  const timestamp = timestampNow();
  const password = Buffer.from(
    `${config.mpesa.shortcode}${config.mpesa.passkey}${timestamp}`
  ).toString('base64');

  const { data } = await axios.post(
    `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
    {
      BusinessShortCode: config.mpesa.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: phoneNumber,
      PartyB: config.mpesa.shortcode,
      PhoneNumber: phoneNumber,
      CallBackURL: config.mpesa.callbackUrl,
      AccountReference: accountReference,
      TransactionDesc: transactionDesc,
    },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  // data.CheckoutRequestID is used to match the async callback to this request
  return data;
}

// Parses the callback body Safaricom posts to MPESA_CALLBACK_URL.
function parseCallback(body) {
  const stkCallback = body?.Body?.stkCallback;
  if (!stkCallback) return null;

  const resultCode = stkCallback.ResultCode;
  const checkoutRequestId = stkCallback.CheckoutRequestID;

  if (resultCode !== 0) {
    return { success: false, checkoutRequestId, resultDesc: stkCallback.ResultDesc };
  }

  const items = stkCallback.CallbackMetadata?.Item || [];
  const get = (name) => items.find((i) => i.Name === name)?.Value;

  return {
    success: true,
    checkoutRequestId,
    amount: get('Amount'),
    mpesaReceiptNumber: get('MpesaReceiptNumber'),
    phoneNumber: get('PhoneNumber'),
    transactionDate: get('TransactionDate'),
  };
}

module.exports = { stkPush, parseCallback };

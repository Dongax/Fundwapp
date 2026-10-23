const axios = require('axios');
const config = require('../../config');

const BASE_URL = 'https://openapiuat.airtel.africa'; // swap to production host when going live

async function getAccessToken() {
  const { data } = await axios.post(`${BASE_URL}/auth/oauth2/token`, {
    client_id: config.airtel.clientId,
    client_secret: config.airtel.clientSecret,
    grant_type: 'client_credentials',
  });
  return data.access_token;
}

// Initiates an Airtel Money "request to pay" prompt on the contributor's phone.
async function requestToPay({ phoneNumber, amount, currency, transactionReference }) {
  const accessToken = await getAccessToken();

  const { data } = await axios.post(
    `${BASE_URL}/merchant/v1/payments/`,
    {
      reference: transactionReference,
      subscriber: { country: 'KE', currency, msisdn: phoneNumber },
      transaction: { amount, country: 'KE', currency, id: transactionReference },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Country': 'KE',
        'X-Currency': currency,
      },
    }
  );

  return data;
}

// Parses Airtel's payment callback payload.
function parseCallback(body) {
  const transaction = body?.transaction;
  if (!transaction) return null;

  return {
    success: transaction.status_code === 'TS' || transaction.status === 'SUCCESS',
    transactionId: transaction.id,
    airtelMoneyId: transaction.airtel_money_id,
    reference: transaction.reference,
  };
}

module.exports = { requestToPay, parseCallback };

const axios = require('axios');
const config = require('../../config');

// Generic card-gateway adapter. Swap the base URL / payload shape for your
// chosen processor (e.g. Flutterwave, Pesapal, Stripe) — the interface
// (charge + parseWebhook) is what the rest of the app depends on.
const BASE_URL = 'https://api.your-card-gateway.com';

async function charge({ email, amount, currency, reference, cardToken }) {
  const { data } = await axios.post(
    `${BASE_URL}/charge`,
    { email, amount, currency, reference, card_token: cardToken },
    { headers: { Authorization: `Bearer ${config.card.secret}` } }
  );
  return data;
}

function parseWebhook(body) {
  return {
    success: body.status === 'successful',
    reference: body.reference,
    gatewayTransactionId: body.id,
    amount: body.amount,
  };
}

module.exports = { charge, parseWebhook };

const { v4: uuidv4 } = require('uuid');
const { Contribution, Fundraiser, sequelize } = require('../models');
const mpesa = require('./gateways/mpesa');
const airtel = require('./gateways/airtel');
const card = require('./gateways/card');
const notificationService = require('./notificationService');

// Step: "System initiates payment request" (SDD 4.1)
// Creates a pending Contribution record, then sends the charge request to
// the chosen gateway. No amount is added to the fundraiser total yet —
// that only happens once the gateway confirms the payment (SDD 4.3).
async function initiateContribution({ fundraiserSlug, contributorName, contributorPhone, amount, paymentMethod, message, isAnonymous }) {
  const fundraiser = await Fundraiser.findOne({ where: { slug: fundraiserSlug, status: 'active' } });
  if (!fundraiser) {
    const err = new Error('Fundraiser not found or not accepting contributions');
    err.statusCode = 404;
    throw err;
  }

  const contribution = await Contribution.create({
    fundraiser_id: fundraiser.id,
    contributor_name: contributorName,
    contributor_phone: contributorPhone,
    amount,
    payment_method: paymentMethod,
    status: 'pending',
    is_anonymous: !!isAnonymous,
    message,
  });

  const reference = contribution.id; // used to reconcile the async gateway callback

  let gatewayResponse;
  switch (paymentMethod) {
    case 'mpesa':
      gatewayResponse = await mpesa.stkPush({
        phoneNumber: contributorPhone,
        amount,
        accountReference: reference,
        transactionDesc: `Contribution to ${fundraiser.title}`,
      });
      // Track Safaricom's CheckoutRequestID against our contribution for callback matching
      contribution.gateway_transaction_id = gatewayResponse.CheckoutRequestID;
      break;

    case 'airtel_money':
      gatewayResponse = await airtel.requestToPay({
        phoneNumber: contributorPhone,
        amount,
        currency: fundraiser.currency,
        transactionReference: reference,
      });
      contribution.gateway_transaction_id = gatewayResponse.transaction?.id || reference;
      break;

    case 'card':
      gatewayResponse = await card.charge({
        email: undefined,
        amount,
        currency: fundraiser.currency,
        reference,
        cardToken: undefined, // supplied by the client's card-collection widget/SDK
      });
      contribution.gateway_transaction_id = gatewayResponse.id || reference;
      break;

    default:
      // bank_transfer: manual confirmation path, no gateway call
      contribution.gateway_transaction_id = reference;
  }

  await contribution.save();

  return { contribution, fundraiser, gatewayResponse };
}

// Step: "Gateway confirms transaction" (SDD 4.1) — called from the
// mpesa/airtel/card callback routes. Gateway confirmation is the single
// source of truth (SDD 4.3); nothing here trusts client-reported success.
async function confirmContribution({ gatewayTransactionId, success, failureReason }) {
  const contribution = await Contribution.findOne({ where: { gateway_transaction_id: gatewayTransactionId } });
  if (!contribution) {
    console.warn(`No matching contribution for gateway reference ${gatewayTransactionId}`);
    return null;
  }

  if (contribution.status !== 'pending') {
    return contribution; // already processed — callback may have been retried
  }

  if (!success) {
    contribution.status = 'failed';
    await contribution.save();
    return contribution;
  }

  // Confirmed: atomically mark the contribution confirmed and bump the fundraiser total
  // (SDD 4.1 step "Dashboard updates in real time").
  const result = await sequelize.transaction(async (t) => {
    contribution.status = 'confirmed';
    await contribution.save({ transaction: t });

    const fundraiser = await Fundraiser.findByPk(contribution.fundraiser_id, { transaction: t, lock: t.LOCK.UPDATE });
    fundraiser.amount_raised = Number(fundraiser.amount_raised) + Number(contribution.amount);
    await fundraiser.save({ transaction: t });

    return fundraiser;
  });

  const organizer = await result.getOrganizer ? await result.getOrganizer() : null;
  if (organizer) {
    await notificationService.notifyContributionReceived(organizer, result, contribution);
  }

  return contribution;
}

module.exports = { initiateContribution, confirmContribution };

const paymentService = require('../services/paymentService');
const mpesa = require('../services/gateways/mpesa');
const airtel = require('../services/gateways/airtel');
const card = require('../services/gateways/card');

// Contributor-facing: "Select payment & enter details" -> initiates the charge.
async function contribute(req, res, next) {
  try {
    const { slug } = req.params;
    const { contributor_name, contributor_phone, amount, payment_method, message, is_anonymous } = req.body;

    const { contribution } = await paymentService.initiateContribution({
      fundraiserSlug: slug,
      contributorName: contributor_name,
      contributorPhone: contributor_phone,
      amount,
      paymentMethod: payment_method,
      message,
      isAnonymous: is_anonymous,
    });

    res.status(202).json({
      message: 'Payment request sent. Approve the prompt on your phone to complete your contribution.',
      contribution_id: contribution.id,
      status: contribution.status,
    });
  } catch (err) { next(err); }
}

async function mpesaCallback(req, res, next) {
  try {
    const parsed = mpesa.parseCallback(req.body);
    if (parsed) {
      await paymentService.confirmContribution({
        gatewayTransactionId: parsed.checkoutRequestId,
        success: parsed.success,
        failureReason: parsed.resultDesc,
      });
    }
    // Safaricom expects a 200 with this exact shape regardless of outcome
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (err) { next(err); }
}

async function airtelCallback(req, res, next) {
  try {
    const parsed = airtel.parseCallback(req.body);
    if (parsed) {
      await paymentService.confirmContribution({
        gatewayTransactionId: parsed.transactionId,
        success: parsed.success,
      });
    }
    res.json({ status: 'received' });
  } catch (err) { next(err); }
}

async function cardWebhook(req, res, next) {
  try {
    const parsed = card.parseWebhook(req.body);
    if (parsed) {
      await paymentService.confirmContribution({
        gatewayTransactionId: parsed.gatewayTransactionId,
        success: parsed.success,
      });
    }
    res.json({ status: 'received' });
  } catch (err) { next(err); }
}

module.exports = { contribute, mpesaCallback, airtelCallback, cardWebhook };

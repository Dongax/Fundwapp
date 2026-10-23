const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const controller = require('../controllers/paymentController');

const router = express.Router();

// Public: a contributor pays into a fundraiser identified by its public slug — no login required.
router.post('/:slug/contribute', [
  body('contributor_name').notEmpty(),
  body('contributor_phone').notEmpty(),
  body('amount').isFloat({ gt: 0 }),
  body('payment_method').isIn(['mpesa', 'airtel_money', 'card', 'bank_transfer']),
], validate, controller.contribute);

// Gateway callbacks (server-to-server, not for browser/app use)
router.post('/mpesa/callback', controller.mpesaCallback);
router.post('/airtel/callback', controller.airtelCallback);
router.post('/card/webhook', controller.cardWebhook);

module.exports = router;

const express = require('express');
const router = express.Router();

router.use('/auth', require('./authRoutes'));
router.use('/campaigns', require('./campaignRoutes'));
router.use('/payments', require('./paymentRoutes'));
router.use('/withdrawals', require('./withdrawalRoutes'));
router.use('/admin', require('./adminRoutes'));

module.exports = router;

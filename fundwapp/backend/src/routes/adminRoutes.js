const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const controller = require('../controllers/adminController');

const router = express.Router();
router.use(authenticate, authorize('admin'));

router.get('/fundraisers/pending', controller.listPendingFundraisers);
router.patch('/fundraisers/:id/approve', controller.approveFundraiser);
router.patch('/fundraisers/:id/reject', controller.rejectFundraiser);
router.get('/users', controller.listUsers);
router.patch('/users/:id/suspend', controller.suspendUser);
router.get('/flagged-activity', controller.flaggedActivity);

module.exports = router;

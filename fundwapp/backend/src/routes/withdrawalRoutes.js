const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const controller = require('../controllers/withdrawalController');

const router = express.Router();

router.post('/', authenticate, authorize('organizer', 'admin'), controller.request);
router.patch('/:id/approve', authenticate, authorize('admin'), controller.approve);
router.patch('/:id/reject', authenticate, authorize('admin'), controller.reject);

module.exports = router;

const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const controller = require('../controllers/campaignController');

const router = express.Router();

// Public: view a fundraiser's public landing page (no auth — SDD 4.1 "Open fundraiser link")
router.get('/public/:slug', controller.getPublic);

// Organizer-only
router.post('/', authenticate, authorize('organizer', 'admin'), [
  body('title').notEmpty(),
  body('goal_amount').isFloat({ gt: 0 }),
], validate, controller.create);

router.get('/mine', authenticate, authorize('organizer', 'admin'), controller.mine);
router.patch('/:id', authenticate, authorize('organizer', 'admin'), controller.update);

module.exports = router;

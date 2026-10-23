const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const controller = require('../controllers/authController');

const router = express.Router();

router.post('/register', [
  body('full_name').notEmpty(),
  body('phone_number').notEmpty(),
  body('password').isLength({ min: 8 }),
  body('email').optional().isEmail(),
], validate, controller.register);

router.post('/login', [
  body('phone_number').notEmpty(),
  body('password').notEmpty(),
], validate, controller.login);

router.get('/me', authenticate, controller.me);

module.exports = router;

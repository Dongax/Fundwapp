const bcrypt = require('bcryptjs');
const { User } = require('../models');
const { signToken } = require('../utils/jwt');
const { generateOtp } = require('../utils/otp');
const notificationService = require('./notificationService');

async function register({ full_name, email, phone_number, password }) {
  const existing = await User.findOne({ where: { phone_number } });
  if (existing) {
    const err = new Error('A user with this phone number already exists');
    err.statusCode = 409;
    throw err;
  }

  const password_hash = await bcrypt.hash(password, 10);
  const user = await User.create({ full_name, email, phone_number, password_hash });

  // Send OTP for phone verification
  const otp = generateOtp();
  // In production, cache the OTP (e.g. Redis) keyed by user id with a short TTL, instead of storing on the row.
  await notificationService.sendOtp(user, otp);

  return { user, otp }; // otp returned here only for demo/testing; do not return it in production
}

async function login({ phone_number, password }) {
  const user = await User.findOne({ where: { phone_number } });
  if (!user) {
    const err = new Error('Invalid credentials');
    err.statusCode = 401;
    throw err;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    const err = new Error('Invalid credentials');
    err.statusCode = 401;
    throw err;
  }

  if (user.status !== 'active') {
    const err = new Error('Account is suspended');
    err.statusCode = 403;
    throw err;
  }

  const token = signToken(user);
  return { user, token };
}

async function verifyPhone(user, submittedOtp, cachedOtp) {
  // Placeholder comparison — wire this to your OTP cache/store.
  if (submittedOtp !== cachedOtp) {
    const err = new Error('Invalid OTP');
    err.statusCode = 400;
    throw err;
  }
  user.is_phone_verified = true;
  await user.save();
  return user;
}

async function requestPasswordReset(user) {
  const otp = generateOtp();
  await notificationService.sendOtp(user, otp);
  return otp; // cache this against the user in production
}

async function resetPassword(user, newPassword) {
  user.password_hash = await bcrypt.hash(newPassword, 10);
  await user.save();
  return user;
}

module.exports = {
  register,
  login,
  verifyPhone,
  requestPasswordReset,
  resetPassword,
};

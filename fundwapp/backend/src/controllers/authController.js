const authService = require('../services/authService');

async function register(req, res, next) {
  try {
    const { user } = await authService.register(req.body);
    res.status(201).json({
      message: 'Registered. An OTP has been sent to your phone for verification.',
      user: { id: user.id, full_name: user.full_name, phone_number: user.phone_number },
    });
  } catch (err) { next(err); }
}

async function login(req, res, next) {
  try {
    const { user, token } = await authService.login(req.body);
    res.json({
      token,
      user: { id: user.id, full_name: user.full_name, phone_number: user.phone_number, role: user.role },
    });
  } catch (err) { next(err); }
}

async function me(req, res) {
  const { id, full_name, email, phone_number, role } = req.user;
  res.json({ id, full_name, email, phone_number, role });
}

module.exports = { register, login, me };

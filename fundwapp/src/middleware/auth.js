import { unauthorized, forbidden } from '../utils/errors.js';
import { verifyAccessToken, findUserById } from '../services/auth.service.js';

async function loadUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  const payload = verifyAccessToken(token);
  if (!payload) return null;
  const user = await findUserById(payload.sub);
  return user && user.status === 'active' ? user : null;
}

export async function requireAuth(req, res, next) {
  const user = await loadUser(req);
  if (!user) throw unauthorized();
  req.user = user;
  next();
}

export const requireRole = (...roles) => async (req, res, next) => {
  if (!req.user) throw unauthorized();
  if (!roles.includes(req.user.role)) throw forbidden();
  next();
};

export const requireVerified = (req, res, next) => {
  if (!req.user?.verified) throw forbidden('Verify your phone number first', 'NOT_VERIFIED');
  next();
};

import { Router } from 'express';
import config from '../config/index.js';
import { safeEqual } from '../utils/ids.js';
import { logger } from '../utils/logger.js';
import { notFound } from '../utils/errors.js';
import { gatewayDrivers } from '../services/payment/gateways/index.js';
import mpesa from '../services/payment/gateways/mpesa.js';
import { getAttemptStatus, handleGatewayCallback, simulateSandbox, CALLBACK_SEGMENTS } from '../services/payment/payment.service.js';
import { handleB2cResult } from '../services/withdrawal.service.js';

const router = Router();

// Contributor's browser polls this while waiting for the gateway (the id is an unguessable UUID).
router.get('/:id/status', async (req, res) => res.json(await getAttemptStatus(req.params.id)));

const secretOk = (given) => safeEqual(given, config.payment.callbackSecret);

// M-Pesa B2C payout result (declared before the generic gateway route)
router.post('/callbacks/b2c/:secret', (req, res) => {
  if (!secretOk(req.params.secret)) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  const parsed = mpesa.parseB2cResult(req);
  if (parsed) handleB2cResult(parsed).catch((err) => logger.error('B2C result handling failed', err));
  return undefined;
});

// Generic gateway webhook. We acknowledge immediately, then verify and settle in the background.
const gatewayBySegment = Object.fromEntries(Object.entries(CALLBACK_SEGMENTS).map(([name, segment]) => [segment, name]));
router.post('/callbacks/:gateway/:secret', (req, res) => {
  const name = gatewayBySegment[req.params.gateway];
  const gateway = name ? gatewayDrivers[name] : undefined;
  if (!gateway || !secretOk(req.params.secret)) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  handleGatewayCallback(name, req, gateway).catch((err) => logger.error(`${name} callback handling failed`, err));
  return undefined;
});

// Sandbox-only: stand in for the customer pressing a button on their phone.
router.post('/sandbox/:id/:decision', async (req, res) => {
  if (config.payment.mode !== 'sandbox') throw notFound();
  res.json(await simulateSandbox(req.params.id, req.params.decision));
});

export default router;

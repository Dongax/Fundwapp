import config from '../../../config/index.js';
import { badGateway } from '../../../utils/errors.js';
import sandbox from './sandbox.js';
import mpesa from './mpesa.js';

// M-Pesa is the only supported live gateway. payment_methods.gateway (a database value) names the driver;
// in sandbox mode every method resolves to the simulator so the flow can be tested without credentials.
const live = { mpesa };

export function getGateway(name) {
  if (config.payment.mode === 'sandbox') return sandbox;
  const gateway = live[name];
  if (!gateway) throw badGateway(`No payment gateway driver is installed for "${name}"`, 'GATEWAY_UNAVAILABLE');
  return gateway;
}

/** Payout drivers (payout_methods.gateway). "manual" payouts are completed by an admin. */
export function getPayoutGateway(name) {
  if (name === 'manual') return null;
  if (config.payment.mode === 'sandbox') return sandbox;
  if (name === 'mpesa_b2c') return mpesa;
  throw badGateway(`No payout driver is installed for "${name}"`, 'GATEWAY_UNAVAILABLE');
}

export const gatewayDrivers = live;

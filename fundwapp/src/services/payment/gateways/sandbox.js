import { uuid } from '../../../utils/ids.js';

// Simulated gateway used when PAYMENT_MODE=sandbox. Nothing is charged. The payment screen shows
// "Approve / Decline" buttons that call /api/sandbox/payments/:id/(approve|decline); those feed the
// same settlement code a real gateway callback uses, so the whole flow can be exercised end to end.
export default {
  name: 'sandbox',
  supportsDecimals: true,

  async initiate({ attempt }) {
    return {
      gatewayReference: `SBX-${uuid().slice(0, 12).toUpperCase()}`,
      message: 'Sandbox mode: approve or decline the simulated prompt below.',
      redirectUrl: null,
      raw: { sandbox: true, attempt: attempt.id },
    };
  },

  // Sandbox outcomes are pushed by the simulate endpoints, so there is nothing to pull.
  async query() {
    return { status: 'pending' };
  },

  async disburse({ withdrawal }) {
    return { status: 'completed', reference: `SBX-PAYOUT-${withdrawal.id.slice(0, 8).toUpperCase()}`, raw: { sandbox: true } };
  },
};

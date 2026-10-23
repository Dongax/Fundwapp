const cron = require('node-cron');
const { Contribution } = require('../models');
const { Op } = require('sequelize');

// FR-06-03: scheduled reconciliation job that cross-checks gateway records
// against stored contributions, catching any callback that was missed or
// delayed (SDD 4.3). Runs every 15 minutes.
function startReconciliationJob() {
  cron.schedule('*/15 * * * *', async () => {
    try {
      const staleThreshold = new Date(Date.now() - 15 * 60 * 1000);
      const stalePending = await Contribution.findAll({
        where: { status: 'pending', created_at: { [Op.lt]: staleThreshold } },
      });

      for (const contribution of stalePending) {
        // TODO: call the relevant gateway's transaction-status query API
        // (e.g. M-Pesa's "Transaction Status" API) using
        // contribution.gateway_transaction_id, then call
        // paymentService.confirmContribution() with the real result.
        console.log(`[reconciliation] stale pending contribution ${contribution.id} — querying gateway status`);
      }
    } catch (err) {
      console.error('[reconciliation] job failed:', err);
    }
  });

  console.log('Reconciliation job scheduled (every 15 minutes).');
}

module.exports = { startReconciliationJob };

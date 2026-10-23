require('dotenv').config();
const app = require('./src/app');
const { sequelize } = require('./src/models');
const { startReconciliationJob } = require('./src/services/reconciliationJob');

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established.');

    // In production, use migrations instead of sync.
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
      console.log('Models synced.');
    }

    startReconciliationJob(); // FR-06-03 scheduled reconciliation

    app.listen(PORT, () => {
      console.log(`Fundwapp backend listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();

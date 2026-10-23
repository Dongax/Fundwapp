const sequelize = require('../config/db');
const { DataTypes } = require('sequelize');

const User = require('./User')(sequelize, DataTypes);
const Fundraiser = require('./Fundraiser')(sequelize, DataTypes);
const Contribution = require('./Contribution')(sequelize, DataTypes);
const Withdrawal = require('./Withdrawal')(sequelize, DataTypes);
const Notification = require('./Notification')(sequelize, DataTypes);

// --- Relationships (per Section 3.1 of the SDD) ---

// One user creates many fundraisers
User.hasMany(Fundraiser, { foreignKey: 'organizer_id', as: 'fundraisers' });
Fundraiser.belongsTo(User, { foreignKey: 'organizer_id', as: 'organizer' });

// A fundraiser has many contributions
Fundraiser.hasMany(Contribution, { foreignKey: 'fundraiser_id', as: 'contributions' });
Contribution.belongsTo(Fundraiser, { foreignKey: 'fundraiser_id', as: 'fundraiser' });

// A fundraiser has many withdrawals
Fundraiser.hasMany(Withdrawal, { foreignKey: 'fundraiser_id', as: 'withdrawals' });
Withdrawal.belongsTo(Fundraiser, { foreignKey: 'fundraiser_id', as: 'fundraiser' });

// A user receives many notifications; a fundraiser may trigger many notifications
User.hasMany(Notification, { foreignKey: 'user_id', as: 'notifications' });
Notification.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Fundraiser.hasMany(Notification, { foreignKey: 'fundraiser_id', as: 'notifications' });
Notification.belongsTo(Fundraiser, { foreignKey: 'fundraiser_id', as: 'fundraiser' });

module.exports = {
  sequelize,
  User,
  Fundraiser,
  Contribution,
  Withdrawal,
  Notification,
};

module.exports = (sequelize, DataTypes) => {
  const Withdrawal = sequelize.define('Withdrawal', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    fundraiser_id: { type: DataTypes.UUID, allowNull: false },
    amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    payout_method: {
      type: DataTypes.ENUM('mpesa', 'airtel_money', 'bank_transfer'),
      allowNull: false,
    },
    payout_destination: { type: DataTypes.STRING, allowNull: false }, // phone or account number
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected', 'paid_out'),
      defaultValue: 'pending',
    },
    approved_by: { type: DataTypes.UUID, allowNull: true }, // admin user id
    notes: { type: DataTypes.TEXT, allowNull: true },
  }, {
    tableName: 'withdrawals',
    underscored: true,
    timestamps: true,
  });

  return Withdrawal;
};

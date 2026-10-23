module.exports = (sequelize, DataTypes) => {
  const Contribution = sequelize.define('Contribution', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    fundraiser_id: { type: DataTypes.UUID, allowNull: false },
    contributor_name: { type: DataTypes.STRING, allowNull: false },
    contributor_phone: { type: DataTypes.STRING, allowNull: false },
    amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    payment_method: {
      type: DataTypes.ENUM('mpesa', 'airtel_money', 'card', 'bank_transfer'),
      allowNull: false,
    },
    gateway_transaction_id: { type: DataTypes.STRING, allowNull: true, unique: true },
    status: {
      type: DataTypes.ENUM('pending', 'confirmed', 'failed'),
      defaultValue: 'pending',
    },
    is_anonymous: { type: DataTypes.BOOLEAN, defaultValue: false },
    message: { type: DataTypes.TEXT, allowNull: true },
  }, {
    tableName: 'contributions',
    underscored: true,
    timestamps: true,
  });

  return Contribution;
};

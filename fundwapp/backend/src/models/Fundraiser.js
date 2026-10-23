module.exports = (sequelize, DataTypes) => {
  const Fundraiser = sequelize.define('Fundraiser', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    organizer_id: { type: DataTypes.UUID, allowNull: false },
    title: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    category: { type: DataTypes.STRING, allowNull: true },
    goal_amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    amount_raised: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
    currency: { type: DataTypes.STRING(3), defaultValue: 'KES' },
    start_date: { type: DataTypes.DATE, allowNull: true },
    end_date: { type: DataTypes.DATE, allowNull: true },
    status: {
      type: DataTypes.ENUM('pending_review', 'active', 'paused', 'closed', 'rejected'),
      defaultValue: 'pending_review',
    },
    slug: { type: DataTypes.STRING, allowNull: false, unique: true },
    qr_code_url: { type: DataTypes.STRING, allowNull: true },
    cover_image_url: { type: DataTypes.STRING, allowNull: true },
  }, {
    tableName: 'fundraisers',
    underscored: true,
    timestamps: true,
  });

  return Fundraiser;
};

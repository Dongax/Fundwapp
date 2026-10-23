module.exports = (sequelize, DataTypes) => {
  const Notification = sequelize.define('Notification', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: { type: DataTypes.UUID, allowNull: false },
    fundraiser_id: { type: DataTypes.UUID, allowNull: true },
    channel: { type: DataTypes.ENUM('sms', 'email'), allowNull: false },
    event_type: {
      type: DataTypes.ENUM(
        'campaign_created', 'campaign_approved', 'contribution_received',
        'withdrawal_requested', 'withdrawal_completed', 'otp'
      ),
      allowNull: false,
    },
    recipient: { type: DataTypes.STRING, allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    delivered: { type: DataTypes.BOOLEAN, defaultValue: false },
    sent_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'notifications',
    underscored: true,
    timestamps: true,
  });

  return Notification;
};

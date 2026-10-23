module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    full_name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: true, unique: true, validate: { isEmail: true } },
    phone_number: { type: DataTypes.STRING, allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING, allowNull: false },
    role: {
      type: DataTypes.ENUM('organizer', 'contributor', 'admin'),
      defaultValue: 'organizer',
    },
    is_email_verified: { type: DataTypes.BOOLEAN, defaultValue: false },
    is_phone_verified: { type: DataTypes.BOOLEAN, defaultValue: false },
    two_factor_enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
    status: {
      type: DataTypes.ENUM('active', 'suspended'),
      defaultValue: 'active',
    },
  }, {
    tableName: 'users',
    underscored: true,
    timestamps: true,
  });

  return User;
};

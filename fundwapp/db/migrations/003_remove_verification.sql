-- Verification codes (SMS/email OTP) and two-factor sign-in were removed. Sign-up is just name, phone and password.
UPDATE users SET verified = 1, two_factor_enabled = 0;
DROP TABLE IF EXISTS otp_codes;
DELETE FROM notification_templates WHERE event IN ('otp_verification', 'otp_password_reset', 'otp_login');
DELETE FROM notifications WHERE trigger_event IN ('otp_verification', 'otp_password_reset', 'otp_login');
DELETE FROM settings WHERE key = 'require_verification';

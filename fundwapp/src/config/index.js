import 'dotenv/config';

const env = process.env;
const has = (k) => env[k] !== undefined && env[k].trim() !== '';
const str = (k, d = '') => (has(k) ? env[k].trim() : d);
const must = (k) => {
  if (!has(k)) {
    throw new Error(`Missing required environment variable ${k}. Copy .env.example to .env and fill it in.`);
  }
  return env[k].trim();
};
const int = (k, d) => {
  if (!has(k)) return d;
  const n = Number.parseInt(env[k], 10);
  if (Number.isNaN(n)) throw new Error(`Environment variable ${k} must be an integer`);
  return n;
};
const bool = (k, d = false) => (has(k) ? ['1', 'true', 'yes', 'on'].includes(env[k].trim().toLowerCase()) : d);
const list = (k) => (has(k) ? env[k].split(',').map((s) => s.trim()).filter(Boolean) : []);

const nodeEnv = str('NODE_ENV', 'development');
const isProd = nodeEnv === 'production';
// Render sets RENDER_EXTERNAL_URL automatically; APP_BASE_URL (e.g. your custom domain) wins when set.
const baseUrl = (str('APP_BASE_URL') || str('RENDER_EXTERNAL_URL') || must('APP_BASE_URL')).replace(/\/+$/, '');
const paymentMode = str('PAYMENT_MODE', 'sandbox');
if (!['sandbox', 'live'].includes(paymentMode)) throw new Error('PAYMENT_MODE must be "sandbox" or "live"');

const jwtSecret = must('JWT_ACCESS_SECRET');
if (jwtSecret.length < 32) throw new Error('JWT_ACCESS_SECRET must be at least 32 characters long');

const config = {
  env: nodeEnv,
  isProd,
  app: {
    port: int('PORT', 3000),
    baseUrl,
    timezone: must('APP_TIMEZONE'),
    corsOrigins: list('CORS_ORIGINS'),
    trustProxy: bool('TRUST_PROXY', false),
    autoMigrate: bool('AUTO_MIGRATE', false),
  },
  db: {
    url: must('DATABASE_URL'),
    authToken: str('DATABASE_AUTH_TOKEN') || undefined,
    syncUrl: str('DATABASE_SYNC_URL') || undefined,
    syncInterval: int('DATABASE_SYNC_INTERVAL_SECONDS', 60),
  },
  currency: {
    code: must('CURRENCY_CODE'),
    minorUnits: int('CURRENCY_MINOR_UNITS', 2),
    locale: str('LOCALE', 'en-KE'),
  },
  phone: {
    callingCode: must('DEFAULT_COUNTRY_CALLING_CODE').replace(/\D/g, ''),
  },
  auth: {
    jwtSecret,
    accessTtl: str('JWT_ACCESS_TTL', '15m'),
    refreshTtlDays: int('REFRESH_TOKEN_TTL_DAYS', 30),
    bcryptRounds: int('BCRYPT_ROUNDS', 12),
    otpLength: int('OTP_LENGTH', 6),
    otpTtlMinutes: int('OTP_TTL_MINUTES', 10),
    otpMaxAttempts: int('OTP_MAX_ATTEMPTS', 5),
    exposeDevOtp: bool('EXPOSE_DEV_OTP', false) && !isProd,
  },
  rateLimit: {
    windowMinutes: int('RATE_LIMIT_WINDOW_MINUTES', 15),
    authMax: int('RATE_LIMIT_AUTH_MAX', 30),
    paymentMax: int('RATE_LIMIT_PAYMENT_MAX', 20),
    globalMax: int('RATE_LIMIT_GLOBAL_MAX', 600),
  },
  payment: {
    mode: paymentMode,
    callbackSecret: must('PAYMENT_CALLBACK_SECRET'),
    callbackBaseUrl: (str('PAYMENT_CALLBACK_BASE_URL') || baseUrl).replace(/\/+$/, ''),
  },
  mpesa: {
    env: str('MPESA_ENV', 'sandbox'),
    consumerKey: str('MPESA_CONSUMER_KEY'),
    consumerSecret: str('MPESA_CONSUMER_SECRET'),
    shortcode: str('MPESA_SHORTCODE'),
    passkey: str('MPESA_PASSKEY'),
    transactionType: str('MPESA_TRANSACTION_TYPE', 'CustomerPayBillOnline'),
    partyB: str('MPESA_PARTY_B') || str('MPESA_SHORTCODE'),
    initiatorName: str('MPESA_INITIATOR_NAME'),
    securityCredential: str('MPESA_SECURITY_CREDENTIAL'),
    b2cShortcode: str('MPESA_B2C_SHORTCODE'),
    b2cCommandId: str('MPESA_B2C_COMMAND_ID', 'BusinessPayment'),
  },
  sms: {
    provider: str('SMS_PROVIDER', 'console'),
    atBaseUrl: str('AT_BASE_URL', 'https://api.sandbox.africastalking.com'),
    atUsername: str('AT_USERNAME'),
    atApiKey: str('AT_API_KEY'),
    atSenderId: str('AT_SENDER_ID'),
  },
  email: {
    provider: str('EMAIL_PROVIDER', 'console'),
    from: str('EMAIL_FROM'),
    smtp: {
      host: str('SMTP_HOST'),
      port: int('SMTP_PORT', 587),
      secure: bool('SMTP_SECURE', false),
      user: str('SMTP_USER'),
      pass: str('SMTP_PASS'),
    },
  },
  notifications: { maxAttempts: int('NOTIFICATION_MAX_ATTEMPTS', 3) },
  storage: {
    driver: str('STORAGE_DRIVER', 'local'),
    uploadDir: str('UPLOAD_DIR', './uploads'),
    maxUploadMb: int('MAX_UPLOAD_MB', 5),
    s3: {
      bucket: str('S3_BUCKET'),
      region: str('S3_REGION'),
      endpoint: str('S3_ENDPOINT') || undefined,
      accessKeyId: str('S3_ACCESS_KEY_ID'),
      secretAccessKey: str('S3_SECRET_ACCESS_KEY'),
      publicBaseUrl: str('S3_PUBLIC_BASE_URL').replace(/\/+$/, ''),
    },
  },
  jobs: {
    enabled: bool('JOBS_ENABLED', true),
    reconciliation: str('CRON_RECONCILIATION', '*/5 * * * *'),
    expireCampaigns: str('CRON_EXPIRE_CAMPAIGNS', '0 * * * *'),
    retryNotifications: str('CRON_RETRY_NOTIFICATIONS', '*/10 * * * *'),
  },
  limits: {
    titleMax: int('TITLE_MAX_LENGTH', 120),
    descriptionMax: int('DESCRIPTION_MAX_LENGTH', 8000),
    messageMax: int('MESSAGE_MAX_LENGTH', 280),
  },
};

export default config;

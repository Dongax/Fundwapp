-- Fundwapp schema v1. Entities and field names follow the System Design Document (Section 3).
-- Money columns (goal_amount, amount, fee_amount, net_amount, min/max amounts) are INTEGER minor units
-- (e.g. cents) so totals never suffer floating point rounding. See src/utils/money.js.

-- ----------------------------------------------------------------------------
-- Reference / configuration data (managed from db/seeds/*.json and the admin portal)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  value_type  TEXT NOT NULL CHECK (value_type IN ('string','integer','decimal','boolean','json')),
  description TEXT,
  is_public   INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0,1)),
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  code        TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  description TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1))
);

CREATE TABLE IF NOT EXISTS payment_methods (
  code            TEXT PRIMARY KEY,
  label           TEXT NOT NULL,
  gateway         TEXT NOT NULL,
  requires_phone  INTEGER NOT NULL DEFAULT 1 CHECK (requires_phone IN (0,1)),
  requires_email  INTEGER NOT NULL DEFAULT 0 CHECK (requires_email IN (0,1)),
  allows_decimals INTEGER NOT NULL DEFAULT 0 CHECK (allows_decimals IN (0,1)),
  min_amount      INTEGER NOT NULL,
  max_amount      INTEGER NOT NULL,
  instructions    TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1))
);

CREATE TABLE IF NOT EXISTS payout_methods (
  code                  TEXT PRIMARY KEY,
  label                 TEXT NOT NULL,
  gateway               TEXT NOT NULL,
  destination_label     TEXT NOT NULL,
  destination_is_phone  INTEGER NOT NULL DEFAULT 0 CHECK (destination_is_phone IN (0,1)),
  min_amount            INTEGER NOT NULL,
  max_amount            INTEGER NOT NULL,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  is_active             INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1))
);

CREATE TABLE IF NOT EXISTS notification_templates (
  id           TEXT PRIMARY KEY,
  event        TEXT NOT NULL,
  channel      TEXT NOT NULL CHECK (channel IN ('sms','email')),
  subject      TEXT,
  body         TEXT NOT NULL,
  is_sensitive INTEGER NOT NULL DEFAULT 0 CHECK (is_sensitive IN (0,1)),
  is_active    INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  UNIQUE (event, channel)
);

-- ----------------------------------------------------------------------------
-- Core entities (ERD)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                 TEXT PRIMARY KEY,
  full_name          TEXT NOT NULL,
  phone_number       TEXT NOT NULL UNIQUE,
  email              TEXT UNIQUE,
  password_hash      TEXT NOT NULL,
  role               TEXT NOT NULL CHECK (role IN ('organizer','contributor','admin')),
  verified           INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0,1)),
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  two_factor_enabled INTEGER NOT NULL DEFAULT 0 CHECK (two_factor_enabled IN (0,1)),
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fundraisers (
  id              TEXT PRIMARY KEY,
  organizer_id    TEXT NOT NULL REFERENCES users(id),
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  category        TEXT NOT NULL REFERENCES categories(code),
  goal_amount     INTEGER NOT NULL CHECK (goal_amount > 0),
  start_date      TEXT NOT NULL,
  end_date        TEXT NOT NULL,
  unique_url      TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL CHECK (status IN ('pending','active','rejected','suspended','ended')),
  cover_image_url TEXT,
  review_note     TEXT,
  reviewed_by     TEXT REFERENCES users(id),
  reviewed_at     TEXT,
  goal_notified_at TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fundraisers_organizer ON fundraisers(organizer_id);
CREATE INDEX IF NOT EXISTS idx_fundraisers_status ON fundraisers(status, end_date);
CREATE INDEX IF NOT EXISTS idx_fundraisers_category ON fundraisers(category);

CREATE TABLE IF NOT EXISTS campaign_updates (
  id            TEXT PRIMARY KEY,
  fundraiser_id TEXT NOT NULL REFERENCES fundraisers(id) ON DELETE CASCADE,
  author_id     TEXT NOT NULL REFERENCES users(id),
  body          TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_updates_fundraiser ON campaign_updates(fundraiser_id, created_at);

-- A payment attempt exists from the moment the contributor taps "Pay" until the gateway answers.
-- A CONTRIBUTIONS row is only written once the gateway confirms success (SDD 4.2).
CREATE TABLE IF NOT EXISTS payment_attempts (
  id                TEXT PRIMARY KEY,
  fundraiser_id     TEXT NOT NULL REFERENCES fundraisers(id),
  contributor_name  TEXT NOT NULL,
  phone_number      TEXT,
  email             TEXT,
  amount            INTEGER NOT NULL CHECK (amount > 0),
  payment_method    TEXT NOT NULL REFERENCES payment_methods(code),
  gateway           TEXT NOT NULL,
  gateway_reference TEXT UNIQUE,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','cancelled','expired')),
  failure_reason    TEXT,
  transaction_id    TEXT,
  redirect_url      TEXT,
  instructions      TEXT,
  is_anonymous      INTEGER NOT NULL DEFAULT 0 CHECK (is_anonymous IN (0,1)),
  message           TEXT,
  raw_response      TEXT,
  ip_address        TEXT,
  last_checked_at   TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  completed_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_attempts_status ON payment_attempts(status, created_at);
CREATE INDEX IF NOT EXISTS idx_attempts_fundraiser ON payment_attempts(fundraiser_id);
CREATE INDEX IF NOT EXISTS idx_attempts_phone ON payment_attempts(phone_number, created_at);

CREATE TABLE IF NOT EXISTS contributions (
  id                 TEXT PRIMARY KEY,
  fundraiser_id      TEXT NOT NULL REFERENCES fundraisers(id),
  payment_attempt_id TEXT NOT NULL UNIQUE REFERENCES payment_attempts(id),
  contributor_name   TEXT NOT NULL,
  phone_number       TEXT,
  email              TEXT,
  amount             INTEGER NOT NULL CHECK (amount > 0),
  payment_method     TEXT NOT NULL,
  transaction_id     TEXT NOT NULL UNIQUE,
  is_anonymous       INTEGER NOT NULL DEFAULT 0 CHECK (is_anonymous IN (0,1)),
  message            TEXT,
  created_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contributions_fundraiser ON contributions(fundraiser_id, created_at);

CREATE TABLE IF NOT EXISTS withdrawals (
  id                 TEXT PRIMARY KEY,
  fundraiser_id      TEXT NOT NULL REFERENCES fundraisers(id),
  requested_by       TEXT NOT NULL REFERENCES users(id),
  amount             INTEGER NOT NULL CHECK (amount > 0),
  fee_amount         INTEGER NOT NULL DEFAULT 0,
  net_amount         INTEGER NOT NULL,
  payout_method      TEXT NOT NULL REFERENCES payout_methods(code),
  payout_destination TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','processing','completed','rejected','failed')),
  reviewed_by        TEXT REFERENCES users(id),
  reviewed_at        TEXT,
  review_note        TEXT,
  gateway_reference  TEXT UNIQUE,
  payout_reference   TEXT,
  failure_reason     TEXT,
  requested_at       TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  completed_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_withdrawals_fundraiser ON withdrawals(fundraiser_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status, requested_at);

CREATE TABLE IF NOT EXISTS notifications (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT REFERENCES users(id),
  fundraiser_id       TEXT REFERENCES fundraisers(id),
  channel             TEXT NOT NULL CHECK (channel IN ('sms','email')),
  trigger_event       TEXT NOT NULL,
  recipient           TEXT NOT NULL,
  subject             TEXT,
  body                TEXT NOT NULL,
  is_sensitive        INTEGER NOT NULL DEFAULT 0,
  delivery_status     TEXT NOT NULL DEFAULT 'queued' CHECK (delivery_status IN ('queued','sent','delivered','failed')),
  attempts            INTEGER NOT NULL DEFAULT 0,
  error               TEXT,
  provider_message_id TEXT,
  created_at          TEXT NOT NULL,
  sent_at             TEXT
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(delivery_status, created_at);

-- ----------------------------------------------------------------------------
-- Auth support, operations and audit
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS otp_codes (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     TEXT NOT NULL CHECK (purpose IN ('verify_contact','password_reset','login_2fa')),
  code_hash   TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  expires_at  TEXT NOT NULL,
  consumed_at TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_otp_user ON otp_codes(user_id, purpose, created_at);

CREATE TABLE IF NOT EXISTS flags (
  id              TEXT PRIMARY KEY,
  entity_type     TEXT NOT NULL CHECK (entity_type IN ('fundraiser','contribution','payment_attempt','withdrawal','user')),
  entity_id       TEXT NOT NULL,
  reason_code     TEXT NOT NULL,
  details         TEXT,
  severity        TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high')),
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  created_at      TEXT NOT NULL,
  resolved_by     TEXT REFERENCES users(id),
  resolved_at     TEXT,
  resolution_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_flags_status ON flags(status, created_at);
CREATE INDEX IF NOT EXISTS idx_flags_entity ON flags(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id               TEXT PRIMARY KEY,
  trigger          TEXT NOT NULL CHECK (trigger IN ('schedule','manual')),
  started_at       TEXT NOT NULL,
  finished_at      TEXT,
  pending_checked  INTEGER NOT NULL DEFAULT 0,
  pending_settled  INTEGER NOT NULL DEFAULT 0,
  contributions_checked INTEGER NOT NULL DEFAULT 0,
  mismatches       INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  notes            TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT REFERENCES users(id),
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  metadata    TEXT,
  ip_address  TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

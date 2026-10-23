# Fundwapp

Digital fundraising platform (M-Pesa only) built from the **Fundwapp System Design Document**: Node.js (Express 5) API, web app, and admin portal on **Turso / libSQL (SQLite)**. The same code runs on a local SQLite file or on Turso; only `DATABASE_URL` changes.

## What is in the box

| SDD component | Where it lives |
|---|---|
| Backend API (single entry point) | `src/app.js`, `src/routes/*` |
| Auth service (register, login, logout, reset, OTP, 2FA) | `src/services/auth.service.js`, `otp.service.js` |
| Campaign service (create, unique URL, QR, updates, sharing) | `src/services/campaign.service.js` |
| Payment service (M-Pesa only: STK push, callbacks, reconciliation, B2C payouts) | `src/services/payment/*`, `reconciliation.service.js` |
| Notification service (SMS + email, logged) | `src/services/notification/*` |
| Cloud storage (cover photos) | `src/services/storage/*` (local disk or S3-compatible) |
| Database (USERS, FUNDRAISERS, CONTRIBUTIONS, WITHDRAWALS, NOTIFICATIONS) | `db/migrations/001_init.sql` |
| Web app + public fundraiser pages | `public/index.html`, `public/js/*` |
| Admin portal | `public/admin.html`, `public/js/admin/admin.js` |
| Mobile app (Flutter) | Not included. It talks to the same `/api` (see API below). |

Field names match the ERD exactly. Extra tables support the flows the SDD describes: `payment_attempts` (a payment is pending until the gateway confirms; **a contribution row is only created on confirmation**), `otp_codes`, `refresh_tokens`, `flags`, `reconciliation_runs`, `audit_logs`, `campaign_updates`.

> **Deploying to Render?** Free plan, browser only: `DEPLOY_RENDER_FREE.md`. Paid/production: `DEPLOY_RENDER.md`. Both use `render.yaml`.

## 1. Run it locally (SQLite file)

```bash
npm install
cp .env.example .env
```
Edit `.env` and set the two secrets (everything else works as shipped for development):
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # -> JWT_ACCESS_SECRET
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"   # -> PAYMENT_CALLBACK_SECRET
```
Then:
```bash
npm run db:setup          # applies db/migrations and loads db/seeds (categories, payment methods, settings, SMS/email templates)
npm run admin:create      # prompts for name, phone, email, password. Creates the first admin
npm run dev               # http://localhost:3000   (admin portal: /admin)
npm run test:smoke        # in a second terminal, with the server running (31 end-to-end checks)
```
In development `SMS_PROVIDER=console` prints OTPs/messages to the server log, `EXPOSE_DEV_OTP=true` also shows the OTP in the UI, and `PAYMENT_MODE=sandbox` gives you Approve / Decline / Cancel buttons on the payment screen, so the whole flow (including the failure path) works without any real gateway.

## 2. Switch to Turso

```bash
curl -sSfL https://get.tur.so/install.sh | bash     # install the Turso CLI
turso auth login
turso db create fundwapp
turso db show fundwapp --url                        # -> DATABASE_URL  (libsql://...)
turso db tokens create fundwapp                     # -> DATABASE_AUTH_TOKEN
```
In `.env`:
```
DATABASE_URL=libsql://fundwapp-<org>.turso.io
DATABASE_AUTH_TOKEN=<token>
```
Run `npm run db:setup` once against Turso, then start the app. Optional embedded replica (fast local reads, synced to Turso): keep `DATABASE_URL=file:./data/fundwapp.db` and set `DATABASE_SYNC_URL` to the Turso URL plus `DATABASE_AUTH_TOKEN`.

## 3. Nothing is hard-coded

| What | Where it is configured |
|---|---|
| Secrets, URLs, timezone, currency, phone country code, gateway credentials, providers, rate limits, cron schedules | `.env` (validated at boot in `src/config/index.js`; missing required values stop the app with a clear message) |
| Categories, the M-Pesa payment and payout method (limits, instructions) | database tables, seeded from `db/seeds/reference-data.json`, editable in **Admin > Settings** |
| Business rules: approval required, min goal, max duration, withdrawal minimum, platform fee %, flag thresholds, expiry and reconciliation windows, suggested amounts, anonymous giving | `settings` table, editable in **Admin > Settings** |
| SMS and email wording | `notification_templates` table, seeded from `db/seeds/notification-templates.json` |
| Everything the front end shows (categories, payment methods, currency, limits, quick amounts) | `GET /api/meta/config` |
| The first admin | `npm run admin:create` (never a default password) |

Money is stored as integers in minor units (no floating point) and returned by the API as decimal strings (`"1500.50"`). Re-seeding keeps admin edits; use `npm run db:seed -- --force` to overwrite from the JSON files.

## 4. Going live with payments

Set `PAYMENT_MODE=live`, `APP_BASE_URL` to your public HTTPS URL, and `PAYMENT_CALLBACK_BASE_URL` to a URL the gateways can reach (use ngrok or cloudflared in development). The STK callback URL is `<PAYMENT_CALLBACK_BASE_URL>/api/payments/callbacks/mpesa/<PAYMENT_CALLBACK_SECRET>` and the B2C result URL is `.../callbacks/mpesa-b2c/<PAYMENT_CALLBACK_SECRET>`. Both are sent with each Daraja request, so you do not register them by hand.

* **M-Pesa (Daraja):** `MPESA_ENV`, `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`, `MPESA_TRANSACTION_TYPE` (Paybill or Till; for a Till also set `MPESA_PARTY_B`). Payouts (B2C) additionally need `MPESA_INITIATOR_NAME`, `MPESA_SECURITY_CREDENTIAL`, `MPESA_B2C_SHORTCODE`.
* **SMS:** `SMS_PROVIDER=africastalking`, `AT_BASE_URL`, `AT_USERNAME`, `AT_API_KEY`, `AT_SENDER_ID`.
* **Email:** `EMAIL_PROVIDER=smtp`, `EMAIL_FROM`, `SMTP_HOST/PORT/SECURE/USER/PASS`.
* **Cover photos in the cloud:** `STORAGE_DRIVER=s3` with the `S3_*` values (works with AWS S3, Cloudflare R2, Spaces, MinIO).
* Behind a proxy/load balancer set `TRUST_PROXY=true` and `NODE_ENV=production`.

How a contribution is made trustworthy (SDD section 4): no contribution row exists until the gateway confirms. The callback is acknowledged immediately, then verified by asking Safaricom (STK query) before money is recorded. Settlement is idempotent. If a callback never arrives, the contributor's status poll and the scheduled **reconciliation** job (default every 5 minutes) ask Safaricom directly, and recent contributions are cross-checked against it. Mismatches become flags in the admin portal.

## 5. API summary

Public: `GET /api/meta/config`, `GET /api/public/fundraisers`, `GET /api/public/fundraisers/:code` (+ `/live`, `/stream` SSE, `/qr.png`), `POST /api/public/fundraisers/:code/contribute`, `POST .../report`, `GET /api/payments/:id/status`.
Auth: `POST /api/auth/register | verify | resend-otp | login | login/2fa | refresh | logout | forgot-password | reset-password | change-password | two-factor | become-organizer`, `GET|PATCH /api/auth/me`. Mobile apps send `Authorization: Bearer <access_token>` and may pass `refresh_token` in the body of `/refresh` and `/logout`; the web app uses an httpOnly cookie.
Organizer: `/api/campaigns` (create, list, get, patch, `/:id/end`, `/updates`, `/contributions`, `/balance`, `/withdrawals`), `POST /api/uploads/images`, `GET /api/notifications`, `GET /api/withdrawals`.
Admin (role `admin`): `/api/admin/overview | fundraisers | users | transactions | withdrawals | flags | reconciliation | settings | reference | audit`.
Errors always look like `{ "error": { "code": "...", "message": "...", "details": [...] } }`.

## 6. Things to know

* **The live M-Pesa integration follows the Daraja documentation but could not be exercised here** (no credentials). The sandbox driver covers the full flow end to end. Test in Daraja sandbox first (`MPESA_ENV=sandbox`), then switch to `production`.
* M-Pesa accepts whole shilling amounts only; fractional amounts are rejected. Existing databases from an earlier build get migration `002_mpesa_only.sql`, which switches off every other method.
* An M-Pesa STK query does not return the receipt number. When a payment is settled by query instead of callback, `transaction_id` falls back to the CheckoutRequestID.
* Real-time totals use Server-Sent Events from an in-process bus, with a 5-second poll as a fallback. On several server instances the poll keeps totals correct; swap `realtime.service.js` for Redis pub/sub for instant cross-instance pushes.
* Payouts go out by M-Pesa B2C. If one fails, an admin can **Retry payout** or **Mark paid** after settling it manually.
* `platform_fee_percent` is seeded at `0` (no fee). Set it in Admin > Settings if you charge one.

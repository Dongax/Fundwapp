# Deploying Fundwapp on Render (Node.js + Turso + M-Pesa)

Architecture on Render: one **Web Service** running this app, a **Turso** database (so data survives redeploys), **Africa's Talking** for SMS codes, **Safaricom Daraja** for M-Pesa, and an **S3-compatible bucket** (Cloudflare R2) or a Render Disk for cover photos.

> Render's filesystem is wiped on every deploy and restart. That is why the database must be Turso (not a `file:` SQLite database) and why photos need a bucket or a disk.

## Part A. Accounts you need
1. GitHub account (Render deploys from a Git repo).
2. Render account: https://render.com
3. Turso account: https://turso.tech
4. Africa's Talking account: https://africastalking.com (SMS verification codes)
5. Safaricom Daraja account: https://developer.safaricom.co.ke (M-Pesa)
6. Cloudflare account for R2 (optional, only if you use a bucket for photos)

## Part B. Create the Turso database
```bash
curl -sSfL https://get.tur.so/install.sh | bash
turso auth login
turso db locations                       # pick the region closest to your Render region
turso db create fundwapp --location fra  # replace fra with your chosen location code
turso db show fundwapp --url             # copy -> DATABASE_URL  (libsql://fundwapp-<org>.turso.io)
turso db tokens create fundwapp          # copy -> DATABASE_AUTH_TOKEN
```
You do not run migrations by hand: the Render start command does it on every boot.

## Part C. Push the code to GitHub
```bash
cd fundwapp
git init
git add .
git commit -m "Fundwapp"
git branch -M main
git remote add origin https://github.com/<you>/fundwapp.git
git push -u origin main
```
`.gitignore` already excludes `.env`, `node_modules` and local databases. Never commit secrets.

## Part D. Create the Render Web Service

### Option 1: Blueprint (fastest)
1. Render dashboard > **New** > **Blueprint** > connect the GitHub repo.
2. Render reads `render.yaml`, shows the service, and asks you for every variable marked `sync: false`. Fill them in using the table in Part E.
3. Click **Apply**.

### Option 2: Manual
1. Dashboard > **New** > **Web Service** > connect the repo.
2. Fill the form exactly:
   | Field | Value |
   |---|---|
   | Name | `fundwapp` |
   | Language | `Node` |
   | Branch | `main` |
   | Region | same area as your Turso database (Frankfurt is closest to Nairobi) |
   | Build Command | `npm install` |
   | Start Command | `npm run db:setup && node scripts/create-admin.js --if-missing && npm start` |
   | Instance Type | **Starter or higher** for real use (see "Free plan" below) |
   | Health Check Path | `/api/health` |
3. Under **Advanced**, keep **Instances = 1** (the live-totals feed and the scheduled jobs run inside the process).
4. Add the environment variables from Part E, then **Create Web Service**.

## Part E. Environment variables (Render > Service > Environment)

**Core**
| Key | Value |
|---|---|
| `NODE_VERSION` | `22` |
| `NODE_ENV` | `production` |
| `TRUST_PROXY` | `true` |
| `APP_TIMEZONE` | `Africa/Nairobi` |
| `CURRENCY_CODE` | `KES` |
| `CURRENCY_MINOR_UNITS` | `2` |
| `LOCALE` | `en-KE` |
| `DEFAULT_COUNTRY_CALLING_CODE` | `254` |
| `APP_BASE_URL` | leave unset to use your `https://<name>.onrender.com` URL automatically; set it to `https://yourdomain.com` once you add a custom domain |
| `JWT_ACCESS_SECRET` | click **Generate** (or 48+ random characters) |
| `PAYMENT_CALLBACK_SECRET` | click **Generate** (or 32+ random characters) |

**Database**
| Key | Value |
|---|---|
| `DATABASE_URL` | `libsql://fundwapp-<org>.turso.io` |
| `DATABASE_AUTH_TOKEN` | the Turso token |

**First admin (created automatically on first boot)**
| Key | Value |
|---|---|
| `ADMIN_FULL_NAME` | your name |
| `ADMIN_PHONE` | e.g. `0712345678` |
| `ADMIN_PASSWORD` | a strong password (8+ characters) |
| `ADMIN_EMAIL` | optional |

After your first successful sign-in at `/admin`, delete `ADMIN_PASSWORD` from Render (the script skips itself when it is missing and does nothing if the admin already exists).

**SMS codes (required: without SMS nobody can verify an account)**
| Key | Value |
|---|---|
| `SMS_PROVIDER` | `africastalking` |
| `AT_BASE_URL` | `https://api.africastalking.com` (use `https://api.sandbox.africastalking.com` only for testing) |
| `AT_USERNAME` | your Africa's Talking app username |
| `AT_API_KEY` | your API key |
| `AT_SENDER_ID` | your approved sender ID (optional) |
`EXPOSE_DEV_OTP` is ignored in production, so codes are never shown on screen.

**M-Pesa**
| Key | Value |
|---|---|
| `PAYMENT_MODE` | `live` |
| `MPESA_ENV` | `sandbox` first, `production` after go-live |
| `MPESA_CONSUMER_KEY` / `MPESA_CONSUMER_SECRET` | from your Daraja app |
| `MPESA_SHORTCODE` | sandbox: `174379`; live: your Paybill or Till number |
| `MPESA_PASSKEY` | sandbox: from Daraja "Test Credentials"; live: from Safaricom |
| `MPESA_TRANSACTION_TYPE` | `CustomerPayBillOnline` (Paybill) or `CustomerBuyGoodsOnline` (Till) |
| `MPESA_PARTY_B` | Till only: the Till number (Paybill: leave unset) |
| `MPESA_INITIATOR_NAME` | for payouts (B2C) |
| `MPESA_SECURITY_CREDENTIAL` | for payouts (B2C), see Part H |
| `MPESA_B2C_SHORTCODE` | for payouts (B2C) |

> `PAYMENT_MODE=sandbox` is a built-in simulator: **anyone can approve a fake payment**. Use it only for demos, never with real fundraisers.

**Optional email:** `EMAIL_PROVIDER=smtp`, `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`.

## Part F. Cover photos: pick one

### Option 1: Cloudflare R2 bucket (works on any plan)
1. Cloudflare > **R2** > **Create bucket** (e.g. `fundwapp-uploads`).
2. Bucket > **Settings** > **Public access**: enable the `r2.dev` URL (or connect a custom domain). Copy the public URL.
3. R2 > **Manage API tokens** > create a token with **Object Read & Write** for that bucket. Copy the Access Key ID, Secret and your account's S3 endpoint.
4. Add to Render:
   | Key | Value |
   |---|---|
   | `STORAGE_DRIVER` | `s3` |
   | `S3_BUCKET` | `fundwapp-uploads` |
   | `S3_REGION` | `auto` |
   | `S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
   | `S3_ACCESS_KEY_ID` | the key id |
   | `S3_SECRET_ACCESS_KEY` | the secret |
   | `S3_PUBLIC_BASE_URL` | the public bucket URL, no trailing slash |

### Option 2: Render Disk (paid plans)
Service > **Disks** > **Add Disk**: Name `uploads`, Mount Path `/var/data`, size 1 GB. Then set `UPLOAD_DIR=/var/data/uploads` (keep `STORAGE_DRIVER=local`). A service with a disk cannot scale beyond one instance and redeploys with a short pause.

## Part G. First deploy and checks
1. Watch **Logs**. You should see `Applied 2 migration(s)`, `Seeded reference data`, `Admin created: ...` (first boot only), then `Fundwapp listening on https://...`.
2. Open `https://<name>.onrender.com/api/health` and expect `{"status":"ok",...}`.
3. Open `https://<name>.onrender.com/admin`, sign in with `ADMIN_PHONE` and `ADMIN_PASSWORD`.
4. Register a test organizer on the main site. You should receive the SMS code (if not, see Troubleshooting).
5. Create a fundraiser, then approve it in **Admin > Fundraisers**.
6. Open its public link and make a small M-Pesa payment (sandbox: use the Daraja test phone number from the Daraja simulator page).
7. Check the total updates, then look in **Admin > Transactions** and **Admin > Reconciliation**.

## Part H. Going live with M-Pesa
1. On the Daraja portal, create an app with **Lipa Na M-Pesa Online** (and **B2C** if you want automatic payouts).
2. Test everything with `MPESA_ENV=sandbox` and the sandbox shortcode/passkey first.
3. Request **Go Live** in Daraja, provide your Paybill/Till and the app's details. Safaricom sends the production passkey (and initiator details for B2C).
4. For payouts, build `MPESA_SECURITY_CREDENTIAL` (the initiator password encrypted with Safaricom's production certificate):
   ```bash
   openssl x509 -pubkey -noout -in ProductionCertificate.cer > pub.pem
   printf '%s' 'INITIATOR_PASSWORD' | openssl pkeyutl -encrypt -pubin -inkey pub.pem -pkeyopt rsa_padding_mode:pkcs1 | base64 -w0
   ```
   Paste the output into Render as `MPESA_SECURITY_CREDENTIAL`.
5. In Render set `MPESA_ENV=production`, the production `MPESA_SHORTCODE`, `MPESA_PASSKEY`, `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, and the B2C values. Render redeploys automatically.
6. Make a real KES 10 payment, confirm it in **Admin > Transactions**, then request and approve a small withdrawal.

The STK callback URL (`https://<your-url>/api/payments/callbacks/mpesa/<PAYMENT_CALLBACK_SECRET>`) and B2C result URL are sent with each request, so you register nothing by hand.

## Part I. Custom domain (optional)
Service > **Settings** > **Custom Domains** > add `yourdomain.com`, create the DNS record Render shows, wait for the certificate, then set `APP_BASE_URL=https://yourdomain.com`.

## Free plan limits (demo only)
A free service sleeps after ~15 minutes idle (the first request takes ~50 seconds), so scheduled jobs (reconciliation, notification retries, ending expired fundraisers) do not run while asleep and an M-Pesa callback can arrive during a cold start. For real money use at least the **Starter** plan.

## Updating and operating
* Deploy: `git push` to `main` (auto-deploy). Migrations apply on boot.
* Change business rules (fees, limits, approval) in **Admin > Settings**; no redeploy needed.
* Backups: `turso db shell fundwapp .dump > backup.sql`.
* Rotating secrets: changing `JWT_ACCESS_SECRET` signs everyone out; changing `PAYMENT_CALLBACK_SECRET` is safe because new payments carry the new URL (pending payments are settled by reconciliation).

## Troubleshooting
| Symptom | Cause and fix |
|---|---|
| Deploy fails: `Missing required environment variable ...` | Add that variable in Render > Environment. |
| Boot fails with `JWT_ACCESS_SECRET must be at least 32 characters` | Use **Generate** or a longer secret. |
| `Database schema is missing` or auth errors | Check `DATABASE_URL` / `DATABASE_AUTH_TOKEN`; the token must belong to that database. |
| Registered users never get a code | `SMS_PROVIDER` is still `console`, or Africa's Talking username/key/sender are wrong. Check Logs and **Messages we sent you** on the account page. Sandbox AT only delivers to the AT simulator. |
| STK prompt never arrives | `MPESA_ENV` does not match the keys, wrong shortcode/passkey, or phone not whitelisted in sandbox. Logs show `M-Pesa STK push rejected`. |
| Payment stays "waiting" | Callback blocked or late; the status poll and reconciliation ask Safaricom directly after about 15 seconds / 2 minutes. Check **Admin > Reconciliation**. |
| Photos disappear after a deploy | You are on `STORAGE_DRIVER=local` without a Render Disk. Use R2 or add the disk. |
| Everyone shares one rate limit | `TRUST_PROXY` is not `true`. |
| Share link shows `localhost` | Remove any stale `APP_BASE_URL` or set it to the real URL. |

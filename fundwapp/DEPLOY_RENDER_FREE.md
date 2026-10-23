# Deploy Fundwapp on Render's FREE plan (no command line needed)

Everything below is done in a web browser: Turso (database), GitHub (code), Brevo or Gmail (email codes), Render (hosting).
Website screens change now and then, so a button label may differ slightly from what is written here. The idea of each step stays the same.

## What "free" means (read first)
* The app **sleeps after about 15 minutes with no visitors**. The next visit takes 30-60 seconds to wake it. Scheduled jobs (payment re-checks, ending expired fundraisers) only run while it is awake. Part 8 shows a free trick to keep it awake.
* Render's free disk is **wiped on every restart**. Your data is safe because it lives in Turso, but **uploaded cover photos would disappear**. Skip cover photos on the free plan, or add an R2 bucket (see `DEPLOY_RENDER.md`, Part F).
* Free is fine for a class demo or a trial. For real fundraisers with real money, move to Render's Starter plan.

---

## Part 1. Create the Turso database (website only)
1. Go to **https://turso.tech** and click **Sign Up**. Sign in with GitHub, Google or email.
2. After signing in you land in the Turso dashboard (**https://app.turso.tech**). If asked to create an organization, accept the default personal one.
3. Click **Databases** in the left menu, then **Create Database**.
4. Fill the form:
   * **Name:** `fundwapp`
   * **Group / Location:** choose the region closest to Nairobi (for example **Frankfurt** or another European region). If it asks for a group, keep the default or create one in that location.
   * Leave everything else as default, then click **Create Database**.
5. Click the new **fundwapp** database to open it.
6. Copy the **Database URL**. It starts with `libsql://` and looks like `libsql://fundwapp-yourname.turso.io`. Paste it into a text file as **DATABASE_URL**.
7. On the same database page click **Generate Token** (sometimes labelled **Create Token**). Choose **Full Access** (read and write) and expiration **Never**, then create it. **Copy the token immediately**, because it is shown only once. Save it as **DATABASE_AUTH_TOKEN**.
   * Warning: use the token created **inside the database page**. A "Platform API token" from your account settings will not work.
8. You do **not** create tables. Fundwapp creates them automatically the first time it starts on Render.

To check later: open the database in Turso and use **Edit Data** (the table viewer or SQL console). After the first deploy you will see tables such as `users` and `fundraisers`.

## Part 2. Free email so people receive their verification codes
Registration needs a code. Real SMS costs money, so on the free setup the code is sent **by email** (people must type their email when they register). Pick one:

**Option A: Brevo (free, 300 emails a day)**
1. Sign up at **https://www.brevo.com** and verify your email.
2. Top-right menu > **SMTP & API** > **SMTP** tab > **Generate a new SMTP key**. Copy the key.
3. Note your **SMTP login** shown on that page (usually your Brevo account email).
4. Under **Senders, Domains & Dedicated IPs** > **Senders**, add and verify the email address you want codes to come from.
5. Your values: `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`, `SMTP_USER=<SMTP login>`, `SMTP_PASS=<SMTP key>`, `EMAIL_FROM=Fundwapp <your verified sender email>`.

**Option B: Gmail**
1. Turn on 2-Step Verification for the Google account.
2. Go to **https://myaccount.google.com/apppasswords**, create an app password named `fundwapp` and copy the 16 letters.
3. Your values: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=<your gmail address>`, `SMTP_PASS=<the app password>`, `EMAIL_FROM=Fundwapp <your gmail address>`.

## Part 3. Put the code on GitHub (browser only)
1. Unzip `Fundwapp.zip` on your computer. You get a folder named `fundwapp`.
2. Sign in at **https://github.com**, click **+** (top right) > **New repository**. Name it `fundwapp`, choose **Private**, leave the README boxes unticked, click **Create repository**.
3. On the empty repo page click **uploading an existing file**.
4. Open the unzipped `fundwapp` folder, select **everything inside it** (the folders `db`, `public`, `scripts`, `src` and the files such as `package.json`, `render.yaml`) and drag them into the GitHub page. The folder has about 84 files, under GitHub's limit of 100 per upload.
   * Hidden files: `.gitignore` and `.env.example` are hidden on Mac (press Cmd+Shift+. in Finder to show them). They are nice to have but not required.
   * Do **not** upload a file named `.env` (the zip does not contain one).
5. Wait for the uploads to finish, then click **Commit changes**.
6. Check that the repo shows `src`, `public`, `db`, `scripts`, `package.json` and `render.yaml` at its top level (not inside another folder). If everything sits inside a `fundwapp` subfolder, the upload went one level too deep: delete the repo and upload again from inside the folder.

## Part 4. Create the service on Render
1. Sign in at **https://render.com** (use **Sign in with GitHub** to make the next steps easier).
2. Click **New +** > **Blueprint**.
3. Connect your GitHub account if asked, choose the `fundwapp` repository, click **Connect**.
4. Render reads `render.yaml` and shows a service named `fundwapp` on the **Free** plan, and asks for the values below. Fill each one in:

   | Field | Value |
   |---|---|
   | `DATABASE_URL` | the `libsql://...` URL from Part 1 |
   | `DATABASE_AUTH_TOKEN` | the Turso token from Part 1 |
   | `ADMIN_FULL_NAME` | your name |
   | `ADMIN_PHONE` | your phone, e.g. `0712345678` |
   | `ADMIN_PASSWORD` | a strong password (8+ characters) |
   | `EMAIL_FROM` | from Part 2 |
   | `SMTP_HOST` | from Part 2 |
   | `SMTP_USER` | from Part 2 |
   | `SMTP_PASS` | from Part 2 |
   | `MPESA_CONSUMER_KEY` | from Daraja (Part 7), or any text for now |
   | `MPESA_CONSUMER_SECRET` | from Daraja (Part 7), or any text for now |
   | `MPESA_SHORTCODE` | `174379` for Daraja sandbox |
   | `MPESA_PASSKEY` | from Daraja "Test Credentials" (Part 7), or any text for now |

   `JWT_ACCESS_SECRET` and `PAYMENT_CALLBACK_SECRET` are generated for you. You do not need to create secrets by hand.
5. Click **Apply** (or **Deploy Blueprint**). Render may ask for a payment card to verify your account; free services are not charged.
6. Wait for the first deploy (3-6 minutes). Click the service > **Logs**. Success looks like:
   * `Applied 2 migration(s)`
   * `Seeded reference data`
   * `Admin created: <your name>`
   * `Fundwapp listening on https://fundwapp-xxxx.onrender.com`
7. Your site address is shown at the top of the service page (`https://fundwapp-xxxx.onrender.com`). No `APP_BASE_URL` is needed; the app uses this address automatically.

If you prefer to create the service by hand instead of a Blueprint: **New + > Web Service**, pick the repo, **Language** `Node`, **Build Command** `npm install`, **Start Command** `npm run db:setup && node scripts/create-admin.js --if-missing && npm start`, **Instance Type** `Free`, **Health Check Path** `/api/health`, then add the variables from `render.yaml` under **Environment** (also `NODE_ENV=production`, `NODE_VERSION=22`, `TRUST_PROXY=true`, `APP_TIMEZONE=Africa/Nairobi`, `CURRENCY_CODE=KES`, `DEFAULT_COUNTRY_CALLING_CODE=254`, `PAYMENT_MODE=live`, `MPESA_ENV=sandbox`, `SMS_PROVIDER=console`, `EMAIL_PROVIDER=smtp`, and use **Generate** for the two secrets).

## Part 5. First checks
1. Open `https://<your-site>/api/health`. You should see `{"status":"ok", ...}`.
2. Open `https://<your-site>/admin` and sign in with `ADMIN_PHONE` and `ADMIN_PASSWORD`.
3. In Render > your service > **Environment**, delete `ADMIN_PASSWORD` (the admin already exists, so the app no longer needs it).
4. On the main site click **Start a fundraiser** and register a test organizer. **Type an email address**, then check that inbox (and spam) for the code.
5. Create a fundraiser. In **Admin > Fundraisers** click **Approve**.
6. Open the fundraiser's public link and check it loads.
7. In Turso, open your database > **Edit Data**. You should see the tables and your new rows.

If the email does not arrive: the Render **Logs** show `[EMAIL to ...]` or an error. For testing only, the verification code is also printed in the Logs as `[SMS to +254...]` because SMS is on console mode. Do not rely on that for real users.

## Part 6. Turn on M-Pesa testing (Daraja sandbox)
1. Sign up at **https://developer.safaricom.co.ke** and create an app with **Lipa Na M-Pesa Online** enabled.
2. Copy the app's **Consumer Key** and **Consumer Secret**. On the **Test Credentials** page copy the **Passkey** (the sandbox shortcode is `174379`).
3. In Render > **Environment** update `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_PASSKEY` (keep `MPESA_SHORTCODE=174379`, `MPESA_ENV=sandbox`, `PAYMENT_MODE=live`). Render redeploys.
4. Make a payment on a fundraiser using the Daraja test phone number from the Daraja simulator page. Check it under **Admin > Transactions**.
5. If the callback arrives while the app is asleep, nothing is lost: the payment page and the re-check job ask Safaricom directly a few seconds later.

(For a pure demo with no Daraja account at all, set `PAYMENT_MODE=sandbox`. A built-in simulator then shows Approve/Decline buttons. Never use that mode with real money because anyone can approve a fake payment.)

## Part 7. Keep it awake (free)
1. Sign up at **https://uptimerobot.com** (free plan).
2. **Add New Monitor**: type **HTTP(s)**, URL `https://<your-site>/api/health`, interval **5 minutes**.
3. This visits your app every 5 minutes so it does not fall asleep. A free Render workspace has 750 running hours a month, enough for one service all month.

## Part 8. Updating the app later
Change a file on GitHub (open it, click the pencil, edit, **Commit changes**). Render redeploys automatically. Business rules (fees, limits, approval) are changed in **Admin > Settings** with no redeploy.

## Part 9. When you are ready for real money
* Render > service > **Settings** > **Instance Type** > **Starter** (always on, so no sleeping).
* Get Africa's Talking for SMS (`SMS_PROVIDER=africastalking`, plus `AT_BASE_URL`, `AT_USERNAME`, `AT_API_KEY`, `AT_SENDER_ID`).
* Add an R2 bucket or Render Disk for cover photos.
* Complete Safaricom **Go Live**, then set `MPESA_ENV=production` with your real shortcode and passkey. Details are in `DEPLOY_RENDER.md`.

## Troubleshooting
| Symptom | Fix |
|---|---|
| Deploy says `Missing required environment variable` | Add that variable under **Environment**. |
| Logs show a database or auth error | `DATABASE_URL` or `DATABASE_AUTH_TOKEN` is wrong. Create a fresh token **inside the database page** in Turso and paste it again. |
| Site takes about a minute to open | It was asleep. Set up the monitor in Part 7. |
| No verification email | Wrong SMTP values, sender not verified in Brevo, or the user left the email box empty. Check Logs and the spam folder. |
| Admin cannot sign in | Check `ADMIN_PHONE` was typed the same way you sign in. If you removed `ADMIN_PASSWORD` too early, add the three `ADMIN_*` variables back with a new password and a new phone number (the script only creates an admin that does not exist yet). |
| Cover photos vanish | Free disk is wiped on restart. Skip photos or add R2. |

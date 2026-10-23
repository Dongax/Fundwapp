# Fundwapp Deployment Guide: Render + Turso + Safaricom (Daraja)

One document, start to finish, using only free services and only your web browser (no command line).

**What you will have at the end:** Fundwapp running on a public `https://….onrender.com` address, storing data in a Turso database, with an admin portal, email verification codes, and M-Pesa payments connected to Safaricom's Daraja sandbox.

---

## 0. Read this first

### What is free, and what is not
| Service | Used for | Cost |
|---|---|---|
| Render (Free web service) | Hosts the app | Free |
| Turso (Starter plan) | Database | Free, no card needed |
| GitHub | Holds the code Render deploys | Free |
| Brevo | Emails the verification codes | Free (300 emails a day) |
| Safaricom Daraja **sandbox** | Safe M-Pesa testing, no real money | Free |
| UptimeRobot | Keeps the free app awake | Free |
| **Taking real M-Pesa money** | Needs your own Paybill or Till from Safaricom, plus Daraja "Go Live" | **Not free** (Safaricom's own process, see Step 10) |
| Real SMS codes | Optional | Not free (Optional Part B) |

So: everything in Steps 1-9 is free and gives you a complete working system for a demo, a class project or a pilot with test money. Step 10 explains what changes when real money is involved.

### Limits of the free Render plan
* The app **falls asleep after about 15 minutes with no visitors** and takes 30-60 seconds to wake up. Step 9 fixes this for free.
* Render's free disk is **erased on every restart**. Your data is safe (it lives in Turso), but **uploaded cover photos would vanish**, so do not use cover photos on the free plan.
* Free Render has no shell, so everything here is done through settings screens.

### Two naming rules
* Do not put the words **mpesa** or **safaricom** in your Render service name or domain. Safaricom rejects callback addresses that contain them. (The app's own paths already avoid these words.)
* Use a **private** GitHub repository.

### Prepare a notes file
Open a plain text file named `fundwapp-values.txt`. You will paste values into it as you collect them (database URL, token, passwords). Keep it private and never upload it anywhere.

---

## Step 1. Create the database on Turso (browser only)
1. Go to **https://turso.tech** and click **Sign Up**. Sign in with GitHub, Google or email.
2. You arrive at the Turso dashboard (**https://app.turso.tech**). If it asks you to create an organization, accept the default personal one.
3. Click **Databases** in the left menu, then **Create Database**.
4. Fill in:
   * **Name:** `fundwapp`
   * **Group / Location:** pick the region closest to Nairobi (for example Frankfurt or another European region). If it asks for a group, keep the default.
5. Click **Create Database**, then click the new `fundwapp` database to open it.
6. Copy the **Database URL**. It starts with `libsql://`, for example `libsql://fundwapp-yourname.turso.io`. Save it in your notes as **DATABASE_URL**.
7. On the same database page click **Generate Token** (it may say **Create Token**). Choose **Full Access** (read and write), expiration **Never**, and create it. **Copy the token immediately**, because it is shown only once. Save it as **DATABASE_AUTH_TOKEN**.
   * Use the token created **inside the database page**. A "platform API token" from your account settings will not work.
8. You do **not** create tables. Fundwapp builds them itself the first time it starts.

---

## Step 2. Free email for verification codes (Brevo)
New users must enter a code to verify their account. SMS costs money, so the free setup sends the code **by email**. Users must type their email address when they register.

1. Sign up at **https://www.brevo.com** and confirm your email address.
2. Open the top-right account menu and choose **SMTP & API**, then the **SMTP** tab.
3. Click **Generate a new SMTP key**, name it `fundwapp`, and copy the key. Save it in your notes as **SMTP_PASS**.
4. On that page note your **SMTP login** (usually your Brevo email). Save it as **SMTP_USER**.
5. Go to **Senders, Domains & Dedicated IPs > Senders > Add a sender**. Add the email address codes should come from and confirm it from the email Brevo sends. Save it as **EMAIL_FROM** in the form `Fundwapp <that-address@example.com>`.
6. Your fixed values: **SMTP_HOST** = `smtp-relay.brevo.com`, **SMTP_PORT** = `587`.

*Gmail instead?* Turn on 2-Step Verification, create an App Password at https://myaccount.google.com/apppasswords, then use `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=<your gmail>`, `SMTP_PASS=<the app password>`, `EMAIL_FROM=Fundwapp <your gmail>`.

---

## Step 3. Get your free M-Pesa test credentials from Safaricom (Daraja)
1. Go to **https://developer.safaricom.co.ke** and click **Sign Up** (create an account). Confirm your email and log in.
2. Open **My Apps** and click **Add a new app**.
3. Give it a name such as `Fundwapp` (no "mpesa" or "safaricom" in the name). Tick the sandbox products **Lipa Na M-Pesa Sandbox** (M-Pesa Express). Tick the **M-Pesa Sandbox** product too if shown. Click **Create app**.
4. Open your new app. Click to reveal and copy:
   * **Consumer Key** -> save as **MPESA_CONSUMER_KEY**
   * **Consumer Secret** -> save as **MPESA_CONSUMER_SECRET**
5. In the portal menu open **APIs > M-Pesa Express** (also called Lipa Na M-Pesa Online) and find the **Simulate** page. It shows the test credentials:
   * **Business Short Code:** `174379` -> save as **MPESA_SHORTCODE**
   * **Passkey:** a long string of letters and numbers -> save as **MPESA_PASSKEY**
   * A **test phone number** you can use in sandbox.
6. Fixed values for sandbox: **MPESA_ENV** = `sandbox`, **MPESA_TRANSACTION_TYPE** = `CustomerPayBillOnline`.

You do **not** register a callback address with Safaricom. Fundwapp sends its own secure callback address with every payment request.

---

## Step 4. Put the code on GitHub (browser only)
1. Unzip `Fundwapp.zip` on your computer. You get a folder named `fundwapp`.
2. Sign in at **https://github.com**. Click **+** (top right) > **New repository**. Name it `fundwapp`, choose **Private**, leave the README options unticked, click **Create repository**.
3. On the empty repository page click **uploading an existing file**.
4. Open the unzipped folder, select **everything inside it** (the folders `db`, `public`, `scripts`, `src`, and the files `package.json`, `render.yaml`, `README.md` and so on) and drag it all into the GitHub page. There are about 80 files, below GitHub's limit of 100 per upload.
   * Hidden files `.gitignore` and `.env.example` are optional. On a Mac press Cmd+Shift+. in Finder to show hidden files.
   * Never upload a file called `.env`.
5. When the files finish uploading, click **Commit changes**.
6. Check the repository top level shows `src`, `public`, `db`, `scripts`, `package.json`, `render.yaml`. If they sit inside an extra `fundwapp` folder, delete the repository and upload again from inside the folder.

---

## Step 5. Deploy on Render (Free plan)
1. Go to **https://render.com** and sign up using **Sign in with GitHub**.
2. Click **New +** > **Blueprint**.
3. Connect your GitHub account if asked, choose the `fundwapp` repository and click **Connect**.
4. Render reads `render.yaml` and shows one service named `fundwapp` on the **Free** plan. Give the service a name without "mpesa" or "safaricom" if it lets you edit it. Fill in each empty value from your notes:

   | Setting | What to enter |
   |---|---|
   | `DATABASE_URL` | your `libsql://…` URL from Step 1 |
   | `DATABASE_AUTH_TOKEN` | your Turso token from Step 1 |
   | `ADMIN_FULL_NAME` | your name |
   | `ADMIN_PHONE` | your phone number, e.g. `0712345678` |
   | `ADMIN_PASSWORD` | a strong password, 8+ characters (this is your admin login) |
   | `EMAIL_FROM` | from Step 2 |
   | `SMTP_HOST` | `smtp-relay.brevo.com` |
   | `SMTP_USER` | from Step 2 |
   | `SMTP_PASS` | from Step 2 |
   | `MPESA_CONSUMER_KEY` | from Step 3 |
   | `MPESA_CONSUMER_SECRET` | from Step 3 |
   | `MPESA_SHORTCODE` | `174379` |
   | `MPESA_PASSKEY` | from Step 3 |

   Render generates `JWT_ACCESS_SECRET` and `PAYMENT_CALLBACK_SECRET` for you. These are already set by the blueprint: `NODE_ENV=production`, `TRUST_PROXY=true`, `APP_TIMEZONE=Africa/Nairobi`, `CURRENCY_CODE=KES`, `PAYMENT_MODE=live`, `MPESA_ENV=sandbox`, `SMS_PROVIDER=console`, `EMAIL_PROVIDER=smtp`.
5. Click **Apply** (or **Deploy Blueprint**). Render may ask for a payment card to verify your account; free services are not charged.
6. Open the service and watch **Logs** (about 3-6 minutes). Success looks like:
   * `Applied 2 migration(s)`
   * `Seeded reference data`
   * `Admin created: <your name>`
   * `Fundwapp listening on https://fundwapp-xxxx.onrender.com`
7. Your public address is at the top of the service page. You do **not** need to set `APP_BASE_URL`; the app uses this address automatically.

*Creating the service by hand instead of a Blueprint:* **New + > Web Service**, pick the repository, **Language** `Node`, **Build Command** `npm install`, **Start Command** `npm run db:setup && node scripts/create-admin.js --if-missing && npm start`, **Instance Type** `Free`, **Health Check Path** `/api/health`, then add every variable from the table above plus `NODE_VERSION=22`, `NODE_ENV=production`, `TRUST_PROXY=true`, `APP_TIMEZONE=Africa/Nairobi`, `CURRENCY_CODE=KES`, `DEFAULT_COUNTRY_CALLING_CODE=254`, `PAYMENT_MODE=live`, `MPESA_ENV=sandbox`, `MPESA_TRANSACTION_TYPE=CustomerPayBillOnline`, `SMS_PROVIDER=console`, `EMAIL_PROVIDER=smtp`, `SMTP_PORT=587`, and use **Generate** for `JWT_ACCESS_SECRET` and `PAYMENT_CALLBACK_SECRET`.

---

## Step 6. First checks
1. Visit `https://<your-site>/api/health`. You should see `{"status":"ok", …}`.
2. Visit `https://<your-site>/admin` and sign in with `ADMIN_PHONE` and `ADMIN_PASSWORD`.
3. In Render > your service > **Environment**, **delete `ADMIN_PASSWORD`**. The admin already exists, so it is no longer needed.
4. On the main site click **Start a fundraiser** and register a test organizer. **Type an email address**, then find the verification code in that inbox (check spam).
5. Create a fundraiser (use dates starting today, a goal of at least 1,000, and no cover photo).
6. In the **admin portal > Fundraisers** click **Approve**. The fundraiser's public page now works.
7. In Turso, open your database and use **Edit Data**. You should see tables such as `users` and `fundraisers` with your new rows.

If the email does not arrive: the Render Logs show `[EMAIL to …]` or the error. For testing only, the code is also printed in the Logs as `[SMS to +254…]`. Do not rely on that for real users.

---

## Step 7. Test M-Pesa
There are two safe ways. Do both.

**A. Test the Safaricom connection (Daraja sandbox).** Your Render settings already point at the sandbox. Open the fundraiser's public page, choose M-Pesa, enter the **test phone number** from the Daraja Simulate page and a whole-shilling amount, and pay.
* In the admin portal open **Transactions**. A new row appears as `pending`, then moves to `succeeded` or `failed` once Safaricom answers.
* If the row says `failed` immediately, the Render Logs show `M-Pesa STK push rejected` with Safaricom's reason (usually a wrong key, secret, shortcode or passkey).
* The sandbox does not send a prompt to real phones, and its behaviour varies. If Safaricom does not send the callback, Fundwapp asks Safaricom directly after about 15 seconds, and a scheduled re-check runs every 5 minutes while the app is awake.

**B. Test the whole flow without Safaricom (built-in simulator).** In Render > **Environment** set `PAYMENT_MODE` to `sandbox` and save. The payment screen now shows **Approve / Decline / Cancel** buttons so you can play the contributor. Use this for demos and class presentations. **Never** use it with real fundraisers, because anyone could approve a fake payment. Switch back to `live` when done.

**Withdrawals on the free setup.** An organizer requests a withdrawal, then an admin clicks **Approve** in **Admin > Withdrawals**. Automatic payouts need Safaricom's B2C product, which is only available after Go Live, so on the free setup the payout shows as `failed` with "M-Pesa B2C is not configured". That is expected. Send the money yourself from your M-Pesa app to the organizer's number shown on the row, then click **Mark paid** and enter the M-Pesa receipt code. The organizer is notified and the balance is already reserved, so nothing is paid twice.

---

## Step 8. Keep a record of your settings
Render > your service > **Environment** shows every setting. Business rules such as the approval requirement, minimum goal, withdrawal minimum and fee percentage are changed in **Admin > Settings**, with no redeploy.

---

## Step 9. Keep the free app awake (UptimeRobot)
1. Sign up at **https://uptimerobot.com** (free).
2. Click **Add New Monitor**. Type **HTTP(s)**, name `Fundwapp`, URL `https://<your-site>/api/health`, interval **5 minutes**. Save.
3. It now visits your app every 5 minutes, so the app stays awake and background jobs keep running. A free Render account has 750 running hours a month, enough for one service all month.

---

## Step 10. Taking real M-Pesa money (what changes, and what costs money)
Everything above uses test money. Real money needs things only Safaricom can give you:
1. **A Paybill or Till number** registered to your business or organization (Lipa Na M-Pesa). Get it from Safaricom or an M-Pesa agent/shop. This is Safaricom's own process and may have fees.
2. **Daraja Go Live.** In the Daraja portal use the **Go Live** option and follow the wizard (it asks for your shortcode and an M-Pesa portal user). Safaricom then sends your **production passkey** and enables production for your app. The portal's Support page lists the current contact if you get stuck.
3. In Render > **Environment** change:
   | Setting | New value |
   |---|---|
   | `MPESA_ENV` | `production` |
   | `MPESA_SHORTCODE` | your production shortcode (for a **Till**, this is the *head office* shortcode Safaricom gives you) |
   | `MPESA_PARTY_B` | **Till only:** your Till number (for a Paybill leave it unset) |
   | `MPESA_TRANSACTION_TYPE` | `CustomerPayBillOnline` for Paybill, `CustomerBuyGoodsOnline` for Till |
   | `MPESA_PASSKEY` | the production passkey from Safaricom |
   | `MPESA_CONSUMER_KEY` / `MPESA_CONSUMER_SECRET` | the production app's key and secret |
4. **Automatic payouts (optional).** After Safaricom enables B2C for you, add `MPESA_INITIATOR_NAME`, `MPESA_B2C_SHORTCODE` and `MPESA_SECURITY_CREDENTIAL`. The security credential is the initiator password encrypted with Safaricom's production certificate. Whoever has `openssl` can create it with:
   ```
   openssl x509 -pubkey -noout -in ProductionCertificate.cer > pub.pem
   printf '%s' 'INITIATOR_PASSWORD' | openssl pkeyutl -encrypt -pubin -inkey pub.pem -pkeyopt rsa_padding_mode:pkcs1 | base64 -w0
   ```
   Until then keep using **Mark paid** (Step 7).
5. **Upgrade Render to the Starter plan** (always on, so Safaricom's callbacks never hit a sleeping app). Render > service > **Settings > Instance Type > Starter**. Then you can remove the UptimeRobot monitor.
6. Make a real KES 10 contribution, confirm it in **Admin > Transactions**, and check the money in your M-Pesa account.

---

## Step 11. Updating the app later
Open a file in your GitHub repository, click the pencil icon, edit, and **Commit changes**. Render redeploys by itself and applies database updates on start.

---

## Optional Part A. Real SMS codes (Twilio)
Costs money after the trial. Only needed if you do not want to rely on email.
1. Sign up at **https://www.twilio.com/try-twilio**, verify your email and your Kenyan phone number.
2. On the Console home page copy the **Account SID** (starts with `AC`) and **Auth Token**. Click **Get a trial phone number** and copy it in the form `+1XXXXXXXXXX`.
3. Console > **Messaging > Settings > Geo permissions**: tick **Kenya** and save.
4. Trial accounts can text only verified numbers: Console > **Phone Numbers > Manage > Verified Caller IDs > Add a new Caller ID**, add each tester's phone.
5. In Render > **Environment** set `SMS_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`. Save and wait for the redeploy.
6. To text anyone, add a card in Twilio Billing and upgrade the account.

Twilio error `21608` means the number is not verified (trial); `21408` means Kenya is not enabled; `20003` means a wrong SID or token. Vonage works too (`SMS_PROVIDER=vonage`, `VONAGE_API_KEY`, `VONAGE_API_SECRET`, `VONAGE_FROM`).

---

## Troubleshooting
| Symptom | Cause and fix |
|---|---|
| Deploy fails with `Missing required environment variable …` | Add that variable in Render > Environment. |
| Logs show a database error | `DATABASE_URL` or `DATABASE_AUTH_TOKEN` is wrong. Create a new token **inside the database page** in Turso and paste it again. |
| The site takes a minute to open | It was asleep. Set up Step 9. |
| No verification email | Wrong SMTP values, sender not confirmed in Brevo, or the user left the email box empty. Check Render Logs and spam. |
| Admin cannot sign in | Check `ADMIN_PHONE` is typed the way you sign in. The admin is only created if it does not exist yet; to start over use a different phone number and re-add the three `ADMIN_*` variables. |
| `M-Pesa STK push rejected` in Logs | Key, secret, shortcode or passkey is wrong, or `MPESA_ENV` does not match the keys (sandbox keys with `production`). |
| `Invalid CallBackURL` from Safaricom | The Render address contains "mpesa" or "safaricom". Rename the service or use another domain. |
| Payment stays "waiting" | Safaricom's callback has not arrived. Fundwapp checks with Safaricom after about 15 seconds and every 5 minutes; see Admin > Reconciliation. |
| A withdrawal shows `failed` | Expected before B2C is enabled. Pay manually and click **Mark paid**. |
| Cover photos disappear | The free disk is erased on restart. Do not use cover photos on the free plan. |
| Everyone shares one rate limit | `TRUST_PROXY` is not `true`. |

---

## Appendix. Every setting and where its value comes from
| Setting | Value | Source |
|---|---|---|
| `DATABASE_URL`, `DATABASE_AUTH_TOKEN` | `libsql://…` and token | Turso, Step 1 |
| `ADMIN_FULL_NAME`, `ADMIN_PHONE`, `ADMIN_PASSWORD` | your choice | You, Step 5 (delete the password afterwards) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | Brevo values | Step 2 |
| `MPESA_ENV` | `sandbox`, later `production` | Steps 3 and 10 |
| `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET` | from your Daraja app | Step 3 |
| `MPESA_SHORTCODE`, `MPESA_PASSKEY` | `174379` and test passkey, later production values | Steps 3 and 10 |
| `MPESA_TRANSACTION_TYPE`, `MPESA_PARTY_B` | Paybill or Till settings | Step 10 |
| `MPESA_INITIATOR_NAME`, `MPESA_SECURITY_CREDENTIAL`, `MPESA_B2C_SHORTCODE` | for automatic payouts | Step 10 |
| `PAYMENT_MODE` | `live` (Safaricom) or `sandbox` (built-in simulator) | Step 7 |
| `JWT_ACCESS_SECRET`, `PAYMENT_CALLBACK_SECRET` | generated | Render, automatic |
| `SMS_PROVIDER` and `TWILIO_*` / `VONAGE_*` | optional SMS | Optional Part A |
| `NODE_ENV`, `TRUST_PROXY`, `APP_TIMEZONE`, `CURRENCY_CODE`, `DEFAULT_COUNTRY_CALLING_CODE` | fixed values in `render.yaml` | Step 5 |

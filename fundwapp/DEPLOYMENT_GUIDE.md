# Fundwapp Deployment Guide (live now, without M-Pesa)

Deploy Fundwapp today on **Render + Turso**, entirely in your web browser, with **no Safaricom account and no M-Pesa credentials**. Payments run on Fundwapp's built-in **demo simulator**, and you can switch real M-Pesa on later (Part 9) without redoing anything.

**What you will have at the end:** a public `https://….onrender.com` website where people register, organizers create fundraisers, an admin approves them, contributors "pay" and totals update live, and organizers request withdrawals that the admin approves. Everything is stored in a Turso database. A yellow banner on every page says **Demo mode: payments are simulated**.

---

## Part 0. Read this first

### What "without M-Pesa" means
| Works fully | Simulated |
|---|---|
| Sign-up, email verification codes, login, 2-step sign-in | The M-Pesa payment itself: the payment screen shows **Approve / Decline / Cancel** buttons instead of a phone prompt |
| Fundraisers, admin approval, public pages, QR codes, live totals, updates | Withdrawal payouts: when the admin approves, the payout is marked paid with a fake `SBX-…` reference and **no money moves** |
| Contributions, receipts, flags, reconciliation, admin portal, audit log | |

**No real money is collected or sent in this mode.** Anyone who opens a payment screen can press Approve, so do not use this setup to collect real donations. It is perfect for demos, classes, user testing and a staging site.

### Costs and limits
| Service | Used for | Cost |
|---|---|---|
| Render (Free web service) | Hosts the app | Free |
| Turso (Starter plan) | Database | Free, no card |
| GitHub (private repo) | Holds the code Render deploys | Free |
| Brevo | Emails the verification codes | Free (300 emails a day) |
| UptimeRobot | Keeps the free app awake | Free |

Free Render limits: the app **sleeps after about 15 minutes with no visitors** (the next visit takes 30-60 seconds; Part 7 fixes this), and its disk is **erased on every restart**, so **do not use cover photos** (your data is safe because it lives in Turso).

### Prepare a notes file
Create a text file `fundwapp-values.txt` on your computer. You will paste values into it as you collect them. Keep it private; never upload it.

---

## Part 1. Create the database on Turso
1. Go to **https://turso.tech** and click **Sign Up**. Sign in with GitHub, Google or email.
2. You arrive at the Turso dashboard (**https://app.turso.tech**). If it asks for an organization, accept the default personal one.
3. Click **Databases** in the left menu, then **Create Database**.
4. Fill in:
   * **Name:** `fundwapp`
   * **Group / Location:** the region closest to Nairobi (for example Frankfurt or another European region). If it asks for a group, keep the default.
5. Click **Create Database**, then click `fundwapp` to open it.
6. Copy the **Database URL**. It starts with `libsql://`. Save it in your notes as **DATABASE_URL**.
7. On the same page click **Generate Token** (or **Create Token**). Choose **Full Access** and expiration **Never**, create it, and **copy the token at once** (it is shown only once). Save it as **DATABASE_AUTH_TOKEN**.
   * Use the token made **inside the database page**, not a "platform API token" from account settings.
8. You do **not** create tables. Fundwapp builds them automatically the first time it starts.

## Part 2. Free email for verification codes (Brevo)
New users must enter a code to verify their account. The free setup sends it **by email**, so users must type their email when registering.
1. Sign up at **https://www.brevo.com** and confirm your email.
2. Top-right account menu > **SMTP & API** > **SMTP** tab > **Generate a new SMTP key**. Name it `fundwapp`, copy the key and save it as **SMTP_PASS**.
3. On that page copy your **SMTP login** (usually your Brevo email) and save it as **SMTP_USER**.
4. Go to **Senders, Domains & Dedicated IPs > Senders > Add a sender**, add the address the codes should come from and confirm it from Brevo's email. Save it as **EMAIL_FROM** written like `Fundwapp <that-address@example.com>`.
5. Fixed value: **SMTP_HOST** = `smtp-relay.brevo.com`.

*Gmail instead?* Turn on 2-Step Verification, make an App Password at https://myaccount.google.com/apppasswords, then use `SMTP_HOST=smtp.gmail.com`, `SMTP_USER=<your gmail>`, `SMTP_PASS=<the app password>`, `EMAIL_FROM=Fundwapp <your gmail>`.

## Part 3. Put the code on GitHub
1. Unzip `Fundwapp.zip`. You get a folder `fundwapp`.
2. Sign in at **https://github.com**, click **+** > **New repository**. Name `fundwapp`, choose **Private**, leave the README options unticked, click **Create repository**.
3. On the empty repository page click **uploading an existing file**.
4. Open the unzipped folder, select **everything inside it** (folders `db`, `public`, `scripts`, `src` and files `package.json`, `render.yaml`, `README.md`, …) and drag it into the GitHub page. There are about 80 files, below GitHub's 100-file limit.
   * `.gitignore` and `.env.example` are hidden files (Mac: press Cmd+Shift+. in Finder). They are optional.
   * Never upload a file named `.env`.
5. When the upload finishes click **Commit changes**.
6. Check the repository's top level shows `src`, `public`, `db`, `scripts`, `package.json`, `render.yaml`. If they sit inside an extra `fundwapp` folder, delete the repository and upload again from inside the folder.

## Part 4. Deploy on Render (Free plan)
1. Go to **https://render.com** and sign up with **Sign in with GitHub**.
2. Click **New +** > **Blueprint**.
3. Connect your GitHub account if asked, choose the `fundwapp` repository, click **Connect**.
4. Render reads `render.yaml` and shows one service on the **Free** plan. Fill in the empty values from your notes (there are no M-Pesa values to enter):

   | Setting | What to enter |
   |---|---|
   | `DATABASE_URL` | the `libsql://…` URL from Part 1 |
   | `DATABASE_AUTH_TOKEN` | the Turso token from Part 1 |
   | `ADMIN_FULL_NAME` | your name |
   | `ADMIN_PHONE` | your phone, e.g. `0712345678` |
   | `ADMIN_PASSWORD` | a strong password, 8+ characters (your admin login) |
   | `EMAIL_FROM` | from Part 2 |
   | `SMTP_HOST` | `smtp-relay.brevo.com` |
   | `SMTP_USER` | from Part 2 |
   | `SMTP_PASS` | from Part 2 |

   Render creates the two secrets (`JWT_ACCESS_SECRET`, `PAYMENT_CALLBACK_SECRET`) itself. The blueprint already sets `PAYMENT_MODE=sandbox`, `NODE_ENV=production`, `TRUST_PROXY=true`, `APP_TIMEZONE=Africa/Nairobi`, `CURRENCY_CODE=KES`, `SMS_PROVIDER=console` and `EMAIL_PROVIDER=smtp`.
5. Click **Apply** (or **Deploy Blueprint**). Render may ask for a payment card to verify your account; free services are not charged.
6. Open the service and watch **Logs** (3-6 minutes). Success looks like:
   * `Applied 2 migration(s)`
   * `Seeded reference data`
   * `Admin created: <your name>`
   * `Fundwapp listening on https://fundwapp-xxxx.onrender.com`
7. Your public address is at the top of the service page. You do **not** need `APP_BASE_URL`; the app uses this address automatically.

*Creating the service by hand instead of a Blueprint:* **New + > Web Service**, pick the repository, **Language** `Node`, **Build Command** `npm install`, **Start Command** `npm run db:setup && node scripts/create-admin.js --if-missing && npm start`, **Instance Type** `Free`, **Health Check Path** `/api/health`, and add under **Environment**: all values in the table above plus `NODE_VERSION=22`, `NODE_ENV=production`, `TRUST_PROXY=true`, `APP_TIMEZONE=Africa/Nairobi`, `CURRENCY_CODE=KES`, `DEFAULT_COUNTRY_CALLING_CODE=254`, `PAYMENT_MODE=sandbox`, `SMS_PROVIDER=console`, `EMAIL_PROVIDER=smtp`, `SMTP_PORT=587`, and **Generate** for `JWT_ACCESS_SECRET` and `PAYMENT_CALLBACK_SECRET`.

## Part 5. First checks
1. Visit `https://<your-site>/api/health`. Expect `{"status":"ok", …}`.
2. Visit `https://<your-site>/admin` and sign in with `ADMIN_PHONE` and `ADMIN_PASSWORD`. You should see the yellow demo banner.
3. In Render > your service > **Environment**, **delete `ADMIN_PASSWORD`**. The admin already exists, so it is no longer needed.
4. In Turso, open your database > **Edit Data**. You should see tables such as `users`, `fundraisers`, `contributions`.

If the site does not start, read the red lines in the Render **Logs** and use the Troubleshooting table at the end.

## Part 6. Walk through the whole system (your demo script)
Do this once to confirm everything works. Use a normal browser window for the organizer and a private window for the admin, or sign out between roles.

1. **Register an organizer.** On the home page click **Start a fundraiser** > fill the form, **choose "I want to start fundraisers"**, and **type an email**. A verification code arrives by email (check spam). Enter it. You are signed in.
2. **Create a fundraiser.** Dashboard > **New fundraiser**: title, category, story (30+ characters), goal (at least 1,000), start today, end in 30 days, **no cover photo**. It is created as **Pending**.
3. **Approve it as admin.** Open `/admin` > **Fundraisers** > **Approve**. The organizer receives an email.
4. **Contribute.** Open the fundraiser's public page (Dashboard > fundraiser > **Open public page**, or the share link). Enter an amount (whole shillings, M-Pesa style), a name and any phone number, choose **M-Pesa**, press **Continue to payment**.
5. **Simulate the phone.** The yellow box offers **Approve / Decline / Cancel**.
   * Press **Approve**: the page says "Thank you", and the total, progress band and supporter list update within seconds, even on a second open browser tab.
   * Press **Decline** on another attempt: it fails and **no contribution is recorded**.
6. **Check the admin view.** `/admin` > **Transactions** shows both attempts (one succeeded, one failed). **Overview** shows totals.
7. **Withdraw.** As the organizer open the fundraiser > **Payouts** > request an amount up to the available balance. As admin go to **Withdrawals** > **Approve**. The row becomes **completed** with an `SBX-…` reference (simulated, no money moves).
8. **Share.** The fundraiser page has a copyable link, a WhatsApp button and a QR code.

## Part 7. Keep the free app awake (UptimeRobot)
1. Sign up at **https://uptimerobot.com** (free).
2. **Add New Monitor**: type **HTTP(s)**, name `Fundwapp`, URL `https://<your-site>/api/health`, interval **5 minutes**. Save.
3. The app now stays awake and its background jobs keep running. A free Render account has 750 running hours a month, enough for one service all month.

## Part 8. Changing things later
* **Change the code:** open a file in your GitHub repo, click the pencil icon, edit, **Commit changes**. Render redeploys by itself.
* **Change rules without code:** `/admin` > **Settings** (approval required, minimum goal, withdrawal minimum, platform fee, flag limits, quick-pick amounts, categories).
* **Add another admin:** register the person, then `/admin` > **Users** > **Make admin**.
* **Backups:** in Turso, open the database and use its export/backup option, or ask Turso support for point-in-time recovery on paid plans.

## Part 9. Later: switch on real M-Pesa (optional)
You do this only when you are ready. Nothing else changes.

### 9A. Safaricom Daraja sandbox (free testing with Safaricom's test environment)
1. Sign up at **https://developer.safaricom.co.ke**, confirm your email and log in.
2. **My Apps > Add a new app**. Name it `Fundwapp` (no "mpesa" or "safaricom" in the name). Tick **Lipa Na M-Pesa Sandbox** (and **M-Pesa Sandbox** if shown). Create the app.
3. Open the app and copy the **Consumer Key** and **Consumer Secret**.
4. In **APIs > M-Pesa Express (Lipa Na M-Pesa Online) > Simulate** copy the test **Business Short Code** (`174379`) and the **Passkey**, and note the test phone number.
5. In Render > **Environment** set:
   | Key | Value |
   |---|---|
   | `PAYMENT_MODE` | `live` |
   | `MPESA_ENV` | `sandbox` |
   | `MPESA_CONSUMER_KEY` | your Consumer Key |
   | `MPESA_CONSUMER_SECRET` | your Consumer Secret |
   | `MPESA_SHORTCODE` | `174379` |
   | `MPESA_PASSKEY` | the test passkey |
   | `MPESA_TRANSACTION_TYPE` | `CustomerPayBillOnline` |
   Save; Render redeploys. The demo banner disappears and the payment screen no longer shows simulator buttons.
6. Pay on a fundraiser with the Daraja test phone number. **Admin > Transactions** shows the attempt and Safaricom's answer. If it fails, the Render Logs contain `M-Pesa STK push rejected` and the reason. The Daraja sandbox does not prompt real phones and its callbacks can be unreliable; Fundwapp asks Safaricom directly after about 15 seconds.
7. To go back to the simulator at any time, set `PAYMENT_MODE=sandbox`.

### 9B. Real money (production)
Real money requires things only Safaricom can provide and is **not free**:
1. A **Paybill or Till** registered to your business or organization (from Safaricom or an M-Pesa agent/shop).
2. **Daraja Go Live**: in the Daraja portal use the **Go Live** option and follow the wizard. Safaricom then issues your production passkey and enables production for your app (the portal's Support page lists the current contact).
3. In Render > **Environment** set:
   | Key | Value |
   |---|---|
   | `PAYMENT_MODE` | `live` |
   | `MPESA_ENV` | `production` |
   | `MPESA_CONSUMER_KEY` / `MPESA_CONSUMER_SECRET` | the production app's key and secret |
   | `MPESA_SHORTCODE` | your production shortcode (for a **Till**: the head-office shortcode Safaricom gives you) |
   | `MPESA_PARTY_B` | **Till only:** your Till number (Paybill: leave unset) |
   | `MPESA_TRANSACTION_TYPE` | `CustomerPayBillOnline` (Paybill) or `CustomerBuyGoodsOnline` (Till) |
   | `MPESA_PASSKEY` | the production passkey |
4. **Upgrade Render to Starter** (always on, so Safaricom's callbacks never reach a sleeping app): Render > service > **Settings > Instance Type > Starter**. Remove the UptimeRobot monitor.
5. **Automatic payouts (optional):** after Safaricom enables B2C for you, add `MPESA_INITIATOR_NAME`, `MPESA_B2C_SHORTCODE`, `MPESA_SECURITY_CREDENTIAL` (the initiator password encrypted with Safaricom's certificate; whoever has `openssl` can make it):
   ```
   openssl x509 -pubkey -noout -in ProductionCertificate.cer > pub.pem
   printf '%s' 'INITIATOR_PASSWORD' | openssl pkeyutl -encrypt -pubin -inkey pub.pem -pkeyopt rsa_padding_mode:pkcs1 | base64 -w0
   ```
   Until then, when the admin approves a withdrawal the payout shows `failed` with "M-Pesa B2C is not configured". Send the money yourself from your M-Pesa app to the number on the row, then click **Mark paid** and enter the receipt code.
6. Make a real KES 10 contribution, confirm it in **Admin > Transactions**, and check your M-Pesa balance.

## Part 10. Optional: SMS codes instead of email (Twilio, not free after trial)
1. Sign up at **https://www.twilio.com/try-twilio**, verify your email and your Kenyan phone.
2. On the Console home page copy the **Account SID** (starts `AC`) and **Auth Token**; click **Get a trial phone number** and copy it as `+1XXXXXXXXXX`.
3. **Messaging > Settings > Geo permissions**: tick **Kenya**, save.
4. Trial accounts can text only verified numbers: **Phone Numbers > Manage > Verified Caller IDs > Add a new Caller ID**.
5. In Render > **Environment** set `SMS_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`. Save and wait for the redeploy.
6. Errors: `21608` number not verified (trial), `21408` Kenya not enabled, `20003` wrong SID or token. Vonage also works (`SMS_PROVIDER=vonage`, `VONAGE_API_KEY`, `VONAGE_API_SECRET`, `VONAGE_FROM`).

---

## Troubleshooting
| Symptom | Cause and fix |
|---|---|
| Deploy fails with `Missing required environment variable …` | Add that variable in Render > Environment. |
| Logs show a database error | `DATABASE_URL` or `DATABASE_AUTH_TOKEN` is wrong. Create a new token **inside the database page** in Turso and paste it again. |
| The site takes a minute to open | It was asleep. Set up Part 7. |
| No verification email | Wrong SMTP values, sender not confirmed in Brevo, or the user left the email box empty. Check the Render Logs and the spam folder. |
| Admin cannot sign in | Check `ADMIN_PHONE` is typed the way you sign in. The admin is only created if it does not exist yet; to start over use a different phone number and re-add the three `ADMIN_*` variables. |
| Payment screen has no Approve/Decline buttons | `PAYMENT_MODE` is not `sandbox`. Set it to `sandbox` in Render. |
| Contribution refused: "only accepts whole amounts" | M-Pesa amounts must be whole shillings (no cents). |
| "This fundraiser is not accepting contributions" | It is still Pending, ended, or paused. Approve it in Admin > Fundraisers and check its dates. |
| Cover photos disappear | The free disk is erased on restart. Do not use cover photos on the free plan. |
| Everyone shares one rate limit | `TRUST_PROXY` is not `true`. |
| `Invalid CallBackURL` (after enabling M-Pesa) | The Render address contains "mpesa" or "safaricom". Rename the service or use another domain. |

## Appendix. Every setting and where it comes from (demo setup)
| Setting | Value | Source |
|---|---|---|
| `DATABASE_URL`, `DATABASE_AUTH_TOKEN` | `libsql://…` and token | Turso, Part 1 |
| `ADMIN_FULL_NAME`, `ADMIN_PHONE`, `ADMIN_PASSWORD` | your choice | You, Part 4 (delete the password afterwards) |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | Brevo values | Part 2 |
| `PAYMENT_MODE` | `sandbox` (demo) or `live` (Safaricom) | Part 4 and Part 9 |
| `JWT_ACCESS_SECRET`, `PAYMENT_CALLBACK_SECRET` | generated | Render, automatic |
| `NODE_ENV`, `TRUST_PROXY`, `APP_TIMEZONE`, `CURRENCY_CODE`, `DEFAULT_COUNTRY_CALLING_CODE`, `SMS_PROVIDER`, `EMAIL_PROVIDER` | fixed values | `render.yaml` |
| `MPESA_*` | not needed in demo mode | Part 9 |

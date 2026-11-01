# Fundwapp Deployment Guide (live now, simple sign-up, no M-Pesa needed)

Deploy Fundwapp today on **Render + Turso**, entirely in your web browser, with:
* **Simple sign-up and login**: a person enters their name, phone number and a password and is signed in immediately. **No verification codes** by SMS or email.
* **No M-Pesa needed**: payments run on Fundwapp's built-in demo simulator. You can switch real M-Pesa on later (Part 9).

**What you will have at the end:** a public `https://….onrender.com` website where people sign up, organizers create fundraisers, an admin approves them, contributors "pay" and totals update live, and organizers request withdrawals that the admin approves. Everything is stored in a Turso database. A yellow banner on every page says **Demo mode: payments are simulated**.

---

## Part 0. Read this first

### What "simple sign-up" means
* Sign-up asks for **full name, phone number, password** (email is optional) and signs the person in at once.
* The phone number is the person's **username** for signing in.
* **There is no "forgot password by code".** If someone forgets their password, the administrator creates a temporary one for them (**Admin > Users > Reset password**, Part 7). This is safer than codes without a working SMS/email service.
* Two-step sign-in (2FA) is not available while codes are off.
* You can turn codes back on any time in **Admin > Settings > `require_verification`** (it needs working SMS or email).

### What "without M-Pesa" means
| Works fully | Simulated |
|---|---|
| Sign-up, login, fundraisers, admin approval, public pages, QR codes, live totals, updates | The M-Pesa payment itself: the payment screen shows **Approve / Decline / Cancel** buttons instead of a phone prompt |
| Contributions, receipts, flags, reconciliation, admin portal, audit log | Withdrawal payouts: when the admin approves, the payout is marked paid with a fake `SBX-…` reference and **no money moves** |

**No real money is collected or sent in this mode.** Anyone who opens a payment screen can press Approve, so do not use this setup to collect real donations. It is perfect for demos, classes, user testing and a staging site.

### Costs and limits
| Service | Used for | Cost |
|---|---|---|
| Render (Free web service) | Hosts the app | Free |
| Turso (Starter plan) | Database | Free, no card |
| GitHub (private repo) | Holds the code Render deploys | Free |
| UptimeRobot | Keeps the free app awake | Free |

Free Render limits: the app **sleeps after about 15 minutes with no visitors** (the next visit takes 30-60 seconds; Part 6 fixes this), and its disk is **erased on every restart**, so **do not use cover photos** (your data is safe because it lives in Turso).

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

## Part 2. Put the code on GitHub
1. Unzip `Fundwapp.zip`. You get a folder `fundwapp`.
2. Sign in at **https://github.com**, click **+** > **New repository**. Name `fundwapp`, choose **Private**, leave the README options unticked, click **Create repository**.
3. On the empty repository page click **uploading an existing file**.
4. Open the unzipped folder, select **everything inside it** (folders `db`, `public`, `scripts`, `src` and files `package.json`, `render.yaml`, `README.md`, …) and drag it into the GitHub page. There are about 80 files, below GitHub's 100-file limit.
   * `.gitignore` and `.env.example` are hidden files (Mac: press Cmd+Shift+. in Finder). They are optional.
   * Never upload a file named `.env`.
5. When the upload finishes click **Commit changes**.
6. Check the repository's top level shows `src`, `public`, `db`, `scripts`, `package.json`, `render.yaml`. If they sit inside an extra `fundwapp` folder, either delete the repository and upload again from inside the folder, or set **Root Directory** in Render (see Troubleshooting).

**Already deployed an earlier version?** Upload the new files the same way (same-named files are replaced) and commit. Render redeploys by itself. Your existing database and users are kept; the new setting is added automatically, and people who never completed a code can now sign in with their password.

## Part 3. Deploy on Render (Free plan)
1. Go to **https://render.com** and sign up with **Sign in with GitHub**.
2. Click **New +** > **Blueprint**.
3. Connect your GitHub account if asked, choose the `fundwapp` repository, click **Connect**.
4. Render reads `render.yaml` and shows one service on the **Free** plan. Fill in the empty values from your notes. Only five are needed:

   | Setting | What to enter |
   |---|---|
   | `DATABASE_URL` | the `libsql://…` URL from Part 1 |
   | `DATABASE_AUTH_TOKEN` | the Turso token from Part 1 |
   | `ADMIN_FULL_NAME` | your name |
   | `ADMIN_PHONE` | your phone, e.g. `0712345678` (this is your admin username) |
   | `ADMIN_PASSWORD` | a strong password, 8+ characters (your admin login) |

   Render creates the two secrets (`JWT_ACCESS_SECRET`, `PAYMENT_CALLBACK_SECRET`) itself. The blueprint already sets `PAYMENT_MODE=sandbox`, `NODE_ENV=production`, `TRUST_PROXY=true`, `APP_TIMEZONE=Africa/Nairobi`, `CURRENCY_CODE=KES`, `SMS_PROVIDER=console` and `EMAIL_PROVIDER=console`. No email or SMS accounts are needed.
5. Click **Apply** (or **Deploy Blueprint**). Render may ask for a payment card to verify your account; free services are not charged.
6. Open the service and watch **Logs** (3-6 minutes). Success looks like:
   * `Applied 2 migration(s)`
   * `Seeded reference data`
   * `Admin created: <your name>`
   * `Fundwapp listening on https://fundwapp-xxxx.onrender.com`
7. Your public address is at the top of the service page. You do **not** need `APP_BASE_URL`; the app uses this address automatically.

### 3B. Creating the service by hand (if you did not use a Blueprint)
Use this if you chose **New + > Web Service**. Nothing works until **every** variable below exists, because the app refuses to start without them (the log says `Missing required environment variables: …`).

**Settings tab**
| Field | Value |
|---|---|
| Language | `Node` |
| Branch | `main` |
| Root Directory | leave **empty** if `package.json` is at the top of your repo; otherwise the folder name, e.g. `fundwapp` |
| Build Command | `npm install` |
| Start Command | `npm run db:setup && node scripts/create-admin.js --if-missing && npm start` |
| Instance Type | `Free` |
| Health Check Path | `/api/health` |

**Environment tab > Add Environment Variable.** Add each row (Key on the left, Value on the right), then click **Save changes** once at the end:
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
| `PAYMENT_MODE` | `sandbox` |
| `SMS_PROVIDER` | `console` |
| `EMAIL_PROVIDER` | `console` |
| `DATABASE_URL` | your `libsql://…` URL from Part 1 |
| `DATABASE_AUTH_TOKEN` | your Turso token from Part 1 |
| `ADMIN_FULL_NAME` | your name |
| `ADMIN_PHONE` | your phone, e.g. `0712345678` |
| `ADMIN_PASSWORD` | a strong password, 8+ characters |
| `JWT_ACCESS_SECRET` | a secret of **32 or more characters** (see below) |
| `PAYMENT_CALLBACK_SECRET` | a secret of **20 or more characters** (see below) |

**The two secrets.** In the Value box click **Generate** if Render shows that button. If not, make your own: use your browser's or phone's password generator ("suggest strong password") with **40 characters**, letters and numbers only, and paste it. Use a *different* value for each secret. Keep both in your notes file; never share them. You do **not** need to set `APP_BASE_URL`; Render provides your address automatically.

After saving, Render redeploys on its own (or click **Manual Deploy > Deploy latest commit**).

## Part 4. First checks
1. Visit `https://<your-site>/api/health`. Expect `{"status":"ok", …}`.
2. Visit `https://<your-site>/admin` and sign in with `ADMIN_PHONE` and `ADMIN_PASSWORD`. You should see the yellow demo banner.
3. In Render > your service > **Environment**, **delete `ADMIN_PASSWORD`**. The admin already exists, so it is no longer needed.
4. In Turso, open your database > **Edit Data**. You should see tables such as `users`, `fundraisers`, `contributions`.

## Part 5. Walk through the whole system (your demo script)
Use a normal browser window for the organizer and a private window for the admin, or sign out between roles.

1. **Sign up as an organizer.** Home page > **Start a fundraiser** > enter name, phone number and password, choose **"I want to start fundraisers"** > **Create account**. You are signed in straight away.
2. **Create a fundraiser.** Dashboard > **New fundraiser**: title, category, story (30+ characters), goal (at least 1,000), start today, end in 30 days, **no cover photo**. It is created as **Pending**.
3. **Approve it as admin.** Open `/admin` > **Fundraisers** > **Approve**.
4. **Contribute.** Open the fundraiser's public page (Dashboard > fundraiser > **Open public page**, or the share link). Enter a whole-shilling amount, a name and any phone number, choose **M-Pesa**, press **Continue to payment**.
5. **Simulate the phone.** The yellow box offers **Approve / Decline / Cancel**.
   * **Approve**: the page says "Thank you", and the total, progress band and supporter list update within seconds (also on a second open tab).
   * **Decline** on another attempt: it fails and **no contribution is recorded**.
6. **Check the admin view.** `/admin` > **Transactions** shows both attempts. **Overview** shows totals.
7. **Withdraw.** As the organizer open the fundraiser > **Payouts** > request an amount up to the available balance. As admin go to **Withdrawals** > **Approve**. The row becomes **completed** with an `SBX-…` reference (simulated, no money moves).
8. **Share.** The fundraiser page has a copyable link, a WhatsApp button and a QR code.

## Part 6. Keep the free app awake (UptimeRobot)
1. Sign up at **https://uptimerobot.com** (free).
2. **Add New Monitor**: type **HTTP(s)**, name `Fundwapp`, URL `https://<your-site>/api/health`, interval **5 minutes**. Save.
3. The app now stays awake and its background jobs keep running. A free Render account has 750 running hours a month, enough for one service all month.

## Part 7. Running it day to day
* **Someone forgot their password:** `/admin` > **Users** > search their phone > **Reset password** > confirm. A box shows a **temporary password** (copy it now; it is shown only once). Give it to the person privately. They sign in with it and change it under **Account > Password**. The reset signs them out everywhere.
* **Add another admin:** the person signs up normally, then `/admin` > **Users** > **Make admin**.
* **Suspend someone:** `/admin` > **Users** > **Suspend**.
* **Change rules without code:** `/admin` > **Settings** (approval required, minimum goal, withdrawal minimum, platform fee, flag limits, quick-pick amounts, categories, `require_verification`).
* **Change the code:** open a file in your GitHub repo, click the pencil icon, edit, **Commit changes**. Render redeploys by itself.

## Part 8. Optional: real email notifications (Gmail)
Not needed for sign-up. Do this only if you want organizers and contributors to receive emails (fundraiser approved, contribution received, receipts, withdrawal updates), or if you later turn `require_verification` on.

> Render's **free** plan blocks the usual email (SMTP) ports (25, 465, 587), so Fundwapp sends through the **Gmail API over HTTPS**.

**A. Google Cloud project.** At **https://console.cloud.google.com** (signed in with the Gmail that will send) create a project `fundwapp-mail`, then **APIs & Services > Library > Gmail API > Enable**.
**B. Consent screen.** **OAuth consent screen** (or **Google Auth Platform**): app name `Fundwapp`, your Gmail as support and contact email, audience **External**. Add the scope `.../auth/gmail.send`. In **Audience** click **Publish app** and confirm (in Testing mode the token dies after 7 days). If you cannot publish, add your Gmail under **Test users**.
**C. OAuth client.** **Credentials > Create credentials > OAuth client ID > Web application**, name `playground`, **Authorized redirect URI** `https://developers.google.com/oauthplayground`. Copy the **Client ID** and **Client secret**.
**D. Refresh token.** Open **https://developers.google.com/oauthplayground**, click the **gear icon**, tick **Use your own OAuth credentials**, paste the Client ID and secret. Paste scope `https://www.googleapis.com/auth/gmail.send`, click **Authorize APIs**, choose your Gmail (if you see "Access blocked … has not completed the Google verification process", publish the app or add yourself as a test user, then retry; if you see "Google hasn't verified this app", click **Advanced > Go to Fundwapp (unsafe)** and Allow). Click **Exchange authorization code for tokens** and copy the **Refresh token** (starts with `1//`).
**E. Render > Environment**, set:
| Key | Value |
|---|---|
| `EMAIL_PROVIDER` | `gmail` |
| `GMAIL_USER` | your Gmail address |
| `EMAIL_FROM` | `Fundwapp <your Gmail address>` |
| `GMAIL_CLIENT_ID` | from step C |
| `GMAIL_CLIENT_SECRET` | from step C |
| `GMAIL_REFRESH_TOKEN` | from step D |
Save. Emails go to people who typed an email at sign-up. If one fails, the Render Logs show `Notification … failed Error: …`. `invalid_grant` means the token expired (publish the app and repeat step D); `invalid_client` means a wrong Client ID/secret; `insufficient authentication scopes` means the token was made without `gmail.send`.

## Part 9. Later: switch on real M-Pesa (optional)
Nothing else changes when you do this.

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
2. **Daraja Go Live**: in the Daraja portal use the **Go Live** option and follow the wizard. Safaricom then issues your production passkey and enables production for your app.
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
7. **Before real money, consider turning `require_verification` on** (needs working email or SMS, Part 8 or Twilio): it stops people creating accounts with other people's phone numbers.

---

## Troubleshooting
| Symptom | Cause and fix |
|---|---|
| Build fails: `npm error enoent Could not read package.json … /opt/render/project/src/package.json` | Render cannot see `package.json` at the top of your repository. Open the repo on GitHub: if the top level shows a single folder (for example `fundwapp`) instead of `package.json`, go to Render > your service > **Settings > Build & Deploy > Root Directory**, type that folder's name, **Save Changes**, then **Manual Deploy > Clear build cache & deploy**. If `package.json` is missing, upload it (**Add file > Upload files**). Do not upload the `.zip` itself. |
| Deploy fails with `Missing required environment variables: …` | The log lists **every** variable that is missing. Add them all in Render > your service > **Environment** (the full table is in Part 3B), click **Save changes**, and let it redeploy. If the list includes `JWT_ACCESS_SECRET` or `PAYMENT_CALLBACK_SECRET`, create them as described under "The two secrets" in Part 3B. |
| Logs show a database error | `DATABASE_URL` or `DATABASE_AUTH_TOKEN` is wrong. Create a new token **inside the database page** in Turso and paste it again. |
| The site takes a minute to open | It was asleep. Set up Part 6. |
| "An account with this phone number already exists" | That number is registered. Sign in instead, or ask the admin to reset the password. |
| Cannot sign in | Check the phone number is the one used at sign-up (spaces and `0712…` / `+254712…` are all fine) and the password is right. Admin: **Users > Reset password**. |
| Admin cannot sign in | Check `ADMIN_PHONE` is typed the way you sign in. The admin is only created if it does not exist yet; to start over use a different phone number and re-add the three `ADMIN_*` variables. |
| Users are asked for a verification code | `require_verification` is on. Turn it off in **Admin > Settings**. |
| Payment screen has no Approve/Decline buttons | `PAYMENT_MODE` is not `sandbox`. Set it to `sandbox` in Render. |
| Contribution refused: "only accepts whole amounts" | M-Pesa amounts must be whole shillings (no cents). |
| "This fundraiser is not accepting contributions" | It is still Pending, ended, or paused. Approve it in Admin > Fundraisers and check its dates. |
| Cover photos disappear | The free disk is erased on restart. Do not use cover photos on the free plan. |
| Everyone shares one rate limit | `TRUST_PROXY` is not `true`. |
| `Invalid CallBackURL` (after enabling M-Pesa) | The Render address contains "mpesa" or "safaricom". Rename the service or use another domain. |

## Appendix. Every setting and where it comes from (this setup)
| Setting | Value | Source |
|---|---|---|
| `DATABASE_URL`, `DATABASE_AUTH_TOKEN` | `libsql://…` and token | Turso, Part 1 |
| `ADMIN_FULL_NAME`, `ADMIN_PHONE`, `ADMIN_PASSWORD` | your choice | You, Part 3 (delete the password afterwards) |
| `PAYMENT_MODE` | `sandbox` (demo) or `live` (Safaricom) | Part 3 and Part 9 |
| `JWT_ACCESS_SECRET`, `PAYMENT_CALLBACK_SECRET` | generated | Render, automatic |
| `NODE_ENV`, `TRUST_PROXY`, `APP_TIMEZONE`, `CURRENCY_CODE`, `DEFAULT_COUNTRY_CALLING_CODE`, `SMS_PROVIDER`, `EMAIL_PROVIDER` | fixed values (`console`, `console`) | `render.yaml` |
| `require_verification` | off (a setting inside the app) | Admin > Settings |
| `GMAIL_*`, `EMAIL_FROM` | optional real emails | Part 8 |
| `MPESA_*` | not needed in demo mode | Part 9 |

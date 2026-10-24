# Deploying Tressa to Railway

Same setup as Xymber: one Railway project with three services (Postgres, `api`, `web`) in the same region.
Use a **separate** Railway project, GitHub repo and domain from Xymber so the two brands never share data.

```
client's phone ──► https://yourdomain ──► web (Next.js) ──► api (FastAPI, private) ──► Postgres
```

## 1. Put the code on GitHub (5 min)

```bash
unzip tressa.zip && cd tressa
git init && git add . && git commit -m "Tressa salon app"
gh repo create tressa --private --source=. --push
```

## 2. Create the Railway project (5 min)

1. railway.com → **New Project → Empty Project**. Name it `Tressa`.
2. **Create → Database → Add PostgreSQL**. Keep the name `Postgres`.
3. **Create → GitHub Repo → tressa**. Rename the service `api`.
4. **Create → GitHub Repo → tressa** again. Rename it `web`.
5. For all three: **Settings → Deploy → Region → EU West (Amsterdam)** (closest to the UAE).

## 3. Configure `web`

| Setting | Value |
|---|---|
| Source → Root Directory | `/frontend` |
| Config-as-code → Railway Config File | `/frontend/railway.toml` |
| Networking → Generate Domain | port `3000` |

Variables:

```
PORT=3000
API_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:8000
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
NEXT_PUBLIC_BRAND_NAME=Tressa
NEXT_PUBLIC_CONTACT_EMAIL=hello@yourdomain.com
NEXT_PUBLIC_SUPPORT_WHATSAPP=9715XXXXXXXX
NEXT_PUBLIC_PRICE_AED=
```

## 4. Configure `api`

| Setting | Value |
|---|---|
| Source → Root Directory | `/backend` |
| Config-as-code → Railway Config File | `/backend/railway.toml` |
| Networking | **Do not** generate a domain |

Make a secret: `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`, then Variables:

```
PORT=8000
DATABASE_URL=${{Postgres.DATABASE_URL}}
APP_URL=https://yourdomain.com
CORS_ORIGINS=https://yourdomain.com
JWT_SECRET=<your secret>
BRAND_NAME=Tressa
ADMIN_EMAILS=<the email you'll sign up with>
EMAIL_FROM=Tressa <no-reply@yourdomain.com>
RESEND_API_KEY=
```

`APP_URL` is what link pages, booking confirmations, quote links and QR codes use, so set it to the real domain from the start.

## 5. Deploy and check

Click **Deploy**. The `api` log should show `Running upgrade  -> 0001_initial, initial salon schema`, then `Uvicorn running`.
`web` should show `Ready`.

Then on your domain:
1. `/signup` → create your own salon. Your link page is ready at `/your-salon-name` straight away.
2. **Link page** → add your bio and Instagram, pick a colour and animation, and open the page on your phone.
3. **Settings → Service menu** → tap "Add all" for the starter menu, then fix the prices.
4. **Team** → add yourself and your stylists. **Appointments** → book a test client and send the WhatsApp confirmation.

Demo data is for your laptop, not production: `python -m app.seed` locally gives you `demo@tressa.app` / `demo12345`
and a demo link page at `/layla-beauty`.

## 6. Domain (Cloudflare, as with Xymber)

Railway needs a CNAME at the bare domain, so put the domain's DNS on Cloudflare (free):
1. Cloudflare → Add a domain → Free plan. Copy the two nameservers into your registrar (GoDaddy → DNS → Nameservers).
2. Railway → `web` → Networking → Custom domain → `yourdomain.com` (port 3000). Add the CNAME (DNS only, grey cloud)
   and the `_railway-verify` TXT record it shows into Cloudflare.
3. Add `www` the same way if you want it. Anyone opening `www.` or `app.` is redirected to the main address.

## Updating an existing deployment

Push the new code. The `api` service runs database migrations on start, so the log shows
`Running upgrade 0001_initial -> 0002_booking`. That adds campaigns, inventory, opening hours, booking status
and the link-page switch. Existing data is kept, and quotes already accepted are marked
"booked" (if they have an appointment) or "awaiting booking".

This update adds `0003_whatsapp` and `0004_social` (social accounts and campaign posts). It also adds
`pillow`, `cryptography` and `imageio-ffmpeg` to the api, installed automatically on deploy.
The WhatsApp part (`0003_whatsapp`) adds (a log of incoming WhatsApp messages and
delivery ticks). Nothing changes until you add the WhatsApp variables (see below).

After this update the **link page is off for every salon** until you switch it on in **Admin → the salon → Features**.

## Posting campaigns to Facebook, Instagram and YouTube

Each salon connects **its own** Facebook Page, Instagram and YouTube channel once (Settings → Social media), then
posts a campaign from **Quotes → Campaigns → Post to social** in one tap:

- **Facebook:** a photo post on the Page with the caption. The offer link in the caption can be tapped.
- **Instagram:** a feed post. Instagram doesn't let links in captions be tapped, so the picture carries a
  **QR code** and the caption says "Scan the code in the picture".
- **YouTube:** an 8-second vertical video (a **Short**) made from the offer, with the offer link in the description.

The picture (feed 4:5, square, story 9:16) and the video are made automatically from the campaign: title, price,
"was" price, end date and the QR code. They can also be downloaded for TikTok, Snapchat, WhatsApp status or ads.
Clients who tap or scan land on the offer page, where they **accept and book a free time** (as before).
When the offer link is shared anywhere, the preview shows the offer picture.

You set this up **once for the whole platform**: one Meta app and one Google project. Salons only press **Connect**.
Until you do, Settings shows "Not available yet" and everything else keeps working.

### A. Meta app (Facebook + Instagram)

1. **developers.facebook.com → My Apps → Create app.** Use case: **Other** → type **Business** → connect your Business portfolio.
2. **Add product → Facebook Login for Business.** In its **Settings**, add this to **Valid OAuth Redirect URIs**:
   `https://brisk-web-production.up.railway.app/api/social/meta/callback`
   (use your own web domain; add both if you later move to a custom domain).
3. **App settings → Basic:** fill in the Privacy Policy URL (`https://<web domain>/privacy`), Terms URL (`/terms`),
   app icon and category. Copy **App ID** and **App secret**.
4. Railway → **api** service → Variables:
   ```
   META_APP_ID=<App ID>
   META_APP_SECRET=<App secret>
   ```
5. **Testing (works straight away):** in **App roles → Roles**, add the Facebook accounts of salons you want to test with
   as **Testers** (they accept the invite at developers.facebook.com). While the app is in Development mode, only
   people with a role can connect.
6. **For every salon (App Review):** **App Review → Permissions and features**, request:
   `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `business_management`,
   `instagram_basic`, `instagram_content_publish`. Meta asks for a short screen recording of the flow
   (Settings → Connect → choose Page → Post to social) and **Business verification**. Then switch the app to **Live**.

Requirements for each salon:
- a **Facebook Page** for the salon, and they must be an admin of it;
- an **Instagram Business or Creator account linked to that Page** (Instagram app → Settings → Account type, then
  Page settings → Linked accounts → Instagram). Personal Instagram accounts can't be posted to by apps.

### B. Google project (YouTube)

1. **console.cloud.google.com** → create a project (e.g. "Brisk").
2. **APIs & Services → Library → YouTube Data API v3 → Enable.**
3. **OAuth consent screen:** External, app name "Brisk", support email, your web domain as authorised domain,
   privacy and terms links. Scopes: `youtube.upload` and `youtube.readonly`.
4. **Credentials → Create credentials → OAuth client ID → Web application.** Authorised redirect URI:
   `https://brisk-web-production.up.railway.app/api/social/google/callback`. Copy the **Client ID** and **Client secret**.
5. Railway → **api** service → Variables:
   ```
   GOOGLE_CLIENT_ID=<Client ID>
   GOOGLE_CLIENT_SECRET=<Client secret>
   ```
6. **Testing:** while the consent screen is in *Testing*, add the salons' Google accounts under **Test users** (up to 100).
7. **For every salon:** press **Publish app**, then submit for **verification** (the upload scope is "sensitive").
   Also apply for the **YouTube API audit** (YouTube API Services → Audit and quota extension form):
   until a project passes it, videos uploaded through the API are **locked as private**. The daily free quota
   allows about 6 uploads a day across the platform at first; the same form asks for more.

### What happens on the server

Pictures are made with the bundled fonts, the video with a bundled ffmpeg (`imageio-ffmpeg`), so no extra Railway
setup. Facebook Page tokens don't expire; YouTube keeps a refresh token. All tokens are stored **encrypted** with a key
from `JWT_SECRET` (changing `JWT_SECRET` means salons reconnect). If a salon removes access, the post shows why
and Settings says "Reconnect".

### If something doesn't work

| What you see | Why / fix |
|---|---|
| "Not available yet" in Settings | `META_APP_ID`/`META_APP_SECRET` or `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` not set on the **api** service. |
| Facebook says "URL blocked" / Google says `redirect_uri_mismatch` | The redirect URI in step A2 / B4 doesn't exactly match your web domain. |
| "No Facebook Page was shared" | On Meta's screen the owner didn't tick their Page. Press Reconnect and tick the Page and its Instagram. |
| Instagram missing after connecting | The Instagram is personal, or not linked to that Page (see requirements). |
| Instagram post fails "couldn't use the picture" | `APP_URL` must be the public web address (Instagram downloads the picture from it). |
| YouTube video is private | The Google project hasn't passed the YouTube API audit yet (step B7). |
| `quotaExceeded` from YouTube | Daily upload quota used up; it resets at midnight Pacific time, or request more. |

## WhatsApp Business API (optional, later phase)

**Without it** everything still works: the app opens WhatsApp on the owner's phone with each message ready
(quotes, confirmations) and they press send. Clients accept and book on the quote web page.

**With it**, from your WhatsApp Business number:
- **Send on WhatsApp** on a quote (or **Send all** on a bulk quote) sends it at once with **Accept** and **Decline** buttons and a **View quote** link.
- The client taps **Accept** → the quote becomes *Accepted* and the chat replies with a list of free days, then free times, plus **Book later**.
- Picking a free time books it → *Accepted · Booking confirmed*, it appears in Appointments, and the confirmation arrives in the chat.
- **Book later** (or the time was just taken and they give up) → *Accepted · Awaiting booking*; it shows on Today for you to arrange.
- Campaigns get an **Accept on WhatsApp** link (offer page, caption, ads). The client presses send on a pre-filled message, the bot creates their accepted quote and offers times.
- The quote shows *Sent / Delivered / Read on WhatsApp*. Typing "accept", "yes" or "book" in the chat also works.

One WhatsApp Business number serves every salon on the platform (each message names the salon).

### Step 1: Meta app and number (about 30 minutes, plus Meta's review)

1. Go to **business.facebook.com** and make sure you have a Business portfolio (your company). Verifying the business
   (Settings → Business info → Start verification, with your trade licence) raises sending limits; you can start without it.
2. Go to **developers.facebook.com** → **My Apps → Create app** → type **Business** → pick your Business portfolio.
3. In the app, **Add product → WhatsApp → Set up**.
4. **WhatsApp → API Setup → Add phone number**. Use a number that is **not** registered in the WhatsApp or WhatsApp
   Business app on a phone (or delete it from the app first). Verify it by SMS or call. Set the display name to your
   brand (Meta reviews it).
5. On the same page copy:
   - **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`
   - the number in international format without `+`, e.g. `971501234567` → `WHATSAPP_BUSINESS_NUMBER`
6. **App settings → Basic → App secret → Show** → `WHATSAPP_APP_SECRET`.

### Step 2: a permanent access token

The token on the API Setup page expires in 24 hours. Make a permanent one:

1. **business.facebook.com → Settings → Users → System users → Add**, name `tressa-api`, role **Admin**.
2. **Assign assets** → Apps → your app → **Full control**. Also **WhatsApp accounts** → your account → **Full control**.
3. **Generate new token** → your app → expiry **Never** → permissions `whatsapp_business_messaging` and
   `whatsapp_business_management` → copy it → `WHATSAPP_TOKEN`.

### Step 3: two message templates

**WhatsApp Manager → Account tools → Message templates → Create template.** Language **English** (`en`).
Names must match exactly.

**1. `booking_confirmed`** — Category **Utility**. Body:
```
Hi {{1}}, your {{2}} is confirmed for {{3}} at {{4}}. See you then!
```
Sample values: `Sara`, `Gel manicure`, `Sat 26 Oct, 4:00 PM`, `Layla Beauty Lounge`.

**2. `quote_offer`** — Category **Utility** (Meta may move it to Marketing; both work, Marketing costs a little more). Body:
```
Hi {{1}}, {{2}} has sent you a quote: {{3}} for {{4}}. Valid until {{5}}. Tap Accept to accept it and book a time.
```
Sample values: `Sara`, `Layla Beauty Lounge`, `Gel manicure`, `AED 94.50`, `31 Oct 2026`.

Buttons, **in this order** (the order matters):
1. **Quick reply** — `Accept`
2. **Quick reply** — `Decline`
3. **Visit website** — text `View quote`, URL type **Dynamic**, URL `https://<your web domain>/q/{{1}}`
   (sample: `https://brisk-web-production.up.railway.app/q/AB12CD34EF`)

Submit both. Approval usually takes minutes, sometimes a day.

### Step 4: variables on the Railway `api` service

```
WHATSAPP_TOKEN=<permanent token from step 2>
WHATSAPP_PHONE_NUMBER_ID=<phone number ID>
WHATSAPP_BUSINESS_NUMBER=971501234567
WHATSAPP_APP_SECRET=<app secret>
WHATSAPP_VERIFY_TOKEN=<any long random text you make up, e.g. tressa-7f3k29xq81>
WHATSAPP_TEMPLATE=booking_confirmed
WHATSAPP_QUOTE_TEMPLATE=quote_offer
WHATSAPP_TEMPLATE_LANG=en
```
Deploy the api. Settings → **WhatsApp** in the app should show three **On**.

### Step 5: the webhook (so button taps reach the app)

1. developers.facebook.com → your app → **WhatsApp → Configuration → Webhook → Edit**.
2. **Callback URL:** `https://<your web domain>/api/whatsapp/webhook`
   e.g. `https://brisk-web-production.up.railway.app/api/whatsapp/webhook` (the web service forwards it to the api).
3. **Verify token:** the same text as `WHATSAPP_VERIFY_TOKEN`. Press **Verify and save**.
4. Under **Webhook fields**, **Subscribe** to `messages`.

### Step 6: test it

1. While the app is in Development mode, add your own mobile under **API Setup → To** as a test recipient.
2. Make a quote for yourself → **Send on WhatsApp**. Tap **Accept**, pick a day and a time.
3. The quote should read *Accepted · Booked*, the booking appears in Appointments, and the confirmation arrives.
4. When it works: app **Dashboard → Publish / switch to Live**, and add a payment method in
   WhatsApp Manager → **Payment settings** (Meta charges per conversation after the free allowance).

### If something doesn't work

| What you see | Why / fix |
|---|---|
| "Verify and save" fails | `WHATSAPP_VERIFY_TOKEN` differs from what you typed in Meta, or the api wasn't redeployed. |
| Quote shows **WhatsApp failed** `132001` | Template name or language doesn't match, or not approved yet. |
| `132000` | The template's variable count differs: `quote_offer` needs 5 body variables and the 3 buttons in order. |
| `131030` | In Development mode you can only send to the test numbers you added. |
| `190` | The token expired: use the system-user token from step 2. |
| Taps do nothing | Webhook not subscribed to `messages`, or `WHATSAPP_APP_SECRET` is wrong (api log says "Bad signature"). |

A failed automatic send never gets lost: it appears on **Today** as a one-tap WhatsApp link from your phone.

## Renaming the brand

The name lives in two variables: `NEXT_PUBLIC_BRAND_NAME` on `web` (website, app, link-page footer) and `BRAND_NAME`
on `api` (emails, messages). Change both and redeploy. Also update `EMAIL_FROM`.
The fallback name in code is in `frontend/lib/site.ts` and `backend/app/config.py`.

## Troubleshooting

| Problem | Fix |
|---|---|
| Link page shows "Page not found" | The address is lower-case letters, numbers and dashes only. Check it in **Link page**. |
| Confirmation links point to the railway.app address | `APP_URL` on `api` must be your domain. Redeploy `api`. |
| Times look an hour off | All times are UAE time (Asia/Dubai) by design, whatever the device clock says. |
| Password reset email doesn't arrive | Without `RESEND_API_KEY`, the reset link is written to the `api` log (search `reset-password?token=`). |

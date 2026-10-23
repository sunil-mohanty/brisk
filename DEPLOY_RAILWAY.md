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

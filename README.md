# Brisk

The booking and client app for salons, barbers, spas and nail studios in the UAE. A sister product to Xymber,
on the same stack, with its own brand, data and deployment.

```
Link page / QR  ──►  Enquiry  ──►  Appointment  ──►  Visit  ──►  Rebook
(Instagram bio)      (request)     (diary, WhatsApp   (history    (WhatsApp
                                    confirmation)      + notes)    invitation)
                 └────────── one client record, matched by mobile number ──────────┘
```

- **Link page** (`/{your-salon}`): a link-in-bio page for Instagram, TikTok and Snapchat. Mirror monogram, bio,
  socials, WhatsApp, custom buttons, the service menu by category, the team and opening hours. Clients tap services
  and send a booking request (service, day, time, preferred stylist). Five colour themes (Clay, Sand, Rose, Sage, Noir)
  and four animations (Bloom, Shimmer, Drift, Still). Visits and taps are counted.
- **Enquiries (leads)**: requests from the link page and QR codes arrive with service, preferred day/time and stylist.
  Reply on WhatsApp, quote, or **Book** in one tap.
- **Appointments (jobs)**: a day diary with one column per stylist. Tap a free slot to book; double bookings are caught
  (with "Book anyway"). Send the WhatsApp confirmation and reminder from your own number, mark arrived / no-show /
  cancelled, reschedule. The client gets a confirmation page with "Add to calendar" (.ics) and "Need to change it?".
- **Finish a visit**: records the amount, notes (colour formula, products) and sets the rebook reminder in weeks.
- **Quotes**: for bridal, events and packages. A WhatsApp link the client accepts; accepted quotes become appointments.
- **Visits & rebooking**: every client's history link, and a "Due to rebook" list with one-tap WhatsApp invitations.
- **Team**, **service menu** (price, minutes, category, "from" price, shown on page), **clients** with import from
  phone contacts / Excel, **QR codes** for the counter and mirror, and the platform **admin** (invites, trials, payments).

## What's different from Xymber

| | Xymber | Tressa |
|---|---|---|
| Audience | Many trades | Salons only (unisex, ladies, barbers, spa, nails, home service) |
| Look | Navy, IBM Plex / Bricolage, left side menu | Clay & cream, Gloock serif / Hanken Grotesk, top bar, arched-mirror motif |
| New | — | Appointments diary, team, link-in-bio page with animations, booking requests, client confirmation page + calendar file |
| Database | Its own | Its own (fresh single migration `0001_initial`) |

## Stack

Next.js 15 (App Router, TypeScript, plain CSS) · FastAPI · SQLAlchemy 2 · Alembic · PostgreSQL 16. Same as Xymber.
The browser only talks to Next.js, which proxies `/api/*` to FastAPI. Fonts are self-hosted (SIL OFL).
All times are UAE time (Asia/Dubai).

## Run it locally

```bash
docker compose up --build
docker compose exec api python -m app.seed     # demo salon
```

Open http://localhost:3000. Demo login: `demo@tressa.app` / `demo12345`. Demo link page: http://localhost:3000/layla-beauty

Without Docker: see the Xymber steps — `cd backend && pip install -r requirements.txt && alembic upgrade head && uvicorn app.main:app --reload`,
then `cd frontend && npm install && npm run dev`.

## Tests

```bash
cd backend && pytest        # 36 tests: full lifecycle, appointments, clashes, link page, booking requests, tenant isolation
```

## Brand name

"Tressa" is a placeholder. Set `NEXT_PUBLIC_BRAND_NAME` (web) and `BRAND_NAME` (api) to rename everywhere.

## Deploying

[DEPLOY_RAILWAY.md](DEPLOY_RAILWAY.md).

## Main routes

```
App:     /dashboard (Today) /appointments /leads /quotes /link /customers /services /team /settings /qr
Public:  /{slug} link page · /a/{token} appointment · /q/{token} quote · /s/{token} visit history · /l/{code} QR page
API:     /api/appointments  /api/team  /api/linkpage  /api/public/b/{slug}[/tap|/book]  /api/public/a/{token}[/ics]
```

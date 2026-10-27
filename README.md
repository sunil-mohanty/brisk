# Tressa

Leads, quotes and bookings for small businesses (B2B). Two lines of business today, each with its own theme and words:

| | Salons | Real estate brokers |
|---|---|---|
| Look | Ink navy + copper on warm stone, arched-mirror motif | Deep navy + charcoal, framed panels |
| Words | Appointments, Staff, Services, Visits, Inventory | Viewings, Agents, Listings, Deals (no inventory) |
| Public pages | "Book your time" | "Book a viewing" |

The owner picks **Select your business: Salon / Real estate** at sign-up (`business_type` = a salon kind or `real_estate`).
Landing page, sign-up and admin use the platform look (stone + ink navy, copper spark) and the forward-leaning "B" logo.
A sister product to Xymber, on the same stack, with its own brand, data and deployment.

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
- **Quotes, two kinds:**
  - **Client quotes** for one client, or **bulk** (the same quote to many clients, one link each), sent on WhatsApp.
  - **Campaign quotes**: one public offer page + QR code for Instagram, TikTok, YouTube or ads (`/c/{token}`).
  - Clients **accept on the page and can book a free time** (from opening hours, staff and the diary). Free slot →
    *Accepted · Booking confirmed*, appointment created and a WhatsApp confirmation sent (automatic with the
    WhatsApp Cloud API, otherwise one tap for the owner). No time chosen or slot taken → *Accepted · Awaiting booking*.
- **Campaign banners from the package text**: the theme (facial, nails, bridal, villa, sea view…) is read from the offer and
  sets the illustration and colours; Bold / Soft / Classic with Shuffle, free. Optional AI background photo (fal.ai or
  OpenAI, about USD 0.003 a picture) with a monthly cap per business.
- **Pictures on client quotes** (optional): attach an image or PDF brochure from the computer (a quote can be just a
  brochure), or make a picture from the quote (Bold / Soft / Classic), or create one with AI from a description (and an optional
  reference photo). WhatsApp shows it as the
  link preview; on phones "Share picture" sends the picture itself.
- **Post campaigns to Facebook, Instagram and YouTube** from Quotes → Campaigns: each salon connects its own Page,
  Instagram and channel; the picture (with price and QR code) and an 8-second Short are made automatically; clients
  tap or scan, accept and book. Setup: [DEPLOY_RAILWAY.md](DEPLOY_RAILWAY.md#posting-campaigns-to-facebook-instagram-and-youtube).
- **WhatsApp Business API** (optional, later phase): quotes go out with **Accept / Decline** buttons; the client accepts and picks a
  free day and time inside WhatsApp, and the booking and confirmation happen by themselves. Campaigns get an
  "Accept on WhatsApp" link. Delivered/read ticks on each quote. Setup: [DEPLOY_RAILWAY.md](DEPLOY_RAILWAY.md#whatsapp-business-api-automatic-quotes-accept-buttons-and-booking-in-the-chat-optional).
- **Inventory**: products, stock in/used/sold/counted, reorder levels, stock value.
- **Link page** is switched on per salon by the platform admin (Admin → salon → Features).
- **Visits & rebooking**: every client's history link, and a "Due to rebook" list with one-tap WhatsApp invitations.
- **Team**, **service menu** (price, minutes, category, "from" price, shown on page), **clients** with import from
  phone contacts / Excel, **QR codes** for the counter and mirror, and the platform **admin** (invites, trials, payments).

## What's different from Xymber

| | Xymber | Tressa |
|---|---|---|
| Audience | Many trades | Salons only (unisex, ladies, barbers, spa, nails, home service) |
| Look | Navy, IBM Plex / Bricolage, left side menu | Ink + copper (salons) / navy + charcoal (brokers), Gloock serif / Hanken Grotesk |
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

Open http://localhost:3000. Demo logins (password `demo12345`): `demo@tressa.app` (salon, link page /layla-beauty) and
`broker@tressa.app` (real estate, link page /marina-key).

Without Docker: see the Xymber steps — `cd backend && pip install -r requirements.txt && alembic upgrade head && uvicorn app.main:app --reload`,
then `cd frontend && npm install && npm run dev`.

## Tests

```bash
cd backend && pytest        # 78 tests: lifecycle, appointments, clashes, link page, quote booking, social posting and WhatsApp bot (Meta/Google mocked), tenant isolation
```

## Brand name

"Tressa" is a placeholder. Set `NEXT_PUBLIC_BRAND_NAME` (web) and `BRAND_NAME` (api) to rename everywhere.

## Deploying

[DEPLOY_RAILWAY.md](DEPLOY_RAILWAY.md).

## Main routes

```
App:     /dashboard (Today) /appointments /leads /quotes /link /customers /services /team /settings /qr
Public:  /{slug} link page · /a/{token} appointment · /q/{token} quote · /s/{token} visit history · /l/{code} QR page
API:     /api/whatsapp/webhook (Meta)  /api/quotes/{id}/whatsapp
         /api/appointments  /api/team  /api/linkpage  /api/public/b/{slug}[/tap|/book]  /api/public/a/{token}[/ics]
```

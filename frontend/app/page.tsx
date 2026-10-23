import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/Brand";
import { HomeNav, SourceMemo } from "@/components/HomeNav";
import { LinkPageView } from "@/components/LinkPageView";
import { site } from "@/lib/site";
import type { PublicLinkPage } from "@/lib/types";

export const metadata: Metadata = {
  title: { absolute: `${site.name} – bookings, link page and rebooking for salons` },
  description: "A link page for your Instagram and TikTok bio, a booking diary for your team, quotes on WhatsApp and reminders that bring clients back. For salons, barbers, spas and nail studios in the UAE. Free trial.",
};

const DEMO: PublicLinkPage = {
  business: { name: "Layla Beauty Lounge", tagline: "Hair, nails & bridal · Al Barsha", phone: "+971 50 123 4567", whatsapp_url: "https://wa.me/971501234567", address: "Shop 4, Al Barsha 1, Dubai", trn: null, initials: "LB", business_type: "unisex", slug: "demo" },
  bio: "Unisex salon in Al Barsha. Colour, cuts, nails and bridal. Walk-ins welcome.",
  hours: "Daily 10am – 10pm · Fri from 2pm",
  socials: { instagram: "#", tiktok: "#", snapchat: "#" },
  maps_url: "#",
  theme: "clay",
  motion: "bloom",
  currency: "AED",
  show_prices: true,
  booking: true,
  links: [{ id: 1, label: "Bridal lookbook 2026", url: "#", highlight: true, position: 0, clicks: 0 }],
  menu: [
    { name: "Women's cut & blow-dry", price: "180", price_from: false, duration_min: 60, category: "Hair" },
    { name: "Men's haircut", price: "70", price_from: false, duration_min: 30, category: "Hair" },
    { name: "Balayage", price: "650", price_from: true, duration_min: 180, category: "Colour" },
    { name: "Gel manicure", price: "90", price_from: false, duration_min: 45, category: "Nails" },
  ],
  team: [
    { id: 1, name: "Maya Haddad", role: "Senior stylist", color: "#b4532f", initials: "MH" },
    { id: 2, name: "Karim Nassar", role: "Barber", color: "#5e7a5a", initials: "KN" },
    { id: 3, name: "Joy Santos", role: "Nail artist", color: "#8a5a83", initials: "JS" },
  ],
};

const JOURNEY = [
  { when: "Instagram, 9:41 pm", title: "She finds you", text: "Your link page sits in your bio: menu, prices, team, WhatsApp. She taps balayage and picks Saturday afternoon.", bubble: "New request · Noor · Balayage · Sat, afternoon" },
  { when: "Next morning", title: "You book her in", text: "Her request is waiting in Enquiries. Tap Book, choose Maya at 2 pm, and the diary warns you if Maya is already busy.", bubble: "Booked · Sat 25 Oct, 2:00 pm · Maya" },
  { when: "One tap", title: "She gets the confirmation", text: "A WhatsApp message from your own number with the time and a link to add it to her calendar. No app for her to install.", bubble: "Hi Noor, your balayage with Maya is booked for Sat 25 Oct, 2:00 pm." },
  { when: "Saturday, 5:00 pm", title: "You finish the visit", text: "Save the colour formula for next time. Her history is kept on one page she can open any time.", bubble: "Visit saved · 7.1 + 20 vol · rebook in 8 weeks" },
  { when: "Eight weeks later", title: "She comes back", text: "She shows up on your Due to rebook list. One tap sends her a friendly WhatsApp invitation.", bubble: "Hi Noor, it's almost time for your next balayage. Reply and we'll book you in." },
];

const KINDS = [
  { type: "unisex", name: "Unisex salons" },
  { type: "ladies", name: "Ladies salons" },
  { type: "gents", name: "Barbershops" },
  { type: "spa", name: "Spas & wellness" },
  { type: "nails", name: "Nail & lash studios" },
  { type: "home", name: "Home beauty services" },
];

const FAQ = [
  { q: "Do my clients need to download anything?", a: "No. Your link page, their confirmation and their visit history are ordinary web pages that open from Instagram or WhatsApp." },
  { q: "Does it send WhatsApp messages by itself?", a: "No, and that's on purpose. Every confirmation and reminder opens WhatsApp on your phone with the message written for you, so it comes from your own number and you can change it before sending. No WhatsApp Business API needed." },
  { q: "Can clients book a time directly?", a: "They send a request with the service, day and time they'd like. You confirm it in one tap. You stay in control of your chairs, and nobody books a slot you were keeping free." },
  { q: "I have several stylists. Will it stop double bookings?", a: "Yes. Each team member gets a column in the diary, and booking someone into a busy slot shows a warning first." },
  { q: "I already have my clients' numbers on my phone.", a: "Bring them in from your phone contacts, an Excel file or a pasted list. Same mobile number, same client record." },
  { q: "What happens after the free trial?", a: `You keep everything and choose whether to continue${site.priceAED ? ` at AED ${site.priceAED} a month` : " on a simple monthly plan"}. No card up front, and nothing renews by itself.` },
];

export default function Home() {
  return (
    <div className="site">
      <SourceMemo />
      <header className="site-nav">
        <Brand />
        <HomeNav />
      </header>

      <section className="site-hero">
        <div className="site-hero-copy">
          <h1>Every chair booked. Every client back.</h1>
          <p className="site-lede">{site.name} gives your salon a link page for your Instagram bio, a diary for your team, quotes on WhatsApp and reminders that bring clients back for their next visit.</p>
          <div className="site-cta">
            <Link className="btn primary big" href="/signup">Start your free {site.trialDays}-day trial</Link>
            <span className="site-fine">No card needed. Works on your phone.</span>
          </div>
          <ul className="site-kinds" aria-label="Made for">
            {KINDS.map((k) => <li key={k.type}><Link href={`/signup?type=${k.type}`}>{k.name}</Link></li>)}
          </ul>
        </div>
        <div className="site-mirror" aria-label="Example link page">
          <div className="site-mirror-glass">
            <LinkPageView slug="demo" initial={DEMO} demo />
          </div>
          <p className="site-mirror-cap">A real link page. Tap the menu, it works.</p>
        </div>
      </section>

      <section className="site-journey" aria-labelledby="journey-h">
        <h2 id="journey-h">From her first tap on Instagram to her next appointment</h2>
        <ol>
          {JOURNEY.map((j) => (
            <li key={j.title}>
              <span className="site-when">{j.when}</span>
              <h3>{j.title}</h3>
              <p>{j.text}</p>
              <div className="site-bubble">{j.bubble}</div>
            </li>
          ))}
        </ol>
      </section>

      {site.demoYouTubeId && (
        <section className="site-video" aria-labelledby="demo-h">
          <h2 id="demo-h">See it in two minutes</h2>
          <div className="site-frame">
            <iframe src={`https://www.youtube-nocookie.com/embed/${site.demoYouTubeId}`} title={`${site.name} demo`} loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
          </div>
        </section>
      )}

      <section className="site-price" aria-labelledby="price-h">
        <div className="arch site-price-arch" aria-hidden="true" />
        <div>
          <h2 id="price-h">{site.priceAED ? `AED ${site.priceAED} a month, for the whole salon` : "One simple monthly plan for the whole salon"}</h2>
          <p>Link page, diary for your whole team, enquiries, quotes, client history and rebooking reminders. Try everything free for {site.trialDays} days.</p>
        </div>
        <Link className="btn big" href="/signup">Start free trial</Link>
      </section>

      <section className="site-faq" aria-labelledby="faq-h">
        <h2 id="faq-h">Questions salon owners ask</h2>
        {FAQ.map((f) => (
          <details key={f.q}>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </section>

      <footer className="site-foot">
        <span>© {new Date().getFullYear()} {site.name}</span>
        <nav aria-label="Legal">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
          {site.supportWhatsApp && <a href={`https://wa.me/${site.supportWhatsApp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp</a>}
        </nav>
      </footer>
    </div>
  );
}

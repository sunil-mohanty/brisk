import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/Brand";
import { HomeDemo } from "@/components/HomeDemo";
import { HomeNav, SourceMemo } from "@/components/HomeNav";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: `${site.name} – leads, quotes and bookings for small businesses` },
  description: "Enquiries from Instagram and ads, quotes your clients accept on WhatsApp, and bookings that confirm themselves. Made for salons and real estate brokers in the UAE. Free trial.",
};

const FLOW = [
  { n: "01", title: "Leads come in", text: "Your link page, QR codes and social posts send enquiries straight into one list, with what they want and when.",
    salon: "Noor · Balayage · Sat afternoon", re: "Daniel · 2BR Marina, AED 2.5M · this weekend" },
  { n: "02", title: "Quotes go out", text: "A clean quote with a link, sent from your own WhatsApp. Or post a campaign to Facebook, Instagram and YouTube in one tap.",
    salon: "Q-1019 · Bridal package · AED 1,995", re: "Q-2202 · 1BR JLT · AED 85,000 / year" },
  { n: "03", title: "They accept and book", text: "Clients accept on the page and pick a free time from your calendar. Booked straight away, with a confirmation.",
    salon: "Accepted · Sun 26 Oct, 11:30 with Maya", re: "Accepted · Viewing Sat 1 Nov, 4:00 with Omar" },
  { n: "04", title: "They come back", text: "Every finished job lands in the client's history and sets a follow-up, so nobody slips away.",
    salon: "Due to rebook · 8 weeks", re: "Tenancy renews in 11 months · follow up" },
];

const FAQ = [
  { q: `Who is ${site.name} for?`, a: "Small businesses that live on enquiries, quotes and appointments. Today that's salons (unisex, ladies, barbers, spas, nail studios, home beauty) and real estate brokers and small agencies. Each gets its own look and its own words: appointments and stylists for salons, viewings, agents and listings for brokers." },
  { q: "Do my clients need to download anything?", a: "No. Your link page, quotes, offers and confirmations are ordinary web pages that open from Instagram, Facebook or WhatsApp." },
  { q: "Can clients book a time themselves?", a: "Yes. When they accept a quote or an offer they can pick a free time from your calendar (opening hours, your team and existing bookings). If it's free it's booked straight away; if not, it waits for you." },
  { q: `Can I post offers to social media from ${site.name}?`, a: "Yes. Connect your Facebook Page, Instagram and YouTube once. It makes the picture and a short video with the price and a QR code, and posts it for you." },
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
          <span className="site-eyebrow"><i />For salons and real estate brokers</span>
          <h1>Leads in. Quotes out. <em>Bookings done.</em></h1>
          <p className="site-lede">{site.name} gives small businesses one place for enquiries from Instagram and ads, quotes clients accept on WhatsApp, and bookings that confirm themselves.</p>
          <div className="site-cta">
            <Link className="btn primary big" href="/signup">Start your free {site.trialDays}-day trial</Link>
            <span className="site-fine">No card needed. Works on your phone.</span>
          </div>
        </div>
        <HomeDemo />
      </section>

      <section className="site-verticals" aria-labelledby="for-h">
        <h2 id="for-h">Made for your kind of business</h2>
        <div className="site-vgrid">
          <article className="site-v salon" data-vertical="salon">
            <div className="site-v-art" aria-hidden="true" />
            <h3>Salons</h3>
            <p>Unisex and ladies salons, barbers, spas, nail and lash studios, home beauty.</p>
            <ul>
              <li>Link page for your Instagram bio, with menu and team</li>
              <li>Diary per stylist, no double bookings</li>
              <li>Campaign offers clients accept and book</li>
              <li>Rebooking reminders on WhatsApp</li>
            </ul>
            <Link className="btn primary" href="/signup?type=salon">Start as a salon</Link>
          </article>
          <article className="site-v re" data-vertical="real_estate">
            <div className="site-v-art" aria-hidden="true" />
            <h3>Real estate brokers</h3>
            <p>Independent brokers and small agencies, sales and leasing.</p>
            <ul>
              <li>Leads from portals, Instagram and ads in one list</li>
              <li>Viewings calendar per agent</li>
              <li>Listing offers that book viewings by themselves</li>
              <li>Deals and renewal follow-ups</li>
            </ul>
            <Link className="btn primary" href="/signup?type=real_estate">Start as a broker</Link>
          </article>
        </div>
      </section>

      <section className="site-journey" aria-labelledby="flow-h">
        <h2 id="flow-h">From the first tap to the next deal</h2>
        <ol>
          {FLOW.map((f) => (
            <li key={f.n}>
              <span className="site-when">{f.n}</span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
              <div className="site-bubbles">
                <div className="site-bubble salon"><b>Salon</b>{f.salon}</div>
                <div className="site-bubble re"><b>Broker</b>{f.re}</div>
              </div>
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
        <div>
          <h2 id="price-h">{site.priceAED ? `AED ${site.priceAED} a month, for your whole team` : "One simple monthly plan for your whole team"}</h2>
          <p>Link page, calendar for everyone, enquiries, quotes, campaigns, client history and follow-ups. Try everything free for {site.trialDays} days.</p>
        </div>
        <Link className="btn big" href="/signup">Start free trial</Link>
      </section>

      <section className="site-faq" aria-labelledby="faq-h">
        <h2 id="faq-h">Questions owners ask</h2>
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

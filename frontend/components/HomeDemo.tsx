"use client";

import { useState } from "react";
import { LinkPageView } from "@/components/LinkPageView";
import type { PublicLinkPage } from "@/lib/types";

const SALON: PublicLinkPage = {
  business: { name: "Layla Beauty Lounge", tagline: "Hair, nails & bridal · Al Barsha", phone: "+971 50 123 4567", whatsapp_url: "https://wa.me/971501234567", address: "Shop 4, Al Barsha 1, Dubai", trn: null, initials: "LB", business_type: "unisex", vertical: "salon", slug: "demo" },
  bio: "Unisex salon in Al Barsha. Colour, cuts, nails and bridal. Walk-ins welcome.",
  hours: "Daily 10am – 10pm · Fri from 2pm",
  socials: { instagram: "#", tiktok: "#", snapchat: "#" },
  maps_url: "#", theme: "clay", motion: "bloom", currency: "AED", show_prices: true, booking: true,
  links: [{ id: 1, label: "Bridal lookbook 2026", url: "#", highlight: true, position: 0, clicks: 0 }],
  menu: [
    { name: "Women's cut & blow-dry", price: "180", price_from: false, duration_min: 60, category: "Hair" },
    { name: "Balayage", price: "650", price_from: true, duration_min: 180, category: "Colour" },
    { name: "Gel manicure", price: "90", price_from: false, duration_min: 45, category: "Nails" },
  ],
  team: [
    { id: 1, name: "Maya Haddad", role: "Senior stylist", color: "#b4532f", initials: "MH" },
    { id: 2, name: "Karim Nassar", role: "Barber", color: "#5e7a5a", initials: "KN" },
  ],
};

const REAL_ESTATE: PublicLinkPage = {
  business: { name: "Marina Key Properties", tagline: "Sales & leasing · Dubai Marina", phone: "+971 4 555 0192", whatsapp_url: "https://wa.me/971507001122", address: "Marina Plaza, Dubai Marina", trn: null, initials: "MK", business_type: "real_estate", vertical: "real_estate", slug: "demo" },
  bio: "RERA-registered brokerage. Apartments and villas for sale and rent across Dubai Marina, JLT and the Ranches.",
  hours: "Daily 9am – 8pm",
  socials: { instagram: "#", facebook: "#" },
  maps_url: "#", theme: "navy", motion: "calm", currency: "AED", show_prices: true, booking: true,
  links: [{ id: 1, label: "Sea-view 2BR, Marina Gate: AED 2.45M", url: "#", highlight: true, position: 0, clicks: 0 }],
  menu: [
    { name: "2BR, Marina Gate (sale)", price: "2450000", price_from: false, duration_min: 45, category: "For sale" },
    { name: "1BR, JLT Cluster D (rent / year)", price: "85000", price_from: false, duration_min: 30, category: "For rent" },
    { name: "Property valuation visit", price: "750", price_from: false, duration_min: 60, category: "Services" },
  ],
  team: [
    { id: 1, name: "Omar Siddiqui", role: "Senior agent", color: "#1f3a5f", initials: "OS" },
    { id: 2, name: "Hannah Brooks", role: "Leasing agent", color: "#4a6b8a", initials: "HB" },
  ],
};

/** The landing page's live example, switchable between a salon and a brokerage. */
export function HomeDemo() {
  const [kind, setKind] = useState<"salon" | "real_estate">("salon");
  const page = kind === "salon" ? SALON : REAL_ESTATE;
  return (
    <div className="site-demo">
      <div className="seg site-demo-tabs" role="tablist" aria-label="Example business">
        <button type="button" role="tab" aria-selected={kind === "salon"} aria-pressed={kind === "salon"} onClick={() => setKind("salon")}>Salon</button>
        <button type="button" role="tab" aria-selected={kind === "real_estate"} aria-pressed={kind === "real_estate"} onClick={() => setKind("real_estate")}>Real estate</button>
      </div>
      <div className={`site-device ${kind}`}>
        <LinkPageView key={kind} slug="demo" initial={page} demo />
      </div>
      <p className="site-mirror-cap">A real {kind === "salon" ? "salon" : "brokerage"} page. Tap around, it works.</p>
    </div>
  );
}

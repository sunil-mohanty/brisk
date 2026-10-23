import { ImageResponse } from "next/og";
import { OG, ogFonts } from "@/lib/ogfonts";
import { site } from "@/lib/site";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${site.name} – bookings, link page and rebooking for salons`;

// Preview for the website (ads, posts, WhatsApp shares).
export default async function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", padding: "0 90px", gap: 70, background: OG.cream, fontFamily: "Hanken" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", fontSize: 34, color: OG.clay, fontFamily: "Gloock" }}>{site.name}</div>
          <div style={{ marginTop: 26, fontFamily: "Gloock", fontSize: 84, lineHeight: 1, color: OG.cocoa, display: "flex", flexWrap: "wrap", maxWidth: 640 }}>Every chair booked. Every client back.</div>
          <div style={{ marginTop: 28, fontSize: 28, color: OG.muted, display: "flex" }}>Link page · Bookings · Quotes on WhatsApp · Rebooking</div>
        </div>
        <div style={{ width: 300, height: 400, borderRadius: "150px 150px 24px 24px", border: `5px solid ${OG.clay}`, background: OG.paper, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 60, gap: 14 }}>
          <div style={{ width: 96, height: 122, borderRadius: "48px 48px 10px 10px", border: `3px solid ${OG.clay}`, color: OG.clay, display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 14, fontFamily: "Gloock", fontSize: 40 }}>LB</div>
          <div style={{ width: 210, height: 34, borderRadius: 999, background: OG.clay, display: "flex" }} />
          <div style={{ width: 210, height: 34, borderRadius: 999, border: `2px solid ${OG.sand}`, display: "flex" }} />
          <div style={{ width: 210, height: 34, borderRadius: 999, border: `2px solid ${OG.sand}`, display: "flex" }} />
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts() },
  );
}

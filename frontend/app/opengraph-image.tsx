import { ImageResponse } from "next/og";
import { ogFonts } from "@/lib/ogfonts";
import { site } from "@/lib/site";
import { BRISK_SVG } from "@/components/Logo";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${site.name} – leads, quotes and bookings for small businesses`;

const INK = "#1d2330", STONE = "#f4f2ee", SPARK = "#d4704a", MUTED = "#6d7280";

// Preview for the website (ads, posts, WhatsApp shares).
export default async function Image() {
  const mark = `data:image/svg+xml;utf8,${encodeURIComponent(BRISK_SVG(INK, SPARK))}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", padding: "0 90px", gap: 60, background: STONE, fontFamily: "Hanken" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mark} width={64} height={64} alt="" />
            <div style={{ display: "flex", fontSize: 44, fontWeight: 700, color: INK, letterSpacing: -1 }}>{site.name}</div>
          </div>
          <div style={{ marginTop: 34, fontFamily: "Gloock", fontSize: 80, lineHeight: 1.02, color: INK, display: "flex", flexWrap: "wrap", maxWidth: 680 }}>
            Leads in. Quotes out.&nbsp;<span style={{ color: SPARK }}>Bookings done.</span>
          </div>
          <div style={{ marginTop: 28, fontSize: 28, color: MUTED, display: "flex" }}>For salons and real estate brokers</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ width: 280, height: 170, borderRadius: "140px 140px 20px 20px", background: "#fbf8f5", border: "4px solid #c0613f", display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 22, fontSize: 26, color: "#2a1f1a", fontWeight: 700 }}>Salons</div>
          <div style={{ width: 280, height: 170, borderRadius: 20, background: "#fafbfc", border: "4px solid #1f3a5f", display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 22, fontSize: 26, color: "#1b2029", fontWeight: 700 }}>Real estate</div>
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts() },
  );
}

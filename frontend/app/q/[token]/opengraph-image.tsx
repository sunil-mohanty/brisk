import { ImageResponse } from "next/og";
import { OgCard } from "@/lib/ogcard";
import { ogFonts } from "@/lib/ogfonts";
import { aed, fetchQuote } from "@/lib/server";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Quotation";

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const q = await fetchQuote(token);
  // A quote with a picture (uploaded, designed or AI): WhatsApp shows that picture as the link preview.
  if (q?.picture_url) {
    try {
      const API = process.env.API_URL || "http://localhost:8000";
      const r = await fetch(`${API}/api/public/q/${encodeURIComponent(token)}/picture/square.jpg`, { cache: "no-store" });
      if (r.ok) {
        const src = `data:image/jpeg;base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
        return new ImageResponse(
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#1d2330" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" style={{ height: 630, objectFit: "contain" }} />
          </div>,
          { ...size, headers: { "Cache-Control": "public, max-age=300" } },
        );
      }
    } catch { /* fall back to the card below */ }
  }
  const decided = q?.status === "accepted" ? "Accepted" : q?.status === "rejected" ? "Declined" : q?.expired ? "Expired" : null;
  return new ImageResponse(
    <OgCard vertical={q?.business.vertical} initials={q?.business.initials ?? "S"} name={q?.business.name ?? "Business"} kicker={q ? `Quotation ${q.label}` : "Quotation"}
      big={q ? aed(q.totals.total, q.currency) : ""} sub={q ? `for ${q.customer_name}` : undefined} cta={decided ?? "Tap to view & accept"} done={decided === "Accepted"} />,
    { ...size, fonts: await ogFonts(), headers: { "Cache-Control": "public, max-age=300" } },
  );
}

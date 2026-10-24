import { ImageResponse } from "next/og";
import { OG, ogFonts } from "@/lib/ogfonts";
import { fetchLinkPage } from "@/lib/server";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Business page";

const THEMES: Record<string, { bg: string; card: string; ink: string; ac: string; soft: string }> = {
  clay: { bg: OG.cream, card: OG.paper, ink: OG.cocoa, ac: OG.clay, soft: OG.muted },
  sand: { bg: "#efe5d3", card: "#f9f3e8", ink: "#2e2519", ac: "#8a6a3a", soft: "#7a6a52" },
  rose: { bg: "#f5e5e1", card: "#fdf5f3", ink: "#3a1f24", ac: "#a8505f", soft: "#8a6268" },
  sage: { bg: "#e8eadf", card: "#f6f7f0", ink: "#23281b", ac: "#56663f", soft: "#66705a" },
  noir: { bg: "#1d1714", card: "#29211c", ink: "#f4e9df", ac: "#d9946a", soft: "#b4a293" },
  navy: { bg: "#eef0f3", card: "#fafbfc", ink: "#1b2029", ac: "#1f3a5f", soft: "#616a7b" },
};

// Link preview: the mirror monogram, salon name and a few menu lines, centred for square crops.
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await fetchLinkPage(slug);
  const t = THEMES[p?.theme ?? "clay"] ?? THEMES.clay;
  const name = p?.business.name ?? "Salon";
  const items = (p?.menu ?? []).slice(0, 3).map((m) => m.name);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 60, background: t.bg, fontFamily: "Hanken" }}>
        <div style={{ width: 230, height: 300, borderRadius: "115px 115px 22px 22px", border: `4px solid ${t.ac}`, background: t.card, display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 30, color: t.ac, fontFamily: "Gloock", fontSize: 92 }}>
          {p?.business.initials ?? "S"}
        </div>
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 560 }}>
          <div style={{ fontFamily: "Gloock", fontSize: 68, lineHeight: 1.04, color: t.ink, display: "flex" }}>{name}</div>
          {p?.business.tagline && <div style={{ fontSize: 28, color: t.soft, marginTop: 14, display: "flex" }}>{p.business.tagline}</div>}
          {items.length > 0 && <div style={{ fontSize: 24, color: t.ink, marginTop: 22, display: "flex" }}>{items.join("  ·  ")}</div>}
          <div style={{ marginTop: 30, display: "flex", alignSelf: "flex-start", background: t.ac, color: t.bg, borderRadius: 999, padding: "16px 34px", fontSize: 28, fontWeight: 700 }}>Book an appointment</div>
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts(), headers: { "Cache-Control": "public, max-age=300" } },
  );
}

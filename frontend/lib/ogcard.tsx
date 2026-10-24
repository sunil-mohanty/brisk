// Shared layout for link-preview images (quotes, visits, appointments). Everything important
// sits in the middle, because WhatsApp crops small previews to a square.
import { OG } from "./ogfonts";

const RE = { clay: "#1f3a5f", paper: "#fafbfc", cocoa: "#1b2029", muted: "#616a7b" }; // real estate: deep navy + charcoal

export function OgCard({ initials, name, kicker, big, sub, cta, done, vertical }: { initials: string; name: string; kicker: string; big: string; sub?: string; cta: string; done?: boolean; vertical?: string }) {
  const re = vertical === "real_estate";
  const C = re ? RE : OG;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: C.clay, fontFamily: "Hanken" }}>
      <div style={{ width: 620, display: "flex", flexDirection: "column", alignItems: "center", background: C.paper, borderRadius: re ? "28px" : "300px 300px 36px 36px", padding: re ? "48px 44px 40px" : "70px 44px 40px" }}>
        <div style={{ width: re ? 84 : 76, height: re ? 84 : 96, borderRadius: re ? "16px" : "38px 38px 10px 10px", border: `3px solid ${C.clay}`, color: C.clay, display: "flex", alignItems: "center", justifyContent: "center", paddingTop: re ? 0 : 12, fontFamily: "Gloock", fontSize: 32 }}>{initials}</div>
        <div style={{ marginTop: 14, fontFamily: "Gloock", fontSize: 36, color: C.cocoa, maxWidth: 520, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", display: "flex" }}>{name}</div>
        <div style={{ marginTop: 20, fontSize: 26, color: C.muted, display: "flex" }}>{kicker}</div>
        <div style={{ marginTop: 4, fontFamily: "Gloock", fontSize: 62, color: C.cocoa, maxWidth: 540, textAlign: "center", lineHeight: 1.05, display: "flex" }}>{big}</div>
        {sub && <div style={{ marginTop: 6, fontSize: 24, color: C.muted, display: "flex" }}>{sub}</div>}
        <div style={{ marginTop: 28, width: "100%", display: "flex", justifyContent: "center", background: done ? "#e3e8d3" : C.cocoa, color: done ? "#4e6b3a" : C.paper, borderRadius: 999, padding: "18px 0", fontSize: 28, fontWeight: 700 }}>{cta}</div>
      </div>
    </div>
  );
}

// Shared layout for link-preview images (quotes, visits, appointments). Everything important
// sits in the middle, because WhatsApp crops small previews to a square.
import { OG } from "./ogfonts";

export function OgCard({ initials, name, kicker, big, sub, cta, done }: { initials: string; name: string; kicker: string; big: string; sub?: string; cta: string; done?: boolean }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: OG.clay, fontFamily: "Hanken" }}>
      <div style={{ width: 620, display: "flex", flexDirection: "column", alignItems: "center", background: OG.paper, borderRadius: "300px 300px 36px 36px", padding: "70px 44px 40px" }}>
        <div style={{ width: 76, height: 96, borderRadius: "38px 38px 10px 10px", border: `3px solid ${OG.clay}`, color: OG.clay, display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 12, fontFamily: "Gloock", fontSize: 32 }}>{initials}</div>
        <div style={{ marginTop: 14, fontFamily: "Gloock", fontSize: 36, color: OG.cocoa, maxWidth: 520, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", display: "flex" }}>{name}</div>
        <div style={{ marginTop: 20, fontSize: 26, color: OG.muted, display: "flex" }}>{kicker}</div>
        <div style={{ marginTop: 4, fontFamily: "Gloock", fontSize: 62, color: OG.cocoa, maxWidth: 540, textAlign: "center", lineHeight: 1.05, display: "flex" }}>{big}</div>
        {sub && <div style={{ marginTop: 6, fontSize: 24, color: OG.muted, display: "flex" }}>{sub}</div>}
        <div style={{ marginTop: 28, width: "100%", display: "flex", justifyContent: "center", background: done ? "#e3e8d3" : OG.cocoa, color: done ? "#4e6b3a" : OG.paper, borderRadius: 999, padding: "18px 0", fontSize: 28, fontWeight: 700 }}>{cta}</div>
      </div>
    </div>
  );
}

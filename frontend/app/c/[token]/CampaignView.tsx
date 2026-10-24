"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Powered, PubHeader, PubShell } from "@/components/PubHeader";
import { SlotPicker, type Pick } from "@/components/SlotPicker";
import { api } from "@/lib/api";
import { fmtDate, money } from "@/lib/format";
import type { PublicCampaign } from "@/lib/types";
import { duration } from "@/lib/vocab";

/** A campaign offer from a post or ad: accept with name and mobile, and book a free time. */
export function CampaignView() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const preview = useSearchParams().get("preview") === "1";
  const [c, setC] = useState<PublicCampaign | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", phone: "" });
  const [pick, setPick] = useState<Pick | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get<PublicCampaign>(`/public/c/${token}${preview ? "?preview=1" : ""}`).then(setC).catch((e) => setError(e.message)); }, [token, preview]);

  async function accept(e: React.FormEvent) {
    e.preventDefault();
    if (preview) return setError("This is a preview, so nothing was saved. Clients accept from the live link.");
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ quote_token: string; booking_status: string; slot_taken: boolean }>(`/public/c/${token}/accept`, {
        name: f.name, phone: f.phone, ...(pick ? { day: pick.day, time: pick.time } : {}),
      });
      router.push(`/q/${r.quote_token}${r.slot_taken ? "?taken=1" : ""}`);
    } catch (err) { setError((err as Error).message); setBusy(false); }
  }

  if (error && !c) return <PubShell><div className="banner bad">{error}</div></PubShell>;
  if (!c) return <PubShell><small>Loading offer…</small></PubShell>;
  const cur = c.currency;
  const ended = !c.active || c.expired;
  const before = Number(c.totals.subtotal) * (1 + Number(c.vat_rate) / 100); // full price incl. VAT, before the offer discount

  return (
    <PubShell>
      {preview && <div className="banner info">Preview. Views aren&apos;t counted and nothing is saved.</div>}
      <PubHeader business={c.business} />
      <div className="offer-hero">
        <span className="k">{ended ? "Offer ended" : c.valid_until ? `Offer until ${fmtDate(c.valid_until)}` : "Special offer"}</span>
        <h1>{c.title}</h1>
        {c.description && <p>{c.description}</p>}
        <div className="price">{Number(c.totals.discount) > 0 && <s>{money(before, cur)}</s>}{money(c.totals.total, cur)}</div>
      </div>
      <div className="pcard">
        {c.items.map((i, n) => (
          <div className="pline" key={n}><div>{i.description}{Number(i.quantity) !== 1 && <span className="q">× {Number(i.quantity)}</span>}</div><span className="mono">{money(i.line_total, cur)}</span></div>
        ))}
        {Number(c.totals.discount) > 0 && <div className="pline"><span>Offer discount</span><span className="mono">−{money(c.totals.discount, cur)}</span></div>}
        <div className="pline"><span>VAT {Number(c.vat_rate)}%</span><span className="mono">{money(c.totals.vat, cur)}</span></div>
        <div className="ptotal"><span>Total</span><b>{money(c.totals.total, cur)}</b></div>
        <p className="kicker" style={{ margin: "10px 0 0" }}>About {duration(c.duration_min)} at the salon.</p>
      </div>
      {c.notes && <div className="pcard" style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{c.notes}</div>}
      {ended ? (
        <div className="banner info">This offer has ended. Message {c.business.name} for current prices.</div>
      ) : (
        <form className="pcard bookcard" onSubmit={accept} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h3 style={{ fontSize: 24, margin: 0 }}>Accept this offer</h3>
          <label>Your name<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" maxLength={160} /></label>
          <label>Mobile number<input required minLength={6} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" autoComplete="tel" placeholder="050 123 4567" /></label>
          <div>
            <b style={{ display: "block", marginBottom: 8 }}>Book your time <span className="opt">optional</span></b>
            <SlotPicker slotsPath={`/public/c/${token}/slots`} openDays={c.open_days} value={pick} onChange={setPick} />
          </div>
          {error && <div className="banner bad">{error}</div>}
          <div className="pbtns">
            <button className="btn primary" disabled={busy}>{busy ? "Please wait…" : pick ? "Accept & book this time" : "Accept, I'll book later"}</button>
          </div>
          <small>By accepting, {c.business.name} gets your name and mobile number to confirm your booking.</small>
        </form>
      )}
      {c.business.whatsapp_url && <div className="pbtns"><a className="btn wa" href={`${c.business.whatsapp_url}?text=${encodeURIComponent(`Hi, I have a question about "${c.title}".`)}`} target="_blank" rel="noreferrer">Questions? Chat on WhatsApp</a></div>}
      <Powered />
    </PubShell>
  );
}

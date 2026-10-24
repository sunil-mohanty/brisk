"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Powered, PubHeader, PubShell } from "@/components/PubHeader";
import { SlotPicker, type Pick } from "@/components/SlotPicker";
import { api } from "@/lib/api";
import { fmtDate, fmtDayLong, fmtTime, money, uaeDate } from "@/lib/format";
import type { PublicCampaign, PublicQuote } from "@/lib/types";
import { duration } from "@/lib/vocab";
import { words } from "@/lib/words";

type Step = "form" | "book" | "booked" | "later";

/** A campaign offer from a post or ad: 1) name + mobile → Accept, 2) optionally pick a free time, 3) confirmation. */
export function CampaignView() {
  const { token } = useParams<{ token: string }>();
  const preview = useSearchParams().get("preview") === "1";
  const [c, setC] = useState<PublicCampaign | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", phone: "" });
  const [pick, setPick] = useState<Pick | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step>("form");
  const [q, setQ] = useState<PublicQuote | null>(null);
  const [qt, setQt] = useState<string | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const key = `offer:${token}`;

  useEffect(() => {
    api.get<PublicCampaign>(`/public/c/${token}${preview ? "?preview=1" : ""}`).then(setC).catch((e) => setError(e.message));
    // Came back to the page after accepting: carry on where they left off.
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(key); } catch { /* storage blocked */ }
    if (saved && !preview) {
      api.get<PublicQuote>(`/public/q/${saved}?preview=1`).then((r) => {
        setQ(r); setQt(saved);
        setStep(r.booking_status === "confirmed" ? "booked" : "book");
      }).catch(() => {});
    }
  }, [token, preview, key]);

  async function accept(e: React.FormEvent) {
    e.preventDefault();
    if (preview) return setError("This is a preview, so nothing was saved. Clients accept from the live link.");
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ quote_token: string }>(`/public/c/${token}/accept`, { name: f.name.trim(), phone: f.phone.trim() });
      try { sessionStorage.setItem(key, r.quote_token); } catch { /* fine */ }
      setQt(r.quote_token);
      setQ(await api.get<PublicQuote>(`/public/q/${r.quote_token}?preview=1`));
      setStep("book");
      setTimeout(() => document.getElementById("next")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (err) { setError((err as Error).message); }
    setBusy(false);
  }

  async function book() {
    if (!qt || !pick) return;
    setBusy(true);
    setError(null);
    try {
      setQ(await api.post<PublicQuote>(`/public/q/${qt}/book`, { day: pick.day, time: pick.time }));
      setStep("booked");
      setTimeout(() => document.getElementById("next")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (err) {
      setError((err as Error).message);
      setPick(null);
      setPickerKey((k) => k + 1); // reload free times
    }
    setBusy(false);
  }

  if (error && !c) return <PubShell><div className="banner bad">{error}</div></PubShell>;
  if (!c) return <PubShell><small>Loading offer…</small></PubShell>;
  const cur = c.currency;
  const ended = !c.active || c.expired;
  const before = Number(c.totals.subtotal) * (1 + Number(c.vat_rate) / 100); // full price incl. VAT, before the offer discount

  return (
    <PubShell vertical={c.business.vertical}>
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
        <p className="kicker" style={{ margin: "10px 0 0" }}>{c.business.vertical === "real_estate" ? `Viewings take about ${duration(c.duration_min)}.` : `About ${duration(c.duration_min)} at the salon.`}</p>
      </div>
      {c.notes && <div className="pcard" style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{c.notes}</div>}
      <div id="next" />
      {step === "booked" && q?.appointment_at ? (
        <div className="outcome ok">
          <span className="outcome-k">Accepted · Booking confirmed</span>
          <b>{fmtDayLong(uaeDate(q.appointment_at))}</b>
          <span>{fmtTime(q.appointment_at)}{q.stylist ? ` with ${q.stylist}` : ""} · {duration(q.duration_min)} · {c.business.name}</span>
          {c.business.address && <span>{c.business.address}</span>}
          {q.appointment_token && (
            <div className="pbtns" style={{ marginTop: 6 }}>
              <a className="btn primary" href={`/api/public/a/${q.appointment_token}/ics`}>Add to my calendar</a>
              <a className="btn" href={`/a/${q.appointment_token}`}>Booking details & directions</a>
            </div>
          )}
          <small>Quotation {q.label}. Need to change it? Message {c.business.name}.</small>
        </div>
      ) : step === "later" && q ? (
        <div className="outcome wait">
          <span className="outcome-k">Accepted · Waiting for booking confirmation</span>
          <b>Thank you, {q.customer_name.split(" ")[0]}! Your offer is accepted.</b>
          <span>{c.business.name} will message you on {f.phone || "your mobile"} to arrange a time. You can also book online whenever you like.</span>
          {qt && <div className="pbtns" style={{ marginTop: 6 }}><a className="btn" href={`/q/${qt}`}>Book a time later</a></div>}
        </div>
      ) : step === "book" && q && qt ? (
        <div className="pcard bookcard" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="accepted-tick">✓ Offer accepted · quotation {q.label}</div>
          <h3 style={{ fontSize: 22, margin: 0 }}>{words(c.business.business_type).bookTime} <span className="opt">optional</span></h3>
          <p className="kicker" style={{ margin: 0 }}>Pick a free time and it&apos;s booked straight away. Or skip, and {c.business.name} will arrange it with you.</p>
          <SlotPicker key={pickerKey} slotsPath={`/public/q/${qt}/slots`} openDays={q.open_days} value={pick} onChange={setPick} />
          {error && <div className="banner bad">{error}</div>}
          <div className="pbtns">
            <button className="btn primary" disabled={busy || !pick} onClick={book}>{busy ? "Booking…" : pick ? "Confirm this time" : "Pick a day and time"}</button>
            <button className="btn" disabled={busy} onClick={() => setStep("later")}>Skip, {c.business.name} will arrange it</button>
          </div>
        </div>
      ) : ended ? (
        <div className="banner info">This offer has ended. Message {c.business.name} for current prices.</div>
      ) : (
        <form className="pcard bookcard" onSubmit={accept} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h3 style={{ fontSize: 24, margin: 0 }}>Accept this offer</h3>
          <label>Your name<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" maxLength={160} /></label>
          <label>Mobile number<input required minLength={6} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" autoComplete="tel" placeholder="050 123 4567" /></label>
          {error && <div className="banner bad">{error}</div>}
          <div className="pbtns">
            <button className="btn primary" disabled={busy}>{busy ? "Please wait…" : "Accept"}</button>
          </div>
          <small>Next, you can pick a time (optional). {c.business.name} gets your name and mobile number to confirm your booking.</small>
        </form>
      )}
      {!ended && step === "form" && c.whatsapp_accept_url && (
        <div className="pcard wa-accept">
          <b>Prefer WhatsApp?</b>
          <span>Accept and pick your time in a WhatsApp chat instead. Just press send on the message that opens.</span>
          <div className="pbtns"><a className="btn wa" href={c.whatsapp_accept_url} target="_blank" rel="noreferrer">Accept on WhatsApp</a></div>
        </div>
      )}
      {c.business.whatsapp_url && <div className="pbtns"><a className={c.whatsapp_accept_url && !ended ? "btn" : "btn wa"} href={`${c.business.whatsapp_url}?text=${encodeURIComponent(`Hi, I have a question about "${c.title}".`)}`} target="_blank" rel="noreferrer">Questions? Chat on WhatsApp</a></div>}
      <Powered />
    </PubShell>
  );
}

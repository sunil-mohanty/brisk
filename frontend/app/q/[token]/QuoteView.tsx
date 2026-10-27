"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Powered, PubHeader, PubShell } from "@/components/PubHeader";
import { api } from "@/lib/api";
import { fmtDate, fmtDayLong, fmtTime, money, uaeDate } from "@/lib/format";
import type { PublicQuote as PublicQuoteData } from "@/lib/types";
import { duration } from "@/lib/vocab";
import { words } from "@/lib/words";

export function PublicQuote() {
  return <Suspense fallback={null}><QuoteView /></Suspense>;
}

function QuoteView() {
  const { token } = useParams<{ token: string }>();
  const params = useSearchParams();
  const preview = params.get("preview") === "1";
  const [q, setQ] = useState<PublicQuoteData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"view" | "accept" | "reject">("view");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<PublicQuoteData>(`/public/q/${token}${preview ? "?preview=1" : ""}`).then(setQ).catch((e) => setError(e.message));
  }, [token, preview]);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      setQ(await api.post<PublicQuoteData>(`/public/q/${token}/accept`, {}));
      setStep("view");
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }
  async function reject() {
    setBusy(true);
    try { setQ(await api.post<PublicQuoteData>(`/public/q/${token}/reject`)); setStep("view"); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  if (error && !q) return <PubShell><div className="banner bad">{error}</div></PubShell>;
  if (!q) return <PubShell><small>Loading quotation…</small></PubShell>;
  const cur = q.currency;
  const open = (q.status === "sent" || q.status === "viewed") && !q.expired;
  const wa = q.business.whatsapp_url ? `${q.business.whatsapp_url}?text=${encodeURIComponent(`Hi, I have a question about quotation ${q.label}.`)}` : null;

  return (
    <PubShell vertical={q.business.vertical}>
      {preview && <div className="banner info">Preview. Your visit isn&apos;t counted, and the buttons are live.</div>}
      <PubHeader business={q.business} />

      {/* Outcome first, so the client sees where they stand */}
      {q.status === "accepted" && q.booking_status === "confirmed" && q.appointment_at && (
        <div className="outcome ok">
          <span className="outcome-k">Accepted · Booking confirmed</span>
          <b>{fmtDayLong(uaeDate(q.appointment_at))}</b>
          <span>{fmtTime(q.appointment_at)}{q.stylist ? ` with ${q.stylist}` : ""} · {duration(q.duration_min)}</span>
          {q.appointment_token && <a className="btn" href={`/a/${q.appointment_token}`}>Add to calendar & directions</a>}
        </div>
      )}
      {q.status === "accepted" && q.booking_status !== "confirmed" && (
        <div className="outcome wait">
          <span className="outcome-k">Accepted</span>
          <b>Thank you, your quotation is accepted.</b>
          <span>{q.business.name} will message you to arrange the time.</span>
        </div>
      )}
      {q.status === "rejected" && <div className="banner bad">You declined this quotation. Message us if you&apos;d like a revised price.</div>}
      {q.expired && q.status !== "accepted" && <div className="banner info">This quotation expired on {fmtDate(q.valid_until)}. Message us for an updated price.</div>}

      <div className="pcard">
        <div className="kicker">Quotation {q.label}</div>
        <h3>{q.reference || q.items.map((i) => i.description).join(" + ") || "Your quotation"}</h3>
        <div className="pmeta">
          <div>Prepared for<b>{q.customer_name}</b></div>
          <div>Valid until<b>{fmtDate(q.valid_until)}</b></div>
        </div>
      </div>
      {q.picture_url && (
        <div className="qpicture">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={q.picture_url} alt={`Quotation ${q.label}`} />
        </div>
      )}
      {q.attachment?.is_pdf && (
        <a className="pcard qbrochure" href={q.attachment.url} target="_blank" rel="noreferrer">
          <span aria-hidden="true">PDF</span>
          <span><b>{q.attachment.name}</b><small>Tap to open the brochure</small></span>
        </a>
      )}
      {q.items.length > 0 && <div className="pcard">
        {q.items.map((i, n) => (
          <div className="pline" key={n}>
            <div>{i.description}<span className="q">{Number(i.quantity)} × {money(i.unit_price, cur)}</span></div>
            <span className="mono">{money(i.line_total, cur)}</span>
          </div>
        ))}
        {Number(q.totals.discount) > 0 && <div className="pline"><span>Discount</span><span className="mono">−{money(q.totals.discount, cur)}</span></div>}
        <div className="pline"><span>VAT {Number(q.vat_rate)}%</span><span className="mono">{money(q.totals.vat, cur)}</span></div>
        <div className="ptotal"><span>Total</span><b>{money(q.totals.total, cur)}</b></div>
      </div>}
      {q.notes && <div className="pcard" style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{q.notes}</div>}
      {error && <div className="banner bad">{error}</div>}

      {open && step === "view" && (
        <div className="pbtns">
          <button className="btn primary" onClick={() => setStep("accept")}>Accept quotation</button>
          <div className="row2">
            <button className="btn" onClick={() => setStep("reject")}>Decline</button>
            <a className="btn" href={`/api/public/q/${token}/pdf`}>Download PDF</a>
          </div>
        </div>
      )}
      {open && step === "accept" && (
        <div className="pcard" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <b>Accept quotation {q.label}?</b>
          <span className="kicker" style={{ margin: 0 }}>{q.business.name} will message you to arrange the time.</span>
          <div className="row2 pbtns" style={{ display: "grid" }}>
            <button className="btn" onClick={() => setStep("view")}>Go back</button>
            <button className="btn primary" disabled={busy} onClick={accept}>{busy ? "Please wait…" : "Yes, accept"}</button>
          </div>
        </div>
      )}
      {open && step === "reject" && (
        <div className="pcard" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <b>Decline this quotation?</b>
          <div className="row2 pbtns" style={{ display: "grid" }}>
            <button className="btn" onClick={() => setStep("view")}>Go back</button>
            <button className="btn" style={{ color: "#a3392b" }} disabled={busy} onClick={reject}>Yes, decline</button>
          </div>
        </div>
      )}
      <div className="pbtns">
        {!open && <a className="btn" href={`/api/public/q/${token}/pdf`}>Download PDF</a>}
        {wa && <a className="btn wa" href={wa} target="_blank" rel="noreferrer">Questions? Chat on WhatsApp</a>}
      </div>
      {q.business.trn && <small>TRN {q.business.trn}{q.business.address ? ` · ${q.business.address}` : ""}</small>}
      <Powered />
    </PubShell>
  );
}

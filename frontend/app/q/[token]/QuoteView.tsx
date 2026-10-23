"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Powered, PubHeader, PubShell } from "@/components/PubHeader";
import { api } from "@/lib/api";
import { fmtDate, money } from "@/lib/format";
import type { PublicQuote as PublicQuoteData } from "@/lib/types";

export function PublicQuote() {
  return <Suspense fallback={null}><QuoteView /></Suspense>;
}

function QuoteView() {
  const { token } = useParams<{ token: string }>();
  const preview = useSearchParams().get("preview") === "1";
  const [q, setQ] = useState<PublicQuoteData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<PublicQuoteData>(`/public/q/${token}${preview ? "?preview=1" : ""}`).then(setQ).catch((e) => setError(e.message));
  }, [token, preview]);

  async function decide(accept: boolean) {
    setBusy(true);
    try {
      setQ(await api.post<PublicQuoteData>(`/public/q/${token}/${accept ? "accept" : "reject"}`));
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
    setConfirmReject(false);
  }

  if (error && !q) return <PubShell><div className="banner bad">{error}</div></PubShell>;
  if (!q) return <PubShell><small>Loading quotation…</small></PubShell>;
  const cur = q.currency;
  const open = (q.status === "sent" || q.status === "viewed") && !q.expired;
  const wa = q.business.whatsapp_url
    ? `${q.business.whatsapp_url}?text=${encodeURIComponent(`Hi, I have a question about quotation ${q.label}.`)}`
    : null;

  return (
    <PubShell>
      {preview && <div className="banner info">Preview. Your visit isn't counted as a client view, and the buttons are live.</div>}
      <PubHeader business={q.business} />
      <div className="pcard">
        <div className="kicker">Quotation</div>
        <h3>{q.label}</h3>
        <div className="pmeta">
          <div>Prepared for<b>{q.customer_name}</b></div>
          <div>Valid until<b>{fmtDate(q.valid_until)}</b></div>
          {q.reference && <div className="wide">Occasion<b>{q.reference}</b></div>}
        </div>
      </div>
      <div className="pcard">
        {q.items.map((i, n) => (
          <div className="pline" key={n}>
            <div>{i.description}<span className="q">{Number(i.quantity)} × {money(i.unit_price, cur)}</span></div>
            <span className="mono">{money(i.line_total, cur)}</span>
          </div>
        ))}
        <div className="pline"><span>Subtotal</span><span className="mono">{money(q.totals.subtotal, cur)}</span></div>
        {Number(q.totals.discount) > 0 && <div className="pline"><span>Discount</span><span className="mono">−{money(q.totals.discount, cur)}</span></div>}
        <div className="pline"><span>VAT {Number(q.vat_rate)}%</span><span className="mono">{money(q.totals.vat, cur)}</span></div>
        <div className="ptotal"><span>Total</span><b>{money(q.totals.total, cur)}</b></div>
      </div>
      {q.notes && <div className="pcard" style={{ fontSize: 13.5, whiteSpace: "pre-wrap" }}>{q.notes}</div>}

      {error && <div className="banner bad">{error}</div>}
      {q.status === "accepted" && <div className="banner ok">✓ You accepted this quotation on {fmtDate(q.decided_at!)}. {q.business.name} will message you to book your appointment.</div>}
      {q.status === "rejected" && <div className="banner bad">You declined this quotation. Message us if you'd like a revised price.</div>}
      {q.expired && <div className="banner info">This quotation expired on {fmtDate(q.valid_until)}. Message us for an updated price.</div>}

      <div className="pbtns">
        {open && !confirmReject && (
          <>
            <button className="btn primary" disabled={busy} onClick={() => decide(true)}>Accept quotation</button>
            <div className="row2">
              <button className="btn" disabled={busy} onClick={() => setConfirmReject(true)}>Decline</button>
              <a className="btn" href={`/api/public/q/${token}/pdf`}>Download PDF</a>
            </div>
          </>
        )}
        {open && confirmReject && (
          <div className="pcard" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <b>Decline this quotation?</b>
            <div className="row2">
              <button className="btn" onClick={() => setConfirmReject(false)}>Go back</button>
              <button className="btn" style={{ color: "#a3392b" }} disabled={busy} onClick={() => decide(false)}>Yes, decline</button>
            </div>
          </div>
        )}
        {!open && <a className="btn" href={`/api/public/q/${token}/pdf`}>Download PDF</a>}
        {wa && <a className="btn wa" href={wa} target="_blank" rel="noreferrer">Chat on WhatsApp</a>}
      </div>
      {q.business.trn && <small>TRN {q.business.trn}{q.business.address ? ` · ${q.business.address}` : ""}</small>}
      <Powered />
    </PubShell>
  );
}

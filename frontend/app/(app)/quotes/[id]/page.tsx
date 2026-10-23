"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { copyText, ErrorBox, Loading, PageHead, Pill, QuotePill, toast } from "@/components/ui";
import { api, download } from "@/lib/api";
import { fmtDate, fmtDateTime, money, waLink } from "@/lib/format";
import type { Quote } from "@/lib/types";
import { Tip } from "@/components/Tips";

export default function QuoteDetailPage() {
  return <Suspense fallback={<Loading />}><QuoteDetail /></Suspense>;
}

function QuoteDetail() {
  const { id } = useParams<{ id: string }>();
  const created = useSearchParams().get("created");
  const { business } = useSession();
  const [q, setQ] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api.get<Quote>(`/quotes/${id}`).then(setQ).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  async function decide(accepted: boolean) {
    try {
      setQ(await api.post<Quote>(`/quotes/${id}/decision?accepted=${accepted}`));
      toast(accepted ? "Marked as accepted" : "Marked as declined");
    } catch (e) {
      toast((e as Error).message);
    }
  }

  // Sending it (any way) moves it from "Ready to send" to "Sent".
  function shared() {
    if (q && !q.shared_at) api.post<Quote>(`/quotes/${id}/shared`).then(setQ).catch(() => {});
  }

  if (error) return <ErrorBox error={error} />;
  if (!q) return <Loading />;
  const cur = business.currency;
  const open = q.status === "sent" || q.status === "viewed";

  const events = [
    { t: q.created_at, label: "Quote created and link generated", cls: "" },
    ...(q.shared_at && q.shared_at !== q.created_at ? [{ t: q.shared_at, label: "Sent to the client", cls: "" }] : []),
    ...q.views.map((v, i) => ({ t: v, label: i ? `Opened again (${i + 1}×)` : "Client opened the quote", cls: "view" })),
    ...(q.decided_at ? [{ t: q.decided_at, label: q.status === "accepted" ? "Accepted" : "Declined", cls: "" }] : []),
  ].sort((a, b) => a.t.localeCompare(b.t));

  return (
    <>
      <PageHead
        eyebrow={created && !q.shared_at ? "Quote ready. Now send it to your client" : "Quotes"}
        title={`${q.label} · ${q.customer.name}`}
        sub={`${money(q.totals.total, cur)} · valid until ${fmtDate(q.valid_until)}${q.reference ? ` · ${q.reference}` : ""}`}
        action={<QuotePill q={q} />}
      />
      <div className="detail">
        <div className="stack">
          <section className="panel">
            <h2>Send to your client</h2>
            <div className="linkbox">
              <input id="quote-link" readOnly value={q.public_url} onFocus={(e) => e.target.select()} />
              <button className="btn" onClick={() => { copyText(q.public_url); shared(); }}>Copy</button>
            </div>
            <div className="acts" style={{ justifyContent: "flex-start", marginTop: 10 }}>
              <Tip id="qd.whatsapp" order={1} text="Opens WhatsApp with the message and link ready, from your own number. Just press send."><a className="btn wa" href={waLink(q.customer.phone, q.share_message)} target="_blank" rel="noreferrer" onClick={shared}>Send on WhatsApp</a></Tip>
              <a className="btn" href={`/q/${q.token}?preview=1`} target="_blank" rel="noreferrer">Preview as client</a>
              <button className="btn" onClick={() => { download(`/quotes/${q.id}/pdf`, `${q.label}.pdf`); shared(); }}>Download PDF</button>
            </div>
            <p className="note" style={{ marginBottom: 0 }}>Previews don't count as views. Only your client opening the link does.</p>
          </section>
          <section className="panel">
            <h2>Items</h2>
            <div className="list">
              {q.items.map((i, n) => (
                <div className="row" key={n}>
                  <div className="l"><b>{i.description}</b><div>{Number(i.quantity)} × {money(i.unit_price, cur)}</div></div>
                  <span className="mono">{money(i.line_total, cur)}</span>
                </div>
              ))}
            </div>
            <div className="totals">
              <div><span>Subtotal</span><span className="mono">{money(q.totals.subtotal, cur)}</span></div>
              {Number(q.totals.discount) > 0 && <div><span>Discount</span><span className="mono">−{money(q.totals.discount, cur)}</span></div>}
              <div><span>VAT {Number(q.vat_rate)}%</span><span className="mono">{money(q.totals.vat, cur)}</span></div>
              <div className="grand"><span>Total</span><span className="mono">{money(q.totals.total, cur)}</span></div>
            </div>
            {q.notes && <p className="note">{q.notes}</p>}
          </section>
        </div>
        <div className="stack">
          <section className="panel">
            <Tip id="qd.activity" order={2} text="When your client opens the link, it shows here with the time, so you know when to follow up."><h2>Activity <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>{q.view_count} view{q.view_count === 1 ? "" : "s"}</span></h2></Tip>
            <ul className="timeline">
              {events.map((e, i) => (
                <li key={i} className={e.cls}><i /><span>{e.label}</span><time>{fmtDateTime(e.t)}</time></li>
              ))}
            </ul>
          </section>
          <section className="panel">
            <Tip id="qd.next" order={3} text="Client said yes on the phone? Mark it here. Once accepted, book the appointment in one tap."><h2>Next step</h2></Tip>
            {q.status === "accepted" ? (
              q.service_record_id ? (
                <p className="muted" style={{ margin: 0 }}>Done. The visit is in the client's history. <Link href="/services">See visits</Link></p>
              ) : (
                <div className="acts" style={{ justifyContent: "flex-start" }}>
                  <Link className="btn primary" href={`/appointments?quote=${q.id}`}>Book the appointment</Link>
                  <Link className="btn" href={`/services/new?quote=${q.id}`}>Already done? Record the visit</Link>
                </div>
              )
            ) : open ? (
              <div className="acts" style={{ justifyContent: "flex-start" }}>
                <Link className="btn" href={`/quotes/new?edit=${q.id}`}>Edit quote</Link>
                <button className="btn" onClick={() => decide(true)}>Client accepted by phone</button>
                <button className="btn danger" onClick={() => decide(false)}>Mark declined</button>
              </div>
            ) : (
              <Link className="btn" href={`/quotes/new${q.lead_id ? `?lead=${q.lead_id}` : ""}`}>Send a revised quote</Link>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

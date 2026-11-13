"use client";

import Link from "next/link";
import { useState } from "react";
import { useSession } from "@/components/session";
import { ErrorBox, PageHead, toast } from "@/components/ui";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import type { BulkSend, Quote } from "@/lib/types";
import { useWhatsApp } from "@/lib/whatsapp";

/** After a quote is made for several clients: send each one on WhatsApp (or all at once with the WhatsApp API). */
export function SendList({ made }: { made: Quote[] }) {
  const { business } = useSession();
  const wa = useWhatsApp();
  const [sent, setSent] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState<BulkSend | null>(null);
  const next = made.find((x) => !sent.has(x.id) && x.whatsapp_url);

  function send(x: Quote) {
    api.post(`/quotes/${x.id}/shared`).catch(() => {});
    setSent((s) => new Set(s).add(x.id));
  }
  async function sendAll() {
    setBusy(true);
    try {
      const r = await api.post<BulkSend>("/quotes/whatsapp-bulk", { quote_ids: made.map((x) => x.id) });
      setAuto(r);
      setSent(new Set(made.map((x) => x.id)));
      toast(r.failed ? `${r.sent} sent, ${r.failed} couldn't be sent` : `${r.sent} quotes sent on WhatsApp`);
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  return (
    <>
      <PageHead title="Send your quotes" eyebrow={`${sent.size} of ${made.length} sent`}
        sub={wa?.quotes ? "Send them all at once from your WhatsApp Business number. Each client gets Accept and Decline buttons." : "Each client has their own link. Tap Send to open WhatsApp with the message ready, press send there, then come back for the next one."}
        action={wa?.quotes && !auto
          ? <button className="btn wa" disabled={busy} onClick={sendAll}>{busy ? "Sending…" : `Send all ${made.length} on WhatsApp`}</button>
          : <Link className="btn" href="/quotes">Done</Link>} />
      <ErrorBox error={error} />
      {auto && (
        <div className="wa-banner">
          <b>{auto.sent} sent automatically.</b>
          {auto.failed > 0 && <span>{auto.failed} couldn&apos;t be sent; use the Send buttons below for those.</span>}
          <Link className="btn sm" href="/quotes">Done</Link>
        </div>
      )}
      {!wa?.quotes && next && (
        <div className="sendnext">
          <a className="btn wa" href={next.whatsapp_url!} target="_blank" rel="noreferrer" onClick={() => send(next)}>Send to next: {next.customer.name}</a>
          <span className="seg-progress"><span className="bar"><i style={{ width: `${(sent.size / made.length) * 100}%` }} /></span></span>
        </div>
      )}
      <section className="panel">
        <div className="list sendlist">
          {made.map((x) => (
            <div className={`row${sent.has(x.id) ? " sent" : ""}`} key={x.id}>
              <div className="l"><b>{x.customer.name}</b><div>{x.label} · {money(x.totals.total, business.currency)} · {x.customer.phone}</div></div>
              <div className="acts" style={{ flexWrap: "nowrap" }}>
                {sent.has(x.id) && <span className="sent-ok">✓ Sent</span>}
                {x.whatsapp_url && <a className="btn sm wa" href={x.whatsapp_url} target="_blank" rel="noreferrer" onClick={() => send(x)}>{sent.has(x.id) ? "Again" : "Send"}</a>}
                <Link className="btn sm ghost" href={`/quotes/${x.id}`}>Open</Link>
              </div>
            </div>
          ))}
        </div>
      </section>
      {!wa?.quotes && <p className="note" style={{ marginTop: 12 }}>Without the WhatsApp Business API, WhatsApp only lets you send from your own phone, so each one opens separately.</p>}
    </>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { blankRow, cleanRows, ItemsEditor, Totals, type Row } from "@/components/ItemsEditor";
import { useSession } from "@/components/session";
import { ErrorBox, Loading, PageHead, toast } from "@/components/ui";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import type { CustomerSummary, Quote } from "@/lib/types";

/** The same quote for many clients (an Eid offer, a loyalty price…), one personal link each, sent on WhatsApp. */
export default function BulkQuotePage() {
  const { business } = useSession();
  const [clients, setClients] = useState<CustomerSummary[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([{ ...blankRow }]);
  const [discount, setDiscount] = useState("0");
  const [vat, setVat] = useState(business.default_vat_rate);
  const [days, setDays] = useState("14");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [made, setMade] = useState<Quote[] | null>(null);
  const [sent, setSent] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get<CustomerSummary[]>("/customers").then(setClients).catch((e) => setError(e.message)); }, []);

  const withPhone = (clients ?? []).filter((c) => c.phone);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return withPhone.filter((c) => !t || c.name.toLowerCase().includes(t) || (c.phone ?? "").replace(/\D/g, "").includes(t.replace(/\D/g, "") || "~"));
  }, [withPhone, q]);
  const toggle = (id: number) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allShown = shown.length > 0 && shown.every((c) => picked.has(c.id));

  async function create() {
    const items = cleanRows(rows);
    if (!picked.size) return setError("Choose at least one client.");
    if (!items.length) return setError("Add at least one service with a price.");
    setBusy(true);
    setError(null);
    try {
      const qs = await api.post<Quote[]>("/quotes/bulk", {
        customer_ids: [...picked], items, discount: Number(discount) || 0, vat_rate: Number(vat), valid_days: Number(days) || 14,
        reference: reference.trim() || null, notes: notes.trim() || null,
      });
      setMade(qs);
      toast(`${qs.length} quotes ready to send`);
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  function send(x: Quote) {
    api.post(`/quotes/${x.id}/shared`).catch(() => {});
    setSent((s) => new Set(s).add(x.id));
  }

  if (made) {
    return (
      <>
        <PageHead title="Send your quotes" eyebrow={`${sent.size} of ${made.length} sent`} sub="Each client gets their own link. Tap Send to open WhatsApp with the message ready, press send, and come back for the next one." action={<Link className="btn" href="/quotes">Done</Link>} />
        <section className="panel">
          <div className="list sendlist">
            {made.map((x) => (
              <div className={`row${sent.has(x.id) ? " sent" : ""}`} key={x.id}>
                <div className="l"><b>{x.customer.name}</b><div>{x.label} · {money(x.totals.total, business.currency)} · {x.customer.phone}</div></div>
                <div className="acts" style={{ flexWrap: "nowrap" }}>
                  {x.whatsapp_url && <a className="btn sm wa" href={x.whatsapp_url} target="_blank" rel="noreferrer" onClick={() => send(x)}>{sent.has(x.id) ? "Send again" : "Send"}</a>}
                  <Link className="btn sm ghost" href={`/quotes/${x.id}`}>Open</Link>
                </div>
              </div>
            ))}
          </div>
        </section>
        <p className="note" style={{ marginTop: 12 }}>WhatsApp doesn&apos;t allow one message to many people without its Business API, so each one opens separately from your own number.</p>
      </>
    );
  }

  return (
    <>
      <PageHead title="Quote for many clients" eyebrow="Bulk · WhatsApp" sub="The same services and price for a group of clients, for example an Eid offer for your regulars. Each client gets their own link to accept and book." />
      <ErrorBox error={error} />
      <div className="detail" style={{ marginTop: error ? 12 : 0 }}>
        <section className="panel">
          <h2>Clients <span className="muted small">{picked.size} chosen</span></h2>
          {!clients ? <Loading /> : withPhone.length === 0 ? (
            <div className="empty">No clients with a mobile number yet. <Link href="/customers/import">Import your clients</Link>.</div>
          ) : (
            <>
              <div className="filters" style={{ marginBottom: 8 }}>
                <input className="headsearch" type="search" placeholder="Search name or mobile" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search clients" style={{ flex: 1 }} />
                <button type="button" className="chip" onClick={() => setPicked((s) => { const n = new Set(s); shown.forEach((c) => (allShown ? n.delete(c.id) : n.add(c.id))); return n; })}>{allShown ? "Clear" : `Select all ${shown.length}`}</button>
              </div>
              <div className="pickall">
                {shown.map((c) => (
                  <label key={c.id}><input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />{c.name}<span>{c.phone}</span></label>
                ))}
                {!shown.length && <div className="empty">No clients match.</div>}
              </div>
            </>
          )}
        </section>
        <section className="card">
          <div className="form">
            <label className="full">Offer name <span className="hint">(shown on each quote)</span><input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Eid glow offer for our regulars" maxLength={200} /></label>
            <ItemsEditor rows={rows} setRows={setRows} />
            <label>Discount ({business.currency})<input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} /></label>
            <label>VAT %<input type="number" min="0" max="100" step="0.5" value={vat} onChange={(e) => setVat(e.target.value)} /></label>
            <label>Valid for (days)<input type="number" min="1" max="365" value={days} onChange={(e) => setDays(e.target.value)} /></label>
            <label className="full">Notes for clients<textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What's included, deposit, cancellation policy…" /></label>
          </div>
          <Totals rows={rows} discount={discount} vat={vat} />
          <div className="foot">
            <Link className="btn" href="/quotes">Cancel</Link>
            <button className="btn primary" onClick={create} disabled={busy}>{busy ? "Creating…" : `Create ${picked.size || ""} quote${picked.size === 1 ? "" : "s"}`}</button>
          </div>
        </section>
      </div>
    </>
  );
}

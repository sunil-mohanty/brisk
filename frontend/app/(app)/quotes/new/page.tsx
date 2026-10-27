"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { CustomerPicker } from "@/components/CustomerPicker";
import { useSession } from "@/components/session";
import { ErrorBox, Loading, PageHead } from "@/components/ui";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import type { CatalogItem, CustomerRef, Lead, Quote } from "@/lib/types";
import Link from "next/link";
import { vocab } from "@/lib/vocab";
import { Tip } from "@/components/Tips";
import { words } from "@/lib/words";
import { AttachField, type Picked } from "@/components/QuotePicture";

interface Row { description: string; quantity: string; unit_price: string }
const blank: Row = { description: "", quantity: "1", unit_price: "" };

export default function NewQuotePage() {
  return <Suspense fallback={<Loading />}><QuoteForm /></Suspense>;
}

function QuoteForm() {
  const router = useRouter();
  const params = useSearchParams();
  const leadId = params.get("lead");
  const editId = params.get("edit");
  const [attachment, setAttachment] = useState<Picked | null>(null);
  const { business } = useSession();
  const W = words(business.business_type);

  const [lead, setLead] = useState<Lead | null>(null);
  const [ref, setRef] = useState<CustomerRef>({});
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[]>([{ ...blank }]);
  const [discount, setDiscount] = useState("0");
  const [vat, setVat] = useState(business.default_vat_rate);
  const [validDays, setValidDays] = useState("7");
  const [notes, setNotes] = useState("");
  const [reference, setReference] = useState("");
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [saveNew, setSaveNew] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(!leadId && !editId);

  useEffect(() => {
    api.swr<CatalogItem[]>("/catalog", setCatalog).catch(() => {});
  }, []);

  useEffect(() => {
    if (leadId) {
      api.get<Lead[]>("/leads").then((ls) => {
        const l = ls.find((x) => String(x.id) === leadId) ?? null;
        setLead(l);
        if (l) {
          setCustomerId(l.customer.id);
          if (l.requirement) setRows([{ ...blank, description: l.requirement.slice(0, 300) }]);
        }
        setReady(true);
      });
    }
    if (editId) {
      api.get<Quote>(`/quotes/${editId}`).then((q) => {
        setCustomerId(q.customer.id);
        setRows(q.items.map((i) => ({ description: i.description, quantity: String(Number(i.quantity)), unit_price: String(Number(i.unit_price)) })));
        setDiscount(String(Number(q.totals.discount)));
        setVat(q.vat_rate);
        setValidDays(String(q.valid_days));
        setNotes(q.notes ?? "");
        setReference(q.reference ?? "");
        if (q.attachment && q.design_style === "upload") setAttachment({ id: q.attachment.id, name: q.attachment.name, is_pdf: q.attachment.is_pdf, preview: q.picture_url });
        else if (q.design_style === "photo" && q.picture_url) setAttachment({ id: -1, name: "AI picture (change it on the quote page)", is_pdf: false, preview: q.picture_url, ai: true });
        setReady(true);
      });
    }
  }, [leadId, editId]);

  const totals = useMemo(() => {
    const sub = rows.reduce((a, r) => a + (Number(r.quantity) || 0) * (Number(r.unit_price) || 0), 0);
    const disc = Math.min(Number(discount) || 0, sub);
    const vatAmt = Math.round((sub - disc) * (Number(vat) || 0)) / 100;
    return { sub, disc, vat: vatAmt, total: sub - disc + vatAmt };
  }, [rows, discount, vat]);

  const byName = useMemo(() => new Map(catalog.map((c) => [c.name.trim().toLowerCase(), c])), [catalog]);
  const update = (i: number, k: keyof Row, val: string) =>
    setRows(rows.map((r, n) => {
      if (n !== i) return r;
      const next = { ...r, [k]: val };
      // Picked a line from the price list: fill in its price.
      const hit = k === "description" ? byName.get(val.trim().toLowerCase()) : undefined;
      if (hit && !r.unit_price) next.unit_price = String(Number(hit.unit_price));
      return next;
    }));
  const addFromList = (c: CatalogItem) => {
    const row = { description: c.name, quantity: "1", unit_price: String(Number(c.unit_price)) };
    const empty = rows.findIndex((r) => !r.description.trim() && !r.unit_price);
    setRows(empty >= 0 ? rows.map((r, n) => (n === empty ? row : r)) : [...rows, row]);
  };
  const newLines = rows.filter((r) => r.description.trim() && r.unit_price !== "" && !byName.has(r.description.trim().toLowerCase()));

  async function save() {
    const items = rows.filter((r) => r.description.trim() && r.unit_price !== "").map((r) => ({
      description: r.description.trim(), quantity: Number(r.quantity) || 1, unit_price: Number(r.unit_price),
    }));
    if (!items.length && !attachment) return setError("Add at least one item with a price, or attach a picture or brochure.");
    setBusy(true);
    setError(null);
    const body = {
      ...(lead ? { lead_id: lead.id } : ref),
      items,
      discount: Number(discount) || 0,
      vat_rate: Number(vat),
      valid_days: Number(validDays) || 7,
      notes: notes || null,
      reference: reference.trim() || null,
      attachment_id: attachment && !attachment.ai ? attachment.id : null,
      ai_art_id: attachment?.ai && attachment.id > 0 ? attachment.id : null,
    };
    try {
      const q = editId ? await api.put<Quote>(`/quotes/${editId}`, body) : await api.post<Quote>("/quotes", body);
      // Keep the price list up to date (never blocks the quote).
      await Promise.allSettled([
        saveNew && newLines.length ? api.post("/catalog", newLines.map((r) => ({ name: r.description.trim(), unit_price: Number(r.unit_price) }))) : null,
        api.post("/catalog/used", items.map((i) => i.description).filter((d) => byName.has(d.toLowerCase()))),
      ]);
      router.push(`/quotes/${q.id}${editId ? "" : "?created=1"}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (!ready) return <Loading />;
  const cur = business.currency;
  const v = vocab(business.business_type);

  return (
    <>
      <PageHead
        eyebrow="Quote"
        title={editId ? "Edit quote" : "New quote"}
        sub={lead ? `For ${lead.customer.name}'s enquiry via ${lead.source}.` : `Client, ${W.services}, price, VAT. You'll get a link to send on WhatsApp.`}
      />
      <div className="card">
        <ErrorBox error={error} />
        <div className="form" style={{ marginTop: error ? 12 : 0 }}>
          <Tip id="qn.customer" order={1} text="Search your clients by name or mobile number, or type a new name to add one.">
            <CustomerPicker value={customerId} onChange={setRef} locked={!!lead || !!editId} />
          </Tip>
          <label className="full"><span>Occasion or booking details <span className="hint">(optional)</span></span><input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder={v.refPlaceholder} maxLength={200} /></label>
          <div className="full">
            {catalog.length > 0 && (
              <div className="pricechips">
                <span className="small muted">Tap to add from your menu:</span>
                <div className="chips-inline">
                  {catalog.slice(0, 8).map((c) => (
                    <button type="button" key={c.id} className="chip" onClick={() => addFromList(c)}>+ {c.name} <span className="mono">{money(c.unit_price, cur)}</span></button>
                  ))}
                  <Link className="chip linkchip" href="/menu">Edit menu</Link>
                </div>
              </div>
            )}
            <Tip id="qn.items" order={2} text={`One line per ${W.service}: what it is, how many, and the price each. VAT and the total are worked out for you below.`}>
            <div className="items">
              <div className="item itemhead" aria-hidden="true"><span>Service</span><span>Qty</span><span>Price each ({cur})</span><span /></div>
              {rows.map((r, i) => (
                <div className="item" key={i}>
                  <span className="ifield" data-l="Item"><input aria-label="Item" list="pricelist" value={r.description} onChange={(e) => update(i, "description", e.target.value)} placeholder={i ? "Another item" : v.itemPlaceholder} /></span>
                  <span className="ifield" data-l="Qty"><input aria-label="Quantity" type="number" min="0.01" step="any" inputMode="decimal" value={r.quantity} onChange={(e) => update(i, "quantity", e.target.value)} /></span>
                  <span className="ifield" data-l={`Price each (${cur})`}><input aria-label={`Price each (${cur})`} type="number" min="0" step="0.01" inputMode="decimal" value={r.unit_price} onChange={(e) => update(i, "unit_price", e.target.value)} placeholder="0.00" /></span>
                  <button type="button" aria-label="Remove item" onClick={() => rows.length > 1 && setRows(rows.filter((_, n) => n !== i))}>×</button>
                </div>
              ))}
            </div>
            </Tip>
            <datalist id="pricelist">{catalog.map((c) => <option key={c.id} value={c.name} />)}</datalist>
            <div className="itemfoot">
              <button type="button" className="btn sm" onClick={() => setRows([...rows, { ...blank }])}>+ Add {W.service}</button>
              {newLines.length > 0 && (
                <label className="check">
                  <input type="checkbox" checked={saveNew} onChange={(e) => setSaveNew(e.target.checked)} />
                  Save {newLines.length === 1 ? `this ${W.service}` : `these ${newLines.length} ${W.services}`} to my {W.vertical === "real_estate" ? "listings" : "menu"}
                </label>
              )}
            </div>
          </div>
          <label>Discount ({cur})<input id="discount" type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} /></label>
          <label>VAT %<input id="vat" type="number" min="0" max="100" step="0.5" value={vat} onChange={(e) => setVat(e.target.value)} /></label>
          <label>Valid for (days)<input id="valid" type="number" min="1" max="365" value={validDays} onChange={(e) => setValidDays(e.target.value)} /></label>
          <div className="full">
            <span className="flabel">Picture or brochure <span className="hint">(optional: upload your flyer or price list, or create one with AI)</span></span>
            <AttachField value={attachment} onChange={setAttachment} />
          </div>
          <label className="full">Notes for your client<textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={v.quoteNotesPlaceholder} /></label>
        </div>
        <div className="totals">
          <div><span>Subtotal</span><span className="mono">{money(totals.sub, cur)}</span></div>
          {totals.disc > 0 && <div><span>Discount</span><span className="mono">−{money(totals.disc, cur)}</span></div>}
          <div><span>VAT {vat}%</span><span className="mono">{money(totals.vat, cur)}</span></div>
          <div className="grand"><span>Total</span><span className="mono">{money(totals.total, cur)}</span></div>
        </div>
        <div className="foot">
          <button className="btn" onClick={() => router.back()}>Cancel</button>
          <Tip id="qn.create" order={3} text="Saves the quote and gives you a link to send. Nothing goes to your client until you send it."><button className="btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : editId ? "Save changes" : "Create quote & get link"}</button></Tip>
        </div>
      </div>
    </>
  );
}

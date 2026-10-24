"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CustomerPicker } from "@/components/CustomerPicker";
import { useSession } from "@/components/session";
import { ErrorBox, Loading, PageHead, toast } from "@/components/ui";
import { api } from "@/lib/api";
import { todayUAE } from "@/lib/format";
import { vocab } from "@/lib/vocab";
import type { CustomerRef, Quote, ServiceRecord } from "@/lib/types";
import { words } from "@/lib/words";

export default function NewServicePage() {
  return <Suspense fallback={<Loading />}><ServiceForm /></Suspense>;
}

const addWeeks = (iso: string, w: number) => { const d = new Date(iso + "T12:00:00+04:00"); d.setUTCDate(d.getUTCDate() + w * 7); return d.toISOString().slice(0, 10); };

function ServiceForm() {
  const router = useRouter();
  const quoteId = useSearchParams().get("quote");
  const { business } = useSession();
  const W = words(business.business_type);
  const v = vocab(business.business_type);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [ref, setRef] = useState<CustomerRef>({});
  const [f, setF] = useState({ service: "", service_date: todayUAE(), amount: "", technician: "", notes: "", reference: "", weeks: String(v.rebookWeeks) });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(!quoteId);

  useEffect(() => {
    if (!quoteId) return;
    api.get<Quote>(`/quotes/${quoteId}`).then((q) => {
      setQuote(q);
      setF((x) => ({ ...x, service: q.items.map((i) => i.description).join(" + ").slice(0, 300), amount: q.totals.total, reference: q.reference ?? "" }));
      setReady(true);
    });
  }, [quoteId]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    if (!f.service.trim()) return setError("Enter the service.");
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<ServiceRecord>("/services", {
        ...(quote ? { quote_id: quote.id } : ref),
        service: f.service,
        service_date: f.service_date,
        amount: Number(f.amount) || 0,
        technician: f.technician || null,
        notes: f.notes || null,
        reference: f.reference.trim() || null,
        next_service_date: f.weeks === "0" ? null : addWeeks(f.service_date, Number(f.weeks)),
      });
      toast(`${W.Visit} saved. Share the history link with your client.`);
      window.open(r.public_url, "_blank");
      router.push("/services");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (!ready) return <Loading />;
  return (
    <>
      <PageHead
        eyebrow={W.Visits}
        title={`Record a ${W.visit}`}
        sub={quote ? `From ${quote.label} for ${quote.customer.name}.` : W.vertical === "real_estate" ? "For a deal you closed outside the calendar. The client gets a link with their full history." : "For walk-ins you didn't book in the diary. The client gets a link with their full history."}
      />
      <div className="card">
        <ErrorBox error={error} />
        <div className="form" style={{ marginTop: error ? 12 : 0 }}>
          <CustomerPicker value={quote?.customer.id} onChange={setRef} locked={!!quote} />
          <label className="full">Service<input id="svc" value={f.service} onChange={set("service")} placeholder={v.itemPlaceholder} /></label>
          <label>Date<input id="svc-date" type="date" value={f.service_date} onChange={set("service_date")} /></label>
          <label>Amount ({business.currency})<input id="svc-amount" type="number" min="0" step="0.01" value={f.amount} onChange={set("amount")} /></label>
          <label>{v.staff}<input id="svc-tech" value={f.technician} onChange={set("technician")} placeholder={v.staffPlaceholder} /></label>
          <label>
            Invite back in
            <select id="svc-next" value={f.weeks} onChange={set("weeks")}>
              {[2, 3, 4, 6, 8, 12].map((w) => <option key={w} value={w}>{w} weeks</option>)}
              <option value="0">No reminder</option>
            </select>
          </label>
          <label className="full">Notes<textarea id="svc-notes" value={f.notes} onChange={set("notes")} placeholder={v.recordNotesPlaceholder} /></label>
        </div>
        <div className="foot">
          <button className="btn" onClick={() => router.back()}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : `Save ${W.visit}`}</button>
        </div>
      </div>
    </>
  );
}

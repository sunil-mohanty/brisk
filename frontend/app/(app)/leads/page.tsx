"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CustomerPicker } from "@/components/CustomerPicker";
import { Sheet } from "@/components/Sheet";
import { ErrorBox, Loading, PageHead, toast } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDateTime, fmtDay, todayUAE, waLink } from "@/lib/format";
import type { CustomerRef, Lead, LeadStatus, QR } from "@/lib/types";
import { useSession } from "@/components/session";
import { TIME_SLOTS, vocab } from "@/lib/vocab";
import { Tip } from "@/components/Tips";
import { words } from "@/lib/words";

const STATUSES: LeadStatus[] = ["new", "contacted", "quoted", "won", "lost"];
const LABEL: Record<LeadStatus, string> = { new: "New", contacted: "Replied", quoted: "Quoted", won: "Booked", lost: "Not booked" };

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [filter, setFilter] = useState<LeadStatus | "all">("all");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => api.swr<Lead[]>("/leads", setLeads).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function setStatus(l: Lead, status: LeadStatus) {
    try {
      await api.patch(`/leads/${l.id}`, { status });
      toast(`${l.customer.name}: ${LABEL[status].toLowerCase()}`);
      load();
    } catch (e) {
      toast((e as Error).message);
    }
  }

  const rows = (leads ?? []).filter((l) => filter === "all" || l.status === filter);

  return (
    <>
      <PageHead
        eyebrow="Enquiries & booking requests"
        title="Enquiries"
        sub="Booking requests from your link page and QR codes arrive here on their own. Reply, book them in, or send a quote."
        action={<Tip id="l.add" order={1} text="Got an enquiry by phone, Instagram DM or walk-in? Add it here so nobody is forgotten."><button className="btn primary" onClick={() => setAdding(true)}>+ Add enquiry</button></Tip>}
      />
      <ErrorBox error={error} />
      <Tip id="l.filters" order={2} text="Each enquiry moves along: New, Replied, Quoted, then Booked or Not booked. Booking one marks it Booked for you.">
      <div className="filters">
        {(["all", ...STATUSES] as const).map((s) => (
          <button key={s} className="chip" aria-pressed={filter === s} onClick={() => setFilter(s)}>
            {s === "all" ? "All" : LABEL[s]} <span className="mono">{(leads ?? []).filter((l) => s === "all" || l.status === s).length}</span>
          </button>
        ))}
      </div>
      </Tip>
      {!leads ? <Loading /> : (
        <div className="tablewrap">
          <table className="ctable">
            <thead><tr><th>Client</th><th>Came from</th><th>Wants</th><th>Status</th><th>Received</th><th /></tr></thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id}>
                  <td className="c-main"><b>{l.customer.name}</b><div className="sub mono">{l.customer.phone}</div></td>
                  <td className="c-stat c-first" data-label="via">{l.source}</td>
                  <td className="c-line" style={{ maxWidth: 300 }}>
                    {l.service_interest || l.requirement || <span className="muted">No details</span>}
                    {(l.preferred_date || l.preferred_time || l.stylist_pref) && (
                      <div className="sub">
                        {[l.preferred_date && fmtDay(l.preferred_date), l.preferred_time, l.stylist_pref && `with ${l.stylist_pref}`].filter(Boolean).join(", ")}
                      </div>
                    )}
                    {l.service_interest && l.requirement && <div className="sub">“{l.requirement}”</div>}
                  </td>
                  <td className="c-end">
                    <select className="inline" aria-label={`Status for ${l.customer.name}`} value={l.status} onChange={(e) => setStatus(l, e.target.value as LeadStatus)}>
                      {STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
                    </select>
                  </td>
                  <td className="sub c-stat">{fmtDateTime(l.created_at)}</td>
                  <td className="c-acts">
                    <div className="acts">
                      {l.customer.phone && (
                        <a className="btn sm" href={waLink(l.customer.phone, `Hi ${l.customer.name.split(" ")[0]}, thanks for your message${l.service_interest ? ` about ${l.service_interest.toLowerCase()}` : ""}.`)} target="_blank" rel="noreferrer">WhatsApp</a>
                      )}
                      <Link className="btn sm" href={`/quotes/new?lead=${l.id}`}>Quote</Link>
                      {l.appointment_id
                        ? <Link className="btn sm" href={`/appointments?id=${l.appointment_id}`}>See booking</Link>
                        : <Link className="btn sm primary" href={`/appointments?lead=${l.id}`}>Book</Link>}
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={6} className="empty">{leads.length ? "No enquiries with this status." : <>No enquiries yet. Put your <Link href="/link">link page</Link> in your Instagram bio and requests will arrive here.</>}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <Sheet open={adding} onClose={() => setAdding(false)}>
        <AddLead onDone={() => { setAdding(false); load(); }} onCancel={() => setAdding(false)} />
      </Sheet>
    </>
  );
}

function AddLead({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { business } = useSession();
  const v = vocab(business.business_type);
  const [ref, setRef] = useState<CustomerRef>({});
  const [source, setSource] = useState("Phone call");
  const [requirement, setRequirement] = useState("");
  const [service, setService] = useState("");
  const [prefDate, setPrefDate] = useState("");
  const [prefTime, setPrefTime] = useState("");
  const [qrs, setQrs] = useState<QR[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.swr<QR[]>("/qr", setQrs).catch(() => {}); }, []);

  async function save() {
    try {
      await api.post("/leads", { ...ref, source, requirement: requirement || null, service_interest: service.trim() || null, preferred_date: prefDate || null, preferred_time: prefTime || null });
      toast("Enquiry added");
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <h2>Add enquiry</h2>
      <p className="intro">For enquiries that came by phone, DM, walk-in or a friend's recommendation.</p>
      <ErrorBox error={error} />
      <div className="form" style={{ marginTop: 10 }}>
        <CustomerPicker onChange={setRef} />
        <label className="full">
          Source
          <select id="lead-source" value={source} onChange={(e) => setSource(e.target.value)}>
            {[...new Set(["Phone call", "WhatsApp", "Walk-in", "Instagram", "TikTok", "Snapchat", "Google", "Recommended by a client", ...qrs.map((q) => q.name)])].map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label className="full">{words(business.business_type).vertical === "real_estate" ? "What they're looking for" : "Service they want"}<input id="lead-svc" value={service} onChange={(e) => setService(e.target.value)} placeholder={v.itemPlaceholder} /></label>
        <label>Preferred day <span className="hint">(optional)</span><input id="lead-date" type="date" min={todayUAE()} value={prefDate} onChange={(e) => setPrefDate(e.target.value)} /></label>
        <label>Preferred time
          <select id="lead-time" value={prefTime} onChange={(e) => setPrefTime(e.target.value)}>
            <option value="">No preference</option>
            {TIME_SLOTS.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label className="full">Notes<textarea id="lead-req" value={requirement} onChange={(e) => setRequirement(e.target.value)} placeholder={v.requirementPlaceholder} /></label>
      </div>
      <div className="foot">
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn primary" onClick={save}>Save enquiry</button>
      </div>
    </>
  );
}

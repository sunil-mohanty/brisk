"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { copyText, ErrorBox, Loading, PageHead, Pill, toast } from "@/components/ui";
import { api } from "@/lib/api";
import { daysUntil, fmtDate, money } from "@/lib/format";
import type { ReminderOut, ServiceRecord } from "@/lib/types";
import { vocab } from "@/lib/vocab";
import { Tip } from "@/components/Tips";

export default function VisitsPage() {
  return <Suspense fallback={<Loading />}><Visits /></Suspense>;
}

function Visits() {
  const { business } = useSession();
  const v = vocab(business.business_type);
  const [rows, setRows] = useState<ServiceRecord[] | null>(null);
  const [dueOnly, setDueOnly] = useState(useSearchParams().get("due") === "1");
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    () => api.swr<ServiceRecord[]>(dueOnly ? "/services?due_within_days=30" : "/services", setRows).catch((e) => setError(e.message)),
    [dueOnly],
  );
  useEffect(() => { load(); }, [load]);

  async function remind(s: ServiceRecord) {
    // Open the tab inside the click so pop-up blockers allow it, then point it at WhatsApp.
    const w = window.open("about:blank", "_blank");
    try {
      const r = await api.post<ReminderOut>(`/services/${s.id}/reminder`);
      if (r.whatsapp_url && w) w.location.href = r.whatsapp_url;
      else {
        w?.close();
        await copyText(r.message);
        toast("No mobile number saved. Message copied instead.");
      }
      load();
    } catch (e) {
      w?.close();
      toast((e as Error).message);
    }
  }

  return (
    <>
      <PageHead
        eyebrow="History & rebooking"
        title="Visits"
        sub="Every finished appointment, with the client's own history link. When someone is due back, invite them in one tap."
        action={<Tip id="s.new" order={1} text="Visits are saved for you when you finish an appointment. Use this for a walk-in you didn't book in the diary."><Link className="btn" href="/services/new">+ Record a walk-in</Link></Tip>}
      />
      <ErrorBox error={error} />
      <div className="filters">
        <button className="chip" aria-pressed={!dueOnly} onClick={() => setDueOnly(false)}>All visits</button>
        <Tip id="s.due" order={2} text="Clients due back soon. Invite each one on WhatsApp in one tap."><button className="chip" aria-pressed={dueOnly} onClick={() => setDueOnly(true)}>Due to rebook</button></Tip>
      </div>
      {!rows ? <Loading /> : (
        <div className="tablewrap">
          <table className="ctable">
            <thead><tr><th>Client</th><th>Service</th><th>Date</th><th className="num">Amount</th><th>{v.staff}</th><th>Due back</th><th /></tr></thead>
            <tbody>
              {rows.map((s) => {
                const d = s.next_service_date ? daysUntil(s.next_service_date) : null;
                return (
                  <tr key={s.id}>
                    <td className="c-main"><b>{s.customer.name}</b><div className="sub mono">{s.customer.phone}</div></td>
                    <td className="c-line">{s.service}</td>
                    <td className="sub c-stat" data-label="Done">{fmtDate(s.service_date)}</td>
                    <td className="num c-end">{money(s.amount, business.currency)}</td>
                    <td className="c-stat" data-label={v.staff}>{s.technician || "—"}</td>
                    <td className="c-stat" data-label="Due back">
                      {s.next_service_date ? fmtDate(s.next_service_date) : "—"}{" "}
                      {d !== null && (d < 0 ? <Pill status="due" label="Overdue" /> : d <= 30 ? <Pill status="soon" label={`in ${d}d`} /> : null)}
                      {s.reminder_sent_at && <div className="sub">Reminded {fmtDate(s.reminder_sent_at)}</div>}
                    </td>
                    <td className="c-acts">
                      <div className="acts">
                        <a className="btn sm" href={s.public_url} target="_blank" rel="noreferrer">Client's history</a>
                        <button className="btn sm" onClick={() => copyText(s.public_url)}>Copy link</button>
                        {d !== null && d <= 30 && <button className="btn sm primary" onClick={() => remind(s)}>Invite back</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!rows.length && <tr><td colSpan={7} className="empty">{dueOnly ? "Nobody is due back in the next 30 days." : <>No visits yet. Finish an appointment in the <Link href="/appointments">diary</Link> and it appears here.</>}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

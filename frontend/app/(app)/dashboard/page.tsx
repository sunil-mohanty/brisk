"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppointmentSheet, STATUS_LABEL, type SheetState } from "@/components/AppointmentSheet";
import { Checklist } from "@/components/Checklist";
import { useSession } from "@/components/session";
import { Tip } from "@/components/Tips";
import { copyText, ErrorBox, Loading, PageHead, Pill, QuotePill, toast } from "@/components/ui";
import { api } from "@/lib/api";
import { Icon } from "@/components/icons";
import { daysUntil, fmtDate, fmtDay, fmtTime, money, todayUAE } from "@/lib/format";
import type { Dashboard, Lead, Outbound, ReminderOut, ServiceRecord } from "@/lib/types";

export default function TodayPage() {
  const { business, user } = useSession();
  const [d, setD] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const load = useCallback(() => api.swr<Dashboard>("/dashboard", setD).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorBox error={error} />;
  if (!d) return <Loading />;
  const cur = business.currency;
  const live = d.today.filter((a) => a.status !== "cancelled" && a.status !== "no_show");
  const takings = live.reduce((s, a) => s + Number(a.price), 0);
  const hour = Number(new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", hour12: false }));
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHead
        title="Today"
        eyebrow={fmtDay(todayUAE())}
        sub={`${hello}, ${user.name.split(" ")[0]}. ${live.length ? `${live.length} client${live.length === 1 ? "" : "s"} booked today, ${money(takings, cur)} in the diary.` : "No one booked in yet today."}`}
        action={<>
          <Link className="btn" href="/quotes/new">{Icon.quotes()}New Quote</Link>
          <Tip id="dash.book" order={1} text="Book a client in from here, or from the Appointments calendar."><button className="btn primary" onClick={() => setSheet({ kind: "new" })}>{Icon.appointments()}New Booking</button></Tip>
        </>}
      />
      <Checklist setup={d.setup} />
      <div className="kpis">
        <Link href="/appointments" className="kpi kpilink"><span>Booked today</span><strong>{live.length}</strong><em>{d.upcoming} in the next 7 days</em></Link>
        <Link href="/leads" className="kpi kpilink"><span>New enquiries</span><strong>{d.new_leads}</strong><em>{d.new_leads ? "waiting for your reply" : "all answered"}</em></Link>
        {business.link_page_enabled
          ? <Link href="/link" className="kpi kpilink"><span>Link page visits</span><strong>{d.link_views_7d}</strong><em>{d.link_taps_7d} taps this week</em></Link>
          : <Link href="/quotes" className="kpi kpilink"><span>Awaiting booking</span><strong>{d.awaiting_booking.length}</strong><em>accepted quotes to book in</em></Link>}
        <Link href="/services?due=1" className="kpi kpilink"><span>Due to rebook</span><strong>{d.due_soon}</strong><em>in the next 30 days</em></Link>
      </div>
      {(d.to_send.length > 0 || d.awaiting_booking.length > 0 || d.low_stock > 0) && (
        <div className="grid2" style={{ marginBottom: 16 }}>
          {d.to_send.length > 0 && <ToSend rows={d.to_send} onDone={load} />}
          {d.awaiting_booking.length > 0 && (
            <section className="panel attention">
              <h2>Accepted, waiting for a booking <Link href="/quotes">Quotes</Link></h2>
              <div className="list">
                {d.awaiting_booking.map((q) => (
                  <div className="row" key={q.id}>
                    <div className="l"><b>{q.customer.name}</b><div>{q.campaign_title ?? q.items.map((i) => i.description).join(", ")} · {money(q.totals.total, cur)}</div></div>
                    <Link className="btn sm primary" href={`/appointments?quote=${q.id}`}>Book</Link>
                  </div>
                ))}
              </div>
            </section>
          )}
          {d.low_stock > 0 && (
            <section className="panel">
              <h2>Running low <Link href="/inventory">Inventory</Link></h2>
              <p className="muted" style={{ margin: 0 }}>{d.low_stock} product{d.low_stock === 1 ? " is" : "s are"} at or below the reorder level.</p>
            </section>
          )}
        </div>
      )}
      <div className="grid2">
        <section className="panel">
          <h2>Today's appointments <Link href="/appointments">Open diary</Link></h2>
          {d.today.length ? (
            <div className="today">
              {d.today.map((a) => (
                <button key={a.id} type="button" className={`slot ${a.status === "completed" ? "done" : ""} ${a.status === "cancelled" || a.status === "no_show" ? "gone" : ""}`}
                  style={{ "--c": a.stylist?.color } as React.CSSProperties} onClick={() => setSheet({ kind: "view", appt: a })}>
                  <time>{fmtTime(a.starts_at)}<small>{a.duration_min} min</small></time>
                  <i aria-hidden="true" />
                  <span className="l"><b>{a.customer.name}</b><span>{a.service}{a.stylist ? ` · ${a.stylist.name}` : ""}</span></span>
                  <Pill status={a.status} label={STATUS_LABEL[a.status]} />
                </button>
              ))}
            </div>
          ) : <div className="empty">A quiet day so far. <button className="linkbtn" style={{ margin: 0, padding: 0 }} onClick={() => setSheet({ kind: "new" })}>Book someone in</button></div>}
        </section>
        <NewEnquiries />
        <DueToRebook rows={d.due_services} onSent={load} />
        <section className="panel">
          <h2>Recent quotes <Link href="/quotes">All quotes</Link></h2>
          <div className="list">
            {d.recent_quotes.length ? d.recent_quotes.map((q) => (
              <Link className="row" key={q.id} href={`/quotes/${q.id}`}>
                <div className="l">
                  <b>{q.customer.name}</b>
                  <div>{money(q.totals.total, cur)} · {q.view_count ? `opened ${q.view_count}×` : "not opened yet"}</div>
                </div>
                <QuotePill q={q} />
              </Link>
            )) : <div className="empty">No quotes yet. Useful for bridal and event packages.</div>}
          </div>
        </section>
      </div>
      <AppointmentSheet state={sheet} onClose={() => setSheet(null)} onChanged={(a) => { load(); if (a && sheet?.kind === "new") setSheet({ kind: "view", appt: a }); }} />
    </>
  );
}

function NewEnquiries() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  useEffect(() => { api.swr<Lead[]>("/leads?status=new", setLeads).catch(() => setLeads([])); }, []);
  return (
    <section className="panel">
      <h2>New enquiries <Link href="/leads">All enquiries</Link></h2>
      <div className="list">
        {leads === null ? <Loading /> : leads.length ? leads.slice(0, 6).map((l) => (
          <div className="row" key={l.id}>
            <div className="l">
              <b>{l.customer.name}</b>
              <div>{l.service_interest || l.requirement || "No details"}{l.preferred_date ? ` · wants ${fmtDay(l.preferred_date)}${l.preferred_time ? `, ${l.preferred_time.toLowerCase()}` : ""}` : ""} · via {l.source}</div>
            </div>
            <Link className="btn sm primary" href={`/appointments?lead=${l.id}`}>Book</Link>
          </div>
        )) : <div className="empty">All caught up. New booking requests from your link page land here.</div>}
      </div>
    </section>
  );
}

function DueToRebook({ rows, onSent }: { rows: ServiceRecord[]; onSent: () => void }) {
  async function remind(s: ServiceRecord) {
    const w = window.open("about:blank", "_blank");
    try {
      const r = await api.post<ReminderOut>(`/services/${s.id}/reminder`);
      if (r.whatsapp_url && w) w.location.href = r.whatsapp_url;
      else { w?.close(); await copyText(r.message); toast("No mobile number saved. Message copied instead."); }
      onSent();
    } catch (e) { w?.close(); toast((e as Error).message); }
  }
  return (
    <section className="panel">
      <h2>Due to rebook <Link href="/services?due=1">Visits</Link></h2>
      <div className="list">
        {rows.length ? rows.map((s) => {
          const days = daysUntil(s.next_service_date!);
          return (
            <div className="row" key={s.id}>
              <div className="l">
                <b>{s.customer.name}</b>
                <div>{s.service} · last {fmtDate(s.service_date)}{s.reminder_sent_at ? " · reminded" : ""}</div>
              </div>
              <div className="acts" style={{ flexWrap: "nowrap" }}>
                {days < 0 ? <Pill status="due" label="Overdue" /> : <Pill status="soon" label={days === 0 ? "today" : `in ${days}d`} />}
                <button className="btn sm" onClick={() => remind(s)}>Invite back</button>
              </div>
            </div>
          );
        }) : <div className="empty">Nobody due in the next 30 days. Finished visits set this up for you.</div>}
      </div>
    </section>
  );
}

/** Booking confirmations the system couldn't send itself: one tap opens WhatsApp with the message ready. */
function ToSend({ rows, onDone }: { rows: Outbound[]; onDone: () => void }) {
  async function sent(m: Outbound) {
    try { await api.post(`/messages/${m.id}/done`); onDone(); } catch (e) { toast((e as Error).message); }
  }
  return (
    <section className="panel attention">
      <h2>Confirmations to send <span className="muted small">clients booked online</span></h2>
      <div className="list">
        {rows.map((m) => (
          <div className="row" key={m.id}>
            <div className="l"><b>{m.to_name ?? "Client"}</b><div>{m.body}</div></div>
            <div className="acts" style={{ flexWrap: "nowrap" }}>
              {m.whatsapp_url && <a className="btn sm wa" href={m.whatsapp_url} target="_blank" rel="noreferrer" onClick={() => setTimeout(() => sent(m), 800)}>Send</a>}
              <button className="btn sm ghost" onClick={() => sent(m)} aria-label={`Mark ${m.to_name ?? "message"} as sent`}>Done</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
